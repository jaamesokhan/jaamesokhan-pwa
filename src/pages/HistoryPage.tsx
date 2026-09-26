import { useState } from 'react';
import { Link } from 'react-router';
import { mdiClose, mdiDeleteSweepOutline, mdiHistory } from '@mdi/js';
import { useTitle } from '../components/Layout';
import { ConfirmDialog, EmptyState, Icon, IconButton, PoetAvatar, Spinner } from '../components/ui';
import { clearHistory, deleteHistoryItem, listHistory, pathText } from '../data/user';
import { formatDateTime } from '../lib/format';
import { useDbQuery } from '../state/hooks';
import { S } from '../strings';

export default function HistoryPage() {
  useTitle(S.readHistory);
  const history = useDbQuery(listHistory, []);
  const [confirmClear, setConfirmClear] = useState(false);

  if (history.loading && !history.data) return <Spinner />;
  if (history.data?.length === 0) return <EmptyState icon={mdiHistory} title={S.noHistory} />;

  return (
    <div className="page">
      <div className="page-actions">
        <button type="button" className="button text" onClick={() => setConfirmClear(true)}>
          <Icon path={mdiDeleteSweepOutline} size={20} />
          {S.deleteAllHistory}
        </button>
      </div>
      <ul className="list">
        {history.data?.map((item) => (
          <li key={item.id} className="card collection-item">
            <div className="collection-item-header">
              <PoetAvatar name={item.context.poet.name} imageUrl={item.context.poet.imageUrl} size={40} />
              <Link className="path" to={`/poem/${item.context.poet.id}/${item.context.poem.id}`}>
                {pathText(item.context)}
              </Link>
              <IconButton icon={mdiClose} label={S.delete} onClick={() => void deleteHistoryItem(item.id)} />
            </div>
            <Link className="collection-item-body" to={`/poem/${item.context.poet.id}/${item.context.poem.id}`}>
              <p className="verse-preview">{item.context.firstVerse?.text}</p>
            </Link>
            <time className="muted">{formatDateTime(item.timestamp)}</time>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirmClear}
        message={S.clearHistoryConfirm}
        confirmLabel={S.deleteAllHistory}
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          void clearHistory();
          setConfirmClear(false);
        }}
      />
    </div>
  );
}
