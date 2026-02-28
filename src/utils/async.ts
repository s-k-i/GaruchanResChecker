/**
 * @file 非同期ユーティリティ
 * @description 汎用の非同期ヘルパー関数を提供
 */

/**
 * 指定時間待機する
 * @param ms - 待機時間（ミリ秒）
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
