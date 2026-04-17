import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
// Strip <animate> so raster renders the mid-pulse static frame.
const staticSvg = svg.replace(/<animate[\s\S]*?\/>/g, '');

// Maskable icon needs safe-zone padding (icons rendered into any mask shape).
// Spec: keep content inside the central 80% circle → scale the 32x32 artwork
// down to ~70% and center it on a 32x32 canvas of the same bg color.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#ea580c"/>
  <g transform="translate(16 16) scale(0.7) translate(-16 -16)">
    ${staticSvg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')}
  </g>
</svg>`;

const outDir = new URL('../public/icons/', import.meta.url);
await mkdir(outDir, { recursive: true });

const targets = [
  { name: 'icon-192.png', svg: staticSvg, size: 192 },
  { name: 'icon-512.png', svg: staticSvg, size: 512 },
  { name: 'icon-maskable-512.png', svg: maskableSvg, size: 512 },
  { name: 'apple-touch-icon.png', svg: staticSvg, size: 180 },
];

for (const t of targets) {
  const png = await sharp(Buffer.from(t.svg)).resize(t.size, t.size).png().toBuffer();
  await writeFile(new URL(t.name, outDir), png);
  console.log(`wrote public/icons/${t.name} (${t.size}×${t.size})`);
}
