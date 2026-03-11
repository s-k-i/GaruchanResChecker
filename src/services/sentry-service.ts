/**
 * @file Sentry サービス
 * @description 全コンテキスト共通の Sentry 初期化・エラー送信関数を提供する。
 * 他モジュールは @sentry/browser を直接 import せず、本サービス経由で Sentry を利用すること。
 *
 * 使用方法:
 * - 各エントリポイントの起動直後に `initSentry(context)` を呼び出す
 * - 開発環境では自動的に無効化される
 * - VITE_SENTRY_DSN が未設定の場合も無効化される
 */
import * as Sentry from '@sentry/browser';

const IS_PRODUCTION = import.meta.env.MODE === 'production';

/**
 * Sentry を初期化する
 * @param context - 実行コンテキスト名（Sentry のタグとして付与される）
 */
export function initSentry(context: 'background' | 'content' | 'popup' | 'options'): void {
  if (!IS_PRODUCTION) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: __SENTRY_RELEASE__,
    initialScope: {
      tags: { context },
    },
    // パフォーマンス監視は不要
    tracesSampleRate: 0,
  });
}

/**
 * Sentry が初期化済みかどうかを判定する
 * Content Script では Sentry.init() を呼べないため false になる
 */
export function isSentryInitialized(): boolean {
  return Sentry.getClient() !== undefined;
}

/**
 * エラーを Sentry に直接送信する（Background / Popup / Options 用）
 */
export function captureError(err: Error, extra?: { detail?: unknown }): void {
  Sentry.captureException(err, extra ? { extra } : undefined);
}

/**
 * Content Script から中継されたエラーを Sentry に送信する（Background 用）
 */
export function captureRelayedError(
  message: string,
  context: string,
  stack?: string,
  detail?: unknown,
): void {
  const err = new Error(message);
  if (stack) {
    err.stack = stack;
  }
  Sentry.captureException(err, {
    tags: { context },
    extra: { detail },
  });
}
