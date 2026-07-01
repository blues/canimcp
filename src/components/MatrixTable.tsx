/** @jsxImportSource preact */
/**
 * MatrixTable — the default client-centric compatibility matrix, now the
 * interactive parent island: it composes the Filters bar, the scrollable
 * grid, and the CellDetail popover.
 *
 * Rows are features grouped by category; columns are MCP clients. Cells
 * render the 4-state support status, color-coded AND accessible (each cell
 * carries an aria-label + title so meaning is never conveyed by color alone).
 *
 * Interactivity:
 *   - Filters (Task 2.4): free-text search over client + feature names, plus
 *     category / support-state / provenance filters. Pure client-side; the
 *     filter state lives here and drives which rows (features) and columns
 *     (clients) render. Matching text is highlighted.
 *   - CellDetail (Task 2.3): clicking a cell opens an accessible popover with
 *     notes, source link, dates, version and a provenance badge.
 *
 * Each cell still carries `data-client-id` / `data-feature-id` / `data-status`
 * attributes for testing + external hooks.
 */
import { useMemo, useState } from 'preact/hooks';
import type {
  Category,
  ClientMeta,
  Feature,
  Matrix,
  MatrixBundle,
  Status,
  SupportCell,
} from '../lib/matrix';
import { clientCoverage, flattenFeatures, statusColorClass, statusLabel, statusSymbol } from '../lib/matrix';
import Filters, { EMPTY_FILTERS, type FilterState } from './Filters';
import CellDetail from './CellDetail';

export interface CellClickPayload {
  clientId: string;
  featureId: string;
  cell: SupportCell;
}

export interface MatrixTableProps {
  /** Feature categories (rows), in order. */
  categories: Category[];
  /** Clients (columns), in order. */
  clients: ClientMeta[];
  /** Denormalized support matrix. */
  matrix: Matrix;
  /**
   * Optional cell-click handler. Fires in addition to opening the built-in
   * CellDetail popover; defaults to a no-op.
   */
  onCellClick?: (payload: CellClickPayload) => void;
}

/** Convenience prop shape for passing the whole bundle. */
export type MatrixTableBundleProps = {
  bundle: MatrixBundle;
  onCellClick?: (payload: CellClickPayload) => void;
};

const UNKNOWN_CELL: SupportCell = { status: 'unknown' };

function getCell(matrix: Matrix, clientId: string, featureId: string): SupportCell {
  return matrix[clientId]?.[featureId] ?? UNKNOWN_CELL;
}

interface SelectedCell {
  client: ClientMeta;
  feature: Feature;
  cell: SupportCell;
}

/** Split a title into parts, highlighting the query match (case-insensitive). */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (q === '') return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return (
    <>
      {before}
      <mark class="rounded bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/40">
        {match}
      </mark>
      {after}
    </>
  );
}

export default function MatrixTable(props: MatrixTableProps) {
  const { categories, clients, matrix, onCellClick } = props;

  const [filters, setFilters] = useState<FilterState>({ ...EMPTY_FILTERS });
  const [selected, setSelected] = useState<SelectedCell | null>(null);

  // Fast lookups for the popover.
  const clientById = useMemo(() => {
    const m = new Map<string, ClientMeta>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const featureById = useMemo(() => {
    const m = new Map<string, Feature>();
    for (const f of flattenFeatures(categories)) m.set(f.id, f);
    return m;
  }, [categories]);

  const totalFeatures = useMemo(() => flattenFeatures(categories).length, [categories]);

  // Stable list of every feature id — used for per-client coverage bars
  // (coverage is computed over the FULL spec, not just the filtered view).
  const allFeatureIds = useMemo(
    () => flattenFeatures(categories).map((f) => f.id),
    [categories],
  );

  const { visibleCategories, visibleClients } = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const allFeatures = flattenFeatures(categories);

    const clientMatchesQuery = (c: ClientMeta) =>
      q === '' ||
      c.title.toLowerCase().includes(q) ||
      (c.vendor?.toLowerCase().includes(q) ?? false);
    const featureMatchesQuery = (f: Feature) =>
      q === '' || f.title.toLowerCase().includes(q);

    const anyClientMatches = q !== '' && clients.some(clientMatchesQuery);
    const anyFeatureMatches = q !== '' && allFeatures.some(featureMatchesQuery);

    // Row/column query visibility: if the query matches features, restrict
    // rows to matches; if it matches clients, restrict columns; otherwise keep
    // the whole dimension so a client search still shows all feature rows.
    const rowVisibleByQuery = (f: Feature) =>
      q === '' || !anyFeatureMatches || featureMatchesQuery(f);
    const colVisibleByQuery = (c: ClientMeta) =>
      q === '' || !anyClientMatches || clientMatchesQuery(c);

    const stateActive = filters.state !== 'all';
    const provActive = filters.provenance !== 'all';
    const cellPasses = (c: ClientMeta, f: Feature) => {
      if (!stateActive && !provActive) return true;
      const cell = getCell(matrix, c.id, f.id);
      if (stateActive && cell.status !== filters.state) return false;
      if (provActive && (cell.provenance ?? undefined) !== filters.provenance) return false;
      return true;
    };

    // Candidate rows after category + query filtering.
    const categoryFiltered =
      filters.categoryId === 'all'
        ? categories
        : categories.filter((c) => c.id === filters.categoryId);

    const candidateFeaturesByCat = categoryFiltered.map((cat) => ({
      cat,
      features: cat.features.filter(rowVisibleByQuery),
    }));
    const candidateClients = clients.filter(colVisibleByQuery);

    // State/provenance cross-filter: a row survives if some candidate client
    // has a passing cell; a column survives if some candidate feature does.
    const allCandidateFeatures = candidateFeaturesByCat.flatMap((g) => g.features);

    const clientsFinal = candidateClients.filter(
      (c) =>
        (!stateActive && !provActive) ||
        allCandidateFeatures.some((f) => cellPasses(c, f)),
    );

    const catsFinal: Category[] = candidateFeaturesByCat
      .map((g) => ({
        ...g.cat,
        features: g.features.filter(
          (f) =>
            (!stateActive && !provActive) ||
            clientsFinal.some((c) => cellPasses(c, f)),
        ),
      }))
      .filter((cat) => cat.features.length > 0);

    return { visibleCategories: catsFinal, visibleClients: clientsFinal };
  }, [categories, clients, matrix, filters]);

  const visibleFeatureCount = useMemo(
    () => visibleCategories.reduce((n, c) => n + c.features.length, 0),
    [visibleCategories],
  );

  function handleCellClick(payload: CellClickPayload) {
    const client = clientById.get(payload.clientId);
    const feature = featureById.get(payload.featureId);
    if (client && feature) {
      setSelected({ client, feature, cell: payload.cell });
    }
    onCellClick?.(payload);
  }

  const hasResults = visibleCategories.length > 0 && visibleClients.length > 0;

  return (
    <div>
      <Filters
        categories={categories}
        value={filters}
        onChange={setFilters}
        visibleFeatures={visibleFeatureCount}
        totalFeatures={totalFeatures}
        visibleClients={visibleClients.length}
        totalClients={clients.length}
      />

      {hasResults ? (
        <>
          <InlineLegend />
          <div
            class="relative max-h-[80vh] overflow-auto rounded-lg border border-gray-200 shadow-sm dark:border-gray-800"
            role="region"
            aria-label="MCP client compatibility matrix"
            tabIndex={0}
          >
            <table class="border-collapse text-sm">
              <thead>
                <tr>
                  {/* Top-left corner: sticky both directions, above everything. */}
                  <th
                    scope="col"
                    class="sticky left-0 top-0 z-30 min-w-[15rem] border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"
                  >
                    Feature ↓ / Client →
                  </th>
                  {visibleClients.map((client) => {
                    const cov = clientCoverage(matrix[client.id] ?? {}, allFeatureIds);
                    const pct = Math.round(cov.score * 100);
                    return (
                      <th
                        key={client.id}
                        scope="col"
                        class="sticky top-0 z-20 w-24 min-w-[6rem] border-b border-l border-gray-200 bg-gray-100 px-1.5 pb-1.5 pt-2 align-bottom font-semibold text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
                        title={`${client.title}${client.vendor ? ` — ${client.vendor}` : ''}\n${cov.yes} supported, ${cov.partial} partial of ${cov.total} features`}
                      >
                        <a
                          href={`/client/${client.id}`}
                          class="mx-auto block max-w-[5.5rem] truncate text-center text-[13px] hover:underline"
                        >
                          <Highlight text={client.title} query={filters.query} />
                        </a>
                        {/* Coverage bar: instantly scan who supports the most. */}
                        <div class="mt-1.5" aria-hidden="true">
                          <div class="h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              class="h-full rounded-full bg-emerald-500"
                              style={`width:${pct}%`}
                            />
                          </div>
                          <div class="mt-0.5 text-center text-[10px] font-normal tabular-nums text-gray-400 dark:text-gray-500">
                            {pct}%
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleCategories.map((category) => (
                  <CategoryRows
                    key={category.id}
                    category={category}
                    clients={visibleClients}
                    matrix={matrix}
                    query={filters.query}
                    onCellClick={handleCellClick}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div class="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          <p>No features or clients match the current filters.</p>
          <button
            type="button"
            onClick={() => setFilters({ ...EMPTY_FILTERS })}
            class="mt-3 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Clear filters
          </button>
        </div>
      )}

      {selected ? (
        <CellDetail
          client={selected.client}
          feature={selected.feature}
          cell={selected.cell}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function InlineLegend() {
  const items: { status: Status; label: string }[] = [
    { status: 'yes', label: 'Supported' },
    { status: 'partial', label: 'Partial' },
    { status: 'no', label: 'Not supported' },
    { status: 'unknown', label: 'Unknown' },
  ];
  return (
    <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-gray-600 dark:text-gray-400">
      {items.map(({ status, label }) => (
        <span key={status} class="inline-flex items-center gap-1.5">
          <span
            class={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${statusColorClass(status)} ${status === 'unknown' ? 'border border-gray-300 dark:border-gray-700' : ''}`}
            aria-hidden="true"
          >
            {statusSymbol(status)}
          </span>
          {label}
        </span>
      ))}
      <span class="inline-flex items-center gap-1.5">
        <span class="relative inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500">
          <span class="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-white opacity-80" />
        </span>
        Cited source
      </span>
      <span class="ml-auto hidden items-center gap-1.5 sm:inline-flex">
        <span class="inline-block h-1 w-8 rounded-full bg-emerald-500" aria-hidden="true" />
        Coverage bar = % of spec supported
      </span>
    </div>
  );
}

function CategoryRows(props: {
  category: Category;
  clients: ClientMeta[];
  matrix: Matrix;
  query: string;
  onCellClick: (payload: CellClickPayload) => void;
}) {
  const { category, clients, matrix, query, onCellClick } = props;
  const colSpan = clients.length + 1;

  return (
    <>
      {/* Category header row. */}
      <tr>
        <th
          scope="colgroup"
          colSpan={colSpan}
          class="sticky left-0 z-10 border-y border-gray-200 bg-slate-100 px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-gray-800 dark:bg-slate-800/80 dark:text-slate-300"
        >
          {category.title}
        </th>
      </tr>
      {category.features.map((feature) => (
        <tr key={feature.id} class="even:bg-gray-50/60 dark:even:bg-gray-900/40">
          {/* Sticky first column: feature title. Fixed height so rows align. */}
          <th
            scope="row"
            class="sticky left-0 z-10 h-9 min-w-[15rem] max-w-[15rem] border-b border-r border-gray-200 bg-white px-3 text-left font-medium text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
          >
            <a
              href={`/feature/${feature.id}`}
              class="block truncate hover:text-blue-600 hover:underline dark:hover:text-blue-400"
              title={feature.title}
            >
              <Highlight text={feature.title} query={query} />
            </a>
          </th>
          {clients.map((client) => {
            const cell = getCell(matrix, client.id, feature.id);
            const status: Status = cell.status;
            const aria = `${client.title} — ${feature.title}: ${statusLabel(status)}. Click for details.`;
            const sourced = Boolean(cell.source);
            return (
              <td
                key={client.id}
                data-client-id={client.id}
                data-feature-id={feature.id}
                data-status={status}
                onClick={() =>
                  onCellClick({ clientId: client.id, featureId: feature.id, cell })
                }
                class={`group relative h-9 w-24 min-w-[6rem] cursor-pointer border-b border-l border-gray-200 text-center transition-colors hover:ring-2 hover:ring-inset hover:ring-blue-500 dark:border-gray-800 ${statusColorClass(status)}`}
              >
                <button
                  type="button"
                  aria-label={aria}
                  title={aria}
                  class="flex h-full w-full items-center justify-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                >
                  <span class="text-sm font-bold leading-none" role="img" aria-hidden="true">
                    {statusSymbol(status)}
                  </span>
                  {/* Tiny dot marks cells backed by a real source. */}
                  {sourced ? (
                    <span
                      class="absolute right-1 top-1 h-1 w-1 rounded-full bg-current opacity-60"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
