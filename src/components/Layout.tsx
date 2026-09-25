import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  mdiAccountOutline,
  mdiArrowRight,
  mdiBookmark,
  mdiBookmarkOutline,
  mdiBookOpenPageVariant,
  mdiBookOpenPageVariantOutline,
  mdiCog,
  mdiDice5Outline,
  mdiDotsVertical,
  mdiHistory,
  mdiMagnify,
  mdiMarker,
  mdiNoteEdit,
  mdiNoteEditOutline,
  mdiPlusCircleOutline,
  mdiShareVariantOutline,
} from '@mdi/js';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon, IconButton, MenuItem, Sheet, Toaster } from './ui';
import { MiniPlayer } from './MiniPlayer';
import { getRandomPoemId, getPoemPath } from '../data/content';
import { shareText } from '../lib/share';
import { showToast } from '../state/toast';
import { S } from '../strings';
import logoUrl from '../assets/name-logo.svg?raw';

// ---- page title store: pages call useTitle() and the top bar renders it.
let title = '';
const titleListeners = new Set<() => void>();
export function useTitle(value: string) {
  useEffect(() => {
    title = value;
    titleListeners.forEach((l) => l());
  }, [value]);
}
const useCurrentTitle = () =>
  useSyncExternalStore(
    (l) => {
      titleListeners.add(l);
      return () => titleListeners.delete(l);
    },
    () => title,
  );

const NAV_ITEMS = [
  { to: '/', label: S.myPoetsTitle, icon: mdiBookOpenPageVariantOutline, activeIcon: mdiBookOpenPageVariant, end: true },
  { to: '/collections/save', label: S.bookmarkTitle, icon: mdiBookmarkOutline, activeIcon: mdiBookmark },
  { to: '/collections/hi', label: S.highlightTitle, icon: mdiMarker, activeIcon: mdiMarker },
  { to: '/notes', label: S.noteTitle, icon: mdiNoteEditOutline, activeIcon: mdiNoteEdit },
];
const ROOT_PATHS = new Set(NAV_ITEMS.map((i) => i.to));

export async function openRandomPoem(navigate: (to: string) => void): Promise<void> {
  const poemId = await getRandomPoemId();
  const path = poemId != null ? await getPoemPath(poemId) : null;
  if (!path) {
    showToast(S.noPoetDownloaded, 'error');
    return;
  }
  navigate(`/poem/${path.poet.id}/${path.poem.id}`);
}

function OptionsMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <nav className="menu">
        <MenuItem icon={mdiPlusCircleOutline} label={S.addNewPoet} onClick={() => go('/poets/new')} />
        <MenuItem
          icon={mdiDice5Outline}
          label={S.randomPoem}
          onClick={() => {
            onClose();
            void openRandomPoem(navigate);
          }}
        />
        <MenuItem icon={mdiMagnify} label={S.search} onClick={() => go('/search')} />
        <hr />
        <MenuItem icon={mdiCog} label={S.settings} onClick={() => go('/settings')} />
        <MenuItem icon={mdiAccountOutline} label={S.aboutUs} onClick={() => go('/about')} />
        <MenuItem
          icon={mdiShareVariantOutline}
          label={S.introToFriend}
          onClick={() => void shareText(S.introToFriendsText + location.origin)}
        />
      </nav>
      <div className="menu-logo" dangerouslySetInnerHTML={{ __html: logoUrl }} />
    </Sheet>
  );
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (offlineReady) {
      showToast(S.offlineReady, 'success');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="alert">
      <span>{S.updateAvailable}</span>
      <button type="button" className="button text" onClick={() => setNeedRefresh(false)}>
        {S.close}
      </button>
      <button type="button" className="button filled" onClick={() => void updateServiceWorker(true)}>
        {S.update}
      </button>
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = useCurrentTitle();
  const [menuOpen, setMenuOpen] = useState(false);
  const isRoot = ROOT_PATHS.has(location.pathname);

  useEffect(() => {
    document.title = pageTitle && pageTitle !== S.appName ? `${pageTitle} | ${S.appName}` : S.appName;
  }, [pageTitle]);

  return (
    <div className="app">
      <header className="top-bar">
        {isRoot ? (
          <IconButton icon={mdiDotsVertical} label={S.options} onClick={() => setMenuOpen(true)} />
        ) : (
          <IconButton
            icon={mdiArrowRight}
            label={S.back}
            onClick={() => ((history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))}
          />
        )}
        {location.pathname === '/' ? (
          <Link to="/" className="top-bar-logo" aria-label={S.appName} dangerouslySetInnerHTML={{ __html: logoUrl }} />
        ) : (
          <h1 className="top-bar-title">{pageTitle}</h1>
        )}
        <div className="top-bar-actions">
          <IconButton icon={mdiHistory} label={S.readHistory} onClick={() => navigate('/history')} />
          <IconButton icon={mdiMagnify} label={S.search} onClick={() => navigate('/search')} />
          {!isRoot && <IconButton icon={mdiDotsVertical} label={S.options} onClick={() => setMenuOpen(true)} />}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <MiniPlayer />

      {isRoot && (
        <nav className="bottom-nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="bottom-nav-item">
              {({ isActive }) => (
                <>
                  <span className="bottom-nav-indicator">
                    <Icon path={isActive ? item.activeIcon : item.icon} />
                  </span>
                  <span className="bottom-nav-label">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}

      <OptionsMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <UpdatePrompt />
      <Toaster />
    </div>
  );
}
