/**
 * @file クローラーサービス
 * @description コメントの返信数を定期的に取得し、未読数を更新する
 */
import { storage } from '#imports';
import { parse, HTMLElement as ParsedHTMLElement } from 'node-html-parser';
import Logger from '../utils/logger';
import { calculatePageNumber } from '../utils/pagination';
import { sleep } from './storage-service';
import type { CommentEntry } from '../types/comment';
import {
  SITE_CONFIG,
  SELECTORS,
  REGEX_PATTERNS,
  CRAWLER_CONFIG,
  STORAGE_KEYS,
} from '../constants/app-config';
import { validateTopicId, validateCommentNumber, buildSafeUrl } from '../utils/validation';

/**
 * クローラーの二重起動を防止するフラグ
 */
let isCrawling = false;

/**
 * 指定したコメントの返信数を取得する * @description girlschannel.netのトピックページからHTMLを取得し、
 * node-html-parserを使用してDOMをパースし、返信数を抽出する。
 * ページ番号はコメント番号から動的に算出する。
 * 
 * 処理フロー:
 * 1. コメント番号からページ番号を算出
 * 2. 該当ページのHTMLをfetch
 * 3. HTMLをパースして該当コメント要素を検索
 * 4. 返信数のテキストから数値を抽出
 *  * @param topicId - トピック ID
 * @param commentNumber - コメント番号
 * @returns 返信数（取得失敗時は null）
 */
export async function fetchResCountForComment(
  topicId: string,
  commentNumber: string
): Promise<number | null> {
  // 入力検証（セキュリティ対策）
  if (!validateTopicId(topicId) || !validateCommentNumber(commentNumber)) {
    Logger.error('無効な入力パラメータが検出されました', { topicId, commentNumber });
    return null;
  }

  // ページ番号を動的に計算
  const pageNumber = calculatePageNumber(commentNumber);

  const basePath = `/topics/${topicId}/${pageNumber === '1' ? '' : `${pageNumber}/`}`;
  const url = buildSafeUrl(SITE_CONFIG.BASE_URL, basePath);

  try {
    Logger.debug('返信数取得のため fetch を開始', { url, topicId, commentNumber, pageNumber });
    const res = await fetch(url);
    Logger.debug('fetch レスポンス', {
      url,
      status: res.status,
      ok: res.ok,
      redirected: res.redirected,
      type: res.type,
    });

    if (!res.ok) {
      const text = await res.text().catch((e) => `テキスト取得失敗: ${e}`);
      Logger.error('fetch が失敗しました', {
        url,
        status: res.status,
        statusText: res.statusText,
        body: text,
      });
      return null;
    }

    const text = await res.text();
    Logger.debug('fetch で取得した HTML の先頭', { url, htmlHead: text.slice(0, 300) });

    // node-html-parser でローカルパース
    try {
      const root = parse(text);
      const commentEl = root.querySelector(`#comment${commentNumber}`);

      if (commentEl) {
        // 可能性のあるセレクタを順に試す
        const selectors = SELECTORS.RES_COUNT.split(', ');
        let resElement: ParsedHTMLElement | null = null;

        for (const selector of selectors) {
          try {
            resElement = commentEl.querySelector(selector);
          } catch {
            resElement = null;
          }
          if (resElement) break;
        }

        const resText = resElement ? (resElement.textContent ?? '') : '';

        // コメント要素があるが返信要素が見つからない場合は返信0とみなす
        if (!resElement) {
          Logger.info('コメント要素に返信要素が見つかりません。返信0とします', { topicId, commentNumber });
          return 0;
        }

        // トリムしてから厳密に "件の返信" パターンを探す
        const trimmedText = resText.trim();
        Logger.info('コメント要素から取得した返信テキスト', {
          topicId,
          commentNumber,
          text: trimmedText.slice(0, 200),
        });

        const matchResult = trimmedText.match(REGEX_PATTERNS.RES_COUNT);
        if (matchResult) {
          const resCount = parseInt(matchResult[1], 10);
          if (!Number.isNaN(resCount) && resCount >= 0) return resCount;
        }
      }
    } catch (e) {
      Logger.warn('node-html-parser でのパースに失敗しました', e);
      Logger.error('返信数を取得できませんでした');
      return null;
    }
  } catch (err) {
    let errInfo: any = { url, errType: typeof err, errString: String(err) };
    if (err instanceof Error) {
      errInfo.errMessage = err.message;
      errInfo.errStack = err.stack;
      errInfo.errName = err.name;
    }
    Logger.error('fetch 中にエラーが発生しました', errInfo);
    return null;
  }

  return null;
}

/**
 * コメントを一度クロールする
 * @description 追跡中の全コメントの返信数を取得し、変更があればストレージを更新する。
 * 古いコメント（SKIP_AFTER_DAYS日以上経過）はスキップする。
 * 二重起動防止機構があるため、同時に複数回実行されることはない。
 * 
 * 処理フロー:
 * 1. 古すぎるコメントをフィルタリング
 * 2. 各コメントの返信数を順次取得
 * 3. 前回の返信数と比較して変化を検出
 * 4. 変化があればunreadCountを更新して保存
 * 5. 未読合計を調整
 * 
 * @param commentList - クロール対象のコメントリスト
 * @param getComment - コメントを取得する関数
 * @param saveComment - コメントを保存する関数
 * @param adjustUnread - 未読数を調整する関数
 * @returns 更新されたコメント数
 */
export async function crawlCommentsOnce(
  commentList: CommentEntry[],
  getComment: (topicId: string, commentNumber: string) => CommentEntry | undefined,
  saveComment: (entry: CommentEntry) => Promise<CommentEntry | null>,
  adjustUnread: (delta: number) => Promise<void>
): Promise<number> {
  if (isCrawling) {
    Logger.info('クローラー: 既に実行中です');
    return 0;
  }

  isCrawling = true;

  try {
    if (!commentList || commentList.length === 0) {
      Logger.info('クローラー: 更新対象のコメントはありません');
      return 0;
    }

    Logger.info('クローラー: コメントのチェックを開始します', { count: commentList.length });
    let updatedCount = 0;

    for (const comment of commentList) {
      // 各エントリー処理前に最新の有効フラグを確認
      try {
        const enabledNow = (await storage.getItem<boolean>(STORAGE_KEYS.CRAWLER_ENABLED)) ?? true;
        if (!enabledNow) {
          Logger.info('クローラー: 停止フラグが立っているため途中終了します');
          break;
        }
      } catch (e) {
        Logger.warn('クローラー: enabled フラグの読み取りに失敗しましたが処理を継続します', e);
      }

      try {
        const previousComment = getComment(comment.topicId, comment.commentNumber) ?? comment;
        const previousResCount = previousComment.resCount;
        const previousUnread = previousComment.unreadCount;

        // postedAt から31日以上経過したエントリーはスキップ
        if (previousComment.postedAt) {
          const postedDate = new Date(previousComment.postedAt).getTime();
          const currentTime = new Date().getTime();
          const elapsedDays = (currentTime - postedDate) / (1000 * 60 * 60 * 24);

          if (elapsedDays >= CRAWLER_CONFIG.SKIP_AFTER_DAYS) {
            Logger.info(`クローラー: ${CRAWLER_CONFIG.SKIP_AFTER_DAYS}日以上経過したエントリーをスキップしました`, {
              topicId: comment.topicId,
              commentNumber: comment.commentNumber,
              elapsedDays: Math.floor(elapsedDays),
            });
            continue;
          }
        }

        const currentResCount = await fetchResCountForComment(comment.topicId, comment.commentNumber);

        if (currentResCount === null) {
          Logger.warn('クローラー: コメントが見つかりませんでした', {
            topicId: comment.topicId,
            commentNumber: comment.commentNumber,
          });
          continue;
        }

        let unreadCount = previousResCount == null ? 0 : currentResCount - previousResCount + (previousUnread ?? 0);
        if (typeof unreadCount === 'number') unreadCount = Math.max(0, unreadCount);

        // 未読数または返信数に変化があった場合のみ保存
        const delta = unreadCount - previousUnread;
        const resChanged = currentResCount !== previousResCount;

        if (delta !== 0 || resChanged) {
          const updatedEntry: CommentEntry = {
            ...previousComment,
            resCount: currentResCount,
            unreadCount: unreadCount,
            updatedAt: new Date().toISOString(),
          };

          // 保存
          const saved = await saveComment(updatedEntry);
          if (saved) {
            // 未読差分を調整
            if (delta !== 0) {
              await adjustUnread(delta);
            }
            updatedCount++;
            Logger.info('クローラー: 更新を検出しました', {
              topicId: comment.topicId,
              commentNumber: comment.commentNumber,
              previousResCount,
              currentResCount,
              delta,
            });
          }
        } else {
          Logger.info('クローラー: 新着なし', {
            topicId: comment.topicId,
            commentNumber: comment.commentNumber,
            resCount: currentResCount,
          });
        }
      } catch (err) {
        Logger.error('クローラー: 更新に失敗しました', err);
      } finally {
        // サーバー負荷軽減のため各ループ後に3秒待機
        try {
          await sleep(CRAWLER_CONFIG.ACTIVE_DELAY_MS);

          // 待機後にもフラグを再確認して停止を反映
          try {
            const enabledAfter = (await storage.getItem<boolean>(STORAGE_KEYS.CRAWLER_ENABLED)) ?? true;
            if (!enabledAfter) {
              Logger.info('クローラー: 待機後に停止フラグが検出されたためループを抜けます');
              break;
            }
          } catch (e) {
            Logger.warn('クローラー: 待機後の enabled 読み取りに失敗しましたが処理を継続します', e);
          }
        } catch {
          // ignore
        }
      }
    }

    if (updatedCount > 0) {
      Logger.info('クローラー: 更新完了', { updatedCount });
    } else {
      Logger.info('クローラー: 更新なし');
    }

    return updatedCount;
  } catch (err) {
    Logger.error('クローラー: 実行中にエラーが発生しました', err);
    return 0;
  } finally {
    isCrawling = false;
  }
}
