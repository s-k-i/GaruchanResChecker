/**
 * @file Browser API型拡張
 * @description TypeScriptでのBrowser API利用時の型安全性向上
 * @remarks WebExtensions APIの型定義を補完し、TypeScriptコンパイラの型チェックを機能させる
 */

/**
 * Tab情報の型定義
 * @description browser.tabs APIで取得されるTabオブジェクトの部分型
 */
export interface Tab {
  /** タブID */
  id?: number;
  /** タブのURL */
  url?: string;
  /** アクティブ状態 */
  active?: boolean;
  /** 所属するウィンドウID */
  windowId?: number;
}

/**
 * アクティブ情報の型定義
 * @description browser.tabs.onActivatedイベントで渡される情報
 */
export interface ActiveInfo {
  /** アクティブになったタブID */
  tabId: number;
  /** ウィンドウID */
  windowId: number;
}

/**
 * 変更情報の型定義
 * @description browser.tabs.onUpdatedイベントで渡される変更情報
 */
export interface ChangeInfo {
  /** 変更後のURL */
  url?: string;
  /** 読み込み状態 */
  status?: 'loading' | 'complete' | 'unloaded';
}

/**
 * コンテキストメニュークリック情報の型定義
 * @description browser.contextMenus.onClicked イベントで渡される情報
 */
export interface ContextMenuClickInfo {
  /** クリックされたメニューアイテムID */
  menuItemId: string | number;
}

/**
 * browser.runtime の型拡張
 * @description WXT が提供する型に不足している getURL を補完する
 */
export interface BrowserRuntime {
  /** 拡張機能内リソースの完全 URL を返す */
  getURL(path: string): string;
}