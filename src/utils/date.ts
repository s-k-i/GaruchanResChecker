/**
 * @file 日付ユーティリティ
 * @description 日付フォーマット関連のヘルパー関数
 */

/**
 * Date を日本時間（JST）で指定フォーマットに変換する
 * @description 保存フォーマット: "2026/01/19(月) 18:52:17"
 * @param date - 変換する日付（省略時は現在日時）
 * @returns フォーマット済みの日付文字列
 */
export function formatJstDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  // map.weekday は "月" のような単一文字
  return `${map.year}/${map.month}/${map.day}(${map.weekday}) ${map.hour}:${map.minute}:${map.second}`;
}

/**
 * `formatJstDate` が生成する独自フォーマットの日付文字列を Date オブジェクトへパースする
 * @description "2026/01/19(月) 18:52:17" のような曜日括弧を除去してから Date でパースする。
 * 曜日を含む非 ISO 形式は new Date() で NaN になるブラウザが多いため、括弧部分を除去する。
 * @param dateString - パース対象の日付文字列
 * @returns パースされた Date、または無効な文字列の場合は null
 */
export function parseJstDate(dateString: string): Date | null {
  const normalized = dateString.replace(/\([^)]*\)/g, '').trim();
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
