/**
 * @file エラーハンドリングユーティリティ
 * @description 統一されたエラー処理機能を提供
 */
import Logger from './logger';

/**
 * browser.runtime.sendMessage のエラーハンドリングラッパー
 * @description メッセージ送信を安全に実行し、エラー時に適切にハンドリングする。
 * レスポンスのok: falseが返った場合もエラーとして扱う。
 * @template T - レスポンスの型
 * @param message - 送信するメッセージ
 * @returns レスポンス、またはエラー時は null
 * @example
 * ```typescript
 * const response = await sendMessageSafely<GetSessionResponse>({
 *   type: 'get-session',
 *   key: topicId,
 * });
 * if (response?.ok) {
 *   console.log(response.value);
 * }
 * ```
 */
export async function sendMessageSafely<T = unknown>(message: unknown): Promise<T | null> {
  try {
    const response = await browser.runtime.sendMessage(message);
    if (response && !response.ok && response.error) {
      Logger.error('メッセージがエラーを返しました', { message, error: response.error });
      return null;
    }
    return response as T;
  } catch (error) {
    Logger.error('メッセージ送信に失敗しました', { message, error });
    return null;
  }
}
