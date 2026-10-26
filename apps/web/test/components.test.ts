import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NotePyramid from '../app/components/fragrance/NotePyramid.vue';
import ScentTraitBars from '../app/components/fragrance/ScentTraitBars.vue';
import Chromatogram from '../app/components/fragrance/Chromatogram.vue';
import FragranceImage from '../app/components/fragrance/FragranceImage.vue';
import { NAVIGATION, PRIMARY_NAV, SECONDARY_NAV, isActive } from '../shared/navigation';

const stubs = { AppIcon: true };

describe('NotePyramid', () => {
  it('lists sourced notes per tier and says "Not listed" for unknown tiers', () => {
    const w = mount(NotePyramid, { props: { pyramid: { top: ['Plum', 'Saffron'], heart: null, base: [] } }, global: { stubs } });
    expect(w.get('[aria-label="Top notes"]').text()).toContain('Plum');
    expect(w.find('[data-testid="tier-heart-unknown"]').text()).toBe('Not listed');
    expect(w.find('[data-testid="tier-base-unknown"]').exists()).toBe(true);
    expect(w.text()).toContain('Partial source data');
  });
  it('compact mode shows one representative note per tier, never invented ones', () => {
    const w = mount(NotePyramid, { props: { compact: true, pyramid: { top: ['Plum', 'Saffron'], heart: ['Lavender'], base: ['Oud', 'Benzoin'] } }, global: { stubs } });
    expect(w.findAll('li').map((l) => l.text())).toEqual(['Plum', 'Lavender', 'Oud']);
  });
  it('without any pyramid says so instead of rendering placeholders', () => {
    const w = mount(NotePyramid, { props: { pyramid: null }, global: { stubs } });
    expect(w.text()).toContain('No pyramid has been sourced');
    expect(w.findAll('li')).toHaveLength(0);
  });
});

describe('ScentTraitBars', () => {
  it('renders unknown as "—" with no bar, and 0 as a real value', () => {
    const w = mount(ScentTraitBars, {
      props: { series: ['A', 'B'], method: 'normalized-v1', rows: [{ code: 'sweet', label: 'Sweet', values: [null, 0] }, { code: 'fresh', label: 'Fresh', values: [3.5, 5] }] },
    });
    expect(w.get('[data-testid="trait-sweet-0"]').text()).toBe('—');
    expect(w.get('[data-testid="trait-sweet-1"]').text()).toBe('0.0');
    const sweetBars = w.findAll('tbody tr')[0]!.findAll('td [data-bar]');
    expect(sweetBars).toHaveLength(1); // only B (0) has a bar element; unknown A has none
    expect(w.get('caption').text()).toContain('method normalized-v1');
    expect(w.findAll('th[scope="row"]').map((t) => t.text())).toEqual(['Sweet', 'Fresh']);
  });
});

describe('navigation is defined once', () => {
  it('has the four primary journeys in DESIGN order plus secondary items', () => {
    expect(PRIMARY_NAV.map((n) => n.label)).toEqual(['Collection', 'Discover', 'Compare', 'My DNA']);
    expect(SECONDARY_NAV.map((n) => n.label)).toEqual(['Samples', 'My Spectrum', 'Academy', 'Settings']);
    expect(new Set(NAVIGATION.map((n) => n.to)).size).toBe(NAVIGATION.length);
  });
  it('marks Samples (not Collection) active for the sampled filter', () => {
    const collection = NAVIGATION.find((n) => n.label === 'Collection')!;
    const samples = NAVIGATION.find((n) => n.label === 'Samples')!;
    expect(isActive(collection, '/collection', {})).toBe(true);
    expect(isActive(collection, '/collection', { state: 'sampled' })).toBe(false);
    expect(isActive(samples, '/collection', { state: 'sampled' })).toBe(true);
    expect(isActive(collection, '/discover', {})).toBe(false);
  });
});

describe('Chromatogram', () => {
  const pyramid = { top: ['Plum', 'Saffron', 'Bergamot'], heart: null, base: ['Oud'] };
  it('summarises listed notes per tier for assistive tech and keeps unknown tiers unknown', () => {
    const w = mount(Chromatogram, { props: { pyramid }, global: { stubs } });
    expect(w.get('svg[role="img"]').attributes('aria-label')).toBe('Note profile: Top 3 notes, Heart not listed, Base 1 note');
    expect(w.get('[aria-label="Top notes"]').text()).toContain('Saffron');
    expect(w.find('[data-testid="tier-heart-unknown"]').text()).toBe('Not listed');
  });
  it('micro mode draws the trace without note labels', () => {
    const w = mount(Chromatogram, { props: { pyramid, micro: true, label: 'Phantom' }, global: { stubs } });
    expect(w.find('figcaption').exists()).toBe(false);
    expect(w.findAll('path').length).toBeGreaterThan(0);
    expect(w.get('svg').attributes('aria-label')).toContain('Phantom:');
  });
  it('draws no trace when no pyramid is known (never a fabricated curve)', () => {
    const w = mount(Chromatogram, { props: { pyramid: null }, global: { stubs } });
    expect(w.get('svg').attributes('aria-label')).toBe('Note profile: no notes listed');
    expect(w.findAll('path')).toHaveLength(0);
  });
});

describe('FragranceImage', () => {
  it('says "No verified image yet" instead of rendering a broken image when there is no image', () => {
    const w = mount(FragranceImage, { props: { imageId: null, alt: 'Rabanne Phantom in Red', size: 'hero' } });
    expect(w.find('img').exists()).toBe(false);
    expect(w.text()).toContain('No verified image yet');
  });
  it('lazy-loads the owner-scoped display derivative and falls back to the placeholder on error', async () => {
    const w = mount(FragranceImage, { props: { imageId: '11111111-1111-4111-8111-111111111111', alt: 'Layton', size: 'thumb' } });
    const img = w.get('img');
    expect(img.attributes('src')).toBe('/api/v1/images/11111111-1111-4111-8111-111111111111/display');
    expect(img.attributes('loading')).toBe('lazy');
    expect(img.attributes('alt')).toBe('Layton');
    await img.trigger('error');
    expect(w.find('img').exists()).toBe(false);
    expect(w.text()).toContain('No verified image yet');
  });
});
