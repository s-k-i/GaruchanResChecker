/**
 * @file コメントページ用コンテントスクリプト
 * @description /comment/* ページで実行されるスクリプト。
 * トピック情報を抽出してセッションストレージに保存し、
 * 各コメントに「追跡」ボタンを追加する。
 * 
 * 処理フロー:
 * 1. ページからトピックIDとタイトルを抽出
 * 2. セッションストレージに保存（background経由）
 * 3. 各コメントに追跡ボタンをDOMに挿入
 */
import { initTrackingContentScript } from '../utils/content-script-initializer';
import '../styles/track-button.css';

export default defineContentScript({
  matches: ['https://girlschannel.net/comment/*'],
  async main() {
    await initTrackingContentScript({
      pathPrefix: '/comment/',
      initLogMessage: 'コメントページを検出しました。トピック情報を抽出します。',
    });
  },
});
