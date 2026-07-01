/**
 * Conformance-report ingester (SEP-1627, interim adapter).
 *
 * Reads a conformance report JSON (see schema/conformance-report.schema.json and
 * docs/conformance-format.md), maps each per-feature outcome to a canimcp support
 * cell, and applies it to the matching data/clients/<id>.yaml record under a
 * merge policy that never silently clobbers human-curated data.
 *
 * The core logic is the PURE function `applyConformanceReport`, which takes a
 * parsed report + the in-memory client records and returns the patched records
 * plus any review flags — no disk IO, fully unit-testable. `main()` does the file
 * IO: load report + clients, validate the report shape, apply, validate each
 * resulting record with validateClient, and write the YAML back.
 *
 * Usage:
 *   npx tsx scripts/ingest-conformance.ts [report.json]
 * Defaults to tests/fixtures/sample-conformance-report.json when no path is given.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { loadFeatures, allFeatureIds, type FeatureTaxonomy } from '../lib/features';
import { validateClient, type ClientRecord, type SupportCell } from '../lib/validate';

// ---------------------------------------------------------------------------
// Report types (mirror schema/conformance-report.schema.json)
// ---------------------------------------------------------------------------

export type ConformanceOutcome = 'pass' | 'fail' | 'skip';

export interface ConformanceFeatureResult {
  feature_id: string;
  outcome: ConformanceOutcome;
  notes?: string;
}

export interface ConformanceResult {
  clientInfo_name: string;
  version?: string;
  features: ConformanceFeatureResult[];
}

export interface ConformanceReport {
  run_url?: string;
  run_date: string;
  spec_version: string;
  results: ConformanceResult[];
}

// ---------------------------------------------------------------------------
// Apply-result types
// ---------------------------------------------------------------------------

/** A cell that conformance wants to change but which is human-owned (manual/submission). */
export interface ReviewFlag {
  clientId: string;
  clientInfo_name: string;
  feature_id: string;
  existingProvenance: 'manual' | 'submission';
  from: SupportCell;
  to: SupportCell;
}

export interface ApplyResult {
  /** Patched client records (only clients that changed appear here), keyed by id. */
  patches: Record<string, ClientRecord>;
  /** Conflicts against manual/submission cells — recorded, NOT applied. */
  reviewFlags: ReviewFlag[];
  /** Report entries whose clientInfo_name matched no client record. */
  unmatched: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Slugify a clientInfo name the same way client ids tend to be formed. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** pass => yes, fail => no, skip => null (leave cell untouched). */
export function outcomeToStatus(outcome: ConformanceOutcome): SupportCell['status'] | null {
  switch (outcome) {
    case 'pass':
      return 'yes';
    case 'fail':
      return 'no';
    case 'skip':
      return null;
  }
}

/**
 * Merge-policy note: the schema has no `provenance: 'unknown'` enum value, so
 * "unknown" in the merge policy means an ABSENT provenance (a bare/unset cell).
 * Absent, `apify`, and prior `conformance` cells are freely overwritable; only
 * `manual`/`submission` (human-owned) cells are protected. This is enforced
 * inline in `applyConformanceReport`.
 */

/**
 * Build the conformance cell for a single feature result.
 * `skip` returns null (the caller leaves the existing cell alone).
 */
export function buildCell(
  fr: ConformanceFeatureResult,
  report: ConformanceReport,
  version?: string,
): SupportCell | null {
  const status = outcomeToStatus(fr.outcome);
  if (status === null) return null;
  const cell: SupportCell = {
    status,
    provenance: 'conformance',
    last_verified: report.run_date,
  };
  if (version) cell.version_tested = version;
  if (report.run_url) cell.source = report.run_url;
  if (fr.notes) cell.notes = fr.notes;
  return cell;
}

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

/**
 * Apply a conformance report to a set of existing client records IN MEMORY.
 *
 * Merge policy:
 *   - skip                          => leave the existing cell untouched (unknown stays unknown).
 *   - target cell absent / apify /
 *     prior conformance write       => OVERWRITE with the conformance cell.
 *   - target cell manual / submission
 *     AND the value would change     => DO NOT overwrite; record a ReviewFlag.
 *     (If a manual/submission cell already agrees with conformance, we leave it
 *      as-is and do not flag — nothing to review.)
 *
 * Matching: report.clientInfo_name is matched against each client's clientInfo_name,
 * then against its id, then against slugify(clientInfo_name) as a fallback.
 *
 * Returns deep-copied patched records so callers/tests never mutate their inputs.
 */
export function applyConformanceReport(
  report: ConformanceReport,
  existingClients: ClientRecord[],
  taxonomy: FeatureTaxonomy = loadFeatures(),
): ApplyResult {
  const knownFeatures = new Set(allFeatureIds(taxonomy));
  const patches: Record<string, ClientRecord> = {};
  const reviewFlags: ReviewFlag[] = [];
  const unmatched: string[] = [];

  // Index clients for matching.
  const byClientInfoName = new Map<string, ClientRecord>();
  const byId = new Map<string, ClientRecord>();
  const bySlug = new Map<string, ClientRecord>();
  for (const c of existingClients) {
    if (c.clientInfo_name) byClientInfoName.set(c.clientInfo_name, c);
    byId.set(c.id, c);
    bySlug.set(slugify(c.clientInfo_name ?? c.id), c);
  }

  const findClient = (name: string): ClientRecord | undefined =>
    byClientInfoName.get(name) ?? byId.get(name) ?? bySlug.get(slugify(name));

  for (const result of report.results) {
    const client = findClient(result.clientInfo_name);
    if (!client) {
      unmatched.push(result.clientInfo_name);
      continue;
    }

    // Deep-clone so we never mutate the caller's record. Reuse an in-progress
    // patch if the same client appears more than once in the report.
    const working: ClientRecord =
      patches[client.id] ?? JSON.parse(JSON.stringify(client));
    working.support = working.support ?? {};
    let changed = false;

    for (const fr of result.features) {
      if (!knownFeatures.has(fr.feature_id)) {
        throw new Error(
          `Conformance report references unknown feature id "${fr.feature_id}" ` +
            `for client "${result.clientInfo_name}".`,
        );
      }

      const newCell = buildCell(fr, report, result.version);
      if (newCell === null) continue; // skip => leave untouched

      const existing = working.support[fr.feature_id];
      const existingProv = existing?.provenance;

      if (existingProv === 'manual' || existingProv === 'submission') {
        // Human-owned. Only flag if the value would actually change.
        const wouldChange =
          existing?.status !== newCell.status ||
          existing?.notes !== newCell.notes;
        if (wouldChange) {
          reviewFlags.push({
            clientId: client.id,
            clientInfo_name: result.clientInfo_name,
            feature_id: fr.feature_id,
            existingProvenance: existingProv,
            from: existing as SupportCell,
            to: newCell,
          });
        }
        continue; // never silently overwrite human data
      }

      // Overwritable (absent / apify / prior conformance).
      working.support[fr.feature_id] = newCell;
      changed = true;
    }

    if (changed) patches[client.id] = working;
  }

  return { patches, reviewFlags, unmatched };
}

// ---------------------------------------------------------------------------
// File IO (main)
// ---------------------------------------------------------------------------

const DEFAULT_REPORT = 'tests/fixtures/sample-conformance-report.json';

function loadReportSchema() {
  const p = path.join(process.cwd(), 'schema/conformance-report.schema.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Validate a parsed report against the interim JSON Schema; throw on failure. */
export function validateReport(data: unknown): ConformanceReport {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(loadReportSchema());
  if (!validate(data)) {
    const msg = (validate.errors ?? [])
      .map((e) => `${e.instancePath || '(root)'} ${e.message}`)
      .join('; ');
    throw new Error(`Conformance report failed schema validation: ${msg}`);
  }
  return data as ConformanceReport;
}

/** Load every client YAML from a dir into { id -> {record, file} } (no validation cross-check needed here). */
function loadClientFiles(
  dir: string,
): Map<string, { record: ClientRecord; file: string }> {
  const out = new Map<string, { record: ClientRecord; file: string }>();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const f of files) {
    const record = YAML.parse(
      fs.readFileSync(path.join(dir, f), 'utf8'),
    ) as ClientRecord;
    out.set(record.id, { record, file: path.join(dir, f) });
  }
  return out;
}

function main(): void {
  const reportPath = path.resolve(process.cwd(), process.argv[2] ?? DEFAULT_REPORT);
  console.log(`[ingest-conformance] reading report: ${reportPath}`);

  const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const report = validateReport(raw);

  const taxonomy = loadFeatures();
  const clientsDir = path.join(process.cwd(), 'data/clients');
  const clientFiles = loadClientFiles(clientsDir);
  const existingClients = [...clientFiles.values()].map((v) => v.record);

  const { patches, reviewFlags, unmatched } = applyConformanceReport(
    report,
    existingClients,
    taxonomy,
  );

  // Report unmatched entries (informational).
  for (const name of unmatched) {
    console.warn(
      `[ingest-conformance] no client matched clientInfo_name "${name}" — skipped.`,
    );
  }

  // Emit review-needed warnings; these are NOT written.
  for (const flag of reviewFlags) {
    const oldStr = `${flag.from.status} (${flag.existingProvenance})`;
    const newStr = `${flag.to.status} (conformance)`;
    console.warn(
      `[review needed] ${flag.clientId} / ${flag.feature_id}: ` +
        `${oldStr} -> ${newStr} — human-owned cell left untouched; resolve manually.`,
    );
  }

  // Validate + write each patched record.
  let written = 0;
  const patchedIds = Object.keys(patches).sort();
  for (const id of patchedIds) {
    const record = patches[id];
    validateClient(record, taxonomy); // throws loudly if invalid
    const entry = clientFiles.get(id);
    if (!entry) {
      throw new Error(`Patched client "${id}" has no source file — cannot write.`);
    }
    fs.writeFileSync(entry.file, YAML.stringify(record), 'utf8');
    console.log(`[ingest-conformance] wrote ${entry.file}`);
    written++;
  }

  console.log(
    `[ingest-conformance] done: ${written} client file(s) updated, ` +
      `${reviewFlags.length} review flag(s), ${unmatched.length} unmatched.`,
  );

  if (reviewFlags.length > 0) {
    console.log(
      '[ingest-conformance] NOTE: review-needed conflicts were skipped, not applied.',
    );
  }
}

// Only run main() when invoked directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (invokedDirectly) {
  main();
}
