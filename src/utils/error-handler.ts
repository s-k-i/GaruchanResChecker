/**
 * @file エラーハンドリングユーティリティ
 * @description 統一されたエラー処理機能を提供
 */
import Logger from './logger';

/**
 * アプリケーション固有のエラークラス
 */
class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * try-catch を安全にラップする
 * @param fn - 実行する関数
 * @param errorHandler - エラーハンドラ（オプション）
 * @returns 成功時の結果、失敗時は null
 */
async function tryCatch<T>(
  fn: () => Promise<T>,
  errorHandler?: (error: Error) => void
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (errorHandler) {
      errorHandler(err);
    } else {
      Logger.error('予期しないエラーが発生しました', err);
    }
    return null;
  }
}

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
  return tryCatch(
    async () => {
      const response = await browser.runtime.sendMessage(message);
      if (response && !response.ok && response.error) {
        throw new AppError('MESSAGE_ERROR', response.error, { message });
      }
      return response as T;
    },
    (error) => {
      Logger.error('メッセージ送信に失敗しました', { message, error });
    }
  );
}
