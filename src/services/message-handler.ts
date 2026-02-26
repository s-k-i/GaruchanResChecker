/**
 * @file メッセージハンドラー
 * @description background scriptのメッセージ処理を分離
 */
import { storage } from '#imports';
import Logger from '../utils/logger';
import type { CommentEntry } from '../types/comment';
import type { MessageRequest, MessageResponse } from '../types/messages';
import {
  getAllCommentsFromCache,
  getCommentFromCache,
  saveComment,
  deleteComment,
} from '../services/comment-service';
import {
  crawlCommentsOnce,
  fetchResCountForComment,
} from '../services/crawler-service';
import { STORAGE_KEYS } from '../constants/app-config';
import {
  validateTopicId,
  validateCommentNumber,
} from '../utils/validation';

/**
 * メッセージハンドラーの依存関数
 */
interface HandlerDependencies {
  adjustUnread: (delta: number) => Promise<void>;
}

/**
 * クローラー即時実行ハンドラー
 */
async function handleCrawlNow(deps: HandlerDependencies): Promise<MessageResponse> {
  const commentList = getAllCommentsFromCache();
  const updatedCount = await crawlCommentsOnce(
    commentList,
    getCommentFromCache,
    saveComment,
    deps.adjustUnread
  );
  return { ok: true, started: updatedCount > 0 };
}

/**
 * コメント追加・更新ハンドラー
 */
async function handleUpsertComment(
  entry: CommentEntry,
  deps: HandlerDependencies
): Promise<MessageResponse> {
  // 入力検証
  if (!validateTopicId(entry.topicId)) {
    return { ok: false, error: '無効なトピックIDです' };
  }
  if (!validateCommentNumber(entry.commentNumber)) {
    return { ok: false, error: '無効なコメント番号です' };
  }

  const existing = getCommentFromCache(entry.topicId, entry.commentNumber);
  const now = new Date().toISOString();
  const toSave: CommentEntry = {
    ...(existing ?? {}),
    ...entry,
    updatedAt: now,
  };

  // 新規追加の場合は未読数を加算
  if (!existing) {
    await deps.adjustUnread(Number(toSave.unreadCount) || 0);
  } else {
    // 既存の場合は差分を計算
    const prevUnread = Number(existing.unreadCount) || 0;
    const newUnread = Number(toSave.unreadCount) || 0;
    await deps.adjustUnread(newUnread - prevUnread);
  }

  // 保存
  const saved = await saveComment(toSave);
  return { ok: !!saved };
}

/**
 * コメント削除ハンドラー
 */
async function handleRemoveComment(
  topicId: string,
  commentNumber: string,
  deps: HandlerDependencies
): Promise<MessageResponse> {
  // 入力検証
  if (!validateTopicId(topicId)) {
    return { ok: false, error: '無効なトピックIDです' };
  }
  if (!validateCommentNumber(commentNumber)) {
    return { ok: false, error: '無効なコメント番号です' };
  }

  const existing = getCommentFromCache(topicId, commentNumber);
  if (existing) {
    // 削除時は未読分を差し引く
    const prevUnread = Number(existing.unreadCount) || 0;
    if (prevUnread > 0) {
      await deps.adjustUnread(-prevUnread);
    }
  }

  await deleteComment(topicId, commentNumber);
  return { ok: true };
}

/**
 * トピック削除ハンドラー
 */
async function handleRemoveTopic(
  topicId: string,
  deps: HandlerDependencies
): Promise<MessageResponse> {
  // 入力検証
  if (!validateTopicId(topicId)) {
    return { ok: false, error: '無効なトピックIDです' };
  }

  // 該当トピックのすべてのコメントを取得
  const allComments = getAllCommentsFromCache();
  const targetComments = allComments.filter((comment) => comment.topicId === topicId);

  // 未読数の合計を計算
  const totalUnread = targetComments.reduce(
    (sum, comment) => sum + (Number(comment.unreadCount) || 0),
    0
  );

  // 各コメントを削除
  for (const comment of targetComments) {
    await deleteComment(comment.topicId, comment.commentNumber);
  }

  // 未読数を差し引く
  if (totalUnread > 0) {
    await deps.adjustUnread(-totalUnread);
  }

  Logger.info('トピックを削除しました', {
    topicId,
    count: targetComments.length,
    unreadCleared: totalUnread,
  });
  return { ok: true, count: targetComments.length };
}

/**
 * 未読クリアハンドラー
 */
async function handleClearUnread(
  topicId: string,
  commentNumber: string,
  deps: HandlerDependencies
): Promise<MessageResponse> {
  // 入力検証
  if (!validateTopicId(topicId)) {
    return { ok: false, error: '無効なトピックIDです' };
  }
  if (!validateCommentNumber(commentNumber)) {
    return { ok: false, error: '無効なコメント番号です' };
  }

  const existing = getCommentFromCache(topicId, commentNumber);
  if (!existing) {
    return { ok: false, error: 'コメントが見つかりません' };
  }

  // 最新の返信数を取得して prev を合わせることで、直後のクローラで未読が復活するのを防ぐ
  const nowResCount = await fetchResCountForComment(topicId, commentNumber);
  const now = new Date().toISOString();

  const prevUnread = Number(existing.unreadCount) || 0;
  const updatedEntry: CommentEntry = {
    ...existing,
    unreadCount: 0,
    updatedAt: now,
  };

  if (typeof nowResCount === 'number') {
    updatedEntry.resCount = nowResCount;
  }

  // 未読数を差し引く
  if (prevUnread > 0) {
    await deps.adjustUnread(-prevUnread);
  }

  // 保存
  const saved = await saveComment(updatedEntry);
  return { ok: !!saved };
}

/**
 * 全コメント取得ハンドラー
 */
async function handleGetAllComments(): Promise<MessageResponse> {
  const commentList = getAllCommentsFromCache();
  Logger.info('get-all-comments: キャッシュから取得しました', { count: commentList.length });
  return { ok: true, comments: commentList };
}

/**
 * クローラー有効化設定ハンドラー
 */
async function handleSetCrawlerEnabled(enabled: boolean): Promise<MessageResponse> {
  await storage.setItem(STORAGE_KEYS.CRAWLER_ENABLED, enabled);
  Logger.info('クローラー有効化状態を設定しました', { enabled });
  return { ok: true };
}

/**
 * クローラー有効化取得ハンドラー
 */
async function handleGetCrawlerEnabled(): Promise<MessageResponse> {
  const enabled = (await storage.getItem<boolean>(STORAGE_KEYS.CRAWLER_ENABLED)) ?? true;
  return { ok: true, enabled };
}

/**
 * 追跡ボタン表示設定ハンドラー
 */
async function handleSetTrackButtonVisible(visible: boolean): Promise<MessageResponse> {
  await storage.setItem(STORAGE_KEYS.TRACK_BUTTON_VISIBLE, visible);
  Logger.info('追跡ボタン表示状態を設定しました', { visible });
  return { ok: true };
}

/**
 * 追跡ボタン表示取得ハンドラー
 */
async function handleGetTrackButtonVisible(): Promise<MessageResponse> {
  const visible = (await storage.getItem<boolean>(STORAGE_KEYS.TRACK_BUTTON_VISIBLE)) ?? false;
  return { ok: true, visible };
}

/**
 * セッション設定ハンドラー
 */
async function handleSetSession(key: string, value: unknown): Promise<MessageResponse> {
  const sessionKey = `${STORAGE_KEYS.SESSION_PREFIX}${key}` as `session:${string}`;
  await storage.setItem(sessionKey, value);
  Logger.info('セッションストレージに設定しました', { key });
  return { ok: true };
}

/**
 * セッション取得ハンドラー
 */
async function handleGetSession(key: string): Promise<MessageResponse> {
  const sessionKey = `${STORAGE_KEYS.SESSION_PREFIX}${key}` as `session:${string}`;
  const value = await storage.getItem(sessionKey);
  return { ok: true, value };
}

/**
 * メッセージをルーティングして適切なハンドラーに振り分ける
 */
export async function routeMessage(
  message: MessageRequest,
  deps: HandlerDependencies
): Promise<MessageResponse> {
  try {
    switch (message.type) {
      case 'crawl-now':
        return await handleCrawlNow(deps);

      case 'upsert-comment':
        if (!message.entry) {
          return { ok: false, error: 'エントリーが指定されていません' };
        }
        return await handleUpsertComment(message.entry, deps);

      case 'remove-comment':
        if (!message.topicId || !message.commentNumber) {
          return { ok: false, error: 'topicIdまたはcommentNumberが指定されていません' };
        }
        return await handleRemoveComment(message.topicId, message.commentNumber, deps);

      case 'remove-topic':
        if (!message.topicId) {
          return { ok: false, error: 'topicIdが指定されていません' };
        }
        return await handleRemoveTopic(message.topicId, deps);

      case 'clear-unread':
        if (!message.topicId || !message.commentNumber) {
          return { ok: false, error: 'topicIdまたはcommentNumberが指定されていません' };
        }
        return await handleClearUnread(message.topicId, message.commentNumber, deps);

      case 'get-all-comments':
        return await handleGetAllComments();

      case 'set-crawler-enabled':
        if (typeof message.enabled !== 'boolean') {
          return { ok: false, error: 'enabledがboolean型ではありません' };
        }
        return await handleSetCrawlerEnabled(message.enabled);

      case 'get-crawler-enabled':
        return await handleGetCrawlerEnabled();

      case 'set-track-button-visible':
        if (typeof message.visible !== 'boolean') {
          return { ok: false, error: 'visibleがboolean型ではありません' };
        }
        return await handleSetTrackButtonVisible(message.visible);

      case 'get-track-button-visible':
        return await handleGetTrackButtonVisible();

      case 'set-session':
        if (!message.key) {
          return { ok: false, error: 'keyが指定されていません' };
        }
        return await handleSetSession(message.key, message.value);

      case 'get-session':
        if (!message.key) {
          return { ok: false, error: 'keyが指定されていません' };
        }
        return await handleGetSession(message.key);

      case 'track-from-context-menu':
        // この処理はbackground.tsで直接実装されるため、ここでは何もしない
        return { ok: true };

      default:
        Logger.warn('未知のメッセージタイプを受信しました', { type: message.type });
        return { ok: false, error: '未知のメッセージタイプです' };
    }
  } catch (error) {
    Logger.error('メッセージハンドラーでエラーが発生しました', { type: message.type, error });
    return { ok: false, error: String(error) };
  }
}
