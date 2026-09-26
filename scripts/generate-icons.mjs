// Regenerates public/ icons and the name logo from the Android client's launcher assets.
// Usage: npm run icons
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const BRAND = '#5B6642';
const foreground = await readFile(new URL('../assets/icon-foreground.webp', import.meta.url));

async function icon(size, file, { padding = 0 } = {}) {
  const inner = Math.round(size * (1 - padding * 2));
  const fg = await sharp(foreground).resize(inner, inner).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BRAND } })
    .composite([{ input: fg, gravity: 'center' }])
    .png()
    .toFile(new URL(`../public/${file}`, import.meta.url).pathname);
}

// The adaptive-icon foreground already has the Android safe-zone padding, so it is
// usable as-is for maskable icons.
await icon(192, 'pwa-192x192.png');
await icon(512, 'pwa-512x512.png');
await icon(512, 'maskable-512x512.png');
await icon(180, 'apple-touch-icon.png');
await icon(64, 'favicon-64x64.png');

// Android VectorDrawable -> SVG (path data is compatible). Fill uses currentColor so the
// logo follows the theme's text color.
const xml = await readFile(new URL('../assets/name_logo.xml', import.meta.url), 'utf8');
const vw = xml.match(/viewportWidth="([\d.]+)"/)[1];
const vh = xml.match(/viewportHeight="([\d.]+)"/)[1];
const paths = [...xml.matchAll(/<path[^>]*android:pathData="([^"]+)"[^>]*>/g)].map((m) => m[1]);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" fill="currentColor">${paths
  .map((d) => `<path d="${d}"/>`)
  .join('')}</svg>\n`;
await writeFile(new URL('../src/assets/name-logo.svg', import.meta.url), svg);
console.log('icons generated');
