// Validates image bytes and builds the bounded display derivative. The signature decides the type,
// sharp must decode the whole image, dimensions are bounded, and the derivative (max 1200 px, WebP)
// drops all metadata, so camera EXIF such as GPS never reaches the UI.
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ImageError } from './errors.js';
import { looksLikeMarkup, sniff, type ImageMime } from './signature.js';

export const MIN_EDGE = 64;
export const MAX_EDGE = 12_000;
export const DISPLAY_EDGE = 1200;

export interface Processed {
  original: Buffer;
  display: Buffer;
  mime: ImageMime;
  width: number;
  height: number;
  checksum: string;
}

export const checksumOf = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export async function processImage(bytes: Buffer): Promise<Processed> {
  if (!bytes.length) throw new ImageError('NOT_AN_IMAGE', 'The file is empty');
  const mime = sniff(bytes);
  if (!mime) {
    throw looksLikeMarkup(bytes)
      ? new ImageError('NOT_AN_IMAGE', 'The content is HTML or SVG, not a raster image')
      : new ImageError('UNSUPPORTED_FORMAT', 'Only JPEG, PNG and WebP images are accepted');
  }
  let width: number;
  let height: number;
  let display: Buffer;
  try {
    const meta = await sharp(bytes, { limitInputPixels: 50_000_000, failOn: 'error' }).metadata();
    width = meta.autoOrient?.width ?? meta.width ?? 0;
    height = meta.autoOrient?.height ?? meta.height ?? 0;
    if (width < MIN_EDGE || height < MIN_EDGE || width > MAX_EDGE || height > MAX_EDGE) {
      throw new ImageError('DIMENSIONS', `Image must be between ${MIN_EDGE} and ${MAX_EDGE} px on each side (got ${width}×${height})`);
    }
    display = await sharp(bytes, { limitInputPixels: 50_000_000, failOn: 'error' })
      .rotate()
      .resize({ width: DISPLAY_EDGE, height: DISPLAY_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw new ImageError('DECODE_FAILED', 'The image could not be decoded');
  }
  return { original: bytes, display, mime, width, height, checksum: checksumOf(bytes) };
}
