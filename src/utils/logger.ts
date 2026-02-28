/**
 * @file シンプルなログ管理
 * @description 本番/開発環境でログを出し分ける
 */

const PREFIX = `[${browser.runtime.getManifest().name}]`;
const IS_PRODUCTION = import.meta.env.MODE === 'production';

/**
 * オブジェクトから機密情報をフィルタリングする
 * @param data - ログ出力するデータ
 * @returns フィルタリングされたデータ
 */
function filterSensitiveData(data: unknown): unknown {
  // 本番環境ではスタックトレース等の詳細情報を除外
  if (typeof data === 'object' && data !== null) {
    const filtered = { ...data } as Record<string, unknown>;
    delete filtered.stack;
    delete filtered.errStack;
    return filtered;
  }
  return data;
}

// 開発環境:
//   すべてのログを出力する
//   DevToolsで本来の呼び出し元へジャンプできるように、consoleを直接bindする
//   ※ コンフィグで開発ビルドは非圧縮（スタックトレースの変数名保持のため）、ソースマップ付き（呼び出し元情報保持のため）にしておく
// 本番環境:
//   debug/info/warnは出力しない
//   errorはフィルタして出力する（呼び出し元情報は消失するが、セキュリティ優先）
const debug = IS_PRODUCTION ? (() => { }) : console.log.bind(console, PREFIX);
const info = IS_PRODUCTION ? (() => { }) : console.info.bind(console, PREFIX);
const warn = IS_PRODUCTION ? (() => { }) : console.warn.bind(console, PREFIX);
const error = IS_PRODUCTION
  ? (...args: unknown[]) => {
    const filtered = args.map((arg) => filterSensitiveData(arg));
    console.error(PREFIX, ...filtered);
  }
  : console.error.bind(console, PREFIX);

const Logger = {
  debug,
  info,
  warn,
  error,
};

export default Logger;
