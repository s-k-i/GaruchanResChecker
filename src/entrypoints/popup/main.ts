/**
 * @file ポップアップUIのメインスクリプト
 * @description ブラウザアクションボタンをクリックしたときに表示されるUI。
 * 追跡中のコメント一覧を表示し、追跡ボタンや通知の設定を提供する。
 *
 * 主要機能:
 * - 追跡ボタン表示/非表示切り替え
 * - 通知ON/OFF切り替え
 * - コメント一覧表示（トピック別にグループ化）
 * - 個別コメント削除、トピック単位での一括削除
 * - 未読クリア（リンククリック時）
 */
import './style.css';
import Logger from '../../utils/logger';
import { sendMessageSafely } from '../../utils/error-handler';
import { createToggleSwitch } from './toggle-switch';
import { renderComments, renderEmpty } from './comment-renderer';
import type {
  GetTrackButtonVisibleResponse,
  SetTrackButtonVisibleResponse,
  GetCrawlerEnabledResponse,
  SetCrawlerEnabledResponse,
  GetAllCommentsResponse,
} from '../../types/messages';

// ---- DOM 構造 ---------------------------------------------------------------

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div>
    <div class="popup-header">
      <span class="app-title">ガルちゃん返信チェッカー</span>
    </div>
    <div class="card">
      <div id="comments-list"></div>
    </div>
  </div>
`;

const headerEl = document.querySelector<HTMLElement>('.popup-header')!;
const listEl   = document.getElementById('comments-list') as HTMLElement;

// ---- コメントリスト読み込み・描画 -------------------------------------------

/**
 * background からコメントリストを取得してリスト要素に描画する
 */
async function loadAndRender(): Promise<void> {
  try {
    Logger.debug('get-all-comments を送信中...');
    const response = await sendMessageSafely<GetAllCommentsResponse>({
      type: 'get-all-comments',
    });
    Logger.debug('background からの応答:', response);
    const comments = response?.comments ?? [];
    Logger.debug('コメント数:', comments.length);
    renderComments(listEl, comments, loadAndRender);
  } catch (err) {
    Logger.error('コメントリストの読み込みに失敗しました', err);
    renderEmpty(listEl);
  }
}

// ---- ヘッダースイッチ初期化 -------------------------------------------------

/**
 * 追跡ボタン表示 ON/OFF スイッチを初期化してヘッダーに追加する
 */
async function initTrackButtonToggle(): Promise<void> {
  try {
    const response = await sendMessageSafely<GetTrackButtonVisibleResponse>({
      type: 'get-track-button-visible',
    });
    const visible = response?.visible ?? true;

    const el = createToggleSwitch({
      label: '追跡ボタン',
      statusOn: '表示',
      statusOff: '非表示',
      checked: visible,
      containerClass: 'track-button-toggle-container',
      labelClass: 'track-button-label',
      statusClass: 'track-button-status',
      onChange: async (checked) => {
        await sendMessageSafely<SetTrackButtonVisibleResponse>({
          type: 'set-track-button-visible',
          visible: checked,
        });
      },
    });
    headerEl.appendChild(el);
  } catch (e) {
    Logger.error('追跡ボタンスイッチの初期化に失敗しました', e);
  }
}

/**
 * 通知（クローラー）ON/OFF スイッチを初期化してヘッダーに追加する
 */
async function initCrawlerToggle(): Promise<void> {
  try {
    const response = await sendMessageSafely<GetCrawlerEnabledResponse>({
      type: 'get-crawler-enabled',
    });
    const enabled = response?.enabled ?? true;

    const el = createToggleSwitch({
      label: '通知',
      statusOn: 'ON',
      statusOff: 'OFF',
      checked: enabled,
      containerClass: 'crawler-toggle-container',
      labelClass: 'crawler-label',
      statusClass: 'crawler-status',
      onChange: async (checked) => {
        await sendMessageSafely<SetCrawlerEnabledResponse>({
          type: 'set-crawler-enabled',
          enabled: checked,
        });
      },
    });
    headerEl.appendChild(el);
  } catch (e) {
    Logger.error('クローラースイッチの初期化に失敗しました', e);
  }
}

// ---- 初期化 & メッセージ受信 ------------------------------------------------

// background からの更新通知を受信して再描画
browser.runtime.onMessage.addListener((msg: { type: string }) => {
  if (msg?.type === 'refresh-popup') {
    Logger.debug('バッジ更新通知を受信、UI を更新します');
    loadAndRender();
  }
});

// ヘッダースイッチとコメントリストを並行初期化
(async () => {
  await initTrackButtonToggle();
  await initCrawlerToggle();
  await loadAndRender();
})();

