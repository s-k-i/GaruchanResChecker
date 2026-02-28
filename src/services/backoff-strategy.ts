/**
 * @file バックオフ戦略
 * @description fetch エラー時のバックオフ・スキップ判定を管理する
 */
import { storage } from '#imports';
import Logger from '../utils/logger';
import { SESSION_STORAGE_KEYS, ERROR_HANDLING_CONFIG } from '../constants/app-config';
import { toSessionKey } from './storage-service';

/**
 * fetch 結果の型
 */
export type FetchResult =
  | { ok: true; count: number }
  | { ok: false; errorType: 'http'; status: number }      // HTTPエラー (4xx/5xx)
  | { ok: false; errorType: 'network' }                   // ネットワーク/タイムアウトエラー
  | { ok: false; errorType: 'parse' }                     // HTMLパース失敗
  | { ok: false; errorType: 'redirect'; finalUrl: string } // リダイレクト検出
  | { ok: false; errorType: 'validation' };               // 入力検証エラー

/**
 * fetch 失敗結果に応じたバックオフ処理を行う
 * @param fetchResult - 失敗した FetchResult
 * @param topicId - トピック ID（ログ用）
 * @param commentNumber - コメント番号（ログ用）
 * @returns 'abort' = クロールループを中断、'skip' = 次のコメントへ
 */
export async function handleFetchError(
  fetchResult: Extract<FetchResult, { ok: false }>,
  topicId: string,
  commentNumber: string,
): Promise<'abort' | 'skip'> {
  // 入力検証エラー: そのコメントに固有の問題のためスキップ
  if (fetchResult.errorType === 'validation') {
    Logger.warn('クローラー: 入力検証エラーのためスキップします', { topicId, commentNumber });
    return 'skip';
  }

  // リダイレクト: トピック削除またはURL変更のためスキップ
  if (fetchResult.errorType === 'redirect') {
    Logger.warn('クローラー: リダイレクトを検出したためスキップします', {
      topicId,
      commentNumber,
      finalUrl: fetchResult.finalUrl,
    });
    return 'skip';
  }

  // パースエラー: サイト構造変更の可能性があるがループは継続
  if (fetchResult.errorType === 'parse') {
    Logger.warn('クローラー: HTMLパースに失敗しました。サイト構造が変更された可能性があります', {
      topicId,
      commentNumber,
    });
    return 'skip';
  }

  // ネットワークエラー: 一時的な通信障害のためスキップ（過度なリトライを防ぐ）
  if (fetchResult.errorType === 'network') {
    Logger.warn('クローラー: ネットワークエラーが発生しました', { topicId, commentNumber });
    return 'skip';
  }

  // HTTPエラー
  const { status } = fetchResult;

  if (status === 404) {
    Logger.warn('クローラー: ページが見つかりません (404)。トピックが削除済みの可能性があります', {
      topicId,
      commentNumber,
    });
    return 'skip';
  }

  if (status === 403) {
    const until = Date.now() + ERROR_HANDLING_CONFIG.FORBIDDEN_BACKOFF_MS;
    await storage.setItem(toSessionKey(SESSION_STORAGE_KEYS.CRAWLER_BACKOFF_UNTIL), until);
    Logger.error('クローラー: アクセスが拒否されました (403)。1時間バックオフします', {
      topicId,
      until: new Date(until).toISOString(),
    });
    return 'abort';
  }

  if (status === 429) {
    const until = Date.now() + ERROR_HANDLING_CONFIG.FORBIDDEN_BACKOFF_MS;
    await storage.setItem(toSessionKey(SESSION_STORAGE_KEYS.CRAWLER_BACKOFF_UNTIL), until);
    Logger.error('クローラー: レートリミットに達しました (429)。1時間バックオフします', {
      topicId,
      until: new Date(until).toISOString(),
    });
    return 'abort';
  }

  if (status === 500 || status === 502 || status === 503) {
    const prevCount = (await storage.getItem<number>(toSessionKey(SESSION_STORAGE_KEYS.CRAWLER_SERVER_ERROR_COUNT))) ?? 0;
    const newCount = prevCount + 1;
    await storage.setItem(toSessionKey(SESSION_STORAGE_KEYS.CRAWLER_SERVER_ERROR_COUNT), newCount);
    const delayMs = Math.min(
      ERROR_HANDLING_CONFIG.SERVER_ERROR_BASE_DELAY_MS * Math.pow(2, newCount - 1),
      ERROR_HANDLING_CONFIG.SERVER_ERROR_MAX_DELAY_MS,
    );
    const until = Date.now() + delayMs;
    await storage.setItem(toSessionKey(SESSION_STORAGE_KEYS.CRAWLER_BACKOFF_UNTIL), until);
    Logger.error(`クローラー: サーバーエラー (${status})。${Math.ceil(delayMs / 60_000)}分バックオフします`, {
      topicId,
      consecutiveErrors: newCount,
      until: new Date(until).toISOString(),
    });
    return 'abort';
  }

  // その他のHTTPエラー (400, 401 等)
  Logger.warn('クローラー: HTTPエラーが発生しました', { status, topicId, commentNumber });
  return 'skip';
}
