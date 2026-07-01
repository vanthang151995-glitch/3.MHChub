#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const input = path.resolve(process.cwd(), 'public', 'images', 'safety-6s-hero-2400.webp');
const outputPng = path.resolve(process.cwd(), 'public', 'images', 'safety-6s-hero-3840.png');
const outputWebp = path.resolve(process.cwd(), 'public', 'images', 'safety-6s-hero-3840.webp');

async function run() {
  if (!fs.existsSync(input)) {
    console.error('Input image not found:', input);
    process.exit(1);
  }

  const img = await loadImage(input);
  const targetWidth = 3840;
  const scale = targetWidth / img.width;
  const targetHeight = Math.round(img.height * scale);

  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const pngBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPng, pngBuffer);
  console.log('Wrote PNG:', outputPng);

  try {
    const webpBuffer = canvas.toBuffer('image/webp', { quality: 0.95 });
    fs.writeFileSync(outputWebp, webpBuffer);
    console.log('Wrote WEBP:', outputWebp);
  } catch (err) {
    console.warn('WEBP export failed (continuing). PNG created. Error:', err && err.message);
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
