# @flux-control/modbus-schema

Device-independent Effect 4 schemas for 16-bit Modbus register values. Each factory returns an entry with Effect-based and synchronous operations. All factory wire values use unsigned `UInt16` words (0–65535). Signed scaled values use two's-complement conversion within those words. The package also exports an `Int16` schema for signed integers (-32768–32767).

For the complete API reference, see the [GitHub Pages documentation](https://flux-control-solutions.github.io/Modbus-Schema/).

> This project is under active development. Its API may change before the 1.0 release.

## Install

```sh
bun add @flux-control/modbus-schema
```

Requires `effect` v4 (`^4.0.0-rc.118`) as a peer dependency. Effect v4 is still a
release candidate; v3 is not supported, because v3 and v4 schemas do not
interoperate.

## Quick start

### Effect-native API

```ts
import { Effect } from 'effect';
import { makeScaledParam } from '@flux-control/modbus-schema';

const entry = makeScaledParam(0x0102, 0.1, {
  name: 'Maximum Output Frequency',
  unit: 'Hz',
  range: '4.8~599.0',
  default: '50.0',
});

const program = Effect.gen(function* () {
  const value = yield* entry.decode(500);
  console.log(value); // 50.0
  const wire = yield* entry.encode(60.0);
  console.log(wire); // 600
});

Effect.runSync(program);
```

### Synchronous API

```ts
import { makeScaledParam } from '@flux-control/modbus-schema';

const entry = makeScaledParam(0x0102, 0.1, {
  name: 'Maximum Output Frequency',
  unit: 'Hz',
  range: '4.8~599.0',
  default: '50.0',
});

const value = entry.decodeSync(500); // 50.0
const wire = entry.encodeSync(60.0); // 600
```

## Factory functions

Each factory returns a `ParamEntry` with `schema`, `decode`, `encode`, `decodeSync`, `encodeSync`, and `formatted`.
The Effect-based operations fail with `Schema.SchemaError`. The synchronous operations throw `Schema.SchemaError` on invalid input or failed encoding.
`decode` and `decodeSync` accept unknown input and validate the wire word. `formatted` is the schema's domain-value formatter.

| Factory                                                           | Description                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `makeParam(register, meta)`                                       | Validate and pass through a branded `UInt16` value          |
| `makeScaledParam(register, factor, meta, opts?)`                  | Decode as `raw * factor`; encode as `round(value / factor)` |
| `makeSignedScaledParam(register, factor, meta, opts?)`            | Apply scaling to a signed two's-complement word             |
| `makeEnumParam(register, labels, meta, opts?)`                    | Map known wire codes to string labels and back              |
| `makeBitfieldParam(register, flagsClass, bitLayout, meta, opts?)` | Map bit positions to boolean `Schema.Class` fields          |
| `makeLookupParam(register, labels, fallback, meta, opts?)`        | Decode codes with a fallback; encoding always fails         |
| `fromConfig(config)`                                              | Select a factory using `config.kind`                        |

### Scaling and domain validation

Pass a non-zero, finite `factor` to scaled factories. They do not validate the factor when you create an entry.
Both scaled factories multiply the decoded wire value by `factor`. Encoding rounds `value / factor` to a register word, so values between register steps lose precision.
Unsigned scaling checks the resulting word against `UInt16`. Signed scaling interprets words above 32767 as negative and checks the rounded signed word against -32768–32767 before encoding.
The optional `opts.domain` schema validates decoded and encoded domain values. Without it, the domain uses `Schema.Number`. The text in `meta.range` describes a range; it does not enforce one. Define a domain schema to enforce application limits.

### Enums, bitfields, and lookups

An enum must have at least one label. `makeEnumParam` throws during construction if `labels` is empty. An unknown wire code fails decoding. If several codes share a label, encoding selects the first matching code in `Object.entries(labels)` order.

For bitfields, supply a `Schema.Class` with boolean fields and a zero-based bit position for each field. Use positions 0–15; the factory does not validate each position. Gaps are allowed. The returned entry adds `patch`, a class with optional boolean fields, and `merge(base, patch)`. A missing or `undefined` patch field keeps the base flag.

Lookup entries use `fallback(raw)` for codes absent from `labels`. They are always read-only. A lookup can also accept `opts.domain` as its target schema.

Set `opts.readOnly: true` on scaled, signed scaled, enum, or bitfield factories to reject encoding. Bitfield entries still expose `patch` and `merge`. `makeParam` does not accept this option. A `UInt16ParamConfig` declares `readOnly`, but `fromConfig` does not apply it to `makeParam`.

### Declarative configuration and metadata

Use `ParamKind` with `fromConfig` to select a factory from a `ParamConfig`. A typed config returns the corresponding entry type. If an untyped runtime config has an unknown `kind`, `fromConfig` returns `undefined`.

`RegisterMeta` requires `name` and `unit`. Optional `default` appears in the schema description and displays `undefined` when omitted. Optional `range` appears for non-enum entries and displays `undefined` when omitted; enum descriptions do not include it. Extra metadata keys also appear as text. Read the description with `Schema.resolveAnnotations(entry.schema)?.description`.

See [examples](examples/) for complete programs:

- [Basic Effect and synchronous operations](examples/basic.ts)
- [Branded domain schemas](examples/branded-types.ts)
- [Configuration dispatch](examples/from-config.ts)
- [Bitfield patches](examples/bitfield-flags.ts)
- [Lookup fallback](examples/lookup-table.ts)
- [Register snapshots](examples/register-map.ts)
- [Error handling](examples/error-handling.ts)
- [Extended metadata](examples/extended-meta.ts)

## Development

| Action      | Command                      |
| ----------- | ---------------------------- |
| Install     | `bun install`                |
| Type-check  | `bun run typecheck`          |
| Test        | `bun run test`               |
| Run example | `bun run examples/<name>.ts` |
| Build       | `bun run build`              |

Tests import source files directly. Build before running examples, because they import the package through its `dist/` export.

## Source layout

```
index.ts                     — Re-exports all public API from src/
src/
  index.ts                   — Schema engine: factories, config types, fromConfig, wire primitives
  engine.test.ts             — Unit tests for all factories and sync APIs
examples/
  basic.ts                   — Effect + synchronous API usage
  branded-types.ts           — Domain brands with scaled/signed parameters
  from-config.ts             — Declarative ParamConfig dispatch via fromConfig
  bitfield-flags.ts          — Read-modify-write flag registers
  lookup-table.ts            — Decode-only fault/alarm code lookups
  register-map.ts            — Compose multiple entries into a typed snapshot
  error-handling.ts          — Parse error handling in Effect and sync APIs
  extended-meta.ts           — Add metadata to schema descriptions
```

## License

GPL-3.0
