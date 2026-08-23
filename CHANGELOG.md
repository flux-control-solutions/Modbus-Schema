# @flux-control/modbus-schema

## 0.2.1

### Patch Changes

- ed30964: Regenerate `bun.lock` as a standalone package, and add `bun run lock` to keep
  it that way. The lockfile is resolved in an isolated directory, so it records
  registry versions even when this repo is checked out inside a bun workspace,
  where an ordinary install writes only the workspace root's lockfile. A
  pre-commit check now refuses a dependency change that leaves the lockfile
  behind.

  No published code changes: the lockfile is not part of the package.

## 0.2.0

### Minor Changes

- ff2d404: Migrate to Effect v4 (`4.0.0-rc.109`).

  **This is a breaking change.** Effect v3 and v4 schemas do not interoperate, so
  consumers must move to v4 in the same step. Note that Effect v4 is still a
  release candidate.

  **Peer dependency:** `effect` is now `^4.0.0-rc.109` (was `^3.21.4`).

  **Factories now infer concrete schema types.** Previously every factory widened
  its result to `ParamEntry<Schema.Schema<A, number>>`. They now return the real
  inferred schema — `ParamEntry<Schema.decodeTo<…>>` — so domain brands, literal
  unions and typed constructors survive through `fromConfig`. Explicit value-type
  arguments must be dropped:

  ```ts
  // before
  makeScaledParam<FrequencyHz>(0x0102, 0.1, meta, { domain: FrequencyHz });
  // after — inferred from the domain schema
  makeScaledParam(0x0102, 0.1, meta, { domain: FrequencyHz });
  ```

  **Config types are generic over the domain schema, not the value type:**

  ```ts
  // before
  ScaledParamConfig<RegisterMeta, Voltage>;
  // after
  ScaledParamConfig<RegisterMeta, typeof Voltage>;
  ```

  **`makeParam` returns the branded `UInt16`.** Its phantom `<A, I>` type
  parameters are gone; encoding takes `UInt16.make(n)` rather than a plain number.

  **`readOnlyEncodeFailure` lost its third parameter.** v4 transformation
  callbacks no longer receive an AST, so the signature is now
  `(registerName, actual)`.

  **Errors are `Schema.SchemaError`** (was `ParseResult.ParseError`); narrow with
  `Schema.isSchemaError` (was `ParseResult.isParseError`).

  **Descriptions are read with `Schema.resolveAnnotations(entry.schema)`.**
  Annotations are now attached to the outermost schema and exposed as a plain
  object, replacing v3's symbol-keyed annotations that had to be found by walking
  the AST.

  Fixes two examples (`branded-types`, `register-map`) that passed raw negative
  values where Modbus delivers two's-complement unsigned words. They failed on v3
  as well.

## 0.1.2

### Patch Changes

- ef510c4: Fix the npm package export to load its published build artifacts.

## 0.1.1

### Patch Changes

- 32f4597: Exclude TypeScript source files from the published package.
