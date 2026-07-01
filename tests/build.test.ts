import { describe, it, expect } from 'vitest';
import { loadFeatures, allFeatureIds } from '../lib/features';
import { buildMatrix } from '../lib/build';
import type { ClientRecord } from '../lib/validate';

const taxonomy = loadFeatures();

describe('buildMatrix', () => {
  it('fills every (client × feature) cell, defaulting to unknown', () => {
    const clients: ClientRecord[] = [
      { id: 'a', title: 'A', url: 'https://a.example', support: { 'tools.call': { status: 'yes' } } },
    ];
    const bundle = buildMatrix(clients, taxonomy);
    const ids = allFeatureIds(taxonomy);
    const row = bundle.matrix['a'];
    expect(Object.keys(row).sort()).toEqual([...ids].sort());
    expect(row['tools.call'].status).toBe('yes');
    expect(row['auth.oauth'].status).toBe('unknown');
  });

  it('orders clients by usage_rank then title', () => {
    const clients: ClientRecord[] = [
      { id: 'z', title: 'Zeta', url: 'https://z.example', usage_rank: null },
      { id: 'b', title: 'Beta', url: 'https://b.example', usage_rank: 2 },
      { id: 'a', title: 'Alpha', url: 'https://a.example', usage_rank: 1 },
    ];
    const bundle = buildMatrix(clients, taxonomy);
    expect(bundle.clients.map((c) => c.id)).toEqual(['a', 'b', 'z']);
  });

  it('does not leak the support map into the clients list', () => {
    const clients: ClientRecord[] = [
      { id: 'a', title: 'A', url: 'https://a.example', support: { 'tools.call': { status: 'yes' } } },
    ];
    const bundle = buildMatrix(clients, taxonomy);
    expect((bundle.clients[0] as Record<string, unknown>).support).toBeUndefined();
  });

  it('carries the spec version through', () => {
    const bundle = buildMatrix([], taxonomy);
    expect(bundle.spec_version).toBe('2025-11-25');
  });
});
