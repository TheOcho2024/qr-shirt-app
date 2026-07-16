// Generates the QR code, composites it onto your base shirt art to produce
// a print-ready transparent PNG, uploads to Supabase Storage, returns a URL.
import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { supabase, STORAGE_BUCKET } from './supabase.js';

const CANVAS = { width: 3600, height: 4800 };
const QR = { size: 900, left: 1350, top: 3300 };
const BASE_DESIGN = path.join(process.cwd(), 'assets', 'base-design.png');

export async function buildPrintFile({ id, scanUrl }) {
  const qrBuffer = await QRCode.toBuffer(scanUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: QR.size,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });

  let base;
  try {
    const baseBuf = await fs.readFile(BASE_DESIGN);
    base = sharp(baseBuf).resize(CANVAS.width, CANVAS.height, { fit: 'contain' });
  } catch {
    base = sharp({
      create: {
        width: CANVAS.width,
        height: CANVAS.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    });
  }

  const composed = await base
    .composite([{ input: qrBuffer, left: QR.left, top: QR.top }])
    .png()
    .toBuffer();

  const objectPath = 'prints/' + id + '.png';
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, composed, { contentType: 'image/png', upsert: true });
  if (error) throw new Error('Storage upload failed: ' + error.message);

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
  return { publicUrl: data.publicUrl };
}
