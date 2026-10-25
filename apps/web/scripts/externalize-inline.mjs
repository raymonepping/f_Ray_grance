// Post-generate CSP hardening: move every executable inline <script> in the static HTML
// into a same-origin file, so the gateway can keep `script-src 'self'` without
// 'unsafe-inline' or per-build hashes. JSON data scripts are left alone (not executed).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.output/public');
const outDir = path.join(root, '_inline');
mkdirSync(outDir, { recursive: true });
const html = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.html')) html.push(p);
  }
};
walk(root);
let moved = 0;
for (const file of html) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g, (whole, attrs, body) => {
    if (/type="(application\/json|importmap)"/.test(attrs)) {
      if (/importmap/.test(attrs)) throw new Error(`${file}: inline importmap present (set experimental.entryImportMap=false)`);
      return whole;
    }
    if (!body.trim()) return whole;
    const name = createHash('sha256').update(body).digest('hex').slice(0, 16) + '.js';
    writeFileSync(path.join(outDir, name), body);
    moved += 1;
    return `<script${attrs} src="/_inline/${name}"></script>`;
  });
  writeFileSync(file, out);
}
// Fail the build if anything executable is still inline.
for (const file of html) {
  const left = [...readFileSync(file, 'utf8').matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].filter(
    (m) => !/type="application\/json"/.test(m[1]) && m[2].trim(),
  );
  if (left.length) throw new Error(`${file}: ${left.length} inline script(s) remain`);
}
console.log(`externalised ${moved} inline script(s) across ${html.length} HTML file(s)`);
