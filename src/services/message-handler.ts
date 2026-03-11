/**
 * @file メッセージハンドラー
 * @description background scriptのメッセージ処理を分離
 */
import { storage } from '#imports';
import Logger from '../utils/logger';
import type { CommentEntry } from '../types/comment';
import type {
  MessageRequest,
  MessageResponse,
  UpsertCommentRequest,
  RemoveCommentRequest,
  RemoveTopicRequest,
  ClearUnreadRequest,
  SetCrawlerEnabledRequest,
  SetTrackButtonVisibleRequest,
  SetAutoTrackPostRequest,
  SetCommentFontSizeRequest,
  SetCommentFontColorRequest,
  SetSessionRequest,
  GetSessionRequest,
  ReportErrorRequest,
} from '../types/messages';
import { captureRelayedError } from './sentry-service';
import {
  getAllCommentsFromCache,
  getCommentFromCache,
  saveComment,
  deleteComment,
} from './comment-service';
import {
  crawlCommentsOnce,
  fetchResCountForComment,
} from './crawler-service';
import { adjustUnread } from './unread-service';
import { LOCAL_STORAGE_KEYS, SETTING_DEFAULTS, COMMENT_STYLE_OPTIONS } from '../constants/app-config';
import { toLocalKey, toSessionKey } from './storage-service';
import {
  validateTopicId,
  validateCommentNumber,
} from '../utils/validation';

/**
 * クローラー即時実行ハンドラー
 */
async function handleCrawlNow(): Promise<MessageResponse> {
  const commentList = getAllCommentsFromCache();
  const updatedCount = await crawlCommentsOnce(commentList);
  return { ok: true, started: updatedCount > 0 };
}

/**
 * コメント追加・更新ハンドラー
 */
async function handleUpsertComment(
  message: UpsertCommentRequest
): Promise<MessageResponse> {
  const { entry } = message;
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
    await adjustUnread(Number(toSave.unreadCount) || 0);
  } else {
    // 既存の場合は差分を計算
    const prevUnread = Number(existing.unreadCount) || 0;
    const newUnread = Number(toSave.unreadCount) || 0;
    await adjustUnread(newUnread - prevUnread);
  }

  // 保存
  const saved = await saveComment(toSave);
  return { ok: !!saved };
}

/**
 * コメント削除ハンドラー
 */
async function handleRemoveComment(
  message: RemoveCommentRequest
): Promise<MessageResponse> {
  const { topicId, commentNumber } = message;
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
      await adjustUnread(-prevUnread);
    }
  }

  await deleteComment(topicId, commentNumber);
  return { ok: true };
}

/**
 * トピック削除ハンドラー
 */
async function handleRemoveTopic(
  message: RemoveTopicRequest
): Promise<MessageResponse> {
  const { topicId } = message;
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
    await adjustUnread(-totalUnread);
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
  message: ClearUnreadRequest
): Promise<MessageResponse> {
  const { topicId, commentNumber } = message;
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
  const fetchResult = await fetchResCountForComment(topicId, commentNumber);
  const now = new Date().toISOString();

  const prevUnread = Number(existing.unreadCount) || 0;
  const updatedEntry: CommentEntry = {
    ...existing,
    unreadCount: 0,
    updatedAt: now,
  };

  if (fetchResult.ok) {
    updatedEntry.resCount = fetchResult.count;
  }

  // 未読数を差し引く
  if (prevUnread > 0) {
    await adjustUnread(-prevUnread);
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
async function handleSetCrawlerEnabled(message: SetCrawlerEnabledRequest): Promise<MessageResponse> {
  const { enabled } = message;
  await storage.setItem(toLocalKey(LOCAL_STORAGE_KEYS.CRAWLER_ENABLED), enabled);
  Logger.info('クローラー有効化状態を設定しました', { enabled });
  return { ok: true };
}

/**
 * クローラー有効化取得ハンドラー
 */
async function handleGetCrawlerEnabled(): Promise<MessageResponse> {
  const enabled = (await storage.getItem<boolean>(toLocalKey(LOCAL_STORAGE_KEYS.CRAWLER_ENABLED))) ?? SETTING_DEFAULTS.CRAWLER_ENABLED;
  return { ok: true, enabled };
}

/**
 * 追跡ボタン表示設定ハンドラー
 */
async function handleSetTrackButtonVisible(message: SetTrackButtonVisibleRequest): Promise<MessageResponse> {
  const { visible } = message;
  await storage.setItem(toLocalKey(LOCAL_STORAGE_KEYS.TRACK_BUTTON_VISIBLE), visible);
  Logger.info('追跡ボタン表示状態を設定しました', { visible });
  return { ok: true };
}

/**
 * 追跡ボタン表示取得ハンドラー
 */
async function handleGetTrackButtonVisible(): Promise<MessageResponse> {
  const visible = (await storage.getItem<boolean>(toLocalKey(LOCAL_STORAGE_KEYS.TRACK_BUTTON_VISIBLE))) ?? SETTING_DEFAULTS.TRACK_BUTTON_VISIBLE;
  return { ok: true, visible };
}

/**
 * 投稿コメントの自動追跡設定ハンドラー
 */
async function handleSetAutoTrackPost(message: SetAutoTrackPostRequest): Promise<MessageResponse> {
  const { enabled } = message;
  await storage.setItem(toLocalKey(LOCAL_STORAGE_KEYS.AUTO_TRACK_POST_ENABLED), enabled);
  Logger.info('自動追跡設定を変更しました', { enabled });
  return { ok: true };
}

/**
 * 投稿コメントの自動追跡取得ハンドラー
 */
async function handleGetAutoTrackPost(): Promise<MessageResponse> {
  const enabled = (await storage.getItem<boolean>(toLocalKey(LOCAL_STORAGE_KEYS.AUTO_TRACK_POST_ENABLED))) ?? SETTING_DEFAULTS.AUTO_TRACK_POST_ENABLED;
  return { ok: true, enabled };
}

/**
 * コメント文字サイズ設定ハンドラー
 */
async function handleSetCommentFontSize(message: SetCommentFontSizeRequest): Promise<MessageResponse> {
  const { fontSize } = message;
  // 空文字（無効化）または許可リストの値のみ受け付ける
  const allowedSizes: readonly string[] = COMMENT_STYLE_OPTIONS.FONT_SIZES.map((o) => o.value);
  if (fontSize !== '' && !allowedSizes.includes(fontSize)) {
    return { ok: false, error: '無効な文字サイズです' };
  }
  await storage.setItem(toLocalKey(LOCAL_STORAGE_KEYS.COMMENT_FONT_SIZE), fontSize);
  Logger.info('コメント文字サイズを設定しました', { fontSize });
  return { ok: true };
}

/**
 * コメント文字サイズ取得ハンドラー
 */
async function handleGetCommentFontSize(): Promise<MessageResponse> {
  const fontSize = (await storage.getItem<string>(toLocalKey(LOCAL_STORAGE_KEYS.COMMENT_FONT_SIZE))) ?? SETTING_DEFAULTS.COMMENT_FONT_SIZE;
  return { ok: true, fontSize };
}

/**
 * コメント文字色設定ハンドラー
 */
async function handleSetCommentFontColor(message: SetCommentFontColorRequest): Promise<MessageResponse> {
  const { fontColor } = message;
  // 空文字（無効化）または許可リストの値のみ受け付ける
  const allowedColors: readonly string[] = COMMENT_STYLE_OPTIONS.FONT_COLORS.map((o) => o.value);
  if (fontColor !== '' && !allowedColors.includes(fontColor)) {
    return { ok: false, error: '無効な文字色です' };
  }
  await storage.setItem(toLocalKey(LOCAL_STORAGE_KEYS.COMMENT_FONT_COLOR), fontColor);
  Logger.info('コメント文字色を設定しました', { fontColor });
  return { ok: true };
}

/**
 * コメント文字色取得ハンドラー
 */
async function handleGetCommentFontColor(): Promise<MessageResponse> {
  const fontColor = (await storage.getItem<string>(toLocalKey(LOCAL_STORAGE_KEYS.COMMENT_FONT_COLOR))) ?? SETTING_DEFAULTS.COMMENT_FONT_COLOR;
  return { ok: true, fontColor };
}

/**
 * セッション設定ハンドラー
 */
async function handleSetSession(message: SetSessionRequest): Promise<MessageResponse> {
  const { key, value } = message;
  await storage.setItem(toSessionKey(key), value);
  Logger.info('セッションストレージに設定しました', { key });
  return { ok: true };
}

/**
 * セッション取得ハンドラー
 */
async function handleGetSession(message: GetSessionRequest): Promise<MessageResponse> {
  const { key } = message;
  const value = await storage.getItem(toSessionKey(key));
  return { ok: true, value };
}

/**
 * Content Script から中継されたエラーを Sentry に送信するハンドラー
 */
function handleReportError(message: ReportErrorRequest): MessageResponse {
  captureRelayedError(message.message, message.context, message.stack, message.detail);
  return { ok: true };
}

/**
 * メッセージをルーティングして適切なハンドラーに振り分ける
 */
export async function routeMessage(
  message: MessageRequest
): Promise<MessageResponse> {
  try {
    switch (message.type) {
      case 'crawl-now':
        return await handleCrawlNow();

      case 'upsert-comment':
        return await handleUpsertComment(message);

      case 'remove-comment':
        return await handleRemoveComment(message);

      case 'remove-topic':
        return await handleRemoveTopic(message);

      case 'clear-unread':
        return await handleClearUnread(message);

      case 'get-all-comments':
        return await handleGetAllComments();

      case 'set-crawler-enabled':
        return await handleSetCrawlerEnabled(message);

      case 'get-crawler-enabled':
        return await handleGetCrawlerEnabled();

      case 'set-track-button-visible':
        return await handleSetTrackButtonVisible(message);

      case 'get-track-button-visible':
        return await handleGetTrackButtonVisible();

      case 'set-auto-track-post':
        return await handleSetAutoTrackPost(message);

      case 'get-auto-track-post':
        return await handleGetAutoTrackPost();

      case 'set-comment-font-size':
        return await handleSetCommentFontSize(message);

      case 'get-comment-font-size':
        return await handleGetCommentFontSize();

      case 'set-comment-font-color':
        return await handleSetCommentFontColor(message);

      case 'get-comment-font-color':
        return await handleGetCommentFontColor();

      case 'set-session':
        return await handleSetSession(message);

      case 'get-session':
        return await handleGetSession(message);

      case 'report-error':
        return handleReportError(message);

      default:
        Logger.warn('未知のメッセージタイプを受信しました', { type: message.type });
        return { ok: false, error: '未知のメッセージタイプです' };
    }
  } catch (error) {
    Logger.error('メッセージハンドラーでエラーが発生しました', { type: message.type, error });
    return { ok: false, error: String(error) };
  }
}
