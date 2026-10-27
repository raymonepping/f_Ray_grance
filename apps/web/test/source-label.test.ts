// ADR-021: provider claims are labelled by their actual source, never all as "Scento".
import { describe, expect, it } from 'vitest';
import { sourceLabel } from '../shared/types';

describe('sourceLabel', () => {
  it('names provider claims by source and keeps the other origins', () => {
    expect(sourceLabel({ origin: 'provider', source: { provider: 'scento' } })).toBe('Scento');
    expect(sourceLabel({ origin: 'provider', source: { provider: 'noteboxd' } })).toBe('NoteboxD');
    expect(sourceLabel({ origin: 'provider', source: { provider: 'scentrev' } })).toBe('ScentRev');
    expect(sourceLabel({ origin: 'provider', source: null })).toBe('Scento');
    expect(sourceLabel({ origin: 'research', source: { provider: 'tinyfish' } })).toBe('Web research');
    expect(sourceLabel({ origin: 'user', source: null })).toBe('Personal');
  });
});
