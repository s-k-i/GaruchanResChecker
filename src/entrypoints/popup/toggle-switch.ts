/**
 * @file トグルスイッチUIコンポーネント
 * @description 再利用可能なスライドトグルスイッチ生成ファクトリ
 */
import Logger from '../../utils/logger';

/**
 * トグルスイッチ生成オプション
 */
export interface ToggleSwitchOptions {
  /** ラベルテキスト */
  label: string;
  /** ON 状態時のステータステキスト */
  statusOn: string;
  /** OFF 状態時のステータステキスト */
  statusOff: string;
  /** 初期チェック状態 */
  checked: boolean;
  /** コンテナ要素のクラス名 */
  containerClass: string;
  /** ラベル要素のクラス名 */
  labelClass: string;
  /** ステータス表示のクラス名 */
  statusClass: string;
  /** 変更時コールバック（checked = 変更後の値） */
  onChange: (checked: boolean) => Promise<void>;
}

/**
 * スライドトグルスイッチ要素を生成する
 * @param opts - 生成オプション
 * @returns コンテナ HTMLElement（label + switch + status を含む）
 */
export function createToggleSwitch(opts: ToggleSwitchOptions): HTMLElement {
  const container = document.createElement('div');
  container.className = opts.containerClass;

  // ラベル
  const label = document.createElement('span');
  label.className = opts.labelClass;
  label.textContent = opts.label;
  container.appendChild(label);

  // スライドスイッチ構造 (<label class="switch"><input><span class="slider"></label>)
  const switchLabel = document.createElement('label');
  switchLabel.className = 'switch';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = opts.checked;
  const slider = document.createElement('span');
  slider.className = 'slider';
  switchLabel.appendChild(toggle);
  switchLabel.appendChild(slider);
  container.appendChild(switchLabel);

  // ステータステキスト
  const status = document.createElement('span');
  status.className = opts.statusClass;
  status.textContent = opts.checked ? opts.statusOn : opts.statusOff;
  container.appendChild(status);

  toggle.addEventListener('change', async () => {
    try {
      await opts.onChange(toggle.checked);
      status.textContent = toggle.checked ? opts.statusOn : opts.statusOff;
    } catch (e) {
      Logger.error('トグルスイッチの変更処理に失敗しました', e);
      // ロールバック
      toggle.checked = !toggle.checked;
      status.textContent = toggle.checked ? opts.statusOn : opts.statusOff;
    }
  });

  return container;
}
