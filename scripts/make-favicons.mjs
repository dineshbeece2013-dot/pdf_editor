#!/usr/bin/env node
/**
 * make-favicons.mjs — derive the raster favicons from public/favicon.svg.
 *
 * Why this exists: Google Search does NOT support SVG favicons. Its documented
 * formats are BMP, GIF, ICO, PNG, JPEG, PPM and TIFF, and the icon must be a
 * square (1:1). The hand-authored source logo is 48x46 SVG, so serving only
 * that file guarantees the generic globe icon in search results — and
 * /favicon.ico (the path most crawlers probe first) 404s.
 *
 * Outputs (committed to public/ so the build needs no extra step):
 *   public/favicon.png            96x96  transparent, square
 *   public/apple-touch-icon.png  180x180 white background (iOS renders
 *                                  transparency as black otherwise)
 *   public/favicon.ico             48x48 PNG-in-ICO (supported since Vista)
 *
 * Run manually after changing the logo:  npm run favicons
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'public', 'favicon.svg');

/** Render the SVG onto a square canvas of the requested size. */
async function squarePng(size, background) {
  const svg = await readFile(svgPath);
  return sharp(svg)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0, ...background },
    })
    .png()
    .toBuffer();
}

/** Wrap a PNG buffer in a single-image .ico container. */
function pngToIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette size (truecolor)
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset: header + one entry

  return Buffer.concat([header, entry, png]);
}

const favicon96 = await squarePng(96);
const apple180 = await squarePng(180, {
  r: 255,
  g: 255,
  b: 255,
  alpha: 1, // opaque white
});
const ico48 = await squarePng(48);

await writeFile(join(root, 'public', 'favicon.png'), favicon96);
await writeFile(join(root, 'public', 'apple-touch-icon.png'), apple180);
await writeFile(join(root, 'public', 'favicon.ico'), pngToIco(ico48, 48));

console.log('[favicons] wrote favicon.png (96), apple-touch-icon.png (180), favicon.ico (48)');
