/**
 * @file クローラーサービス
 * @description コメントの返信数を定期的に取得し、未読数を更新する
 */
import { storage } from '#imports';
import Logger from '../utils/logger';
import { sleep } from '../utils/async';
import { parseJstDate } from '../utils/date';
import type { CommentEntry } from '../types/comment';
import {
  getCommentFromCache,
  saveComment,
} from './comment-service';
import { adjustUnread, computeNewUnreadCount } from './unread-service';
import { countRepliesFromCommentPageHtml } from './html-parser-service';
import { type FetchResult, handleFetchError } from './backoff-strategy';
import {
  SITE_CONFIG,
  CRAWLER_CONFIG,
  LOCAL_STORAGE_KEYS,
  SESSION_STORAGE_KEYS,
  ERROR_HANDLING_CONFIG,
} from '../constants/app-config';
import { toLocalKey, toSessionKey } from './storage-service';
import { validateTopicId, validateCommentNumber, buildSafeUrl } from '../utils/validation';

/**
 * クローラーの二重起動を防止するフラグ
 */
let isCrawling = false;

/**
 * 指定したコメントの返信数を取得する
 * @param topicId - トピック ID
 * @param commentNumber - コメント番号
 * @returns FetchResult（正常時は count、失敗時は status コード）
 */
export async function fetchResCountForComment(
  topicId: string,
  commentNumber: string
): Promise<FetchResult> {
  // 入力検証（セキュリティ対策）
  if (!validateTopicId(topicId) || !validateCommentNumber(commentNumber)) {
    Logger.error('無効な入力パラメータが検出されました', { topicId, commentNumber });
    return { ok: false, errorType: 'validation' };
  }

  const basePath = `/comment/${topicId}/${commentNumber}/`;
  const url = buildSafeUrl(SITE_CONFIG.BASE_URL, basePath);

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    ERROR_HANDLING_CONFIG.FETCH_TIMEOUT_MS,
  );

  try {
    Logger.debug('返信数取得のため fetch を開始', { url, topicId, commentNumber });
    const res = await fetch(url, { signal: controller.signal });
    Logger.debug('fetch レスポンス', {
      url,
      status: res.status,
      ok: res.ok,
      redirected: res.redirected,
      type: res.type,
    });

    if (res.redirected) {
      Logger.warn('リダイレクトを検出しました。トピックが削除またはURLが変更された可能性があります', {
        originalUrl: url,
        finalUrl: res.url,
        topicId,
        commentNumber,
      });
      return { ok: false, errorType: 'redirect', finalUrl: res.url };
    }

    if (!res.ok) {
      const text = await res.text().catch((e) => `テキスト取得失敗: ${e}`);
      Logger.error('fetch が失敗しました', {
        url,
        status: res.status,
        statusText: res.statusText,
        body: text,
      });
      return { ok: false, errorType: 'http', status: res.status };
    }

    const text = await res.text();
    Logger.debug('fetch で取得した HTML の先頭', { url, htmlHead: text.slice(0, 300) });

    try {
      const count = countRepliesFromCommentPageHtml(text);
      return { ok: true, count };
    } catch (e) {
      Logger.warn('node-html-parser でのパースに失敗しました', e);
      Logger.error('返信数を取得できませんでした');
      return { ok: false, errorType: 'parse' };
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      Logger.error('fetch がタイムアウトしました', {
        url,
        timeoutMs: ERROR_HANDLING_CONFIG.FETCH_TIMEOUT_MS,
      });
    } else {
      const errInfo: Record<string, unknown> = { url, errType: typeof err, errString: String(err) };
      if (err instanceof Error) {
        errInfo.errMessage = err.message;
        errInfo.errStack = err.stack;
        errInfo.errName = err.name;
      }
      Logger.error('fetch 中にエラーが発生しました', errInfo);
    }
    return { ok: false, errorType: 'network' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * クローラーの有効フラグを読み取る
 * @description ストレージ読み取りに失敗した場合は fail-open で true を返す
 * @returns クローラーが有効な場合 true
 */
async function checkCrawlerEnabled(): Promise<boolean> {
  try {
    return (await storage.getItem<boolean>(toLocalKey(LOCAL_STORAGE_KEYS.CRAWLER_ENABLED))) ?? true;
  } catch (e) {
    Logger.warn('クローラー: enabled フラグの読み取りに失敗しましたが処理を継続します', e);
    return true;
  }
}

/**
 * 1件のコメントを処理した結果
 * - `'updated'` : 返信数に変化があり保存した
 * - `'skipped'` : 期限切れ・エラー等でスキップ
 * - `'abort'`   : バックオフがセットされたためループ全体を中断すべき
 */
type ProcessResult = 'updated' | 'skipped' | 'abort';

/**
 * 1件のコメントの返信数を取得・比較し、変化があれば保存する
 * @param comment - 処理対象のコメントエントリー
 * @returns 処理結果
 */
async function processSingleComment(comment: CommentEntry): Promise<ProcessResult> {
  const previousComment = getCommentFromCache(comment.topicId, comment.commentNumber) ?? comment;
  const previousResCount = previousComment.resCount;
  const previousUnread   = previousComment.unreadCount ?? 0;

  // postedAt から SKIP_AFTER_DAYS 日以上経過したエントリーはスキップ
  if (isCommentExpired(previousComment)) {
    Logger.info(`クローラー: ${CRAWLER_CONFIG.SKIP_AFTER_DAYS}日以上経過したエントリーをスキップしました`, {
      topicId: comment.topicId,
      commentNumber: comment.commentNumber,
    });
    return 'skipped';
  }

  const fetchResult = await fetchResCountForComment(comment.topicId, comment.commentNumber);

  if (!fetchResult.ok) {
    const action = await handleFetchError(fetchResult, comment.topicId, comment.commentNumber);
    return action === 'abort' ? 'abort' : 'skipped';
  }

  // 正常取得時: 500/503 連続エラーカウンターをリセット
  try {
      await storage.setItem(toSessionKey(SESSION_STORAGE_KEYS.CRAWLER_SERVER_ERROR_COUNT), 0);
  } catch (e) {
    Logger.warn('クローラー: エラーカウンターのリセットに失敗しましたが処理を継続します', e);
  }

  const currentResCount = fetchResult.count;
  const unreadCount = computeNewUnreadCount(previousResCount, currentResCount, previousUnread);
  const delta      = unreadCount - previousUnread;
  const resChanged = currentResCount !== previousResCount;

  if (delta === 0 && !resChanged) {
    Logger.info('クローラー: 新着なし', {
      topicId: comment.topicId,
      commentNumber: comment.commentNumber,
      resCount: currentResCount,
    });
    return 'skipped';
  }

  const updatedEntry: CommentEntry = {
    ...previousComment,
    resCount: currentResCount,
    unreadCount,
    updatedAt: new Date().toISOString(),
  };

  const saved = await saveComment(updatedEntry);
  if (!saved) return 'skipped';

  if (delta !== 0) {
    await adjustUnread(delta);
  }

  Logger.info('クローラー: 更新を検出しました', {
    topicId: comment.topicId,
    commentNumber: comment.commentNumber,
    previousResCount,
    currentResCount,
    delta,
  });
  return 'updated';
}

/**
 * コメントが追跡期限切れかどうか判定する
 * @description postedAt から SKIP_AFTER_DAYS 日以上経過していれば期限切れとみなす
 * @param comment - 判定対象のコメントエントリー
 * @returns 期限切れの場合 true
 */
function isCommentExpired(comment: CommentEntry): boolean {
  if (!comment.postedAt) return false;
  const parsed = parseJstDate(comment.postedAt);
  if (!parsed) {
    Logger.warn('isCommentExpired: postedAt のパースに失敗しました。期限切れとみなします', { postedAt: comment.postedAt });
    return true;
  }
  const elapsedDays = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
  return elapsedDays >= CRAWLER_CONFIG.SKIP_AFTER_DAYS;
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
 * @returns 更新されたコメント数
 */
export async function crawlCommentsOnce(
  commentList: CommentEntry[]
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

    // バックオフ中は全エントリーをスキップ
    try {
      const backoffUntil = (await storage.getItem<number>(toSessionKey(SESSION_STORAGE_KEYS.CRAWLER_BACKOFF_UNTIL))) ?? 0;
      if (Date.now() < backoffUntil) {
        const remainingMin = Math.ceil((backoffUntil - Date.now()) / 60_000);
        Logger.info('クローラー: バックオフ中のためスキップします', { remainingMin });
        return 0;
      }
    } catch (e) {
      Logger.warn('クローラー: バックオフ状態の読み取りに失敗しましたが処理を継続します', e);
    }

    Logger.info('クローラー: コメントのチェックを開始します', { count: commentList.length });
    let updatedCount = 0;
    let shouldAbort  = false;

    for (const comment of commentList) {
      if (shouldAbort) break;

      // ループ先頭で有効フラグを確認
      if (!await checkCrawlerEnabled()) {
        Logger.info('クローラー: 停止フラグが立っているため途中終了します');
        break;
      }

      try {
        const result = await processSingleComment(comment);
        if (result === 'abort') {
          shouldAbort = true;
        } else if (result === 'updated') {
          updatedCount++;
        }
      } catch (err) {
        Logger.error('クローラー: 更新に失敗しました', err);
      } finally {
        // サーバー負荷軽減のため各ループ後に待機
        try {
          await sleep(CRAWLER_CONFIG.ACTIVE_DELAY_MS);

          // 待機後にも停止フラグを再確認
          if (!await checkCrawlerEnabled()) {
            Logger.info('クローラー: 待機後に停止フラグが検出されたためループを抜けます');
            shouldAbort = true;
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
