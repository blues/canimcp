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

/** Emoji/symbol for a support status (used inside cells, decorative). */
export function statusSymbol(status: Status): string {
  switch (status) {
    case 'yes':
      return '✅';
    case 'partial':
      return '🟡';
    case 'no':
      return '❌';
    case 'unknown':
    default:
      return '❔';
  }
}

/**
 * Tailwind utility classes for a cell's background/text by status.
 * Includes dark-mode variants so cells stay legible in either scheme.
 */
export function statusColorClass(status: Status): string {
  switch (status) {
    case 'yes':
      return 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100';
    case 'partial':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
    case 'no':
      return 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100';
    case 'unknown':
    default:
      return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
  }
}
