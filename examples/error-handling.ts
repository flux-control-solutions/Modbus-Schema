/**
 * Demonstrates decode/encode error handling in both Effect and sync APIs.
 *
 * The Effect API returns `Schema.SchemaError` as a typed failure; the sync
 * API throws it. This example shows how to surface, inspect, and recover from
 * invalid wire/domain values.
 *
 * @example bun run examples/error-handling.ts
 */

import { makeScaledParam } from '@flux-control/modbus-schema';
import { Effect, Schema } from 'effect';

const Voltage = Schema.Number.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(10),
).pipe(Schema.brand('Voltage'));

type Voltage = number & Schema.Schema.Type<typeof Voltage>;

const voltage = makeScaledParam(
  0x2000,
  0.01,
  {
    name: 'DC Bus Voltage',
    unit: 'V',
    range: '0.00–10.00',
    default: '0.00',
  },
  { domain: Voltage },
);

// ── Effect API: catch failures explicitly ──────────────────────

const handleWithEffect = Effect.gen(function* () {
  const good = yield* voltage.decode(750);
  yield* Effect.sync(() => console.log(`Decoded: ${good} V`));

  yield* voltage.decode(1500).pipe(
    Effect.matchEffect({
      onFailure: (error) => Effect.sync(() => console.log('Effect decode failed:', error.message)),
      onSuccess: (value) => Effect.sync(() => console.log('Unexpected:', value)),
    }),
  );

  yield* voltage.encode(15 as Voltage).pipe(
    Effect.matchEffect({
      onFailure: (error) => Effect.sync(() => console.log('Effect encode failed:', error.message)),
      onSuccess: (value) => Effect.sync(() => console.log('Unexpected wire:', value)),
    }),
  );
});

Effect.runSync(handleWithEffect);

// ── Sync API: catch thrown errors ──────────────────────────────

try {
  voltage.decodeSync(15_000);
} catch (error) {
  if (Schema.isSchemaError(error)) {
    console.log('Sync decode failed:', error.message);
  }
}

try {
  voltage.encodeSync(15 as Voltage);
} catch (error) {
  if (Schema.isSchemaError(error)) {
    console.log('Sync encode failed:', error.message);
  }
}

// ── Round-trip guarantee ───────────────────────────────────────

const roundTrip = Effect.gen(function* () {
  const wire = yield* voltage.encode(7.5 as Voltage);
  const decoded = yield* voltage.decode(wire);
  console.log('Round-trip:', decoded, 'V (wire:', wire, ')');
});

Effect.runSync(roundTrip);
