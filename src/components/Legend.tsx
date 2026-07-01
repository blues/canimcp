import type { Status } from '../lib/matrix';
import { statusLabel, statusSymbol } from '../lib/matrix';

/**
 * Legend explaining the four support states. Purely presentational — rendered
 * server-side (no hydration needed).
 */
const STATES: Status[] = ['yes', 'partial', 'no', 'unknown'];

const DESCRIPTIONS: Record<Status, string> = {
  yes: 'Feature is supported.',
  partial: 'Partially supported — see the cell note for caveats.',
  no: 'Not supported.',
  unknown: 'Not yet verified — help us by contributing a sourced report.',
};

export default function Legend() {
  return (
    <dl class="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Support state legend">
      {STATES.map((s) => (
        <div class="flex items-center gap-2" key={s}>
          <dt class="flex items-center gap-1 font-medium">
            <span aria-hidden="true">{statusSymbol(s)}</span>
            <span>{statusLabel(s)}</span>
          </dt>
          <dd class="text-gray-600 dark:text-gray-400">{DESCRIPTIONS[s]}</dd>
        </div>
      ))}
    </dl>
  );
}
