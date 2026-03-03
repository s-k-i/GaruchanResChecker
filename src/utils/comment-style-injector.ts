/**
 * @file コメントスタイル注入ユーティリティ
 * @description ユーザー設定に基づいてコメントの文字サイズ・文字色を一律上書きするCSSを注入する
 */
import Logger from './logger';
import { sendMessageSafely } from './error-handler';
import { SETTING_DEFAULTS, COMMENT_STYLE_OPTIONS, SELECTORS } from '../constants/app-config';
import type {
  GetCommentFontSizeResponse,
  GetCommentFontColorResponse,
} from '../types/messages';

/** 注入するstyle要素のID */
const INJECTED_STYLE_ID = 'garuchan-comment-style-override';

/** 許可された文字サイズ値の集合 */
const ALLOWED_FONT_SIZES: ReadonlySet<string> = new Set(COMMENT_STYLE_OPTIONS.FONT_SIZES.map((o) => o.value));

/** 許可された文字色値の集合 */
const ALLOWED_FONT_COLORS: ReadonlySet<string> = new Set(COMMENT_STYLE_OPTIONS.FONT_COLORS.map((o) => o.value));

/** CSSスタイル上書き用セレクタ（COMMENT_ITEM + COMMENT_BODY から生成） */
const COMMENT_BODY_CSS_SELECTOR = SELECTORS.COMMENT_BODY
  .split(', ')
  .map((s) => `${SELECTORS.COMMENT_ITEM} ${s}`)
  .join(',\n');

/**
 * コメントスタイル（文字サイズ・文字色）の上書きCSSを注入する
 * @description background経由でユーザー設定を取得し、設定値がある場合のみ
 * `!important` 付きのCSSを `<style>` 要素として `<head>` に追加する。
 * 既に注入済みの場合は上書きする。
 * 許可リストに含まれない値はサニタイズとして無視する。
 */
export async function injectCommentStyleOverride(): Promise<void> {
  try {
    const [fontSizeRes, fontColorRes] = await Promise.all([
      sendMessageSafely<GetCommentFontSizeResponse>({ type: 'get-comment-font-size' }),
      sendMessageSafely<GetCommentFontColorResponse>({ type: 'get-comment-font-color' }),
    ]);

    const rawFontSize = fontSizeRes?.fontSize ?? SETTING_DEFAULTS.COMMENT_FONT_SIZE;
    const rawFontColor = fontColorRes?.fontColor ?? SETTING_DEFAULTS.COMMENT_FONT_COLOR;

    // 許可リストでサニタイズ（不正な値は空文字＝無効として扱う）
    const fontSize = ALLOWED_FONT_SIZES.has(rawFontSize) ? rawFontSize : '';
    const fontColor = ALLOWED_FONT_COLORS.has(rawFontColor) ? rawFontColor : '';

    // 両方無効なら何もしない（既存のstyle要素があれば削除する）
    if (!fontSize && !fontColor) {
      const existing = document.getElementById(INJECTED_STYLE_ID);
      if (existing) existing.remove();
      return;
    }

    // CSSプロパティを構築
    const declarations: string[] = [];
    if (fontSize) {
      declarations.push(`font-size: ${fontSize} !important`);
    }
    if (fontColor) {
      declarations.push(`color: ${fontColor} !important`);
    }

    const css = `
${COMMENT_BODY_CSS_SELECTOR} {
  ${declarations.join(';\n  ')};
}`;

    // 既存のstyle要素があれば更新、なければ新規作成
    let styleEl = document.getElementById(INJECTED_STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = INJECTED_STYLE_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;

    Logger.info('コメントスタイルを注入しました', { fontSize, fontColor });
  } catch (err) {
    Logger.error('コメントスタイルの注入に失敗しました', err);
  }
}
