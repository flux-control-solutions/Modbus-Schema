/**
 * Demonstrates extending {@link RegisterMeta} with device-specific fields.
 *
 * Extra keys beyond RegisterMeta's fields are rendered automatically in the
 * schema description (see `formatExtraLines`). Works with both direct factory
 * calls and the declarative {@link fromConfig} dispatch.
 *
 * @example bun run examples/extended-meta.ts
 */

import { Schema } from 'effect';

import {
  ParamKind,
  type RegisterMeta,
  makeScaledParam,
  fromConfig,
  type ParamConfig,
} from '../index';

// ── Extended metadata ─────────────────────────────────────────

interface DeviceMeta extends RegisterMeta {
  readonly code: string;
  readonly group: number;
  readonly page: number;
}

// ── Params with extended meta ─────────────────────────────────

const meta: DeviceMeta = {
  code: '03-47',
  name: 'PID Feedback Gain',
  range: '0.00–100.00',
  default: '1.00',
  unit: '%',
  group: 3,
  page: 431,
};

const device: ParamConfig = {
  register: 0x0347,
  factor: 0.01,
  meta,
  kind: ParamKind.Scaled,
};

const pidGain = makeScaledParam(device.register, device.factor, device.meta);

console.log('Decoded value:', pidGain.decodeSync(5000)); // 50
console.log('Encoded wire:', pidGain.encodeSync(75.25)); // 7525

// Extra fields (code, group, page) are rendered in the schema description.
// v4 exposes annotations as a plain object, so no AST walking is needed.
console.log('\nSchema description:');
console.log(Schema.resolveAnnotations(pidGain.schema)?.description);

// ── Also works with fromConfig ────────────────────────────────

const entry = fromConfig({
  register: 0x0347,
  kind: ParamKind.Scaled,
  factor: 0.01,
  meta,
});

if (entry) {
  console.log('\nfromConfig decode:', (entry as typeof pidGain).decodeSync(3000));
}
