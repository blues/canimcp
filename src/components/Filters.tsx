/** @jsxImportSource preact */
/**
 * Filters — a pure client-side filter bar for the compatibility matrix.
 *
 * Provides:
 *   - free-text search over client + feature names,
 *   - a feature-CATEGORY filter (from the bundle's categories),
 *   - a support-STATE filter (yes / partial / no / unknown),
 *   - a PROVENANCE filter (manual / conformance / apify / submission).
 *
 * It is a controlled component: the current FilterState lives in the parent
 * (MatrixTable) and changes are emitted via onChange. The parent decides which
 * feature-rows and client-columns to render. A "clear filters" affordance
 * resets everything, and the active-filter count is surfaced inline.
 */
import type { Category, Provenance, Status } from '../lib/matrix';

export interface FilterState {
  /** Free-text query over client + feature titles. */
  query: string;
  /** Selected feature category id, or 'all'. */
  categoryId: string;
  /** Selected support state, or 'all'. */
  state: Status | 'all';
  /** Selected provenance, or 'all'. */
  provenance: Provenance | 'all';
}

export const EMPTY_FILTERS: FilterState = {
  query: '',
  categoryId: 'all',
  state: 'all',
  provenance: 'all',
};

export function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.query.trim() !== '') n += 1;
  if (f.categoryId !== 'all') n += 1;
  if (f.state !== 'all') n += 1;
  if (f.provenance !== 'all') n += 1;
  return n;
}

const STATE_OPTIONS: { value: Status | 'all'; label: string }[] = [
  { value: 'all', label: 'All states' },
  { value: 'yes', label: 'Supported' },
  { value: 'partial', label: 'Partial' },
  { value: 'no', label: 'Not supported' },
  { value: 'unknown', label: 'Unknown' },
];

const PROVENANCE_OPTIONS: { value: Provenance | 'all'; label: string }[] = [
  { value: 'all', label: 'All sources' },
  { value: 'manual', label: 'Manual' },
  { value: 'conformance', label: 'Conformance' },
  { value: 'apify', label: 'Apify import' },
  { value: 'submission', label: 'Submission' },
];

export interface FiltersProps {
  categories: Category[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  /** Optional: number of visible feature rows / client columns for context. */
  visibleFeatures?: number;
  totalFeatures?: number;
  visibleClients?: number;
  totalClients?: number;
}

const selectClass =
  'rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200';

export default function Filters(props: FiltersProps) {
  const {
    categories,
    value,
    onChange,
    visibleFeatures,
    totalFeatures,
    visibleClients,
    totalClients,
  } = props;

  const count = activeFilterCount(value);

  function patch(part: Partial<FilterState>) {
    onChange({ ...value, ...part });
  }

  return (
    <div class="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/50">
      <div class="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div class="flex min-w-[14rem] flex-1 flex-col gap-1">
          <label
            for="matrix-search"
            class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Search
          </label>
          <input
            id="matrix-search"
            type="search"
            placeholder="Filter clients &amp; features…"
            value={value.query}
            onInput={(e) => patch({ query: (e.currentTarget as HTMLInputElement).value })}
            class="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          />
        </div>

        {/* Category */}
        <div class="flex flex-col gap-1">
          <label
            for="matrix-category"
            class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Category
          </label>
          <select
            id="matrix-category"
            value={value.categoryId}
            onChange={(e) => patch({ categoryId: (e.currentTarget as HTMLSelectElement).value })}
            class={selectClass}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        {/* State */}
        <div class="flex flex-col gap-1">
          <label
            for="matrix-state"
            class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            State
          </label>
          <select
            id="matrix-state"
            value={value.state}
            onChange={(e) =>
              patch({ state: (e.currentTarget as HTMLSelectElement).value as Status | 'all' })
            }
            class={selectClass}
          >
            {STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Provenance */}
        <div class="flex flex-col gap-1">
          <label
            for="matrix-provenance"
            class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Provenance
          </label>
          <select
            id="matrix-provenance"
            value={value.provenance}
            onChange={(e) =>
              patch({
                provenance: (e.currentTarget as HTMLSelectElement).value as Provenance | 'all',
              })
            }
            class={selectClass}
          >
            {PROVENANCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Clear */}
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTERS })}
          disabled={count === 0}
          class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Clear{count > 0 ? ` (${count})` : ''}
        </button>
      </div>

      {/* Result summary */}
      {(visibleFeatures !== undefined || visibleClients !== undefined) && (
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
          {visibleFeatures !== undefined && totalFeatures !== undefined
            ? `${visibleFeatures} of ${totalFeatures} features`
            : ''}
          {visibleFeatures !== undefined && visibleClients !== undefined ? ' · ' : ''}
          {visibleClients !== undefined && totalClients !== undefined
            ? `${visibleClients} of ${totalClients} clients`
            : ''}
          {count > 0 ? ` · ${count} active filter${count === 1 ? '' : 's'}` : ''}
        </p>
      )}
    </div>
  );
}
