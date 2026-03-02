/**
 * @file オプションページのメインスクリプト
 * @description 拡張機能の設定を管理するUI。
 *
 * 設定項目:
 * - 返信を通知する
 * - 投稿コメントを自動追跡する
 * - 追跡ボタンを表示する
 */
import './style.css';
import Logger from '../../utils/logger';
import { sendMessageSafely } from '../../utils/error-handler';
import { SETTING_DEFAULTS } from '../../constants/app-config';
import type {
  GetTrackButtonVisibleResponse,
  GetCrawlerEnabledResponse,
  GetAutoTrackPostResponse,
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
    label: '返信を通知する',
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

// ---- チェックボックス生成ヘルパー -------------------------------------------------------

let checkboxIdCounter = 0;

/**
 * チェックボックスアイテム要素を生成する
 * @param label - ラベルテキスト
 * @param checked - 初期値
 * @param onChange - 変更時コールバック
 * @returns コンテナ要素
 */
function createCheckboxOption(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => Promise<void>,
): HTMLElement {
  const id = `option-cb-${++checkboxIdCounter}`;

  const container = document.createElement('div');
  container.className = 'option-checkbox-container';

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
  const results = await Promise.allSettled(
    SETTINGS.map((s) => initSettingCheckbox(s)),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      listEl.appendChild(result.value);
    } else {
      Logger.error('設定チェックボックスの初期化に失敗しました', result.reason);
    }
  }
})().catch((e) => Logger.error('オプションページの初期化に失敗しました', e));
