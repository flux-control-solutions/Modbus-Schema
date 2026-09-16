/**
 * Demonstrates decode-only lookup parameters with fallback handling.
 *
 * `makeLookupParam` maps wire integer codes to human-readable strings. Unknown
 * codes route through a fallback function instead of failing, which is useful
 * for fault/alarm/model registers that may gain new codes over time.
 *
 * @example bun run examples/lookup-table.ts
 */

import { makeLookupParam } from '@flux-control/modbus-schema';
import { Brand, Schema } from 'effect';

// ── Branded lookup domain ──────────────────────────────────────

type FaultCode = string & Brand.Brand<'FaultCode'>;
const FaultCode = Schema.String.pipe(Schema.brand('FaultCode'));

// ── Fault code lookup table ────────────────────────────────────

const faultLabels = {
  0: FaultCode.make('No fault'),
  1: FaultCode.make('Over-current'),
  2: FaultCode.make('Over-voltage'),
  3: FaultCode.make('Under-voltage'),
  4: FaultCode.make('Over-temperature'),
} satisfies Record<number, FaultCode>;

const faults = makeLookupParam(
  0x2521,
  faultLabels,
  (raw) => FaultCode.make(`Unknown fault code ${raw}`),
  {
    name: 'Fault Code Register',
    unit: '-',
    range: '0–4',
    default: '0',
  },
  { domain: FaultCode },
);

// ── Decode known and unknown codes ─────────────────────────────

for (const wire of [0, 2, 4, 99]) {
  console.log(`Wire ${wire} ->`, faults.decodeSync(wire));
}

// Known: 0 -> No fault
// Known: 2 -> Over-voltage
// Known: 4 -> Over-temperature
// Unknown: 99 -> Unknown fault code 99

// ── Encode intentionally fails (lookup is decode-only) ───────────

try {
  faults.encodeSync(FaultCode.make('No fault'));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.log('Encode failed as expected:', message.includes('read only'));
}
