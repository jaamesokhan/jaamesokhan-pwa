import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // In dev, /api is proxied to the real server so the app works without CORS.
  const apiTarget = env.VITE_DEV_API_PROXY ?? 'https://jaamesokhan.ir';

  return {
    define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf,wasm}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        includeAssets: ['favicon-64x64.png', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'جام سخن',
          short_name: 'جام سخن',
          description: 'دسترسی آسان و آفلاین به اشعار فارسی',
          lang: 'fa',
          dir: 'rtl',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#5B6642',
          background_color: '#fafaee',
          categories: ['books', 'education'],
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'جست‌وجو', url: '/search', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
            { name: 'ذخیره‌ها', url: '/collections/save', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          ],
        },
        devOptions: { enabled: false, type: 'module' },
      }),
    ],
    optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
    worker: { format: 'es' },
    server: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, secure: true },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
