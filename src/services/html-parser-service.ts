/**
 * @file HTML パースサービス
 * @description girlschannel.net のHTML から返信数を抽出する
 */
import { parse } from 'node-html-parser';
import Logger from '../utils/logger';
import { SELECTORS } from '../constants/app-config';

/**
 * コメントページのHTML文字列から返信数をカウントする（node-html-parser版）
 * @description node-html-parser でパースし、`ul.res-comment` 内の `.comment-item` 要素数を返す。
 * 注: 同等のロジックがコンテンツスクリプト側にもある（ブラウザDOM版）が、実行コンテキストが異なるため統合していない。
 * @param html - コメントページのHTML文字列
 * @returns 返信数（返信領域が見つからない場合は 0）
 */
export function countRepliesFromCommentPageHtml(html: string): number {
  const root = parse(html);
  const resCommentList = root.querySelector(SELECTORS.RES_COMMENT);

  if (!resCommentList) {
    Logger.info('返信コメント領域が見つかりません。返信0とします');
    return 0;
  }

  const replyItems = resCommentList.querySelectorAll(SELECTORS.COMMENT_ITEM);
  return replyItems.length;
}
