import { describe, it, expect } from 'vitest';
import { loadFeatures } from '../lib/features';
import type { Category, Feature } from '../lib/features';
import { validateClient } from '../lib/validate';

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

describe('validateClient', () => {
  it('accepts a well-formed client record', () => {
    const ok = {
      id: 'x',
      title: 'X',
      url: 'https://x.example',
      support: { 'tools.call': { status: 'yes', provenance: 'manual' } },
    };
    expect(() => validateClient(ok)).not.toThrow();
  });

  it('rejects a client referencing an unknown feature id', () => {
    const bad = {
      id: 'x',
      title: 'X',
      url: 'https://x.example',
      support: { 'not.a.feature': { status: 'yes' } },
    };
    expect(() => validateClient(bad)).toThrow(/unknown feature/i);
  });

  it('rejects an invalid status value', () => {
    const bad = {
      id: 'x',
      title: 'X',
      url: 'https://x.example',
      support: { 'tools.call': { status: 'maybe' } },
    };
    expect(() => validateClient(bad)).toThrow();
  });

  it('rejects a record missing required fields', () => {
    const bad = { title: 'X' };
    expect(() => validateClient(bad)).toThrow();
  });

  it('rejects an invalid provenance value', () => {
    const bad = {
      id: 'x',
      title: 'X',
      url: 'https://x.example',
      support: { 'tools.call': { status: 'yes', provenance: 'rumor' } },
    };
    expect(() => validateClient(bad)).toThrow();
  });
});
