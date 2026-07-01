import { describe, it, expect } from 'vitest';
import {
  applyConformanceReport,
  buildCell,
  outcomeToStatus,
  slugify,
  validateReport,
  type ConformanceReport,
} from '../scripts/ingest-conformance';
import type { ClientRecord } from '../lib/validate';

// In-memory client fixtures — deliberately NOT the real data/clients content,
// so these tests stay hermetic and independent of the seed data.
function makeClients(): ClientRecord[] {
  return [
    {
      id: 'cursor-vscode',
      title: 'Cursor',
      url: 'https://cursor.com',
      clientInfo_name: 'cursor-vscode',
      support: {
        // apify => overwritable
        'tools.call': {
          status: 'unknown',
          provenance: 'apify',
          source: 'https://github.com/apify/mcp-client-capabilities',
        },
        // absent provenance => overwritable
        'tools.list': { status: 'unknown' },
        // manual => protected (conflict should be flagged, not overwritten)
        'tools.listChanged': { status: 'yes', provenance: 'manual' },
        // submission => protected
        'sampling.createMessage': {
          status: 'yes',
          provenance: 'submission',
          source: 'https://example.com/evidence',
        },
        // resources.subscribe intentionally absent — skip must leave it absent
      },
    },
    {
      id: 'goose',
      title: 'Goose',
      url: 'https://goose.example',
      clientInfo_name: 'goose',
      support: {},
    },
  ];
}

const report: ConformanceReport = {
  run_url: 'https://github.com/blues/canimcp/actions/runs/1234567890',
  run_date: '2026-06-28',
  spec_version: '2025-06-18',
  results: [
    {
      clientInfo_name: 'cursor-vscode',
      version: '0.47',
      features: [
        { feature_id: 'tools.call', outcome: 'pass' },
        { feature_id: 'tools.list', outcome: 'pass' },
        { feature_id: 'tools.listChanged', outcome: 'fail' }, // conflicts with manual
        { feature_id: 'resources.subscribe', outcome: 'skip' },
        {
          feature_id: 'sampling.createMessage',
          outcome: 'fail',
          notes: 'not implemented',
        }, // conflicts with submission
        { feature_id: 'elicitation.create', outcome: 'pass' }, // brand-new cell
      ],
    },
    {
      clientInfo_name: 'goose',
      version: '1.2.0',
      features: [
        { feature_id: 'tools.call', outcome: 'pass' },
        { feature_id: 'auth.oauth', outcome: 'skip' },
      ],
    },
  ],
};

describe('outcome mapping helpers', () => {
  it('maps pass=>yes, fail=>no, skip=>null', () => {
    expect(outcomeToStatus('pass')).toBe('yes');
    expect(outcomeToStatus('fail')).toBe('no');
    expect(outcomeToStatus('skip')).toBeNull();
  });

  it('builds a conformance cell with provenance, dates, version, source', () => {
    const cell = buildCell(
      { feature_id: 'tools.call', outcome: 'pass' },
      report,
      '0.47',
    );
    expect(cell).toEqual({
      status: 'yes',
      provenance: 'conformance',
      last_verified: '2026-06-28',
      version_tested: '0.47',
      source: 'https://github.com/blues/canimcp/actions/runs/1234567890',
    });
  });

  it('returns null for a skip outcome (cell untouched)', () => {
    expect(
      buildCell({ feature_id: 'resources.subscribe', outcome: 'skip' }, report, '0.47'),
    ).toBeNull();
  });

  it('slugifies clientInfo names', () => {
    expect(slugify('Claude Code')).toBe('claude-code');
    expect(slugify('cursor-vscode')).toBe('cursor-vscode');
  });
});

describe('applyConformanceReport — status mapping (a)', () => {
  it('produces the expected cells for pass outcomes', () => {
    const { patches } = applyConformanceReport(report, makeClients());
    const cursor = patches['cursor-vscode'];
    expect(cursor).toBeDefined();

    expect(cursor.support!['tools.call']).toEqual({
      status: 'yes',
      provenance: 'conformance',
      last_verified: '2026-06-28',
      version_tested: '0.47',
      source: 'https://github.com/blues/canimcp/actions/runs/1234567890',
    });
    expect(cursor.support!['tools.list'].status).toBe('yes');
    expect(cursor.support!['tools.list'].provenance).toBe('conformance');

    // Brand-new cell for a feature that had no prior entry.
    expect(cursor.support!['elicitation.create'].status).toBe('yes');
    expect(cursor.support!['elicitation.create'].provenance).toBe('conformance');

    // Fresh client that had no cells.
    const goose = patches['goose'];
    expect(goose.support!['tools.call'].status).toBe('yes');
    expect(goose.support!['tools.call'].version_tested).toBe('1.2.0');
  });

  it('carries notes onto the cell when present', () => {
    // sampling.createMessage on cursor is submission-owned, so it is NOT applied;
    // test notes propagation via buildCell directly instead.
    const cell = buildCell(
      { feature_id: 'x.y', outcome: 'fail', notes: 'boom' },
      report,
      '9',
    );
    expect(cell?.notes).toBe('boom');
  });
});

describe('applyConformanceReport — skip leaves cells untouched (b)', () => {
  it('does not create or modify a cell for a skip outcome', () => {
    const { patches } = applyConformanceReport(report, makeClients());
    const cursor = patches['cursor-vscode'];
    // resources.subscribe had no cell and outcome was skip => still absent.
    expect(cursor.support!['resources.subscribe']).toBeUndefined();
  });

  it('leaves goose auth.oauth unset when skipped', () => {
    const { patches } = applyConformanceReport(report, makeClients());
    const goose = patches['goose'];
    expect(goose.support!['auth.oauth']).toBeUndefined();
  });
});

describe('applyConformanceReport — merge policy (c)', () => {
  it('OVERWRITES apify and absent-provenance cells', () => {
    const before = makeClients();
    const { patches } = applyConformanceReport(report, before);
    const cursor = patches['cursor-vscode'];

    // was apify/unknown => now conformance/yes
    expect(cursor.support!['tools.call'].provenance).toBe('conformance');
    expect(cursor.support!['tools.call'].status).toBe('yes');

    // was bare {status:unknown} => now conformance/yes
    expect(cursor.support!['tools.list'].provenance).toBe('conformance');
    expect(cursor.support!['tools.list'].status).toBe('yes');
  });

  it('FLAGS conflicts with manual cells rather than overwriting', () => {
    const before = makeClients();
    const { patches, reviewFlags } = applyConformanceReport(report, before);
    const cursor = patches['cursor-vscode'];

    // manual cell must be untouched (still yes/manual, not the conformance 'no').
    expect(cursor.support!['tools.listChanged']).toEqual({
      status: 'yes',
      provenance: 'manual',
    });

    const flag = reviewFlags.find(
      (f) => f.clientId === 'cursor-vscode' && f.feature_id === 'tools.listChanged',
    );
    expect(flag).toBeDefined();
    expect(flag!.existingProvenance).toBe('manual');
    expect(flag!.from.status).toBe('yes');
    expect(flag!.to.status).toBe('no');
  });

  it('FLAGS conflicts with submission cells rather than overwriting', () => {
    const { patches, reviewFlags } = applyConformanceReport(report, makeClients());
    const cursor = patches['cursor-vscode'];

    // submission cell untouched.
    expect(cursor.support!['sampling.createMessage'].status).toBe('yes');
    expect(cursor.support!['sampling.createMessage'].provenance).toBe('submission');

    const flag = reviewFlags.find(
      (f) => f.clientId === 'cursor-vscode' && f.feature_id === 'sampling.createMessage',
    );
    expect(flag).toBeDefined();
    expect(flag!.existingProvenance).toBe('submission');
    expect(flag!.to.status).toBe('no');
  });

  it('does not mutate the input records', () => {
    const before = makeClients();
    applyConformanceReport(report, before);
    // original cursor tools.call must still be the apify cell.
    const cursor = before.find((c) => c.id === 'cursor-vscode')!;
    expect(cursor.support!['tools.call'].provenance).toBe('apify');
    expect(cursor.support!['tools.listChanged']).toEqual({
      status: 'yes',
      provenance: 'manual',
    });
  });

  it('does NOT flag when a manual/submission cell already agrees with conformance', () => {
    const clients: ClientRecord[] = [
      {
        id: 'agree',
        title: 'Agree',
        url: 'https://agree.example',
        clientInfo_name: 'agree',
        support: { 'tools.call': { status: 'yes', provenance: 'manual' } },
      },
    ];
    const agreeReport: ConformanceReport = {
      run_date: '2026-06-28',
      spec_version: '2025-06-18',
      results: [
        {
          clientInfo_name: 'agree',
          features: [{ feature_id: 'tools.call', outcome: 'pass' }],
        },
      ],
    };
    const { reviewFlags, patches } = applyConformanceReport(agreeReport, clients);
    expect(reviewFlags).toHaveLength(0);
    // No changes to apply => no patch for this client.
    expect(patches['agree']).toBeUndefined();
  });
});

describe('applyConformanceReport — matching & validation', () => {
  it('records unmatched clientInfo_names', () => {
    const r: ConformanceReport = {
      run_date: '2026-06-28',
      spec_version: '2025-06-18',
      results: [
        { clientInfo_name: 'nonexistent-client', features: [{ feature_id: 'tools.call', outcome: 'pass' }] },
      ],
    };
    const { unmatched, patches } = applyConformanceReport(r, makeClients());
    expect(unmatched).toContain('nonexistent-client');
    expect(Object.keys(patches)).toHaveLength(0);
  });

  it('matches by slugified name as a fallback', () => {
    const clients: ClientRecord[] = [
      { id: 'claude-code', title: 'Claude Code', url: 'https://claude.example', clientInfo_name: 'claude-code' },
    ];
    const r: ConformanceReport = {
      run_date: '2026-06-28',
      spec_version: '2025-06-18',
      results: [
        { clientInfo_name: 'Claude Code', features: [{ feature_id: 'tools.call', outcome: 'pass' }] },
      ],
    };
    const { patches, unmatched } = applyConformanceReport(r, clients);
    expect(unmatched).toHaveLength(0);
    expect(patches['claude-code'].support!['tools.call'].status).toBe('yes');
  });

  it('throws on an unknown feature id in the report', () => {
    const r: ConformanceReport = {
      run_date: '2026-06-28',
      spec_version: '2025-06-18',
      results: [
        { clientInfo_name: 'goose', features: [{ feature_id: 'not.a.feature', outcome: 'pass' }] },
      ],
    };
    expect(() => applyConformanceReport(r, makeClients())).toThrow(/unknown feature/i);
  });
});

describe('validateReport (schema)', () => {
  it('accepts the sample fixture shape', () => {
    expect(() => validateReport(report)).not.toThrow();
  });

  it('rejects a report missing run_date', () => {
    const bad = { spec_version: '2025-06-18', results: [] };
    expect(() => validateReport(bad)).toThrow();
  });

  it('rejects an invalid outcome value', () => {
    const bad = {
      run_date: '2026-06-28',
      spec_version: '2025-06-18',
      results: [
        { clientInfo_name: 'x', features: [{ feature_id: 'tools.call', outcome: 'maybe' }] },
      ],
    };
    expect(() => validateReport(bad)).toThrow();
  });
});
