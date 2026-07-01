import { describe, it, expect } from 'vitest';
import { loadFeatures } from '../lib/features';
import type { Category, Feature } from '../lib/features';

describe('features', () => {
  it('loads taxonomy with unique feature ids', () => {
    const f = loadFeatures();
    const ids = f.categories.flatMap((c: Category) => c.features.map((x: Feature) => x.id));
    expect(ids.length).toBeGreaterThan(15);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares the target spec version', () => {
    const f = loadFeatures();
    expect(f.spec_version).toBe('2025-06-18');
  });
});
