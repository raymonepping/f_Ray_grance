// Persistent asset store on the mounted volume (outside Git and outside the disposable container).
// Files are content-addressed: <first two hex>/<sha256> for the original and <...>.display.webp for
// the derivative. Writes are atomic (temp file + rename) and idempotent for identical bytes.
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const HEX64 = /^[0-9a-f]{64}$/;

export class AssetStore {
  constructor(readonly root: string) {}

  relPath(checksum: string): string {
    if (!HEX64.test(checksum)) throw new Error('invalid checksum');
    return `${checksum.slice(0, 2)}/${checksum}`;
  }

  /** Absolute path for a stored relative path; refuses anything that is not a content address. */
  resolve(rel: string, variant: 'original' | 'display'): string {
    if (!/^[0-9a-f]{2}\/[0-9a-f]{64}$/.test(rel)) throw new Error('invalid storage path');
    return path.join(this.root, variant === 'display' ? `${rel}.display.webp` : rel);
  }

  async put(checksum: string, original: Buffer, display: Buffer): Promise<string> {
    const rel = this.relPath(checksum);
    await mkdir(path.join(this.root, rel.slice(0, 2)), { recursive: true, mode: 0o750 });
    await this.write(this.resolve(rel, 'original'), original);
    await this.write(this.resolve(rel, 'display'), display);
    return rel;
  }

  async remove(rel: string): Promise<void> {
    await rm(this.resolve(rel, 'original'), { force: true });
    await rm(this.resolve(rel, 'display'), { force: true });
  }

  async ready(): Promise<boolean> {
    try {
      return (await stat(this.root)).isDirectory();
    } catch {
      return false;
    }
  }

  private async write(target: string, bytes: Buffer): Promise<void> {
    try {
      if ((await stat(target)).size === bytes.length) return; // same content address already stored
    } catch {
      /* not stored yet */
    }
    const tmp = `${target}.${randomUUID()}.tmp`;
    await writeFile(tmp, bytes, { mode: 0o640 });
    await rename(tmp, target);
  }
}
