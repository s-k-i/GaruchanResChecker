/**
 * @file コメント管理サービス
 * @description コメントエントリーのCRUD操作とキャッシュ管理を提供
 */
import { storage } from '#imports';
import Logger from '../utils/logger';
import type { CommentEntry } from '../types/comment';
import { COMMENT_ENTRY_CONFIG } from '../constants/app-config';
import {
  getCommentKey,
  saveCommentWithOptimisticLock,
  loadAllCommentsFromStorage,
  deleteCommentFromStorage,
} from './storage-service';

/**
 * インメモリキャッシュ（コメントエントリーを Map で管理）
 */
const commentCache = new Map<string, CommentEntry>();

/**
 * キャッシュを全てのストレージからロードする
 */
export async function loadCacheFromStorage(): Promise<void> {
  try {
    commentCache.clear();
    const comments = await loadAllCommentsFromStorage();

    for (const comment of comments) {
      const cacheKey = getCommentKey(comment.topicId, comment.commentNumber);
      commentCache.set(cacheKey, comment);
    }

    Logger.info('キャッシュのロードが完了しました', { count: comments.length });
  } catch (e) {
    Logger.error('キャッシュのロードに失敗しました', e);
  }
}

/**
 * キャッシュから全てのコメントを配列として取得する
 * @returns コメントエントリーの配列
 */
export function getAllCommentsFromCache(): CommentEntry[] {
  return Array.from(commentCache.values());
}

/**
 * キャッシュからコメントを取得する
 * @param topicId - トピック ID
 * @param commentNumber - コメント番号
 * @returns コメントエントリー
 */
export function getCommentFromCache(topicId: string, commentNumber: string): CommentEntry | undefined {
  const key = getCommentKey(topicId, commentNumber);
  return commentCache.get(key);
}

/**
 * コメントをキャッシュとストレージに保存する
 * @param entry - 保存するコメントエントリー
 * @returns 成功した場合は保存されたエントリー
 */
export async function saveComment(entry: CommentEntry): Promise<CommentEntry | null> {
  const key = getCommentKey(entry.topicId, entry.commentNumber);

  // 楽観ロック付きで保存
  const saved = await saveCommentWithOptimisticLock(entry);
  if (!saved) {
    return null;
  }

  // キャッシュを更新（バージョン更新後の値を取得）
  const storageKey = `local:comment:${entry.topicId}:${entry.commentNumber}` as `local:${string}`;
  const updatedEntry = await storage.getItem<CommentEntry>(storageKey);
  if (updatedEntry) {
    commentCache.set(key, updatedEntry);
  }

  // エントリー数が上限を超えている場合、LRU方式で古いエントリーを削除
  await enforceMaxEntries();

  return updatedEntry || null;
}

/**
 * エントリー数が上限を超えている場合、updatedAtが最も古いエントリーから削除する（LRU方式）
 */
async function enforceMaxEntries(): Promise<void> {
  const allComments = getAllCommentsFromCache();
  const currentCount = allComments.length;
  const maxEntries = COMMENT_ENTRY_CONFIG.MAX_ENTRIES;

  if (currentCount <= maxEntries) {
    return;
  }

  // 削除が必要な件数を計算
  const deleteCount = currentCount - maxEntries;

  // updatedAt で昇順ソート（古い順）
  const sortedComments = allComments.sort((a, b) => {
    const timeA = new Date(a.updatedAt).getTime();
    const timeB = new Date(b.updatedAt).getTime();
    return timeA - timeB;
  });

  // 古いエントリーから削除
  const toDelete = sortedComments.slice(0, deleteCount);
  
  for (const comment of toDelete) {
    await deleteComment(comment.topicId, comment.commentNumber);
  }

  Logger.info('エントリー上限超過のため古いエントリーを削除しました', {
    deletedCount: deleteCount,
    currentCount,
    maxEntries,
  });
}

/**
 * コメントをキャッシュとストレージから削除する
 * @param topicId - トピック ID
 * @param commentNumber - コメント番号
 */
export async function deleteComment(topicId: string, commentNumber: string): Promise<void> {
  const key = getCommentKey(topicId, commentNumber);

  // ストレージから削除
  await deleteCommentFromStorage(topicId, commentNumber);

  // キャッシュから削除
  commentCache.delete(key);
}
