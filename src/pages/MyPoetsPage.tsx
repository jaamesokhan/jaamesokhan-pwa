import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { mdiDeleteOutline, mdiDotsVertical, mdiPlus } from '@mdi/js';
import { useTitle } from '../components/Layout';
import { RandomPoemCard } from '../components/RandomPoemCard';
import { ConfirmDialog, Icon, IconButton, MenuItem, PoetAvatar, Sheet, Spinner } from '../components/ui';
import { deletePoet, getRootCategoryId, listDownloadedPoets } from '../data/content';
import type { Poet } from '../data/types';
import { useDbQuery } from '../state/hooks';
import { updateSettings, useSettings } from '../state/settings';
import { showToast } from '../state/toast';
import { S } from '../strings';

let redirectedOnce = false;

export default function MyPoetsPage() {
  useTitle(S.myPoetsTitle);
  const settings = useSettings();
  const navigate = useNavigate();
  const { data: poets, loading } = useDbQuery(listDownloadedPoets, []);
  const [menuPoet, setMenuPoet] = useState<Poet | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Poet | null>(null);

  if (loading && !poets) return <Spinner />;
  // Like the Android app: start on the catalogue until the first poet is downloaded.
  if (poets && poets.length === 0 && !redirectedOnce) {
    redirectedOnce = true;
    return <Navigate to="/poets/new" replace />;
  }
  redirectedOnce = true;

  const openPoet = async (poet: Poet) => {
    const root = await getRootCategoryId(poet.id);
    if (root != null) navigate(`/poet/${poet.id}/${root}`);
  };

  return (
    <div className="page">
      {poets && poets.length > 0 && <RandomPoemCard layout={settings.randomPoemLayout} />}

      {poets && poets.length > 0 && !settings.randomPoemLayoutIntroSeen && (
        <div className="card intro-card">
          <strong>{S.randomPoemLayoutIntroTitle}</strong>
          <p>{S.randomPoemLayoutIntroBody}</p>
          <div className="button-row">
            <button type="button" className="button text" onClick={() => updateSettings({ randomPoemLayoutIntroSeen: true })}>
              {S.randomPoemLayoutIntroDismiss}
            </button>
            <button
              type="button"
              className="button filled"
              onClick={() => {
                updateSettings({ randomPoemLayoutIntroSeen: true });
                navigate('/settings#random-layout');
              }}
            >
              {S.randomPoemLayoutIntroConfirm}
            </button>
          </div>
        </div>
      )}

      <ul className="poet-grid">
        {poets?.map((poet) => (
          <li key={poet.id} className="poet-tile">
            <button type="button" className="poet-tile-main" onClick={() => void openPoet(poet)}>
              <PoetAvatar name={poet.name} imageUrl={poet.imageUrl} size={72} />
              <span>{poet.name}</span>
            </button>
            <IconButton className="poet-tile-menu" icon={mdiDotsVertical} label={S.options} onClick={() => setMenuPoet(poet)} />
          </li>
        ))}
        <li className="poet-tile">
          <Link to="/poets/new" className="poet-tile-main add">
            <span className="poet-avatar add-avatar" style={{ width: 72, height: 72 }}>
              <Icon path={mdiPlus} size={36} />
            </span>
            <span>{S.downloadNewPoet}</span>
          </Link>
        </li>
      </ul>

      <Sheet open={menuPoet != null} onClose={() => setMenuPoet(null)} title={menuPoet?.name}>
        <MenuItem
          icon={mdiDeleteOutline}
          label={S.deletePoet}
          danger
          onClick={() => {
            setConfirmDelete(menuPoet);
            setMenuPoet(null);
          }}
        />
      </Sheet>
      <ConfirmDialog
        open={confirmDelete != null}
        message={confirmDelete ? S.deletePoetConfirm(confirmDelete.name) : ''}
        confirmLabel={S.delete}
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const poet = confirmDelete!;
          setConfirmDelete(null);
          void deletePoet(poet.id).then(() => showToast(S.unbookmarkSuccess, 'success'));
        }}
      />
    </div>
  );
}
