// @vitest-environment node
// WCAG 2.2 contrast audit of the design tokens, including glass COMPOSITED over the
// canvas (DESIGN §2.1: never assume a pairing passes because its opaque equivalent does).
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
  const canvas = parse(t['bg-canvas']!);
  const surfaces = {
    canvas,
    elevated: parse(t['bg-elevated']!),
    solid: parse(t['bg-solid']!),
    sunken: parse(t['bg-sunken']!),
    'glass over canvas': over(parse(t['glass-fill']!), canvas),
    'strong glass over canvas': over(parse(t['glass-fill-strong']!), canvas),
  };
  it.each(Object.entries(surfaces))('body text tokens ≥ 4.5:1 on %s', (_s, bg) => {
    for (const tok of ['text-primary', 'text-secondary', 'text-muted']) {
      expect(ratio(parse(t[tok]!), bg), `${tok}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('accent, status and focus colours ≥ 3:1 on canvas and solid surfaces (non-text / large)', () => {
    for (const tok of ['accent-gold', 'accent-blue', 'focus-ring', 'status-success', 'status-warning', 'status-error']) {
      for (const bg of [surfaces.canvas, surfaces.solid, surfaces['glass over canvas']]) expect(ratio(parse(t[tok]!), bg), tok).toBeGreaterThanOrEqual(3);
    }
  });
  it('status colours used as text ≥ 4.5:1 on solid surfaces', () => {
    for (const tok of ['status-success', 'status-warning', 'status-error', 'accent-blue']) {
      expect(ratio(parse(t[tok]!), surfaces.solid), tok).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('text on gold buttons ≥ 4.5:1', () => {
    expect(ratio(parse(t['accent-gold-ink']!), parse(t['accent-gold']!))).toBeGreaterThanOrEqual(4.5);
  });
});
