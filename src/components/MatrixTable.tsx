/** @jsxImportSource preact */
/**
 * MatrixTable — the default client-centric compatibility matrix.
 *
 * A Preact island (hydrated via client:load / client:visible from the Astro
 * page). Rows are features grouped by category; columns are MCP clients.
 * Cells render the 4-state support status, color-coded AND accessible (each
 * cell carries an aria-label + title so meaning is never conveyed by color
 * alone).
 *
 * Interactivity is intentionally minimal for now. Filters (Task 2.4) and a
 * cell-detail popover (Task 2.3) are owned by other tasks. To make hooking a
 * future CellDetail in trivial, each cell:
 *   - carries `data-client-id` / `data-feature-id` attributes, and
 *   - accepts an optional `onCellClick` callback (defaults to a no-op).
 */
import type {
  Category,
  ClientMeta,
  Matrix,
  MatrixBundle,
  Status,
  SupportCell,
} from '../lib/matrix';
import { statusColorClass, statusLabel, statusSymbol } from '../lib/matrix';

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
   * Optional cell-click handler. A later task (CellDetail popover) can pass a
   * real handler; defaults to a no-op so the table is inert but structured.
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

export default function MatrixTable(props: MatrixTableProps) {
  const { categories, clients, matrix, onCellClick } = props;
  const handleCellClick = onCellClick ?? (() => {});

  return (
    <div
      class="relative max-h-[80vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-800"
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
              class="sticky left-0 top-0 z-30 min-w-[16rem] border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
            >
              Feature
            </th>
            {clients.map((client) => (
              <th
                key={client.id}
                scope="col"
                class="sticky top-0 z-20 min-w-[7rem] border-b border-l border-gray-200 bg-gray-50 px-2 py-2 text-center align-bottom font-semibold text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
                title={client.vendor ? `${client.title} — ${client.vendor}` : client.title}
              >
                <a
                  href={`/client/${client.id}`}
                  class="block truncate hover:underline"
                >
                  {client.title}
                </a>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <CategoryRows
              key={category.id}
              category={category}
              clients={clients}
              matrix={matrix}
              onCellClick={handleCellClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryRows(props: {
  category: Category;
  clients: ClientMeta[];
  matrix: Matrix;
  onCellClick: (payload: CellClickPayload) => void;
}) {
  const { category, clients, matrix, onCellClick } = props;
  const colSpan = clients.length + 1;

  return (
    <>
      {/* Category header row. */}
      <tr>
        <th
          scope="colgroup"
          colSpan={colSpan}
          class="sticky left-0 z-10 border-y border-gray-200 bg-gray-100 px-3 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-gray-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300"
        >
          {category.title}
        </th>
      </tr>
      {category.features.map((feature) => (
        <tr key={feature.id} class="even:bg-gray-50/50 dark:even:bg-gray-900/40">
          {/* Sticky first column: feature title. */}
          <th
            scope="row"
            class="sticky left-0 z-10 min-w-[16rem] border-b border-r border-gray-200 bg-white px-3 py-2 text-left font-medium text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
          >
            <a href={`/feature/${feature.id}`} class="hover:underline">
              {feature.title}
            </a>
          </th>
          {clients.map((client) => {
            const cell = getCell(matrix, client.id, feature.id);
            const status: Status = cell.status;
            const aria = `${client.title} — ${feature.title}: ${statusLabel(status)}`;
            return (
              <td
                key={client.id}
                data-client-id={client.id}
                data-feature-id={feature.id}
                data-status={status}
                onClick={() =>
                  onCellClick({ clientId: client.id, featureId: feature.id, cell })
                }
                class={`border-b border-l border-gray-200 px-2 py-2 text-center dark:border-gray-800 ${statusColorClass(status)}`}
              >
                <span role="img" aria-label={aria} title={aria}>
                  {statusSymbol(status)}
                </span>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
