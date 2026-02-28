/**
 * @file アイコン管理ユーティリティ
 * @description タブ状態に応じてブラウザアクションアイコンを切り替える
 */
import Logger from './logger';
import { SITE_CONFIG } from '../constants/app-config';

/**
 * マニフェストのアイコン関連フィールドの型
 */
interface ManifestWithIcons {
  icons: Record<string, string>;
  action: { default_icon: Record<string, string> };
}

/**
 * マニフェストからアイコンパスを読み取る
 */
const manifest = browser.runtime.getManifest() as unknown as ManifestWithIcons;
const ICONS = {
  pink: manifest.icons,
  grey: manifest.action.default_icon,
};

/**
 * 指定された URL が girlschannel.net かどうか判定する
 * @param url - 判定する URL
 * @returns girlschannel.net の場合は true
 */
function isGirlsChannel(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === SITE_CONFIG.DOMAIN || u.hostname.endsWith(`.${SITE_CONFIG.DOMAIN}`);
  } catch {
    return false;
  }
}

/**
 * 指定したタブ ID・URL に応じてアイコンを切り替える
 * @param tabId - タブ ID
 * @param url - タブの URL
 */
export async function updateIconForTab(tabId?: number, url?: string): Promise<void> {
  if (!tabId) return;
  const usePink = isGirlsChannel(url);
  try {
    await browser.action.setIcon({ path: usePink ? ICONS.pink : ICONS.grey, tabId });
  } catch (e) {
    Logger.error('アイコン設定に失敗しました', e);
  }
}
