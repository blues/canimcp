import { describe, it, expect } from 'vitest';
import {
  parseFields,
  parseSubmission,
  buildPatch,
  normalizeStatus,
  parseFeatureIds,
  todayUtc,
} from '../scripts/submission-to-patch';

/**
 * Build an issue-form body the way GitHub renders one: a `### <label>` heading
 * per field followed by the entered value. Empty optional fields render as the
 * literal `_No response_`.
 */
function makeBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([label, value]) => `### ${label}\n\n${value}\n`)
    .join('\n');
}

const WELL_FORMED = makeBody({
  'Client ID': 'acme-client',
  'Client name': 'Acme Client',
  'Client URL': 'https://acme.example/docs/mcp',
  'Feature IDs': 'tools.call, resources.subscribe',
  'Support status': 'partial',
  Notes: 'Reads resources but ignores subscribe notifications.',
  'Source URL': 'https://acme.example/evidence',
  'Version tested': '1.2.3',
});

describe('parseFields', () => {
  it('splits a body into heading/value pairs and drops _No response_', () => {
    const body = makeBody({
      'Client ID': 'acme-client',
      Notes: '_No response_',
    });
    const fields = parseFields(body);
    expect(fields['Client ID']).toBe('acme-client');
    expect(fields['Notes']).toBeUndefined();
  });

  it('handles CRLF line endings', () => {
    const fields = parseFields('### Client ID\r\n\r\nacme-client\r\n');
    expect(fields['Client ID']).toBe('acme-client');
  });
});

describe('parseSubmission (well-formed body)', () => {
  it('produces the expected structured patch object', () => {
    const parsed = parseSubmission(WELL_FORMED);
    expect(parsed).toEqual({
      clientId: 'acme-client',
      title: 'Acme Client',
      url: 'https://acme.example/docs/mcp',
      cells: {
        'tools.call': {
          status: 'partial',
          provenance: 'submission',
          last_verified: todayUtc(),
          notes: 'Reads resources but ignores subscribe notifications.',
          source: 'https://acme.example/evidence',
          version_tested: '1.2.3',
        },
        'resources.subscribe': {
          status: 'partial',
          provenance: 'submission',
          last_verified: todayUtc(),
          notes: 'Reads resources but ignores subscribe notifications.',
          source: 'https://acme.example/evidence',
          version_tested: '1.2.3',
        },
      },
    });
  });

  it('defaults last_verified to today (UTC, YYYY-MM-DD)', () => {
    const parsed = parseSubmission(WELL_FORMED);
    expect(parsed.cells['tools.call'].last_verified).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(parsed.cells['tools.call'].last_verified).toBe(todayUtc());
  });
});

describe('buildPatch', () => {
  it('builds a validated ClientRecord from a well-formed submission', () => {
    const patch = buildPatch(parseSubmission(WELL_FORMED));
    expect(patch.id).toBe('acme-client');
    expect(patch.title).toBe('Acme Client');
    expect(patch.support?.['tools.call'].provenance).toBe('submission');
    expect(patch.support?.['resources.subscribe'].status).toBe('partial');
  });

  it('rejects an unknown feature id with a clear error', () => {
    const body = makeBody({
      'Client ID': 'acme-client',
      'Client name': 'Acme Client',
      'Client URL': 'https://acme.example',
      'Feature IDs': 'not.a.real.feature',
      'Support status': 'yes',
      'Source URL': 'https://acme.example/evidence',
    });
    expect(() => buildPatch(parseSubmission(body))).toThrow(
      /unknown feature id/i,
    );
  });
});

describe('malformed / missing-required submissions', () => {
  it('throws when required identity fields are missing', () => {
    const body = makeBody({
      'Feature IDs': 'tools.call',
      'Support status': 'yes',
      'Source URL': 'https://acme.example/evidence',
    });
    expect(() => parseSubmission(body)).toThrow(/missing required field/i);
  });

  it('throws when no feature ids are supplied', () => {
    const body = makeBody({
      'Client ID': 'acme-client',
      'Client name': 'Acme Client',
      'Client URL': 'https://acme.example',
      'Support status': 'yes',
      'Source URL': 'https://acme.example/evidence',
    });
    expect(() => parseSubmission(body)).toThrow(/feature id/i);
  });

  it('requires a source for any non-unknown status', () => {
    const body = makeBody({
      'Client ID': 'acme-client',
      'Client name': 'Acme Client',
      'Client URL': 'https://acme.example',
      'Feature IDs': 'tools.call',
      'Support status': 'yes',
    });
    expect(() => parseSubmission(body)).toThrow(/source/i);
  });
});

describe('status normalization', () => {
  it('trims and lowercases valid statuses', () => {
    expect(normalizeStatus('  YES ')).toBe('yes');
    expect(normalizeStatus('Partial')).toBe('partial');
    expect(normalizeStatus('NO')).toBe('no');
    expect(normalizeStatus('Unknown')).toBe('unknown');
  });

  it('throws on an invalid status value', () => {
    expect(() => normalizeStatus('maybe')).toThrow(/invalid status/i);
  });

  it('throws on a missing status value', () => {
    expect(() => normalizeStatus(undefined)).toThrow(/missing required/i);
  });

  it('normalizes status through the full parse pipeline', () => {
    const body = makeBody({
      'Client ID': 'acme-client',
      'Client name': 'Acme Client',
      'Client URL': 'https://acme.example',
      'Feature IDs': 'tools.call',
      'Support status': '  YES  ',
      'Source URL': 'https://acme.example/evidence',
    });
    const parsed = parseSubmission(body);
    expect(parsed.cells['tools.call'].status).toBe('yes');
  });
});

describe('parseFeatureIds', () => {
  it('splits on commas and newlines, strips bullets/backticks, dedupes', () => {
    expect(parseFeatureIds('- `tools.call`\n- tools.list, tools.call')).toEqual(
      ['tools.call', 'tools.list'],
    );
  });

  it('throws on empty input', () => {
    expect(() => parseFeatureIds(undefined)).toThrow(/feature id/i);
  });
});
