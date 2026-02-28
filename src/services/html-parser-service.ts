/**
 * @file HTML パースサービス
 * @description girlschannel.net のHTML から返信数を抽出する
 */
import { parse, HTMLElement as ParsedHTMLElement } from 'node-html-parser';
import Logger from '../utils/logger';
import { SELECTORS, REGEX_PATTERNS } from '../constants/app-config';

/**
 * HTML文字列からコメントの返信数をパースする
 * @description node-html-parser でパースし、対象コメント要素から返信数を抽出する。
 * @param html - パース対象のHTML文字列
 * @param commentNumber - 対象コメント番号
 * @returns 返信数（コメント要素が見つからない・パターン不一致の場合は null、返信なしは 0）
 */
export function parseResCountFromHtml(html: string, commentNumber: string): number | null {
  const root = parse(html);
  const commentEl = root.querySelector(`#comment${commentNumber}`);

  if (!commentEl) return null;

  // 可能性のあるセレクタを順に試す
  const selectors = SELECTORS.RES_COUNT.split(', ');
  let resElement: ParsedHTMLElement | null = null;

  for (const selector of selectors) {
    try {
      resElement = commentEl.querySelector(selector);
    } catch {
      resElement = null;
    }
    if (resElement) break;
  }

  // コメント要素があるが返信要素が見つからない場合は返信0とみなす
  if (!resElement) {
    Logger.info('コメント要素に返信要素が見つかりません。返信0とします', { commentNumber });
    return 0;
  }

  // トリムしてから厳密に "件の返信" パターンを探す
  const trimmedText = (resElement.textContent ?? '').trim();
  Logger.info('コメント要素から取得した返信テキスト', {
    commentNumber,
    text: trimmedText.slice(0, 200),
  });

  const matchResult = trimmedText.match(REGEX_PATTERNS.RES_COUNT);
  if (matchResult) {
    const resCount = parseInt(matchResult[1], 10);
    if (!Number.isNaN(resCount) && resCount >= 0) return resCount;
  }

  return null;
}
