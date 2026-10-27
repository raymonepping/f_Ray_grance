// @vitest-environment node
// WCAG 2.2 contrast audit of the Spectrometer tokens in both themes, including the
// translucent header chrome COMPOSITED over the canvas (never assume an opaque equivalent).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/assets/css/tokens.css', import.meta.url), 'utf8');
function block(selector: string): Record<string, string> {
  const m = css.match(new RegExp(`${selector.replace(/[[\]'=]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`));
  const out: Record<string, string> = {};
  for (const [, k, v] of (m?.[1] ?? '').matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[k!] = v!.trim();
  return out;
}
const themes = { dark: block(":root,\n[data-theme='dark']"), light: block("[data-theme='light']") };

type RGBA = [number, number, number, number];
function parse(c: string): RGBA {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const [r, g, b, a] = c.replace(/rgba?\(|\)/g, '').split(',').map((x) => Number(x.trim()));
  return [r!, g!, b!, a ?? 1];
}
const over = (fg: RGBA, bg: RGBA): RGBA => [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3])).concat(1) as RGBA;
function lum([r, g, b]: RGBA): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const ratio = (a: RGBA, b: RGBA) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe.each(Object.entries(themes))('%s theme contrast', (_name, t) => {
  const canvas = parse(t['canvas']!);
  const surfaces = {
    canvas,
    panel: parse(t['panel']!),
    raised: parse(t['raised']!),
    sunken: parse(t['sunken']!),
    'header chrome over canvas': over(parse(t['chrome']!), canvas),
  };
  it.each(Object.entries(surfaces))('body text tokens ≥ 4.5:1 on %s', (_s, bg) => {
    for (const tok of ['ink', 'ink-2', 'ink-3']) {
      expect(ratio(parse(t[tok]!), bg), `${tok}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it.each(Object.entries(surfaces))('signal, status and focus colours used as text ≥ 4.5:1 on %s', (_s, bg) => {
    for (const tok of ['signal-text', 'warn', 'bad', 'focus']) expect(ratio(parse(t[tok]!), bg), tok).toBeGreaterThanOrEqual(4.5);
  });
  it('spectral ramp (ADR-019): graphics ≥ 3:1 on panels and canvas, text ≥ 4.5:1 on every surface', () => {
    for (const tok of ['spectrum-fresh', 'spectrum-warm']) for (const bg of [surfaces.panel, surfaces.canvas, surfaces.raised]) expect(ratio(parse(t[tok]!), bg), tok).toBeGreaterThanOrEqual(3);
    for (const tok of ['spectrum-fresh-text', 'spectrum-warm-text']) for (const [s, bg] of Object.entries(surfaces)) expect(ratio(parse(t[tok]!), bg), `${tok} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it('chromatogram tiers and strong hairlines are distinguishable (≥ 3:1 for peaks on panels)', () => {
    for (const tok of ['tier-top', 'tier-heart']) for (const bg of [surfaces.panel, surfaces.canvas]) expect(ratio(parse(t[tok]!), bg), tok).toBeGreaterThanOrEqual(3);
  });
  it('text on the primary action and on a signal fill ≥ 4.5:1', () => {
    expect(ratio(parse(t['action-ink']!), parse(t['action']!))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(parse(t['signal-ink']!), parse(t['signal']!))).toBeGreaterThanOrEqual(4.5);
  });
});
