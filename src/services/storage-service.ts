/**
 * @file ストレージサービス
 * @description WXTストレージAPIのラッパーと楽観ロック機能を提供
 * 
 * @note WXT Storage API 仕様
 * このファイルはWXTの storage API (`storage.getItem/setItem/removeItem`) を使用しています。
 * WXT storage APIでは、キーに必ず `local:` または `session:` のプレフィックスが必要です。
 * 
 * - `local:` プレフィックス ... browser.storage.local に相当
 * - `session:` プレフィックス ... browser.storage.session に相当
 * 
 * 例: `local:comment:123:456`, `session:topic:789`
 * 
 * リファクタリングなどで browser.storage.local/session API に置き換える場合は、
 * プレフィックスを削除する必要があることに注意してください。
 */
import { storage } from '#imports';
import Logger from '../utils/logger';
import type { CommentEntry } from '../types/comment';
import { LOCAL_STORAGE_KEYS, OPTIMISTIC_LOCK } from '../constants/app-config';
import { sleep } from '../utils/async';

/**
 * 生キー名に `local:` プレフィックスを付与して WXT storage API 用キーを返す
 * @param key - `LOCAL_STORAGE_KEYS` の値
 * @returns `local:{key}` 形式の文字列
 */
export function toLocalKey<K extends string>(key: K): `local:${K}` {
  return `local:${key}`;
}

/**
 * 生キー名に `session:` プレフィックスを付与して WXT storage API 用キーを返す
 * @param key - `SESSION_STORAGE_KEYS` の値、またはユーザー定義のセッションキー
 * @returns `session:{key}` 形式の文字列
 */
export function toSessionKey<K extends string>(key: K): `session:${K}` {
  return `session:${key}`;
}

/**
 * コメントエントリーのキーを生成する
 * @param topicId - トピック ID
 * @param commentNumber - コメント番号
 * @returns キー文字列
 */
export function getCommentKey(topicId: string, commentNumber: string): string {
  return `${topicId}:${commentNumber}`;
}

/**
 * ストレージキーを生成する
 * @param topicId - トピック ID
 * @param commentNumber - コメント番号
 * @returns WXT storage API 用ストレージキー（`local:comment:{topicId}:{commentNumber}` 形式）
 */
export function getStorageKey(topicId: string, commentNumber: string): `local:${string}` {
  return toLocalKey(`${LOCAL_STORAGE_KEYS.COMMENT_PREFIX}${topicId}:${commentNumber}`);
}

/**
 * 楽観ロック付きでコメントをストレージに書き込む
 * @description コメントエントリーをストレージに保存する。
 * 楽観ロックを使用して同時更新を検出し、古いデータで上書きしないようにする。
 * - updatedAtの比較: 新しいデータのみ保存
 * - version番号: 更新のたびにインクリメント
 * - 競合検出時は指数バックオフでリトライ
 * @param entry - 保存するコメントエントリー
 * @param maxRetries - 最大リトライ回数
 * @returns 成功した場合は true、既存データが新しい場合は false
 * @example
 * ```typescript
 * const saved = await saveCommentWithOptimisticLock(entry);
 * if (saved) {
 *   console.log('保存成功');
 * } else {
 *   console.log('既存データの方が新しいためスキップ');
 * }
 * ```
 */
export async function saveCommentWithOptimisticLock(
  entry: CommentEntry,
  maxRetries = OPTIMISTIC_LOCK.MAX_RETRIES
): Promise<boolean> {
  const storageKey = getStorageKey(entry.topicId, entry.commentNumber);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 現在のストレージの値を取得
      const current = await storage.getItem<CommentEntry>(storageKey);

      // 楽観ロック: updatedAt で競合検出
      if (current && current.updatedAt && entry.updatedAt) {
        const currentTime = new Date(current.updatedAt).getTime();
        const entryTime = new Date(entry.updatedAt).getTime();

        // 既存のデータが新しい場合はスキップ（古いデータで上書きしない）
        if (currentTime > entryTime) {
          Logger.info('既存データの方が新しいため上書きをスキップしました', {
            key: storageKey,
            currentUpdatedAt: current.updatedAt,
            entryUpdatedAt: entry.updatedAt,
          });
          return false;
        }
      }

      // version を使った楽観ロック（同時更新の検出）
      const currentVersion = current?.version ?? 0;
      const newVersion = currentVersion + 1;
      const toSave = { ...entry, version: newVersion, updatedAt: new Date().toISOString() };

      // ストレージに書き込み（ライトスルー）
      await storage.setItem(storageKey, toSave);
      Logger.info('ストレージへの書き込みが完了しました', { key: storageKey, version: newVersion });

      return true;
    } catch (e) {
      Logger.warn(`書き込みリトライ ${attempt + 1}/${maxRetries}`, { key: storageKey, error: e });
      if (attempt < maxRetries - 1) {
        // 指数バックオフで待機
        await sleep(OPTIMISTIC_LOCK.INITIAL_BACKOFF_MS * Math.pow(2, attempt));
      }
    }
  }

  Logger.error('楽観ロックでの書き込みが最大リトライ回数を超えました', {
    key: getCommentKey(entry.topicId, entry.commentNumber),
  });
  return false;
}

/**
 * ストレージから全てのコメントエントリーを読み込む
 * @description browser.storage.localからcomment:プレフィックスのキーを全て取得し、
 * コメントエントリーの配列として返す。破損したエントリーはスキップする。
 * @returns コメントエントリーの配列
 */
export async function loadAllCommentsFromStorage(): Promise<CommentEntry[]> {
  try {
    Logger.info('ストレージからコメントをロード中...');
    const allItems = await browser.storage.local.get(null);
    const comments: CommentEntry[] = [];

    for (const [key, value] of Object.entries(allItems)) {
      // comment:<topicId>:<commentNumber> 形式のキーのみ処理
      if (key.startsWith(LOCAL_STORAGE_KEYS.COMMENT_PREFIX)) {
        try {
          const parts = key.replace(LOCAL_STORAGE_KEYS.COMMENT_PREFIX, '').split(':');
          if (parts.length === 2) {
            comments.push(value as CommentEntry);
          }
        } catch (e) {
          Logger.warn('エントリーの読み込みに失敗しました', { key, error: e });
        }
      }
    }

    Logger.info('コメントのロードが完了しました', { count: comments.length });
    return comments;
  } catch (e) {
    Logger.error('コメントのロードに失敗しました', e);
    return [];
  }
}

/**
 * コメントをストレージから削除する
 * @param topicId - トピック ID
 * @param commentNumber - コメント番号
 */
export async function deleteCommentFromStorage(topicId: string, commentNumber: string): Promise<void> {
  const storageKey = getStorageKey(topicId, commentNumber);
  await storage.removeItem(storageKey);
  Logger.info('ストレージから削除しました', { key: storageKey });
}
