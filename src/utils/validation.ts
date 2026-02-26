/**
 * @file 入力検証ユーティリティ
 * @description セキュリティのための入力検証機能を提供
 */
import { VALIDATION_CONFIG, VALIDATION_PATTERNS } from '../constants/app-config';

/**
 * トピックIDの形式を検証する
 * @description トピックIDは数値のみで構成される必要がある
 * @param topicId - 検証するトピックID
 * @returns 有効な場合はtrue
 * @example
 * ```typescript
 * validateTopicId('12345'); // => true
 * validateTopicId('abc123'); // => false
 * validateTopicId(''); // => false
 * ```
 */
export function validateTopicId(topicId: string): boolean {
  if (!topicId || typeof topicId !== 'string') {
    return false;
  }
  
  return VALIDATION_PATTERNS.ID.test(topicId);
}

/**
 * URLが追跡可能なページかどうかを判定する
 * @description コメント追跡機能（追跡ボタン、コンテキストメニュー）を表示するページかどうかを判定
 * @param url - 検証するURL（完全なURLまたはパス名）
 * @returns 追跡可能なページの場合はtrue
 * @example
 * ```typescript
 * isTrackablePageUrl('https://girlschannel.net/comment/123'); // => true
 * isTrackablePageUrl('https://girlschannel.net/topics/1234/'); // => true
 * isTrackablePageUrl('https://girlschannel.net/topics/category/'); // => false
 * ```
 */
export function isTrackablePageUrl(url: string | undefined): boolean {
  if (!url) return false;
  
  try {
    // URLオブジェクトを作成して正規化
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // /comment/* ページ
    if (pathname.startsWith('/comment/')) {
      return true;
    }
    
    // /topics/{4桁以上の数字}/ ページ
    if (VALIDATION_PATTERNS.TOPIC_URL.test(pathname)) {
      return true;
    }
    
    return false;
  } catch {
    // URLのパースに失敗した場合はパス名として扱う
    if (url.startsWith('/comment/')) {
      return true;
    }
    if (VALIDATION_PATTERNS.TOPIC_URL.test(url)) {
      return true;
    }
    return false;
  }
}

/**
 * コメント番号の形式を検証する
 * @description コメント番号は数値のみで構成される必要がある
 * @param commentNumber - 検証するコメント番号
 * @returns 有効な場合はtrue
 * @example
 * ```typescript
 * validateCommentNumber('123'); // => true
 * validateCommentNumber('abc'); // => false
 * ```
 */
export function validateCommentNumber(commentNumber: string): boolean {
  if (!commentNumber || typeof commentNumber !== 'string') {
    return false;
  }
  
  return VALIDATION_PATTERNS.ID.test(commentNumber);
}

/**
 * 安全なURL文字列を構築する
 * @description パスパラメータをエスケープしてXSS攻撃を防ぐ
 * @param baseUrl - ベースURL
 * @param path - パス文字列
 * @returns エスケープされた完全なURL
 */
export function buildSafeUrl(baseUrl: string, path: string): string {
  // URLオブジェクトを使用して安全にURLを構築
  const url = new URL(path, baseUrl);
  return url.toString();
}

/**
 * コメント本文の長さを検証する
 * @param text - 検証するテキスト
 * @param maxLength - 最大文字数（デフォルト: 10000）
 * @returns 長さが妥当な場合はtrue
 */
export function validateTextLength(text: string, maxLength: number = VALIDATION_CONFIG.DEFAULT_MAX_TEXT_LENGTH): boolean {
  return typeof text === 'string' && text.length <= maxLength;
}

