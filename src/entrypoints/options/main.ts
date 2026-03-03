/**
 * @file オプションページのメインスクリプト
 * @description 拡張機能の設定を管理するUI。
 *
 * 設定項目:
 * - 返信の通知を有効にする
 * - 投稿コメントを自動追跡する
 * - 追跡ボタンを表示する
 */
import './style.css';
import Logger from '../../utils/logger';
import { sendMessageSafely } from '../../utils/error-handler';
import { SETTING_DEFAULTS, COMMENT_STYLE_OPTIONS } from '../../constants/app-config';
import type {
  GetTrackButtonVisibleResponse,
  GetCrawlerEnabledResponse,
  GetAutoTrackPostResponse,
  GetCommentFontSizeResponse,
  GetCommentFontColorResponse,
} from '../../types/messages';

// ---- 設定項目定義 -------------------------------------------------------------

/** 設定項目の宣言的定義 */
interface SettingDefinition<TGet> {
  /** チェックボックスのラベル */
  label: string;
  /** 現在値を取得するメッセージ */
  getMessage: { type: string };
  /** レスポンスから値を抽出する（null時はデフォルト値を返す） */
  extractValue: (response: TGet | null) => boolean;
  /** 値を保存するメッセージを生成する */
  buildSetMessage: (checked: boolean) => { type: string; [key: string]: unknown };
}

/** 設定項目一覧（表示順） */
const SETTINGS: SettingDefinition<
  GetCrawlerEnabledResponse | GetTrackButtonVisibleResponse | GetAutoTrackPostResponse
>[] = [
  {
    label: '返信の通知を有効にする',
    getMessage: { type: 'get-crawler-enabled' },
    extractValue: (res) =>
      (res as GetCrawlerEnabledResponse | null)?.enabled ?? SETTING_DEFAULTS.CRAWLER_ENABLED,
    buildSetMessage: (checked) => ({ type: 'set-crawler-enabled', enabled: checked }),
  },
  {
    label: '投稿コメントを自動追跡する',
    getMessage: { type: 'get-auto-track-post' },
    extractValue: (res) =>
      (res as GetAutoTrackPostResponse | null)?.enabled ?? SETTING_DEFAULTS.AUTO_TRACK_POST_ENABLED,
    buildSetMessage: (checked) => ({ type: 'set-auto-track-post', enabled: checked }),
  },
  {
    label: '追跡ボタンを表示する',
    getMessage: { type: 'get-track-button-visible' },
    extractValue: (res) =>
      (res as GetTrackButtonVisibleResponse | null)?.visible ?? SETTING_DEFAULTS.TRACK_BUTTON_VISIBLE,
    buildSetMessage: (checked) => ({ type: 'set-track-button-visible', visible: checked }),
  },
];

// ---- DOM 構造 ---------------------------------------------------------------

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app element not found');

app.innerHTML = `
  <h1 class="app-title">ガルちゃん返信チェッカー</h1>
  <div class="options-container">
    <h1 class="options-title">設定</h1>
    <div class="options-section" id="settings-list"></div>
  </div>
`;

const listEl = document.getElementById('settings-list') as HTMLElement;

// ---- DOM 生成ヘルパー -------------------------------------------------------

let checkboxIdCounter = 0;

/**
 * チェックボックス＋ラベルの共通部品を生成する
 * @returns { container, checkbox } — container にはラベル付きチェックボックスが入っている
 */
function createCheckboxLabelParts(
  label: string,
  checked: boolean,
  containerClass: string,
): { container: HTMLElement; checkbox: HTMLInputElement } {
  const id = `option-cb-${++checkboxIdCounter}`;

  const container = document.createElement('div');
  container.className = containerClass;

  const innerLabel = document.createElement('label');
  innerLabel.className = 'option-checkbox-inner';
  innerLabel.htmlFor = id;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  checkbox.className = 'option-checkbox';
  checkbox.checked = checked;

  const span = document.createElement('span');
  span.className = 'option-checkbox-label';
  span.textContent = label;

  innerLabel.appendChild(checkbox);
  innerLabel.appendChild(span);
  container.appendChild(innerLabel);

  return { container, checkbox };
}

/**
 * チェックボックスアイテム要素を生成する
 */
function createCheckboxOption(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => Promise<void>,
): HTMLElement {
  const { container, checkbox } = createCheckboxLabelParts(label, checked, 'option-checkbox-container');

  checkbox.addEventListener('change', async () => {
    try {
      await onChange(checkbox.checked);
    } catch (e) {
      Logger.error('設定の変更に失敗しました', e);
      checkbox.checked = !checkbox.checked;
    }
  });

  return container;
}

/**
 * チェックボックス＋セレクトボックスの複合アイテム要素を生成する
 * チェックボックスOFF時はスタイル上書きなし（サイト準拠）。
 */
function createCheckboxSelectOption(
  label: string,
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>,
  currentValue: string,
  defaultValue: string,
  onChange: (value: string) => Promise<void>,
  colorizeOptions = false,
): HTMLElement {
  const isEnabled = currentValue !== '';
  const selectValue = isEnabled ? currentValue : defaultValue;

  const { container, checkbox } = createCheckboxLabelParts(label, isEnabled, 'option-checkbox-select-container');

  const select = document.createElement('select');
  select.className = 'option-select option-select-inline';
  select.disabled = !isEnabled;

  for (const opt of options) {
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    if (opt.value === selectValue) optionEl.selected = true;
    if (colorizeOptions) {
      optionEl.style.color = opt.value;
      optionEl.style.fontWeight = 'bold';
    }
    select.appendChild(optionEl);
  }
  if (colorizeOptions) {
    select.style.color = selectValue;
    select.style.fontWeight = 'bold';
  }

  container.appendChild(select);

  checkbox.addEventListener('change', async () => {
    try {
      select.disabled = !checkbox.checked;
      await onChange(checkbox.checked ? select.value : '');
    } catch (e) {
      Logger.error('設定の変更に失敗しました', e);
      checkbox.checked = !checkbox.checked;
      select.disabled = !checkbox.checked;
    }
  });

  select.addEventListener('change', async () => {
    if (!checkbox.checked) return;
    try {
      if (colorizeOptions) select.style.color = select.value;
      await onChange(select.value);
    } catch (e) {
      Logger.error('設定の変更に失敗しました', e);
    }
  });

  return container;
}

// ---- 設定項目初期化 -----------------------------------------------------------

/**
 * 設定項目を初期化してチェックボックスを設定リストに追加する
 * @param setting - 設定項目定義
 */
async function initSettingCheckbox<T>(setting: SettingDefinition<T>): Promise<HTMLElement> {
  const response = await sendMessageSafely<T>(setting.getMessage);
  const checked = setting.extractValue(response);

  return createCheckboxOption(setting.label, checked, async (value) => {
    await sendMessageSafely(setting.buildSetMessage(value));
  });
}

// ---- 初期化 -----------------------------------------------------------------

(async () => {
  // チェックボックス設定の初期化
  const checkboxResults = await Promise.allSettled(
    SETTINGS.map((s) => initSettingCheckbox(s)),
  );

  for (const result of checkboxResults) {
    if (result.status === 'fulfilled') {
      listEl.appendChild(result.value);
    } else {
      Logger.error('設定チェックボックスの初期化に失敗しました', result.reason);
    }
  }

  // コメントスタイル設定の初期化
  const fontSizeRes = await sendMessageSafely<GetCommentFontSizeResponse>({ type: 'get-comment-font-size' });
  const currentFontSize = fontSizeRes?.fontSize ?? SETTING_DEFAULTS.COMMENT_FONT_SIZE;

  const fontColorRes = await sendMessageSafely<GetCommentFontColorResponse>({ type: 'get-comment-font-color' });
  const currentFontColor = fontColorRes?.fontColor ?? SETTING_DEFAULTS.COMMENT_FONT_COLOR;

  listEl.appendChild(
    createCheckboxSelectOption(
      'コメントの文字サイズを一律に変更する',
      COMMENT_STYLE_OPTIONS.FONT_SIZES,
      currentFontSize,
      COMMENT_STYLE_OPTIONS.FONT_SIZES[2].value,
      async (value) => {
        await sendMessageSafely({ type: 'set-comment-font-size', fontSize: value });
      },
    ),
  );

  listEl.appendChild(
    createCheckboxSelectOption(
      'コメントの文字色を一律に変更する',
      COMMENT_STYLE_OPTIONS.FONT_COLORS,
      currentFontColor,
      COMMENT_STYLE_OPTIONS.FONT_COLORS[0].value,
      async (value) => {
        await sendMessageSafely({ type: 'set-comment-font-color', fontColor: value });
      },
      true,
    ),
  );
})().catch((e) => Logger.error('オプションページの初期化に失敗しました', e));
