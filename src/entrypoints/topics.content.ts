/**
 * @file トピックページ用コンテントスクリプト
 * @description /topics/* ページで実行されるスクリプト。
 * トピック情報を抽出し、各コメントに「追跡」ボタンを追加する。
 * 
 * 処理フロー:
 * 1. ページからトピックIDとタイトルを抽出
 * 2. セッションストレージに保存（background経由）
 * 3. 各コメントに追跡ボタンをDOMに挿入
 */
import { initTrackingContentScript } from '../utils/content-script-initializer';
import '../styles/track-button.css';

export default defineContentScript({
  matches: ['https://girlschannel.net/topics/*'],
  async main() {
    await initTrackingContentScript({
      pathPrefix: '/topics/',
      checkTrackableUrl: true,
      initLogMessage: 'トピックページを検出しました。トピック情報を抽出します',
      skipLogMessage: 'トピックIDページではありません（キーワードまたはカテゴリページ）',
    });
  },
});
