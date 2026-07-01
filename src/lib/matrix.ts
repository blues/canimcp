/**
 * canimcp — matrix data loader + shared TypeScript types.
 *
 * This module is the SINGLE source of truth for the shape of the compiled
 * data bundle (`public/data/matrix.json`) across the whole UI. Import types
 * and helpers from here rather than redeclaring them elsewhere.
 *
 * The build-time disk loader lives in `loadMatrix.ts` (node-only) so this
 * module stays free of node built-ins and is safe to import from Preact
 * islands / browser code. Import only types + pure helpers from here.
 */

/** The four support states adopted from registry#718. */
export type Status = 'yes' | 'partial' | 'no' | 'unknown';

/** How a given support cell's data was sourced. */
export type Provenance = 'manual' | 'conformance' | 'apify' | 'submission';

/** A single (client × feature) support cell. */
export interface SupportCell {
  status: Status;
  notes?: string;
  source?: string;
  last_verified?: string;
  version_tested?: string;
  provenance?: Provenance;
}

/** A single matrix feature (row). */
export interface Feature {
  id: string;
  title: string;
  spec_url?: string;
}

/** A category groups related features. */
export interface Category {
  id: string;
  title: string;
  features: Feature[];
}

/** Metadata about an MCP client (column). */
export interface ClientMeta {
  id: string;
  title: string;
  url: string;
  vendor?: string;
  clientInfo_name?: string;
  protocolVersion?: string;
  usage_rank?: number | null;
  platforms?: string[];
  install_docs_url?: string;
}

/** The denormalized matrix: matrix[clientId][featureId] -> SupportCell. */
export type Matrix = Record<string, Record<string, SupportCell>>;

/** The full compiled bundle emitted by `scripts/build-data.ts`. */
export interface MatrixBundle {
  spec_version: string;
  generated_at: string;
  /** Categories, each with nested features. */
  features: Category[];
  /** Clients (matrix columns). */
  clients: ClientMeta[];
  /** Every (client × feature) cell, `unknown` where unspecified. */
  matrix: Matrix;
}

/** Flatten categories into a single ordered list of features. */
export function flattenFeatures(categories: Category[]): Feature[] {
  return categories.flatMap((c) => c.features);
}

/** Human-readable label for a support status. */
export function statusLabel(status: Status): string {
  switch (status) {
    case 'yes':
      return 'Supported';
    case 'partial':
      return 'Partial';
    case 'no':
      return 'Not supported';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

/**
 * Crisp geometric glyph for a support status. Deliberately NOT emoji: emoji
 * render inconsistently across platforms and add visual noise across 1000+
 * cells. `unknown` renders as a faint dot so verified data stands out.
 */
export function statusSymbol(status: Status): string {
  switch (status) {
    case 'yes':
      return '✓';
    case 'partial':
      return '◐';
    case 'no':
      return '✕';
    case 'unknown':
    default:
      return '·';
  }
}

/**
 * Cell fill classes by status. Verified states (yes/partial/no) are vivid and
 * high-contrast so real data pops; `unknown` is intentionally near-blank so the
 * eye is drawn to what's actually known — the key to scanning a sparse matrix.
 */
export function statusColorClass(status: Status): string {
  switch (status) {
    case 'yes':
      return 'bg-emerald-500 text-white dark:bg-emerald-500/90 dark:text-white';
    case 'partial':
      return 'bg-amber-400 text-amber-950 dark:bg-amber-400/90 dark:text-amber-950';
    case 'no':
      return 'bg-rose-500 text-white dark:bg-rose-500/90 dark:text-white';
    case 'unknown':
    default:
      return 'bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-600';
  }
}

/** Fraction (0–1) of a client's cells that are `yes` across the given features. */
export function clientCoverage(
  cells: Record<string, SupportCell>,
  featureIds: string[],
): { yes: number; partial: number; known: number; total: number; score: number } {
  let yes = 0;
  let partial = 0;
  let known = 0;
  for (const id of featureIds) {
    const s = cells[id]?.status ?? 'unknown';
    if (s === 'yes') yes += 1;
    else if (s === 'partial') partial += 1;
    if (s !== 'unknown') known += 1;
  }
  const total = featureIds.length || 1;
  // Score weights partial as half a point — used for the coverage bar.
  const score = (yes + partial * 0.5) / total;
  return { yes, partial, known, total: featureIds.length, score };
}
