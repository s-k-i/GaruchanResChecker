/**
 * @file アプリケーション定数
 * @description マジックナンバーやハードコード文字列を集約
 */

/**
 * クローラー設定
 */
export const CRAWLER_CONFIG = {
  /** コメント1件チェックごとの待機時間（ミリ秒） */
  ACTIVE_DELAY_MS: 3000,
  /** スキップする経過日数 */
  SKIP_AFTER_DAYS: 31,
  /** クローラーアラーム名 */
  ALARM_NAME: 'garuchan-crawler',
  /** クロール完了から次回クロール開始までの待機時間（分）。Chrome の制約により最小値は 1 分 */
  ALARM_DELAY_MINUTES: 1,
} as const;

/**
 * ページネーション設定
 */
export const PAGINATION = {
  /** 1ページあたりのコメント数 */
  COMMENTS_PER_PAGE: 500,
} as const;

/**
 * ストレージキー
 * 
 * @important WXT Storage API 仕様について
 * UNREAD_TOTAL, CRAWLER_ENABLED, TRACK_BUTTON_VISIBLE などの`local:`プレフィックス付きキーは、
 * WXT の storage API (storage.getItem/setItem) で使用するための形式です。
 * 
 * SESSION_PREFIX と COMMENT_PREFIX は、実際のキー生成時に `local:` や `session:` を
 * 先頭に付加する必要があります（例: `local:comment:123:456`）。
 * 
 * このプレフィックスはWXTフレームワークの要件であり、省略できません。
 */
export const STORAGE_KEYS = {
  /** コメントプレフィックス（使用時は `local:comment:` となる） */
  COMMENT_PREFIX: 'comment:',
  /** 未読合計 */
  UNREAD_TOTAL: 'local:unreadTotal',
  /** クローラー有効化 */
  CRAWLER_ENABLED: 'local:crawler:enabled',
  /** 追跡ボタン表示 */
  TRACK_BUTTON_VISIBLE: 'local:track-button:visible',
  /** セッションプレフィックス（使用時は `session:` となる） */
  SESSION_PREFIX: 'session:',
} as const;

/**
 * URL パターン
 */
export const URL_PATTERNS = {
  /** トピックページ */
  TOPICS: '/topics/',
  /** コメントページ */
  COMMENT: '/comment/',
  /** コメント投稿ページ */
  MAKE_COMMENT: '/make_comment/',
} as const;

/**
 * サイト設定
 */
export const SITE_CONFIG = {
  /** サイトドメイン */
  DOMAIN: 'girlschannel.net',
  /** ベースURL */
  BASE_URL: 'https://girlschannel.net',
} as const;

/**
 * バッジ設定
 */
export const BADGE_CONFIG = {
  /** バッジ背景色 */
  BACKGROUND_COLOR: '#FF3B30',
  /** バッジテキスト色 */
  TEXT_COLOR: '#FFFFFF',
} as const;

/**
 * DOM セレクタ
 */
export const SELECTORS = {
  /** コメントアイテム */
  COMMENT_ITEM: '.comment-item',
  /** コメント本文 */
  COMMENT_BODY: '.body.lv1, .body.lv2, .body.lv3, .body.lv4, .body',
  /** 返信カウント */
  RES_COUNT: '.res-count .res-count-btn, .res-count-btn, .res-count a',
  /** 投稿日時 */
  POSTED_AT: 'p.info a',
  /** アクション要素 */
  ACTIONS: '.actions',
  /** 追跡ボタン */
  TRACK_BUTTON: '.track-comment-btn',
  /** コメント画像 */
  COMMENT_IMG: '.comment-img',
  /** コメントURL */
  COMMENT_URL: '.comment-url',
  /** h1要素 */
  H1: 'h1',
  /** OGタイトル */
  OG_TITLE: 'meta[property="og:title"]',
  /** コメント投稿ページ: コメント入力フィールド */
  COMMENT_INPUT: 'input[name="text"]',
  /** コメント投稿ページ: 画像添付フラグ */
  IS_ADD_PIC_INPUT: 'input[name="is_add_pic"]',
  /** コメント投稿ページ: トピックリンク */
  TOPICS_LINK: '.entry-wrap a[href*="/topics/"]',
  /** コメント投稿ページ: 投稿フォーム */
  SUBMIT_FORM: 'form#form',
  /** コメントページ: トピックコメント領域 */
  TOPIC_COMMENT: 'ul.topic-comment',
  /** コメントページ: 返信コメント領域 */
  RES_COMMENT: 'ul.res-comment',
} as const;

/**
 * CSS クラス名
 */
export const CLASS_NAMES = {
  /** 追跡ボタン */
  TRACK_BUTTON: 'track-comment-btn',
  /** 追跡アイコン */
  TRACK_ICON: 'track-icon',
} as const;

/**
 * アイコンパス
 */
export const ICONS = {
  /** ピンクハートSVG */
  PINK_HEART_SVG: 'icon/heart_pink128.svg',
} as const;

/**
 * テキスト置換
 */
export const TEXT_REPLACEMENTS = {
  /** 画像置換テキスト */
  IMAGE: '【画像】',
  /** 引用置換テキスト */
  QUOTE: '【引用】',
} as const;

/**
 * 正規表現パターン
 */
export const REGEX_PATTERNS = {
  /** 返信数パターン */
  RES_COUNT: /(\d+)\s*件の返信/,
  /** トピックURL（ページ番号付き） */
  TOPICS_HREF: /\/topics\/(\d+)\/(\d+)#comment(\d+)/,
  /** コメントアンカー */
  COMMENT_ANCHOR: /#comment(\d+)/,
  /** URL行パターン（確認ページのlist[name="text"]内のURL行判定用） */
  URL_LINE: /^https?:\/\//,
} as const;

/**
 * 楽観ロック設定
 */
export const OPTIMISTIC_LOCK = {
  /** 最大リトライ回数 */
  MAX_RETRIES: 3,
  /** 初期待機時間（ミリ秒） */
  INITIAL_BACKOFF_MS: 100,
} as const;

/**
 * コメントエントリー設定
 */
export const COMMENT_ENTRY_CONFIG = {
  /** 保存可能な最大エントリー数（LRU方式で古いエントリーから削除） */
  MAX_ENTRIES: 1000,
} as const;

/**
 * ページ識別用テキスト
 */
export const PAGE_IDENTIFIERS = {
  /** コメント投稿確認ページ */
  COMMENT_CONFIRMATION: 'コメント投稿内容の確認',
  /** コメント投稿完了ページ */
  COMMENT_COMPLETION: 'コメント投稿完了',
} as const;

/**
 * メッセージタイプ
 */
export const MESSAGE_TYPES = {
  /** ポップアップ更新通知 */
  REFRESH_POPUP: 'refresh-popup',
  /** コンテキストメニューからの追跡 */
  TRACK_FROM_CONTEXT_MENU: 'track-from-context-menu',
  /** 追跡ボタン表示状態変更通知（background → content script ブロードキャスト） */
  TRACK_BUTTON_VISIBILITY_CHANGED: 'track-button-visibility-changed',
} as const;

/**
 * コンテキストメニュー設定
 */
export const CONTEXT_MENU_CONFIG = {
  /** 追跡メニューID */
  TRACK_COMMENT_ID: 'track-comment',
  /** 追跡メニュータイトル */
  TRACK_COMMENT_TITLE: 'このコメントを追跡',
} as const;

/**
 * 入力検証設定
 */
export const VALIDATION_CONFIG = {
  /** コメント本文のデフォルト最大文字数 */
  DEFAULT_MAX_TEXT_LENGTH: 10000,
} as const;

/**
 * 検証用正規表現パターン
 */
export const VALIDATION_PATTERNS = {
  /** ID検証パターン（1-10桁の数字） */
  ID: /^\d{1,10}$/,
  /** トピックURLパターン（/topics/の後に4桁以上の数字、その後は任意） */
  TOPIC_URL: /^\/topics\/\d{4,}/,
} as const;
