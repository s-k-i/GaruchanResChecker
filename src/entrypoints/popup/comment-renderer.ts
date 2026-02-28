/**
 * @file コメントリストレンダラー
 * @description ポップアップのコメント一覧UIを構築するファクトリ関数群
 */
import Logger from '../../utils/logger';
import { calculatePageNumber } from '../../utils/pagination';
import { sendMessageSafely } from '../../utils/error-handler';
import { COMMENT_ENTRY_CONFIG, SITE_CONFIG } from '../../constants/app-config';
import type { CommentEntry } from '../../types/comment';
import type {
  RemoveTopicResponse,
  ClearUnreadResponse,
  RemoveCommentResponse,
} from '../../types/messages';

/** トピックグループの内部表現 */
interface TopicGroup {
  topicTitle: string | null;
  comments: CommentEntry[];
}

/**
 * 文字列をトリミングして省略記号を付加する
 * @param s - 入力値（null/undefined も許容）
 * @param n - 最大文字数
 */
function truncate(s: unknown, n: number): string {
  if (s === null || s === undefined) return '';
  const str = String(s);
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

/**
 * コメントエントリーをトピックIDでグループ化する
 */
function groupByTopic(comments: CommentEntry[]): Record<string, TopicGroup> {
  return comments.reduce<Record<string, TopicGroup>>((acc, c) => {
    if (!acc[c.topicId]) {
      acc[c.topicId] = { topicTitle: c.topicTitle, comments: [] };
    }
    acc[c.topicId].comments.push(c);
    return acc;
  }, {});
}

/**
 * 1件のコメント要素を生成する
 * @param c - コメントエントリー
 * @param onRefresh - 削除・未読クリア後の再描画コールバック
 */
function createCommentElement(c: CommentEntry, onRefresh: () => Promise<void>): HTMLElement {
  const el = document.createElement('div');
  el.className = 'comment-item';

  const secondLine = document.createElement('div');
  secondLine.className = 'comment-second';

  // 投稿日時
  if (c.postedAt) {
    const posted = document.createElement('span');
    posted.className = 'comment-posted';
    posted.textContent = `${c.postedAt} `;
    secondLine.appendChild(posted);
  }

  // コメント本文リンク
  const pageNumber = calculatePageNumber(c.commentNumber);
  const commentBasePath = pageNumber !== '1'
    ? `/topics/${c.topicId}/${pageNumber}`
    : `/topics/${c.topicId}/`;
  const commentUrl = `${SITE_CONFIG.BASE_URL}${commentBasePath}#comment${c.commentNumber}`;
  const commentAnchor = document.createElement('a');
  commentAnchor.href = commentUrl;
  commentAnchor.target = '_blank';
  commentAnchor.rel = 'noopener noreferrer';
  commentAnchor.className = 'comment-link';
  commentAnchor.textContent = truncate(c.commentBody ?? '', 80);
  commentAnchor.title = c.commentBody ?? '';
  secondLine.appendChild(commentAnchor);

  // 返信数・未読数リンク（クリックで未読クリア）
  const countsLink = document.createElement('a');
  countsLink.className = 'comment-counts';
  countsLink.href = `${SITE_CONFIG.BASE_URL}/comment/${c.topicId}/${c.commentNumber}/`;
  countsLink.target = '_blank';
  countsLink.rel = 'noopener noreferrer';
  countsLink.textContent = ` 返信:${c.resCount ?? 0}／未読:${c.unreadCount ?? 0}`;
  countsLink.title = '返信を読む';
  countsLink.addEventListener('click', async () => {
    try {
      await sendMessageSafely<ClearUnreadResponse>({
        type: 'clear-unread',
        topicId: c.topicId,
        commentNumber: c.commentNumber,
      });
      await onRefresh();
    } catch (err) {
      Logger.error('未読カウントのクリアに失敗しました', err);
    }
  });
  secondLine.appendChild(countsLink);

  // 削除ボタン
  const delBtn = document.createElement('button');
  delBtn.textContent = '削除';
  delBtn.className = 'comment-delete-btn';
  delBtn.addEventListener('click', async () => {
    try {
      await sendMessageSafely<RemoveCommentResponse>({
        type: 'remove-comment',
        topicId: c.topicId,
        commentNumber: c.commentNumber,
      });
      await onRefresh();
    } catch (err) {
      Logger.error('コメントの削除に失敗しました', err);
    }
  });
  secondLine.appendChild(delBtn);

  el.appendChild(secondLine);
  return el;
}

/**
 * 1トピックのグループ要素を生成する
 * @param topicId - トピックID
 * @param group - グループデータ
 * @param onRefresh - 削除後の再描画コールバック
 */
function createTopicGroupElement(
  topicId: string,
  group: TopicGroup,
  onRefresh: () => Promise<void>
): HTMLElement {
  const topicEl = document.createElement('div');
  topicEl.className = 'topic-group';

  // トピックタイトルヘッダー
  const topicTitleEl = document.createElement('div');
  topicTitleEl.className = 'topic-title';

  const topicLink = document.createElement('a');
  topicLink.href = `${SITE_CONFIG.BASE_URL}/topics/${topicId}/`;
  topicLink.target = '_blank';
  topicLink.rel = 'noopener noreferrer';
  topicLink.textContent = group.topicTitle ?? '';
  topicLink.title = group.topicTitle ?? '';
  topicTitleEl.appendChild(topicLink);

  // 全削除ボタン
  const deleteAllBtn = document.createElement('button');
  deleteAllBtn.textContent = '全削除';
  deleteAllBtn.className = 'topic-delete-all-btn';
  deleteAllBtn.addEventListener('click', async () => {
    try {
      await sendMessageSafely<RemoveTopicResponse>({
        type: 'remove-topic',
        topicId,
      });
      await onRefresh();
    } catch (err) {
      Logger.error('トピックの削除に失敗しました', err);
    }
  });
  topicTitleEl.appendChild(deleteAllBtn);
  topicEl.appendChild(topicTitleEl);

  // コメントリスト（コメント番号昇順）
  const sorted = [...group.comments].sort(
    (a, b) => parseInt(a.commentNumber, 10) - parseInt(b.commentNumber, 10)
  );
  for (const c of sorted) {
    topicEl.appendChild(createCommentElement(c, onRefresh));
  }

  return topicEl;
}

/**
 * コメントがない場合の表示を行う
 * @param listEl - コメントリストコンテナ要素
 */
export function renderEmpty(listEl: HTMLElement): void {
  listEl.innerHTML = '<p>コメントはありません。</p>';
}

/**
 * コメント一覧をコンテナ要素に描画する
 * @param listEl - コメントリストコンテナ要素
 * @param comments - コメントエントリーの配列
 * @param onRefresh - 操作後の再描画コールバック
 */
export function renderComments(
  listEl: HTMLElement,
  comments: CommentEntry[],
  onRefresh: () => Promise<void>
): void {
  if (!comments || comments.length === 0) {
    renderEmpty(listEl);
    return;
  }

  listEl.innerHTML = '';

  // 上限到達通知
  if (comments.length >= COMMENT_ENTRY_CONFIG.MAX_ENTRIES) {
    const notification = document.createElement('div');
    notification.className = 'limit-notification';
    notification.textContent = `コメント数が上限（${COMMENT_ENTRY_CONFIG.MAX_ENTRIES}件）に達しています。古いものから順に削除されます。`;
    listEl.appendChild(notification);
  }

  // トピックIDでグループ化してレンダリング
  const grouped = groupByTopic(comments);
  for (const [topicId, group] of Object.entries(grouped)) {
    listEl.appendChild(createTopicGroupElement(topicId, group, onRefresh));
  }
}
