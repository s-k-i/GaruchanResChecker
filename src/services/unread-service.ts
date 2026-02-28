/**
 * @file 未読管理サービス
 * @description 未読合計の取得・更新とバッジ表示の管理を提供
 */
import { storage } from '#imports';
import Logger from '../utils/logger';
import { getAllCommentsFromCache } from './comment-service';
import { LOCAL_STORAGE_KEYS, BADGE_CONFIG } from '../constants/app-config';
import { toLocalKey } from './storage-service';

/**
 * 未読数変化時のコールバック（background.ts から登録）
 * @description サービス層から UI への直接通知を避けるための依存性逆転
 */
let onUnreadChangedCallback: (() => void) | null = null;

/**
 * 未読数変化コールバックを登録する
 * @description background.ts で呼び出し、popup 更新通知の責務をサービス層から分離する
 */
export function setOnUnreadChanged(callback: () => void): void {
  onUnreadChangedCallback = callback;
}

/**
 * 未読合計を取得する
 * @returns 未読合計
 */
async function getUnreadTotal(): Promise<number> {
  return (await storage.getItem<number>(toLocalKey(LOCAL_STORAGE_KEYS.UNREAD_TOTAL))) ?? 0;
}

/**
 * 未読合計を設定してバッジを更新する
 * @param value - 未読合計
 */
async function setUnreadTotal(value: number): Promise<void> {
  const next = Math.max(0, Math.floor(value));
  await storage.setItem(toLocalKey(LOCAL_STORAGE_KEYS.UNREAD_TOTAL), next);

  // バッジを即座に更新
  try {
    const text = next > 0 ? String(next) : '';
    await browser.action.setBadgeText({ text });
    Logger.debug('バッジテキストを設定しました', { text });
    await browser.action.setBadgeBackgroundColor({ color: BADGE_CONFIG.BACKGROUND_COLOR });
    try {
      await browser.action.setBadgeTextColor?.({ color: BADGE_CONFIG.TEXT_COLOR });
    } catch {
      // setBadgeTextColor が未対応のブラウザでは無視
    }
  } catch (e) {
    Logger.error('バッジ更新に失敗しました', e);
  }

  // 登録済みコールバックで通知（UI 通知の責務は background.ts に委譲）
  onUnreadChangedCallback?.();
}

/**
 * 未読合計を差分調整する
 * @param delta - 増減値
 */
export async function adjustUnread(delta: number): Promise<void> {
  if (!delta) return;
  const cur = await getUnreadTotal();
  await setUnreadTotal(cur + delta);
}

/**
 * クロール結果から新しい未読数を計算する（#8: 未読計算の一元管理）
 * @description 前回の返信数と現在の返信数の差分を既存未読数に加算する。
 * 前回返信数が不明（初回登録）の場合は 0 を返す。
 * @param previousResCount - 前回の返信数（null または undefined の場合は初回とみなす）
 * @param currentResCount - 今回取得した返信数
 * @param previousUnread - 前回の未読数
 * @returns 新しい未読数（0 未満にはならない）
 */
export function computeNewUnreadCount(
  previousResCount: number | null | undefined,
  currentResCount: number,
  previousUnread: number,
): number {
  if (previousResCount == null) return 0;
  return Math.max(0, currentResCount - previousResCount + previousUnread);
}

/**
 * バッジを再計算する
 * @description 全コメントのunreadCountを合計し、バッジテキストを更新する
 */
export async function recomputeBadge(): Promise<void> {
  try {
    const list = getAllCommentsFromCache();
    const total = list.reduce((acc, it) => acc + (Number(it?.unreadCount) || 0), 0);
    Logger.info('バッジ再計算: 合計を算出しました', { total });
    await setUnreadTotal(total);
  } catch (e) {
    Logger.error('バッジ再計算でエラーが発生しました', e);
  }
}
