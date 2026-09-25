# Jaame Sokhan PWA

The Progressive Web App version of [Jaame Sokhan](https://jaamesokhan.ir), an open-source app
for reading Persian poetry. It is a port of the Android client (Kotlin / Jetpack Compose) to the
web. It installs like an app, works offline, and keeps all user data on the device.

## Features

Same as the Android client:

- Downloadable poets from the Jaame Sokhan catalogue, stored locally for offline reading
- Poet → category → poem browsing, previous/next poem, random poem (global or per category)
- Full-text search (normalized Persian/Arabic letters, word-prefix matching) with poet filter
  and search history
- Highlights in five colours (select text → highlight / copy / meaning), multi-verse highlights
- Bookmarks and highlights organised with coloured categories (labels)
- Notes per poem, reading history
- Recitations (Jaame Sokhan API with Ganjoor fallback) with verse-synced scrolling,
  repeat, speed, and lock-screen controls (Media Session)
- Dictionary lookup
- Themes (auto/day/night), poem fonts (Nastaliq, Vazirmatn, Dana, Serif) and font size
- Random-poem home card layouts and category selection
- Daily random-poem notification (where Periodic Background Sync is supported)

Web-only features:

- Backup and restore of the whole local database as a `.sqlite3` file
- Install prompt and offline shell via a service worker

## Architecture

| Concern | Choice |
|---|---|
| UI | React 19 + TypeScript, Vite, React Router; hand-written Material 3 CSS (RTL) |
| Theme | Material 3 TonalSpot scheme from the brand seed `#5B6642` (`npm run theme`) |
| Local DB | [SQLite Wasm](https://sqlite.org/wasm) in a dedicated worker, persisted in OPFS (`opfs-sahpool` VFS, no COOP/COEP headers needed); FTS5 for search |
| Poet import | zip (`fflate`) → CSV (`papaparse`) → one SQLite transaction, inside the worker |
| Offline | `vite-plugin-pwa` (Workbox, `injectManifest`), custom `src/sw.ts` |

```
src/
  api/         server + Ganjoor calls, audio-sync XML parser
  audio/       app-wide recitation player
  components/  layout, sheets, toolbars, shared UI
  data/        queries (ports of the Android DAOs) and types
  db/          SQLite worker, schema/migrations, import engine, main-thread client
  lib/         normalization, highlight segmentation, sharing, daily-poem helper
  pages/       one file per screen
  state/       settings, downloads, toasts, hooks
  sw.ts        service worker
```

The schema in `src/db/schema.ts` mirrors the Room entities of the Android client. Each schema
change is added as a new entry in `MIGRATIONS`, and `PRAGMA user_version` records which ones
have run.

## Development

```bash
npm install
npm run dev        # http://localhost:5173, /api is proxied to https://jaamesokhan.ir
npm test           # unit tests (data layer runs against real SQLite Wasm in Node)
npm run typecheck
npm run build      # production build in dist/
npm run preview    # serve dist/ (service worker active)
```

Configuration (see `.env.example`):

- `VITE_API_BASE_URL`: API origin. The production default is `https://jaamesokhan.ir`. Use `""`
  when the PWA is served from the same origin as the API.
- `VITE_GANJOOR_BASE_URL`: Ganjoor API for the recitation fallback.
- `VITE_DEV_API_PROXY`: where the dev server proxies `/api`.

When the PWA runs on a different origin from the API, the server must allow it through CORS
(`cors.allowed-origins` in jaamesokhan-server). The browser downloads poet archives directly
from MinIO, so MinIO must also allow `GET` from the PWA's origin. MinIO allows all origins by
default.

`npm run icons` regenerates the icons and name logo from the Android launcher assets in
`assets/`.

## CI

`docs/ci.yml` runs typecheck, tests and build. Move it to `.github/workflows/ci.yml` to enable it.

## Deployment

It is a static site, so any static host works. It needs an SPA fallback to `index.html`, and
`sw.js` must not be cached. A Docker image with a matching nginx config is included:

```bash
docker build -t jaamesokhan-pwa --build-arg VITE_API_BASE_URL=https://jaamesokhan.ir .
docker run -p 8080:80 jaamesokhan-pwa
```

HTTPS is required in production for service workers and OPFS. `localhost` is exempt.

## Browser support

This needs OPFS with sync access handles: Chrome/Edge 108+, Safari 16.4+ and Firefox 111+.
Without it (for example Firefox private windows) the app still runs, but data is kept in
memory only and is lost when the app closes. The Settings screen shows this.

The daily notification uses Periodic Background Sync, which is only available in Chromium
browsers when the app is installed. Elsewhere the setting is disabled and explains why.

## License

GPL-3.0, same as the Android client. Poems and recitations come from the open
[Ganjoor](https://ganjoor.net) database.
