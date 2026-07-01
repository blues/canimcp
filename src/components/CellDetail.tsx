/** @jsxImportSource preact */
/**
 * CellDetail — an accessible popover/panel showing the evidence behind a
 * single (client × feature) support cell.
 *
 * Rendered by MatrixTable when a cell is clicked. Shows the support status
 * (label + symbol + color), notes, the source as a clickable link, the
 * last-verified date, the tested version, and a provenance badge.
 *
 * Presented as a drawer: a bottom sheet on mobile, a right-side panel on
 * wider screens, over a dismissable backdrop. Accessible: role="dialog",
 * aria-modal, aria-label, focus moves to the close button on open, and it
 * dismisses on Escape, backdrop click, or the close button.
 */
import { useEffect, useRef } from 'preact/hooks';
import type {
  ClientMeta,
  Feature,
  Provenance,
  SupportCell,
} from '../lib/matrix';
import { statusColorClass, statusLabel, statusSymbol } from '../lib/matrix';

export interface CellDetailProps {
  client: ClientMeta;
  feature: Feature;
  cell: SupportCell;
  onClose: () => void;
}

const PROVENANCE_LABEL: Record<Provenance, string> = {
  manual: 'Manual',
  conformance: 'Conformance',
  apify: 'Apify import',
  submission: 'Submission',
};

const PROVENANCE_CLASS: Record<Provenance, string> = {
  manual:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  conformance:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  apify:
    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  submission:
    'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
};

function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  return (
    <span
      class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PROVENANCE_CLASS[provenance]}`}
    >
      {PROVENANCE_LABEL[provenance]}
    </span>
  );
}

function Row({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="flex flex-col gap-0.5 border-t border-gray-200 py-2.5 dark:border-gray-800">
      <dt class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd class="text-sm text-gray-800 dark:text-gray-200">{children}</dd>
    </div>
  );
}

export default function CellDetail(props: CellDetailProps) {
  const { client, feature, cell, onClose } = props;
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = 'celldetail-title';

  // Focus the close button on open + close on Escape.
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const status = cell.status;

  return (
    <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close details"
        tabIndex={-1}
        class="absolute inset-0 cursor-default bg-black/40"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        class="relative flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-white shadow-2xl dark:bg-gray-950 sm:max-h-none sm:w-96 sm:rounded-none sm:rounded-l-2xl"
      >
        {/* Header */}
        <div class="flex items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
          <div class="min-w-0">
            <h2 id={titleId} class="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
              {feature.title}
            </h2>
            <p class="truncate text-sm text-gray-500 dark:text-gray-400">
              <a href={`/client/${client.id}`} class="hover:underline">
                {client.title}
              </a>
              {client.vendor ? ` · ${client.vendor}` : ''}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            class="-m-1 shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <span aria-hidden="true" class="text-xl leading-none">×</span>
          </button>
        </div>

        {/* Body */}
        <div class="flex-1 px-4 pb-4">
          {/* Status */}
          <div class="flex items-center gap-2 py-3">
            <span
              class={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ${statusColorClass(status)}`}
            >
              <span role="img" aria-hidden="true">
                {statusSymbol(status)}
              </span>
              {statusLabel(status)}
            </span>
          </div>

          <dl class="text-sm">
            {cell.notes ? (
              <Row label="Notes">
                <p class="whitespace-pre-wrap leading-relaxed">{cell.notes}</p>
              </Row>
            ) : null}

            {cell.source ? (
              <Row label="Source">
                <a
                  href={cell.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="break-all text-blue-600 hover:underline dark:text-blue-400"
                >
                  {cell.source}
                </a>
              </Row>
            ) : null}

            {cell.version_tested ? (
              <Row label="Version tested">
                <span class="font-mono">{cell.version_tested}</span>
              </Row>
            ) : null}

            {cell.last_verified ? (
              <Row label="Last verified">{cell.last_verified}</Row>
            ) : null}

            {cell.provenance ? (
              <Row label="Provenance">
                <ProvenanceBadge provenance={cell.provenance} />
              </Row>
            ) : null}

            {!cell.notes &&
            !cell.source &&
            !cell.version_tested &&
            !cell.last_verified &&
            !cell.provenance ? (
              <p class="border-t border-gray-200 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                No additional detail recorded for this cell yet.
              </p>
            ) : null}
          </dl>

          <div class="mt-4 flex flex-wrap gap-3 text-sm">
            <a
              href={`/feature/${feature.id}`}
              class="text-blue-600 hover:underline dark:text-blue-400"
            >
              View feature →
            </a>
            <a
              href={`/client/${client.id}`}
              class="text-blue-600 hover:underline dark:text-blue-400"
            >
              View client →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
