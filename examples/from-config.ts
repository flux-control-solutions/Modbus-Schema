/**
 * Demonstrates declarative register configuration with {@link fromConfig}.
 *
 * Instead of calling factories directly, define a record of {@link ParamConfig}
 * objects and let `fromConfig` dispatch to the correct factory. This pattern
 * mirrors how device parameter groups are defined in the inverter package.
 *
 * @example bun run examples/from-config.ts
 */

import {
  ParamKind,
  type RegisterMeta,
  type ScaledParamConfig,
  type SignedScaledParamConfig,
  type EnumParamConfig,
  fromConfig,
} from '@flux-control/modbus-schema';
import { Schema } from 'effect';

// ── Domain brand ───────────────────────────────────────────────

const Voltage = Schema.Number.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(10),
).pipe(Schema.brand('Voltage'));

type Voltage = number & Schema.Schema.Type<typeof Voltage>;

// ── Declarative register configs ───────────────────────────────

const controlMode = {
  register: 0x0000,
  kind: ParamKind.Enum,
  labels: {
    0: 'V/F',
    1: 'Sensorless Vector',
    2: 'Closed Loop Vector',
  } as const,
  meta: {
    name: 'Control Mode Selection',
    range: '0-2',
    default: '0',
    unit: '-',
  },
} satisfies EnumParamConfig;

const analogOutputScale = {
  register: 0x0001,
  kind: ParamKind.Scaled,
  factor: 0.01,
  domain: Voltage,
  meta: {
    name: 'Analog Output 1 Scale',
    range: '0.00–10.00',
    default: '0.00',
    unit: 'V',
  },
} satisfies ScaledParamConfig<RegisterMeta, typeof Voltage>;

const pulseInputBias = {
  register: 0x0002,
  kind: ParamKind.SignedScaled,
  factor: 0.1,
  meta: {
    name: 'Pulse Input Bias',
    range: '–100.0–100.0',
    default: '0.0',
    unit: '%',
  },
} satisfies SignedScaledParamConfig;

// ── Build entries from configs ─────────────────────────────────

const entries = {
  controlMode: fromConfig(controlMode),
  analogOutputScale: fromConfig(analogOutputScale),
  pulseInputBias: fromConfig(pulseInputBias),
};

// ── Decode a snapshot of raw register values ───────────────────

const snapshot = {
  [controlMode.register]: 2,
  [analogOutputScale.register]: 750,
  [pulseInputBias.register]: 65036, // 0xFE0C = -50.0
};

// A snapshot is keyed by register, so a lookup can miss. `decodeSync` takes a
// wire word, not a maybe-word, so the miss is resolved here rather than handed
// to the decoder as an out-of-domain value.
const wordAt = (register: number): number => {
  const word = snapshot[register];
  if (word === undefined) throw new Error(`register ${register} missing from snapshot`);
  return word;
};

console.log('Control mode:', entries.controlMode.decodeSync(wordAt(controlMode.register)));
console.log(
  'Analog output scale:',
  entries.analogOutputScale.decodeSync(wordAt(analogOutputScale.register)),
);
console.log(
  'Pulse input bias:',
  entries.pulseInputBias.decodeSync(wordAt(pulseInputBias.register)),
);

// ── Encode a domain value back to wire ─────────────────────────

const wire = entries.analogOutputScale.encodeSync(Voltage.make(10));
console.log('Analog output scale wire:', wire); // 1000
