// File-signature sniffing. The declared Content-Type is never trusted on its own: only JPEG, PNG and
// WebP magic bytes are accepted, and HTML or SVG (script-capable) payloads are recognised and refused.
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function sniff(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** True when the payload looks like markup (HTML error pages, SVG), whatever its declared type. */
export function looksLikeMarkup(bytes: Uint8Array): boolean {
  const head = ascii(bytes, 0, Math.min(bytes.length, 512)).replace(/^﻿/, '').trimStart().toLowerCase();
  return head.startsWith('<') || head.includes('<html') || head.includes('<svg') || head.includes('<!doctype');
}

function ascii(b: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < to && i < b.length; i++) s += String.fromCharCode(b[i]!);
  return s;
}
