import { StrictMode, lazy, Suspense, useEffect, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AudioProvider } from './audio/AudioProvider';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { workerDb } from './db/client';
import { refillDailyPoemQueue } from './lib/dailyPoem';
import { listenForInstallPrompt } from './state/install';
import { useMediaQuery } from './state/hooks';
import { useSettings } from './state/settings';
import MyPoetsPage from './pages/MyPoetsPage';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';

const DownloadablePoetsPage = lazy(() => import('./pages/DownloadablePoetsPage'));
const PoetDetailPage = lazy(() => import('./pages/PoetDetailPage'));
const PoemPage = lazy(() => import('./pages/PoemPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'));
const NotesPage = lazy(() => import('./pages/NotesPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

const page = (Component: ComponentType) => (
  <Suspense fallback={<Spinner />}>
    <Component />
  </Suspense>
);

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <MyPoetsPage /> },
      { path: 'poets/new', element: page(DownloadablePoetsPage) },
      { path: 'poet/:poetId/:categoryPath', element: page(PoetDetailPage) },
      { path: 'poem/:poetId/:poemId', element: page(PoemPage) },
      { path: 'search', element: page(SearchPage) },
      { path: 'collections/:tab', element: page(CollectionsPage) },
      { path: 'notes', element: page(NotesPage) },
      { path: 'history', element: page(HistoryPage) },
      { path: 'settings', element: page(SettingsPage) },
      { path: 'about', element: page(AboutPage) },
      { path: '*', element: <MyPoetsPage /> },
    ],
  },
]);

function ThemeSync() {
  const { theme } = useSettings();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1a1c15' : '#fafaee');
  }, [dark]);
  return null;
}

function App() {
  return (
    <AudioProvider>
      <ThemeSync />
      <RouterProvider router={router} />
    </AudioProvider>
  );
}

listenForInstallPrompt();
// Open the database early so the first screen doesn't wait for SQLite to boot.
void workerDb.init().then(() => refillDailyPoemQueue()).catch((e) => console.error('database init failed', e));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
