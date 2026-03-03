/**
 * @file コンテントスクリプト初期化ユーティリティ
 * @description topics / comment ページ共通の追跡ボタン挿入ロジック
 */
import Logger from './logger';
import { getTopicId, getTopicTitle } from './topic-extractor';
import { addTrackingButtons, trackCommentFromElement, removeTrackingButtons } from './comment-tracking';
import { sendMessageSafely } from './error-handler';
import { isTrackablePageUrl } from './validation';
import { MESSAGE_TYPES, SELECTORS } from '../constants/app-config';
import { injectCommentStyleOverride } from './comment-style-injector';
import type { SetSessionResponse, MessageRequest } from '../types/messages';

/**
 * コンテントスクリプト初期化オプション
 */
export interface ContentScriptInitOptions {
  /** URLパスプレフィックス（例: '/topics/', '/comment/'） */
  pathPrefix: string;
  /** `isTrackablePageUrl` でページ種別チェックを行うか（キーワード/カテゴリページをスキップする場合） */
  checkTrackableUrl?: boolean;
  /** 起動時のログメッセージ */
  initLogMessage: string;
  /** トラッカブルでないページだった場合のログメッセージ */
  skipLogMessage?: string;
}

/**
 * 追跡ボタン挿入の共通初期化処理
 * @description topics / comment コンテントスクリプトで共有されるロジック。
 * 1. ページ種別チェック（オプション）
 * 2. トピックID / タイトルの抽出
 * 3. セッションへの保存
 * 4. 追跡ボタンの挿入
 * 5. コンテキストメニュー用イベントリスナーの登録
 * 6. バックグラウンドからのメッセージ受信
 */
export async function initTrackingContentScript(options: ContentScriptInitOptions): Promise<void> {
  const { pathPrefix, checkTrackableUrl, initLogMessage, skipLogMessage } = options;

  // topics ページのみ: キーワード・カテゴリページをスキップ
  if (checkTrackableUrl && !isTrackablePageUrl(location.href)) {
    Logger.info(
      skipLogMessage ?? 'このページはスキップします（キーワードまたはカテゴリページ）',
      { pathname: location.pathname }
    );
    return;
  }

  Logger.info(initLogMessage);

  // コンテキストメニュー用: 右クリックされたコメント要素を記録
  let lastContextMenuTarget: Element | null = null;

  try {
    // トピック情報取得
    const topicId = getTopicId(pathPrefix);
    if (!topicId) {
      Logger.error('このページにトピックIDが見つかりませんでした', { href: location.href });
      return;
    }

    const topicTitle = getTopicTitle();
    if (!topicTitle) {
      Logger.error('このページにトピックタイトルが見つかりませんでした', { href: location.href });
      return;
    }

    const topic = { topicId, topicTitle };

    // セッションに保存（background 経由）
    await sendMessageSafely<SetSessionResponse>({
      type: 'set-session',
      key: topicId,
      value: topic,
    });

    Logger.info('トピック情報を抽出/保存しました', topic);

    // コメントスタイル（文字サイズ・文字色）の上書き注入
    await injectCommentStyleOverride();

    // コメント要素を取得（DOM検索は1回のみ）
    const commentElements = document.querySelectorAll(SELECTORS.COMMENT_ITEM);

    // 各コメントに追跡ボタンを追加
    await addTrackingButtons(topicId, topicTitle, commentElements);

    // コンテキストメニュー用: 各コメントに右クリックイベントリスナーを追加
    commentElements.forEach((commentEl) => {
      commentEl.addEventListener('contextmenu', () => {
        lastContextMenuTarget = commentEl;
      });
    });

    // background.ts からのメッセージを受信
    browser.runtime.onMessage.addListener((message: MessageRequest) => {
      if (message.type === MESSAGE_TYPES.TRACK_FROM_CONTEXT_MENU && lastContextMenuTarget) {
        trackCommentFromElement(lastContextMenuTarget, topicId, topicTitle, 'context-menu');
      }
      if (message.type === MESSAGE_TYPES.TRACK_BUTTON_VISIBILITY_CHANGED) {
        if (message.visible) {
          addTrackingButtons(topicId, topicTitle);
        } else {
          removeTrackingButtons();
        }
      }
      if (message.type === MESSAGE_TYPES.COMMENT_STYLE_CHANGED) {
        injectCommentStyleOverride();
      }
    });
  } catch (err) {
    Logger.error('コンテントスクリプトの初期化に失敗しました', err);
  }
}
