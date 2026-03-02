/**
 * @file ポップアップUIのメインスクリプト
 * @description ブラウザアクションボタンをクリックしたときに表示されるUI。
 * 追跡中のコメント一覧を表示し、オプションページへのリンクを提供する。
 *
 * 主要機能:
 * - オプションページを開く歯車ボタン
 * - コメント一覧表示（トピック別にグループ化）
 * - 個別コメント削除、トピック単位での一括削除
 * - 未読クリア（リンククリック時）
 */
import './style.css';
import Logger from '../../utils/logger';
import { sendMessageSafely } from '../../utils/error-handler';
import { renderComments, renderEmpty } from './comment-renderer';
import type {
  GetAllCommentsResponse,
} from '../../types/messages';

// ---- DOM 構造 ---------------------------------------------------------------

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div>
    <div class="popup-header">
      <span class="app-title">ガルちゃん返信チェッカー</span>
      <button class="settings-btn" title="設定">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 20 20" fill="#aaa">
          <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>
    <div class="card">
      <div id="comments-list"></div>
    </div>
  </div>
`;

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

// ---- 歯車ボタン（設定） -------------------------------------------------------

document.querySelector<HTMLButtonElement>('.settings-btn')!
  .addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

// ---- 初期化 & メッセージ受信 ------------------------------------------------

// background からの更新通知を受信して再描画
browser.runtime.onMessage.addListener((msg: { type: string }) => {
  if (msg?.type === 'refresh-popup') {
    Logger.debug('バッジ更新通知を受信、UI を更新します');
    loadAndRender();
  }
});

// コメントリストを初期化
loadAndRender();

