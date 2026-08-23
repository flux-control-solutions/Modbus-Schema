# Effect v3 → v4 migration

Status: **applied.** Branch `v4`, against `effect@4.0.0-rc.109`. This document is
both the record of the investigation and the reference for the migration that was
carried out.

Verified after porting: `bun run typecheck` clean, 46/46 tests pass, all 8
examples run, `oxlint` and `oxfmt` clean, `bun run build` emits declarations.

## Verdict

There were no blockers, no removed capabilities, and no behaviour changes in the
decode/encode paths. The `effect` upgrade itself was a rename pass plus one
structural change (`transformOrFail` → `decodeTo`), across ~570 lines.

Riding along with it is a deliberate **type-level redesign**: factories and
config types now infer concrete schema types instead of widening to
`Schema.Codec<…>` (§3). That was the larger part of the work and it reshaped
every factory signature and every `ParamConfig` interface.

The remaining cost is not in this package — it is the ecosystem coordination
described in [Blast radius](#blast-radius). **`Effect-modbus-rs` and
`Effect-Teco-Westinghouse-Inverter` have not been migrated and are now
incompatible with this branch.**

## Version landscape

|                            |                                                       |
| -------------------------- | ----------------------------------------------------- |
| `effect` current           | `3.21.4` (peer + dev)                                 |
| `effect` v4 latest         | `4.0.0-rc.109` (`rc` tag); `4.0.0-beta.107` on `beta` |
| `effect` stable            | `3.22.1` — **v4 has not shipped stable yet**          |
| `@effect/language-service` | `0.86.3` → `0.87.2` available, declares no peer range |

v4 is at release candidate, not GA. Everything below works today, but the API
can still move before `4.0.0` final.

`Schema` is a **stable** top-level module in v4 (`effect/Schema`) — it is not
behind `effect/unstable/*`. The top-level `MIGRATION.md` lists `schema` among
unstable modules; that is stale. Only `Model` and `VariantSchema` live under
`effect/unstable/schema`.

## Rename map for this package

Everything this package touches, in one table.

| v3                                                              | v4                                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `import { ParseResult, Pretty }`                                | `import { SchemaIssue, SchemaTransformation }` — `ParseResult` and `Pretty` are gone   |
| `Schema.Schema<A, I, R>`                                        | `Schema.Codec<T, E, RD, RE>` — decode and encode requirements are now separate         |
| `.pipe(Schema.int(), ...)`                                      | `.check(Schema.isInt(), ...)` — `check` is variadic                                    |
| `Schema.int()`                                                  | `Schema.isInt()`                                                                       |
| `Schema.nonNegative()`                                          | **removed** → `Schema.isGreaterThanOrEqualTo(0)`                                       |
| `Schema.greaterThanOrEqualTo(n)`                                | `Schema.isGreaterThanOrEqualTo(n)`                                                     |
| `Schema.lessThanOrEqualTo(n)`                                   | `Schema.isLessThanOrEqualTo(n)`                                                        |
| `Schema.annotations({ ... })`                                   | `.annotate({ ... })`                                                                   |
| `Schema.transformOrFail(to, { decode, encode, strict: false })` | `.pipe(Schema.decodeTo(to, SchemaTransformation.transformOrFail({ decode, encode })))` |
| `ParseResult.succeed` / `ParseResult.fail`                      | `Effect.succeed` / `Effect.fail`                                                       |
| `new ParseResult.Type(ast, actual, msg)`                        | `new SchemaIssue.InvalidValue({ message: msg }, actual)`                               |
| `ParseResult.ParseError`                                        | `Schema.SchemaError`                                                                   |
| `ParseResult.isParseError`                                      | `Schema.isSchemaError`                                                                 |
| `Schema.decodeUnknown`                                          | `Schema.decodeUnknownEffect`                                                           |
| `Schema.encode`                                                 | `Schema.encodeEffect`                                                                  |
| `Pretty.make(schema)`                                           | `Schema.toFormatter(schema)` — returns a callable `Formatter<T>`, drop-in              |
| `Schema.Literal(...values)`                                     | `Schema.Literals(values)` — variadic to array                                          |
| `Schema.Struct.Field`                                           | `Schema.Struct.Fields[string]`                                                         |
| `Effect.either` (tests)                                         | `Effect.result` — `Either` is now `Result`                                             |

Unchanged: `Schema.brand`, `Schema.Class<Self>(id)(fields)`, `Schema.optional`,
`Schema.decodeUnknownSync`, `Schema.encodeSync`, `Schema.Number`,
`Schema.Boolean`, `Brand.Brand`, `Effect.gen` / `runSync` / `sync` /
`matchEffect` / `flip`.

## Structural changes

### 1. `transformOrFail` loses its `ast` argument — public API break

v3 callbacks receive `(input, options, ast)`. v4 getters receive
`(input, options)` only; issues no longer carry an AST. This changes the
signature of the package's own exported helper:

```ts
// v3
export const readOnlyEncodeFailure = (
  registerName: string,
  actual: unknown,
  ast: ConstructorParameters<typeof ParseResult.Type>[0],
) => Effect.fail(new ParseResult.Type(ast, actual, `${registerName} is read only`));

// v4
export const readOnlyEncodeFailure = (registerName: string, actual: unknown) =>
  Effect.fail(new SchemaIssue.InvalidValue({ message: `${registerName} is read only` }, actual));
```

`readOnlyEncodeFailure` is exported, so this is a breaking change for consumers
regardless of the `effect` bump.

### 2. `strict: false` no longer exists

v4 getters are plainly typed — there is no strictness escape hatch. In practice
this is an improvement: the transformation type parameters are explicit
(`transformOrFail<Domain, UInt16>`), so several `strict: false` workarounds
disappear. The outer `as unknown as Schema.Codec<A, number>` casts that widen
each factory's return type still remain.

### 3. Schema typing — DECIDED: full inference everywhere

The v4 guide says to use `Top` / `Schema` / `Codec` as _constraints_, never as
annotations or return types, because widening to `Codec<...>` resets internal
type parameters. v3's public surface did exactly that
(`ParamEntry<Schema.Schema<A, number>>` on every factory).

**Decision: drop the widening annotations and casts. Factories, config types,
and `fromConfig` all infer the concrete schema type.** Prototyped and validated
end-to-end (see [Prototype results](#prototype-results)).

What the widening actually cost, measured: `.annotate()`, `.check()`, `.ast`,
and every decode/encode path behave identically either way. The single
degradation is the constructor — `.schema.make` goes from `(input: number)` to
`(input: unknown)`. Published `.d.ts` output stays readable under inference,
because v4's type-level API is nameable by design:

```ts
export declare const freq: Schema.decodeTo<
  Schema.brand<Schema.Number, 'Hz'>,
  Schema.brand<Schema.Number, 'UInt16'>,
  never,
  never
>;
```

Three patterns carry the design:

**a. `ParamEntry<S>` keyed off `S['Type']` / `S['Encoded']`.** The
`SchemaType<S>` / `SchemaEncoded<S>` conditional-type helpers are deleted —
v4 schemas expose these directly.

```ts
export type ParamEntry<S extends Schema.Codec<any, any>> = {
  readonly schema: S;
  readonly decode: (raw: unknown) => Effect.Effect<S['Type'], Schema.SchemaError>;
  readonly encode: (value: S['Type']) => Effect.Effect<S['Encoded'], Schema.SchemaError>;
  readonly formatted: (value: S['Type']) => string;
  readonly decodeSync: (raw: unknown) => S['Type'];
  readonly encodeSync: (value: S['Type']) => S['Encoded'];
};
```

**b. Overloads on factories with an optional `domain`.** A single signature with
`domain?: D` collapses inference into a union once the `?? Schema.Number`
default is applied. Two overloads keep both paths precise:

```ts
export function makeScaledParam(
  register: number,
  factor: number,
  meta: RegisterMeta,
  opts?: { readonly readOnly?: boolean },
): ParamEntry<Schema.decodeTo<Schema.Number, UInt16Schema>>;
export function makeScaledParam<D extends Schema.Codec<any, any>>(
  register: number,
  factor: number,
  meta: RegisterMeta,
  opts: { readonly domain: D; readonly readOnly?: boolean },
): ParamEntry<Schema.decodeTo<D, UInt16Schema>>;
```

**c. Config types generic over the domain _schema_, not the value type.**
`ScaledParamConfig<R, A>` becomes `ScaledParamConfig<R, D extends Schema.Codec<any, any> = Schema.Number>`
with `readonly domain?: D`.

**Gotcha found in prototyping:** `infer D` against an _optional_ property yields
the constraint (`Codec<any, any>`), **not** the declared default — so a `Scaled`
config with no `domain` silently degrades to `any`, which is worse than the
status quo. `ParamEntryOfConfig` must discriminate on the _presence_ of the key:

```ts
export type ParamEntryOfConfig<C extends ParamConfig<any>> =
  C extends { readonly kind: ParamKind.Scaled }
    ? C extends { readonly domain: infer D extends Schema.Codec<any, any> }
      ? ParamEntry<Schema.decodeTo<D, UInt16Schema>>
      : ParamEntry<Schema.decodeTo<Schema.Number, UInt16Schema>>
    : /* ...Enum, Bitfield, Lookup, UInt16... */;
```

**Also:** `makeParam`'s phantom `<A extends number, I extends number>` generics
disappear — they only existed to let callers cast. Verified no call site in this
repo or the Teco package passes explicit type arguments.

### Prototype results

Built against `effect@4.0.0-rc.109`, checked with `--declaration` emit and run:

| Config                       | Inferred entry schema                                             |
| ---------------------------- | ----------------------------------------------------------------- |
| `kind: UInt16`               | `Schema.brand<Schema.Number, "UInt16">`                           |
| `kind: Scaled`, no domain    | `Schema.decodeTo<Schema.Number, brand<Number,"UInt16">>`          |
| `kind: Scaled`, `domain: Hz` | `Schema.decodeTo<brand<Number,"Hz">, brand<Number,"UInt16">>`     |
| `kind: Enum`                 | `Schema.decodeTo<Schema.Literals<readonly ("Stop"\|"Run")[]>, …>` |

The `Hz` brand and the `"Stop" | "Run"` literal union both survive the
`fromConfig` dispatch, and `.schema.make` types as `(input: number) => Hz`.
Runtime output matches v3 for every case.

### Consumer impact

Smaller than it looks, because of how the device package writes its configs:

- It uses `as const satisfies Record<string, ParamConfig<InverterRegisterMeta>>`,
  **not** a type annotation. `satisfies` preserves the literal's narrow type, so
  inference flows through `fromConfig` unchanged. A plain annotation would have
  erased it and defeated the whole exercise.
- Only **16** `domain:` occurrences across ~850 config objects. Every
  domain-less config is handled by the generic default and needs no edit.
- `TecoInverterService.ts` wraps dispatch in `<C extends ParamConfig>(config: C)`.
  A constraint does not erase inference — `C` still binds to the narrow argument
  type — so this keeps working.

## Behaviour verified in the spike

| Case                                                       | Result                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| Scaled decode `6000` → `60`, encode `60` → `6000`          | identical to v3                                                          |
| Out-of-range wire value `70000`                            | throws, `Expected a value less than or equal to 65535`                   |
| `readOnly` encode                                          | `Failure(Cause([Fail(SchemaError(<name> is read only))]))`               |
| Enum decode/encode + unknown code message                  | identical to v3                                                          |
| Bitfield decode / encode / `merge` / generated patch class | identical to v3                                                          |
| Brands (`UInt16`, `Int16`)                                 | intact                                                                   |
| `decodeSync` throw shape                                   | throws `Schema.SchemaError` carrying `.issue` — 1:1 with v3 `ParseError` |

## Found during the port

Four things the up-front investigation did not predict.

### Annotations moved to the outermost schema

v3 annotated the `UInt16` wire schema, and both the tests and the
`extended-meta` example recovered the description by **recursively walking the
AST for a symbol-keyed annotation**. In v4 that returns nothing: annotations are
a plain object, and for a transforming schema the wire-side annotation is not
reachable from a top-level lookup.

All five transforming factories now annotate the schema produced by `decodeTo`
rather than the `UInt16` it starts from, so descriptions resolve uniformly:

```ts
Schema.resolveAnnotations(entry.schema)?.description;
```

This replaces ~18 lines of AST recursion in both the test helper and the
example. `makeParam` needed no change — `resolveAnnotations` merges the schema's
own annotations with its last check's.

### `makeParam` now decodes to a branded `UInt16`

Dropping the phantom `<A extends number, I extends number>` generics means the
brand is no longer castable away at the call site. `encodeSync` takes
`UInt16.make(n)` instead of a plain `number`. This is the honest type — v3 only
appeared to accept plain numbers because callers cast.

### `Result` is no longer an `Effect` subtype

The v3 `error-handling` example did `yield* Effect.either(...)` and then piped
the resulting `Either` straight into `Effect.matchEffect`, relying on v3's Effect
subtyping. In v4 (the yieldable change) `Result` does not compose that way. The
fix is simpler than the original — match directly on the effect:

```ts
yield * voltage.decode(1500).pipe(Effect.matchEffect({ onFailure, onSuccess }));
```

### Two examples were already broken on `main`

`branded-types` and `register-map` passed raw negative wire values (`-4096`,
`-8192`, `-500`) to signed-scaled parameters. Modbus delivers unsigned 16-bit
words, so these are rejected by the `UInt16` wire schema — **and they fail on v3
too**, which was confirmed against `effect@3.21.4` before changing them. They now
use the two's-complement forms (`61440`, `57344`, `65036`), matching the values
the test suite already used. Unrelated to v4.

## Blast radius

`Schema` instances from v3 and v4 do not interoperate — different AST, different
type hierarchy. There is no incremental path where one package in the workspace
is on v4 and another is on v3.

- `Effect-Teco-Westinghouse-Inverter` depends on `@flux-control/modbus-schema@^0.1.2`
  **and** `@flux-control/effect-modbus-rs@^0.3.0`, and pins `effect ^3.21.4`.
- `Effect-modbus-rs` pins `effect ^3.22.0`.

So migrating this package alone strands the inverter package. The three move
together or not at all.

Also required here: bump `peerDependencies.effect` from `^3.21.4` to the v4
range. That is a breaking change for published consumers — version it as
`0.2.0` (or `1.0.0` if you want to signal the v4 line explicitly), and note in
the changeset that v4 is still an RC.

## Recommended sequence

Done on this branch:

1. ~~Decide the `ParamEntry` / `Codec` typing question~~ — settled: full
   inference (§3).
2. ~~Port `src/index.ts`~~ — rename map applied, inferred return types throughout.
3. ~~Port `src/engine.test.ts`~~ — 46/46 pass.
4. ~~Port `examples/`~~ — all 8 run.
5. ~~Update `AGENTS.md` and `README.md`~~.
6. ~~Bump `effect` (peer + dev) and `@effect/language-service` to `0.87.2`~~.
7. ~~Add changeset~~ — `.changeset/effect-v4-migration.md`, `minor` (0.1.2 →
   0.2.0). Change to `major` if you would rather signal the v4 line as 1.0.0.

Still open:

8. **Migrate `Effect-modbus-rs` and `Effect-Teco-Westinghouse-Inverter`.** They
   are still on v3 and cannot consume this branch. See
   [Blast radius](#blast-radius).
9. **Decide whether to publish before `effect@4.0.0` is stable.** Nothing
   technical blocks it; it is a question of churn against a moving RC. The
   changeset says so explicitly.

## Reference

- Guide index: <https://github.com/Effect-TS/effect/blob/main/MIGRATION.md>
- Schema specifics: <https://github.com/Effect-TS/effect/blob/main/migration/schema.md>
- Full v4 Schema manual: `packages/effect/SCHEMA.md` in the Effect repo
- The installed package ships its own agent docs at
  `node_modules/effect/ai-docs/` and `node_modules/effect/CLAUDE.md`
