/**
 * @file メッセージ型定義
 * @description background scriptとcontent script/popup間の通信型を定義
 */

import type { CommentEntry } from './comment';

/**
 * メッセージ基底型
 */
interface BaseMessage {
  type: string;
}

/**
 * レスポンス基底型
 */
interface BaseResponse {
  ok: boolean;
  error?: string;
}

/**
 * クローラー即時実行リクエスト
 */
export interface CrawlNowRequest extends BaseMessage {
  type: 'crawl-now';
}

export interface CrawlNowResponse extends BaseResponse {
  started: boolean;
}

/**
 * コメント追加・更新リクエスト
 */
export interface UpsertCommentRequest extends BaseMessage {
  type: 'upsert-comment';
  entry: CommentEntry;
}

export interface UpsertCommentResponse extends BaseResponse {}

/**
 * コメント削除リクエスト
 */
export interface RemoveCommentRequest extends BaseMessage {
  type: 'remove-comment';
  topicId: string;
  commentNumber: string;
}

export interface RemoveCommentResponse extends BaseResponse {}

/**
 * トピック削除リクエスト
 */
export interface RemoveTopicRequest extends BaseMessage {
  type: 'remove-topic';
  topicId: string;
}

export interface RemoveTopicResponse extends BaseResponse {
  count?: number;
}

/**
 * 未読クリアリクエスト
 */
export interface ClearUnreadRequest extends BaseMessage {
  type: 'clear-unread';
  topicId: string;
  commentNumber: string;
}

export interface ClearUnreadResponse extends BaseResponse {}

/**
 * 全コメント取得リクエスト
 */
export interface GetAllCommentsRequest extends BaseMessage {
  type: 'get-all-comments';
}

export interface GetAllCommentsResponse extends BaseResponse {
  comments: CommentEntry[];
}

/**
 * クローラー有効化設定リクエスト
 * @description 返信数の定期取得を有効化/無効化する
 */
export interface SetCrawlerEnabledRequest extends BaseMessage {
  type: 'set-crawler-enabled';
  enabled: boolean;
}

export interface SetCrawlerEnabledResponse extends BaseResponse {}

/**
 * クローラー有効化取得リクエスト
 * @description 現在のクローラー有効化状態を取得する
 */
export interface GetCrawlerEnabledRequest extends BaseMessage {
  type: 'get-crawler-enabled';
}

export interface GetCrawlerEnabledResponse extends BaseResponse {
  enabled: boolean;
}

/**
 * 追跡ボタン表示設定リクエスト
 * @description トピック/コメントページの「追跡」ボタンの表示/非表示を切り替える
 */
export interface SetTrackButtonVisibleRequest extends BaseMessage {
  type: 'set-track-button-visible';
  visible: boolean;
}

export interface SetTrackButtonVisibleResponse extends BaseResponse {}

/**
 * 追跡ボタン表示取得リクエスト
 * @description 現在の追跡ボタン表示状態を取得する
 */
export interface GetTrackButtonVisibleRequest extends BaseMessage {
  type: 'get-track-button-visible';
}

export interface GetTrackButtonVisibleResponse extends BaseResponse {
  visible: boolean;
}

/**
 * 投稿コメントの自動追跡設定リクエスト
 * @description 投稿完了時に自動的にコメントを追跡リストに追加するかどうかを切り替える
 */
export interface SetAutoTrackPostRequest extends BaseMessage {
  type: 'set-auto-track-post';
  enabled: boolean;
}

export interface SetAutoTrackPostResponse extends BaseResponse {}

/**
 * 投稿コメントの自動追跡取得リクエスト
 * @description 現在の自動追跡設定を取得する
 */
export interface GetAutoTrackPostRequest extends BaseMessage {
  type: 'get-auto-track-post';
}

export interface GetAutoTrackPostResponse extends BaseResponse {
  enabled: boolean;
}

/**
 * コメント文字サイズ設定リクエスト
 * @description コメントの文字サイズを一律変更する設定
 */
export interface SetCommentFontSizeRequest extends BaseMessage {
  type: 'set-comment-font-size';
  fontSize: string;
}

export interface SetCommentFontSizeResponse extends BaseResponse {}

/**
 * コメント文字サイズ取得リクエスト
 */
export interface GetCommentFontSizeRequest extends BaseMessage {
  type: 'get-comment-font-size';
}

export interface GetCommentFontSizeResponse extends BaseResponse {
  fontSize: string;
}

/**
 * コメント文字色設定リクエスト
 * @description コメントの文字色を一律変更する設定
 */
export interface SetCommentFontColorRequest extends BaseMessage {
  type: 'set-comment-font-color';
  fontColor: string;
}

export interface SetCommentFontColorResponse extends BaseResponse {}

/**
 * コメント文字色取得リクエスト
 */
export interface GetCommentFontColorRequest extends BaseMessage {
  type: 'get-comment-font-color';
}

export interface GetCommentFontColorResponse extends BaseResponse {
  fontColor: string;
}

/**
 * セッション設定リクエスト
 * @description browser.storage.sessionに一時的なデータを保存する
 */
export interface SetSessionRequest extends BaseMessage {
  type: 'set-session';
  key: string;
  value: unknown;
}

export interface SetSessionResponse extends BaseResponse {}

/**
 * セッション取得リクエスト
 * @description browser.storage.sessionから一時的なデータを取得する
 */
export interface GetSessionRequest extends BaseMessage {
  type: 'get-session';
  key: string;
}

export interface GetSessionResponse extends BaseResponse {
  value?: unknown;
}

/**
 * コンテキストメニューから追跡リクエスト
 * @description コンテキストメニューで追跡が選択されたことをcontent scriptに通知する
 */
export interface TrackFromContextMenuRequest extends BaseMessage {
  type: 'track-from-context-menu';
  tabId: number;
}

export interface TrackFromContextMenuResponse extends BaseResponse {}

/**
 * Popup更新通知
 * @description バックグラウンドからポップアップUIに更新を通知する
 */
export interface RefreshPopupMessage extends BaseMessage {
  type: 'refresh-popup';
}

/**
 * 追跡ボタン表示状態変更通知
 * @description backgroundからcontent scriptへブロードキャストする通知
 */
export interface TrackButtonVisibilityChangedMessage extends BaseMessage {
  type: 'track-button-visibility-changed';
  visible: boolean;
}

/**
 * コメントスタイル変更通知
 * @description backgroundからcontent scriptへブロードキャストする通知
 */
export interface CommentStyleChangedMessage extends BaseMessage {
  type: 'comment-style-changed';
}

/**
 * すべてのメッセージリクエスト型のユニオン
 * @description background script / content script / popup 間でやり取りされる全てのメッセージ型。
 */
export type MessageRequest =
  | CrawlNowRequest
  | UpsertCommentRequest
  | RemoveCommentRequest
  | RemoveTopicRequest
  | ClearUnreadRequest
  | GetAllCommentsRequest
  | SetCrawlerEnabledRequest
  | GetCrawlerEnabledRequest
  | SetTrackButtonVisibleRequest
  | GetTrackButtonVisibleRequest
  | SetAutoTrackPostRequest
  | GetAutoTrackPostRequest
  | SetCommentFontSizeRequest
  | GetCommentFontSizeRequest
  | SetCommentFontColorRequest
  | GetCommentFontColorRequest
  | SetSessionRequest
  | GetSessionRequest
  | TrackFromContextMenuRequest
  | RefreshPopupMessage
  | TrackButtonVisibilityChangedMessage
  | CommentStyleChangedMessage;

/**
 * すべてのメッセージレスポンス型のユニオン
 * @description background scriptから返される全てのレスポンス型
 */
export type MessageResponse =
  | CrawlNowResponse
  | UpsertCommentResponse
  | RemoveCommentResponse
  | RemoveTopicResponse
  | ClearUnreadResponse
  | GetAllCommentsResponse
  | SetCrawlerEnabledResponse
  | GetCrawlerEnabledResponse
  | SetTrackButtonVisibleResponse
  | GetTrackButtonVisibleResponse
  | SetAutoTrackPostResponse
  | GetAutoTrackPostResponse
  | SetCommentFontSizeResponse
  | GetCommentFontSizeResponse
  | SetCommentFontColorResponse
  | GetCommentFontColorResponse
  | SetSessionResponse
  | GetSessionResponse
  | TrackFromContextMenuResponse;
