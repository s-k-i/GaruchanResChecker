/**
 * @file コメント追跡ボタン生成ユーティリティ
 * @description コメントページとトピックページで共通の追跡ボタン生成ロジック
 */
import Logger from './logger';
import { sendMessageSafely } from './error-handler';
import {
  SELECTORS,
  CLASS_NAMES,
  ICONS,
  TEXT_REPLACEMENTS,
  REGEX_PATTERNS,
} from '../constants/app-config';
import { validateTopicId, validateCommentNumber, validateTextLength } from './validation';
import type { GetTrackButtonVisibleResponse, UpsertCommentResponse } from '../types/messages';
import type { BrowserRuntime } from '../types/browser.d';

/**
 * コメント本文を抽出する（画像・引用を置換）
 * @param element - コメント要素
 * @returns コメント本文
 */
function extractCommentBody(element: Element): string {
  const bodyEl = element.querySelector(SELECTORS.COMMENT_BODY);
  if (!bodyEl) return '';

  // bodyEl のクローンを作成して処理
  const cloned = bodyEl.cloneNode(true) as Element;

  // comment-img要素を【画像】に置換
  cloned.querySelectorAll(SELECTORS.COMMENT_IMG).forEach((imgEl) => {
    imgEl.textContent = TEXT_REPLACEMENTS.IMAGE;
  });

  // comment-url要素を【引用】に置換
  cloned.querySelectorAll(SELECTORS.COMMENT_URL).forEach((urlEl) => {
    urlEl.textContent = TEXT_REPLACEMENTS.QUOTE;
  });

  return cloned.textContent?.trim() || '';
}

/**
 * コメントページの返信数をカウントする
 * @description `ul.res-comment` 内の `.comment-item` 要素をカウントする。
 * @returns 返信数（見つからない場合は 0）
 */
function countRepliesOnCommentPage(): number {
  const resCommentList = document.querySelector(SELECTORS.RES_COMMENT);
  if (!resCommentList) return 0;

  const replyItems = resCommentList.querySelectorAll(SELECTORS.COMMENT_ITEM);
  return replyItems.length;
}

/**
 * 返信数を抽出する
 * @param element - コメント要素
 * @returns 返信数
 */
function extractResCount(element: Element): number {
  const resBtn = element.querySelector(SELECTORS.RES_COUNT);
  if (!resBtn) {
    // 返信カウンター要素が見つからない場合、コメントページかどうかを判定
    // コメントページでは `ul.topic-comment` の子要素として対象コメントが配置される
    const topicCommentList = document.querySelector(SELECTORS.TOPIC_COMMENT);
    if (topicCommentList && topicCommentList.contains(element)) {
      Logger.info('コメントページを検出: 返信数をカウントします');
      return countRepliesOnCommentPage();
    }
    return 0;
  }

  const txt = (resBtn.textContent || '').trim();
  const m = txt.match(REGEX_PATTERNS.RES_COUNT);
  if (m) return parseInt(m[1], 10);

  return 0;
}

/**
 * 投稿日時を抽出する
 * @param element - コメント要素
 * @returns 投稿日時、または null
 */
function extractPostedAt(element: Element): string | null {
  return element.querySelector(SELECTORS.POSTED_AT)?.textContent?.trim() || null;
}

/**
 * コメント要素から情報を抽出
 * @param element - コメント要素
 * @returns コメント情報、または null
 */
function extractCommentInfoFromElement(element: Element): {
  commentNumber: string;
  commentBody: string;
  resCount: number;
  postedAt: string | null;
} | null {
  const commentNumber = element.getAttribute('data-number') || element.id.replace('comment', '');
  
  // 基本検証
  if (!validateCommentNumber(commentNumber)) {
    Logger.error('無効なコメント番号が検出されました', { commentNumber });
    return null;
  }

  const commentBody = extractCommentBody(element);
  const resCount = extractResCount(element);
  const postedAt = extractPostedAt(element);

  return { commentNumber, commentBody, resCount, postedAt };
}

/**
 * コメント要素を追跡リストに追加
 * @param element - コメント要素
 * @param topicId - トピックID
 * @param topicTitle - トピックタイトル
 * @param source - 追跡元（'button' | 'context-menu'）
 */
export async function trackCommentFromElement(
  element: Element,
  topicId: string,
  topicTitle: string,
  source: 'button' | 'context-menu' = 'button'
): Promise<void> {
  try {
    const info = extractCommentInfoFromElement(element);
    if (!info) return;

    const { commentNumber, commentBody, resCount, postedAt } = info;

    // 入力検証（セキュリティ対策）
    if (!validateTopicId(topicId)) {
      Logger.error('無効なトピックIDが検出されました', { topicId });
      return;
    }
    if (commentBody && !validateTextLength(commentBody)) {
      Logger.error('コメント本文が長すぎます', { length: commentBody.length });
      return;
    }

    const entry = {
      topicId,
      topicTitle,
      commentNumber,
      postedAt,
      commentBody,
      resCount,
      unreadCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 書き込みは background 経由で集中処理する
    const saveResult = await sendMessageSafely<UpsertCommentResponse>({
      type: 'upsert-comment',
      entry,
    });

    if (saveResult?.ok) {
      const logPrefix = source === 'button' ? 'ボタン' : 'コンテキストメニュー';
      Logger.info(`${logPrefix}: コメントを保存しました`, entry);
      // 追加直後に一度クローラーを呼び出して初期値を取得
      await sendMessageSafely({ type: 'crawl-now' });
    }
  } catch (err) {
    const logPrefix = source === 'button' ? 'ボタン' : 'コンテキストメニュー';
    Logger.error(`${logPrefix}: コメント保存に失敗`, err);
  }
}

/**
 * 追跡ボタンをすべて削除する
 */
export function removeTrackingButtons(): void {
  document.querySelectorAll(SELECTORS.TRACK_BUTTON).forEach((btn) => btn.remove());
  Logger.info('追跡ボタンを削除しました');
}

/**
 * 各コメントに追跡ボタンを追加する
 * @param topicId - トピック ID
 * @param topicTitle - トピックタイトル
 * @param commentElements - コメント要素のリスト（省略時は内部で取得）
 */
export async function addTrackingButtons(
  topicId: string, 
  topicTitle: string,
  commentElements?: NodeListOf<Element>
): Promise<void> {
  // 追跡ボタン表示状態を取得
  const response = await sendMessageSafely<GetTrackButtonVisibleResponse>({
    type: 'get-track-button-visible',
  });
  const trackButtonVisible = response?.visible ?? false;

  // 追跡ボタンが非表示の場合は何もしない
  if (!trackButtonVisible) {
    Logger.info('追跡ボタンは非表示に設定されています');
    return;
  }

  // 要素リストが渡されなければ取得する
  const elements = commentElements ?? document.querySelectorAll(SELECTORS.COMMENT_ITEM);

  // 各コメントに「追跡」ボタンを追加
  elements.forEach((el) => {
    // すでにボタンがあればスキップ
    if (el.querySelector(SELECTORS.TRACK_BUTTON)) return;

    const btn = document.createElement('button');
    btn.className = CLASS_NAMES.TRACK_BUTTON;

    // ハートアイコンを追加
    const icon = document.createElement('img');
    icon.src = (browser.runtime as BrowserRuntime).getURL(ICONS.PINK_HEART_SVG);
    icon.className = CLASS_NAMES.TRACK_ICON;

    btn.appendChild(icon);

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await trackCommentFromElement(el, topicId, topicTitle, 'button');
    });

    // コメント下部にボタン追加
    const actions = el.querySelector(SELECTORS.ACTIONS) || el;
    actions.appendChild(btn);
  });
}
