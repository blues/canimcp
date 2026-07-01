/**
 * Community submission parser: turn a GitHub issue-form body into a validated
 * client-YAML patch.
 *
 * GitHub renders an issue *form* submission as markdown, one `### <label>`
 * heading per field followed by the entered value (or the literal
 * `_No response_` for an empty optional field). This module parses that body
 * into a structured submission and compiles it into a `ClientRecord` patch
 * with `provenance: submission`, validating feature ids + status against the
 * taxonomy/schema before anything touches disk.
 *
 * The pure functions (`parseFields`, `parseSubmission`, `buildPatch`) contain
 * no disk/network I/O so they are unit-testable with in-memory string
 * fixtures. `main()` wires them to the filesystem for the GitHub Action.
 *
 * Field labels here MUST stay in sync with the headings produced by
 * `.github/ISSUE_TEMPLATE/client-support-report.yml`.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import {
  allFeatureIds,
  loadFeatures,
  type FeatureTaxonomy,
} from '../lib/features';
import {
  validateClient,
  type ClientRecord,
  type SupportCell,
} from '../lib/validate';

/** Headings emitted by the issue form (the field `label`s). */
const FIELD = {
  clientId: 'Client ID',
  title: 'Client name',
  url: 'Client URL',
  featureIds: 'Feature IDs',
  status: 'Support status',
  notes: 'Notes',
  source: 'Source URL',
  versionTested: 'Version tested',
} as const;

const VALID_STATUSES = ['yes', 'partial', 'no', 'unknown'] as const;
type Status = (typeof VALID_STATUSES)[number];

export interface ParsedSubmission {
  clientId: string;
  title: string;
  url: string;
  cells: Record<string, SupportCell>;
}

/** Today's date (UTC) as `YYYY-MM-DD`, used as the default `last_verified`. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Split an issue-form markdown body into a `{ heading: value }` map.
 * GitHub emits `### <label>\n\n<value>` blocks; an untouched optional field
 * renders as the literal `_No response_`, which we normalise to `undefined`.
 */
export function parseFields(body: string): Record<string, string | undefined> {
  if (typeof body !== 'string') {
    throw new Error('Submission body must be a string.');
  }
  const out: Record<string, string | undefined> = {};
  // Normalise CRLF so heading detection is line-oriented.
  const lines = body.replace(/\r\n/g, '\n').split('\n');

  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentHeading === null) return;
    const raw = buffer.join('\n').trim();
    out[currentHeading] =
      raw === '' || raw === '_No response_' ? undefined : raw;
  };

  for (const line of lines) {
    const m = /^###\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      currentHeading = m[1].trim();
      buffer = [];
    } else if (currentHeading !== null) {
      buffer.push(line);
    }
  }
  flush();
  return out;
}

/** Normalise a raw status value: trim + lowercase. Throws if not a valid state. */
export function normalizeStatus(raw: string | undefined): Status {
  if (!raw) {
    throw new Error(
      `Missing required field "${FIELD.status}". ` +
        `Expected one of: ${VALID_STATUSES.join(', ')}.`,
    );
  }
  const normalized = raw.trim().toLowerCase();
  if (!(VALID_STATUSES as readonly string[]).includes(normalized)) {
    throw new Error(
      `Invalid status "${raw}". Expected one of: ${VALID_STATUSES.join(', ')}.`,
    );
  }
  return normalized as Status;
}

/** Split the free-text feature-id field into a clean, de-duplicated list. */
export function parseFeatureIds(raw: string | undefined): string[] {
  if (!raw) {
    throw new Error(
      `Missing required field "${FIELD.featureIds}". ` +
        `List one or more feature ids (comma- or newline-separated).`,
    );
  }
  const ids = raw
    .split(/[\n,]+/)
    // strip markdown list bullets / backticks / stray whitespace
    .map((s) => s.replace(/^[-*]\s*/, '').replace(/`/g, '').trim())
    .filter((s) => s.length > 0);
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    throw new Error(
      `No feature ids found in "${FIELD.featureIds}". ` +
        `List one or more feature ids (comma- or newline-separated).`,
    );
  }
  return unique;
}

/**
 * Parse an issue-form body into a structured submission with one fully-formed
 * support cell per feature id. Pure: no disk/network access. Throws a clear
 * error on any missing required field or invalid status.
 */
export function parseSubmission(body: string): ParsedSubmission {
  const fields = parseFields(body);

  const clientId = fields[FIELD.clientId]?.trim();
  const title = fields[FIELD.title]?.trim();
  const url = fields[FIELD.url]?.trim();

  const missing: string[] = [];
  if (!clientId) missing.push(FIELD.clientId);
  if (!title) missing.push(FIELD.title);
  if (!url) missing.push(FIELD.url);
  if (missing.length > 0) {
    throw new Error(`Missing required field(s): ${missing.join(', ')}.`);
  }

  const status = normalizeStatus(fields[FIELD.status]);
  const featureIds = parseFeatureIds(fields[FIELD.featureIds]);

  const notes = fields[FIELD.notes]?.trim() || undefined;
  const source = fields[FIELD.source]?.trim() || undefined;
  const versionTested = fields[FIELD.versionTested]?.trim() || undefined;

  // Sourcing requirement: every non-`unknown` cell must carry a real source.
  if (status !== 'unknown' && !source) {
    throw new Error(
      `A "${FIELD.source}" is required for a "${status}" report. ` +
        `Every non-unknown support cell must cite evidence ` +
        `(docs, changelog, or a screen-recording link).`,
    );
  }

  const baseCell: SupportCell = {
    status,
    provenance: 'submission',
    last_verified: todayUtc(),
  };
  if (notes) baseCell.notes = notes;
  if (source) baseCell.source = source;
  if (versionTested) baseCell.version_tested = versionTested;

  const cells: Record<string, SupportCell> = {};
  for (const fid of featureIds) {
    cells[fid] = { ...baseCell };
  }

  return { clientId: clientId!, title: title!, url: url!, cells };
}

/**
 * Compile a parsed submission into a validated `ClientRecord` patch. Rejects
 * unknown feature ids (against the taxonomy) and invalid records (against the
 * JSON Schema) via `validateClient`. Pure: no disk/network access.
 */
export function buildPatch(
  submission: ParsedSubmission,
  taxonomy: FeatureTaxonomy = loadFeatures(),
): ClientRecord {
  const known = new Set(allFeatureIds(taxonomy));
  for (const fid of Object.keys(submission.cells)) {
    if (!known.has(fid)) {
      throw new Error(
        `Unknown feature id: "${fid}". ` +
          `It is not declared in data/features.yaml. Valid ids include: ` +
          `${allFeatureIds(taxonomy).slice(0, 8).join(', ')}, …`,
      );
    }
  }

  const record: ClientRecord = {
    id: submission.clientId,
    title: submission.title,
    url: submission.url,
    support: submission.cells,
  };

  // Structural + taxonomy validation (throws on any violation).
  return validateClient(record, taxonomy);
}

/**
 * Merge a submission patch into an existing client record (if any). Existing
 * fields win for identity (id/title/url are only filled when absent); support
 * cells from the submission overwrite matching feature ids.
 */
export function mergePatch(
  existing: ClientRecord | null,
  patch: ClientRecord,
): ClientRecord {
  if (!existing) return patch;
  return {
    ...existing,
    title: existing.title || patch.title,
    url: existing.url || patch.url,
    support: { ...(existing.support ?? {}), ...(patch.support ?? {}) },
  };
}

/* ------------------------------------------------------------------ *
 * main(): filesystem/GitHub-Action wiring (not exercised by unit tests)
 * ------------------------------------------------------------------ */

function readIssueBody(): string {
  if (process.env.ISSUE_BODY != null) return process.env.ISSUE_BODY;
  const arg = process.argv[2];
  if (arg) {
    // Treat argv as a file path if it exists, else as the raw body.
    if (fs.existsSync(arg)) return fs.readFileSync(arg, 'utf8');
    return arg;
  }
  throw new Error(
    'No issue body provided. Set ISSUE_BODY, or pass a file path / raw body as argv[2].',
  );
}

function main() {
  const taxonomy = loadFeatures();
  const submission = parseSubmission(readIssueBody());
  const patch = buildPatch(submission, taxonomy);

  const clientsDir = path.join(process.cwd(), 'data/clients');
  fs.mkdirSync(clientsDir, { recursive: true });
  const outFile = path.join(clientsDir, `${patch.id}.yaml`);

  const existing: ClientRecord | null = fs.existsSync(outFile)
    ? (YAML.parse(fs.readFileSync(outFile, 'utf8')) as ClientRecord)
    : null;

  const merged = mergePatch(existing, patch);
  // Re-validate the merged result before writing.
  validateClient(merged, taxonomy);

  fs.writeFileSync(outFile, YAML.stringify(merged), 'utf8');
  console.log(
    `Wrote submission patch for "${merged.id}" ` +
      `(${Object.keys(patch.support ?? {}).length} cell(s)) -> ${outFile}`,
  );
}

// Only run main() when executed directly, not when imported by tests.
const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  /submission-to-patch\.(ts|js|mjs)$/.test(process.argv[1]);
if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    console.error(`Submission failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
