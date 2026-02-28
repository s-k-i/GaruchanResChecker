/**
 * @file バックグラウンドサービスワーカー
 * @description ブラウザ拡張機能のメインロジックを実行するバックグラウンドスクリプト。
 * 
 * 主要機能:
 * - chrome.alarms による定期クローリングのスケジューリング
 * - 未読バッジの初期化
 * - content script/popup 間のメッセージルーティング
 * - タブアクティベーション・URL変化に応じたアイコン切り替え
 * - コンテキストメニューの管理
 * 
 * ビジネスロジックは各サービスに委譲:
 * - コメントCRUD/キャッシュ管理 → comment-service
 * - クローリング → crawler-service
 * - 未読・バッジ管理 → unread-service
 * - メッセージ処理 → message-handler
 * - ストレージ操作 → storage-service
 */
import Logger from '../utils/logger';
import { storage } from '#imports';
import { updateIconForTab } from '../utils/icon-manager';
import type { MessageRequest, MessageResponse } from '../types/messages';
import type { Tab, ActiveInfo, ChangeInfo, ContextMenuClickInfo } from '../types/browser.d';
import {
  loadCacheFromStorage,
  getAllCommentsFromCache,
} from '../services/comment-service';
import { crawlCommentsOnce } from '../services/crawler-service';
import { routeMessage } from '../services/message-handler';
import {
  LOCAL_STORAGE_KEYS,
  CRAWLER_CONFIG,
  MESSAGE_TYPES,
  CONTEXT_MENU_CONFIG,
  SITE_CONFIG,
  URL_PATTERNS,
} from '../constants/app-config';
import { toLocalKey } from '../services/storage-service';
import { recomputeBadge, setOnUnreadChanged } from '../services/unread-service';
import { isTrackablePageUrl } from '../utils/validation';

/**
 * 次のクロールアラームを登録する
 * @description 既存アラームを削除してから delayInMinutes で登録し直す。
 * クロール完了後と起動時の両方から呼ばれる。
 */
async function scheduleNextCrawl(): Promise<void> {
  try {
    await browser.alarms.create(CRAWLER_CONFIG.ALARM_NAME, {
      delayInMinutes: CRAWLER_CONFIG.ALARM_DELAY_MINUTES,
    });
    Logger.info('次のクロールアラームを登録しました');
  } catch (e) {
    Logger.error('クロールアラームの登録に失敗しました', e);
  }
}

export default defineBackground(() => {
  Logger.info('バックグラウンドを初期化しました', { id: browser.runtime.id });

  // Content Script から storage.session へのアクセスを許可する
  browser.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
  });

  // 未読変化時に popup へ通知する（unread-service からの UI 通知をここで担う）
  setOnUnreadChanged(() => {
    browser.runtime.sendMessage({ type: MESSAGE_TYPES.REFRESH_POPUP }).catch(() => {});
  });

  // 起動時の初期化処理
  initializeExtension();

  async function initializeExtension(): Promise<void> {
    try {
      // キャッシュをロード
      await loadCacheFromStorage();

      // 現在アクティブなタブのアイコンを初期設定
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        await updateIconForTab(tabs[0].id, tabs[0].url);
      }

      // 初期バッジ設定
      await recomputeBadge();

      // コンテキストメニューを作成（初期状態は非表示）
      // 既存のメニューを削除してから作成することで重複エラーを回避
      await browser.contextMenus.removeAll();
      browser.contextMenus.create({
        id: CONTEXT_MENU_CONFIG.TRACK_COMMENT_ID,
        title: CONTEXT_MENU_CONFIG.TRACK_COMMENT_TITLE,
        contexts: ['all'] as const,
        visible: false,
      });
      Logger.info('コンテキストメニューを作成しました');

      // 現在のタブに応じてメニューの表示を更新
      if (tabs && tabs[0]) {
        await updateContextMenuVisibility(tabs[0].url);
      }
    } catch (e) {
      Logger.error('初期化中にエラーが発生しました', e);
    }
  }

  // アクティブタブが切り替わったとき
  browser.tabs.onActivated.addListener(async (activeInfo: ActiveInfo) => {
    try {
      const tab: Tab = await browser.tabs.get(activeInfo.tabId);
      await updateIconForTab(tab.id, tab.url);
      await updateContextMenuVisibility(tab.url);
    } catch (e) {
      Logger.error('タブアクティブ化時にエラーが発生しました', e);
    }
  });

  // タブのURLが変化・ページロード完了時
  browser.tabs.onUpdated.addListener(async (tabId: number, changeInfo: ChangeInfo, tab: Tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      await updateIconForTab(tabId, changeInfo.url ?? tab.url);
      await updateContextMenuVisibility(changeInfo.url ?? tab.url);
    }
  });

  // ウィンドウのフォーカスが変わったとき
  browser.windows.onFocusChanged.addListener(async (windowId: number) => {
    if (windowId === browser.windows.WINDOW_ID_NONE) return;
    try {
      const tabs = await browser.tabs.query({ active: true, windowId });
      if (tabs && tabs[0]) {
        await updateIconForTab(tabs[0].id, tabs[0].url);
        await updateContextMenuVisibility(tabs[0].url);
      }
    } catch (e) {
      Logger.error('ウィンドウフォーカス変更時にエラーが発生しました', e);
    }
  });

  // クローラー: chrome.alarms で定期的に SW を起動してクロールする（MV3対応）
  // ※ SW はアイドル時に強制終了されるため while+sleep は使えない。alarms は SW 停止中でも発火する。
  browser.alarms.onAlarm.addListener(async (alarm: { name: string }) => {
    if (alarm.name !== CRAWLER_CONFIG.ALARM_NAME) return;

    const enabled = (await storage.getItem<boolean>(toLocalKey(LOCAL_STORAGE_KEYS.CRAWLER_ENABLED))) ?? true;
    if (!enabled) {
      Logger.info('クローラーアラーム: 停止中のためスキップします');
      // 停止中でも次のアラームは登録しておく（再開時に1分待たずに拾えるよう）
      await scheduleNextCrawl();
      return;
    }

    // SW 再起動直後はインメモリキャッシュが空なので必ず再ロードする
    await loadCacheFromStorage();
    const list = getAllCommentsFromCache();
    Logger.info('クローラーアラーム: クロールを開始します', { count: list.length });
    await crawlCommentsOnce(list);

    // クロール完了後に次のアラームを登録
    await scheduleNextCrawl();
  });

  // アラーム初期設定（SW 再起動のたびに呼ばれるが、既存アラームがあれば再登録しない）
  initializeCrawlerAlarm();

  async function initializeCrawlerAlarm(): Promise<void> {
    try {
      // 初回デフォルト: クローラーフラグ有効化フラグが未設定なら有効化しておく
      const saved = await storage.getItem<boolean>(toLocalKey(LOCAL_STORAGE_KEYS.CRAWLER_ENABLED));
      if (saved === undefined || saved === null) {
        await storage.setItem(toLocalKey(LOCAL_STORAGE_KEYS.CRAWLER_ENABLED), true);
        Logger.info('クローラーを有効化しました（デフォルト設定）');
      }

      // 既存アラームがなければ新規登録（SW 再起動毎に重複登録されるのを防ぐ）
      const existing = await browser.alarms.get(CRAWLER_CONFIG.ALARM_NAME);
      if (!existing) {
        await scheduleNextCrawl();
      } else {
        Logger.info('クローラーアラームは既に登録済みです');
      }
    } catch (e) {
      Logger.error('クローラーアラームの設定に失敗しました', e);
    }
  }

  // メッセージハンドラ
  browser.runtime.onMessage.addListener(
    (message: MessageRequest, _sender: unknown, sendResponse: (response: MessageResponse) => void) => {
      if (!message) {
        sendResponse({ ok: false, error: 'メッセージが空です' });
        return false;
      }

      // 非同期処理を実行して結果を返す
      (async () => {
        const response = await routeMessage(message);
        // 追跡ボタン表示状態が変更された場合は全タブに通知
        if (message.type === MESSAGE_TYPES.SET_TRACK_BUTTON_VISIBLE && response.ok) {
          broadcastTrackButtonVisibility(message.visible);
        }
        sendResponse(response);
      })();

      // 非同期レスポンスを待つために true を返す
      return true;
    }
  );

  // コンテキストメニュークリックハンドラ
  browser.contextMenus.onClicked.addListener((info: ContextMenuClickInfo, tab?: Tab) => {
    if (info.menuItemId === CONTEXT_MENU_CONFIG.TRACK_COMMENT_ID && tab?.id && tab?.url) {
      // URLをチェック（念のため）
      if (!isTrackablePageUrl(tab.url)) {
        Logger.warn('コンテキストメニュー: 追跡不可能なページです', { url: tab.url });
        return;
      }

      Logger.info('コンテキストメニューがクリックされました', { tabId: tab.id, url: tab.url });
      // content scriptに追跡処理を依頼
      browser.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPES.TRACK_FROM_CONTEXT_MENU,
        tabId: tab.id,
      }).catch((err: unknown) => {
        Logger.error('コンテキストメニュー処理でエラーが発生しました', err);
      });
    }
  });
});

/**
 * 追跡ボタン表示状態を全タブにブロードキャストする
 * @param visible - 追跡ボタンの表示状態
 */
async function broadcastTrackButtonVisibility(visible: boolean): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ url: [
      `${SITE_CONFIG.BASE_URL}${URL_PATTERNS.TOPICS}*`,
      `${SITE_CONFIG.BASE_URL}${URL_PATTERNS.COMMENT}*`,
    ] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      browser.tabs
        .sendMessage(tab.id, {
          type: MESSAGE_TYPES.TRACK_BUTTON_VISIBILITY_CHANGED,
          visible,
        })
        .catch(() => {
          // タブが閉じている場合などは無視
        });
    }
  } catch (e) {
    Logger.error('追跡ボタン表示変更のブロードキャストに失敗しました', e);
  }
}

/**
 * コンテキストメニューの表示/非表示を更新する
 * @param url - 現在のタブのURL
 */
async function updateContextMenuVisibility(url: string | undefined): Promise<void> {
  try {
    const visible = isTrackablePageUrl(url);
    await browser.contextMenus.update(CONTEXT_MENU_CONFIG.TRACK_COMMENT_ID, { visible });
    Logger.debug('コンテキストメニューの表示を更新しました', { url, visible });
  } catch (e) {
    Logger.error('コンテキストメニューの更新に失敗しました', e);
  }
}
