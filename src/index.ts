/**
 * @fileoverview Device-agnostic Modbus register schema factories and type definitions.
 *
 * Provides six schema factories ({@link makeParam}, {@link makeScaledParam},
 * {@link makeSignedScaledParam}, {@link makeEnumParam}, {@link makeBitfieldParam},
 * {@link makeLookupParam}) that produce decode/encode/format bundles from a
 * register address and metadata. The {@link fromConfig} overload selects the
 * correct factory based on the {@link ParamConfig} discriminant.
 *
 * Every factory returns a {@link ParamEntry} exposing both Effect-native
 * (`decode` / `encode`) and synchronous (`decodeSync` / `encodeSync`) operations,
 * so consumers are not required to run the Effect runtime.
 *
 * The engine is device-agnostic: it never names domain brands, register enums,
 * or device error types. Domain schemas are passed in via the `domain` field on
 * scaled/lookup configs; the read-only encoder is owned here so monitor registers
 * can share the same primitives as command registers.
 *
 * Factories return their *concrete* inferred schema type rather than widening to
 * `Schema.Codec<…>`, so brands, literal unions and typed constructors survive all
 * the way through {@link fromConfig}.
 *
 * @module
 */

import { Brand, Effect, Schema, SchemaIssue, SchemaTransformation } from 'effect';

// ── Wire primitives ─────────────────────────────────────────

/**
 * Branded 16-bit unsigned word for Modbus register values.
 */
export type UInt16 = number & Brand.Brand<'UInt16'>;

export const UInt16 = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(0xffff),
).pipe(Schema.brand('UInt16'));

/**
 * The schema type of {@link UInt16}. Every factory's wire side is this schema,
 * so it appears as the `From` parameter of the returned `Schema.decodeTo<…>`.
 */
export type UInt16Schema = typeof UInt16;

/**
 * Branded 16-bit signed word for Modbus register values.
 */
export type Int16 = number & Brand.Brand<'Int16'>;

export const Int16 = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(-0x8000),
  Schema.isLessThanOrEqualTo(0x7fff),
).pipe(Schema.brand('Int16'));

// ── Read-only encoder ──────────────────────────────────────

/**
 * Constructs a failure `Effect` for monitor registers that cannot be written.
 *
 * Monitor registers are read-only. Calling `encode()` on a read-only schema
 * fails with a `SchemaIssue.InvalidValue` whose message indicates the register
 * is read-only.
 *
 * @param registerName - Human-readable name of the register.
 * @param actual - The value that was passed during encode.
 */
export const readOnlyEncodeFailure = (registerName: string, actual: unknown) =>
  Effect.fail(new SchemaIssue.InvalidValue({ message: `${registerName} is read only` }, actual));

const bit = (n: number): number => 1 << n;

// ── Metadata ───────────────────────────────────────────────

/**
 * Generic, device-agnostic register metadata used by the engine's description
 * annotations. Extend this interface to add device-specific fields; any extra
 * keys not in {@link RegisterMeta} are rendered automatically in the schema
 * description (e.g. `code: "00-41"` becomes a "Code: 00-41" line).
 */
export interface RegisterMeta {
  readonly name: string;
  readonly unit: string;
  readonly range?: string;
  readonly default?: string;
  readonly description?: string;
}

const REGISTER_META_KEYS = new Set(['name', 'unit', 'range', 'default', 'description']);

const formatExtraLines = (meta: RegisterMeta): string[] => {
  const lines: string[] = [];
  for (const key of Object.keys(meta)) {
    if (!REGISTER_META_KEYS.has(key)) {
      const value = (meta as unknown as Record<string, unknown>)[key];
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      lines.push(`${label}: ${value}`);
    }
  }
  return lines;
};

const formatRegister = (register: number): string =>
  `0x${register.toString(16).toUpperCase().padStart(4, '0')}`;

const formatMeta = (register: number, meta: RegisterMeta): string =>
  [
    meta.name,
    `Register: ${formatRegister(register)}`,
    `Setting Range: ${meta.range}`,
    `Default: ${meta.default}`,
    `Unit: ${meta.unit}`,
    ...formatExtraLines(meta),
  ].join('\n');

const formatScaledMeta = (register: number, meta: RegisterMeta, factor: number): string =>
  [
    meta.name,
    `Register: ${formatRegister(register)}`,
    `Wire format: raw × ${factor}`,
    `Setting Range: ${meta.range}`,
    `Default: ${meta.default}`,
    `Unit: ${meta.unit}`,
    ...formatExtraLines(meta),
  ].join('\n');

const formatEnumMeta = (
  register: number,
  meta: RegisterMeta,
  labels: Record<number, string>,
): string =>
  [
    meta.name,
    `Register: ${formatRegister(register)}`,
    `Options:`,
    ...Object.entries(labels).map(([k, v]) => `  ${k} = ${v}`),
    `Default: ${meta.default}`,
    `Unit: ${meta.unit}`,
    ...formatExtraLines(meta),
  ].join('\n');

const formatBitfieldMeta = (register: number, meta: RegisterMeta): string =>
  formatMeta(register, meta);

const formatLookupMeta = (register: number, meta: RegisterMeta): string =>
  formatMeta(register, meta);

// ── Bundle entry type ───────────────────────────────────────

/**
 * A decode/encode/format bundle over a concrete schema `S`.
 *
 * Value and wire types are read straight off the schema via `S['Type']` and
 * `S['Encoded']`, so a branded or literal-union domain stays visible to callers.
 */
export type ParamEntry<S extends Schema.Codec<any, any>> = {
  readonly schema: S;
  readonly decode: (raw: unknown) => Effect.Effect<S['Type'], Schema.SchemaError>;
  readonly encode: (value: S['Type']) => Effect.Effect<S['Encoded'], Schema.SchemaError>;
  readonly formatted: (value: S['Type']) => string;
  readonly decodeSync: (raw: unknown) => S['Type'];
  readonly encodeSync: (value: S['Type']) => S['Encoded'];
};

/**
 * The decoded value type of a {@link ParamEntry}.
 */
export type ParamValueOfEntry<E extends ParamEntry<any>> =
  E extends ParamEntry<infer S> ? S['Type'] : never;

// ── Convenience helpers ────────────────────────────────────

const makeEntry = <S extends Schema.Codec<any, any>>(schema: S): ParamEntry<S> => ({
  schema,
  decode: Schema.decodeUnknownEffect(schema),
  encode: Schema.encodeEffect(schema),
  formatted: Schema.toFormatter(schema),
  decodeSync: Schema.decodeUnknownSync(schema),
  encodeSync: Schema.encodeSync(schema),
});

// ── ParamKind enum ─────────────────────────────────────────

/**
 * Identifies which schema factory created/would create the ParamEntry.
 */
export enum ParamKind {
  UInt16 = 'UInt16',
  Scaled = 'Scaled',
  SignedScaled = 'SignedScaled',
  Enum = 'Enum',
  Bitfield = 'Bitfield',
  Lookup = 'Lookup',
}

// ── Schema factories ──────────────────────────────────────

/**
 * Simple UInt16 pass-through parameter.
 * The wire value IS the parameter value (no scaling).
 */
export const makeParam = (register: number, meta: RegisterMeta): ParamEntry<UInt16Schema> =>
  makeEntry(UInt16.annotate({ description: formatMeta(register, meta) }));

/**
 * Scaled parameter where wire = domain / factor.
 *
 * Decode validates through the optional `domain` schema so out-of-range values
 * fail. Set `readOnly` to make encode fail with {@link readOnlyEncodeFailure}
 * (monitor registers).
 */
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
export function makeScaledParam(
  register: number,
  factor: number,
  meta: RegisterMeta,
  opts?: { readonly domain?: Schema.Codec<any, any>; readonly readOnly?: boolean },
): ParamEntry<any> {
  const domain = opts?.domain ?? Schema.Number;
  const readOnly = opts?.readOnly ?? false;
  return makeEntry(
    UInt16.pipe(
      Schema.decodeTo(
        domain,
        SchemaTransformation.transformOrFail<any, UInt16>({
          decode: (raw) => Effect.succeed(raw * factor),
          encode: readOnly
            ? (value) => readOnlyEncodeFailure(meta.name, value)
            : (value) => Effect.succeed(Math.round(value / factor) as UInt16),
        }),
      ),
    ).annotate({ description: formatScaledMeta(register, meta, factor) }),
  );
}

/**
 * Signed scaled parameter where wire = domain / factor, using UInt16 as the
 * wire-side schema with two's-complement conversion (Modbus delivers unsigned
 * 16-bit values). Decode validates through the optional `domain`.
 */
export function makeSignedScaledParam(
  register: number,
  factor: number,
  meta: RegisterMeta,
  opts?: { readonly readOnly?: boolean },
): ParamEntry<Schema.decodeTo<Schema.Number, UInt16Schema>>;
export function makeSignedScaledParam<D extends Schema.Codec<any, any>>(
  register: number,
  factor: number,
  meta: RegisterMeta,
  opts: { readonly domain: D; readonly readOnly?: boolean },
): ParamEntry<Schema.decodeTo<D, UInt16Schema>>;
export function makeSignedScaledParam(
  register: number,
  factor: number,
  meta: RegisterMeta,
  opts?: { readonly domain?: Schema.Codec<any, any>; readonly readOnly?: boolean },
): ParamEntry<any> {
  const domain = opts?.domain ?? Schema.Number;
  const readOnly = opts?.readOnly ?? false;
  return makeEntry(
    UInt16.pipe(
      Schema.decodeTo(
        domain,
        SchemaTransformation.transformOrFail<any, UInt16>({
          decode: (raw) => {
            const signed = raw > 0x7fff ? raw - 0x10000 : raw;
            return Effect.succeed(signed * factor);
          },
          encode: readOnly
            ? (value) => readOnlyEncodeFailure(meta.name, value)
            : (value) => {
                const raw = Math.round(value / factor);
                const unsigned = raw < 0 ? raw + 0x10000 : raw;
                return Effect.succeed(unsigned as UInt16);
              },
        }),
      ),
    ).annotate({ description: formatScaledMeta(register, meta, factor) }),
  );
}

/**
 * Enum selection parameter.
 * Maps wire integers to human-readable labels and back.
 */
export const makeEnumParam = <Domain extends string>(
  register: number,
  labels: Record<number, Domain>,
  meta: RegisterMeta,
  opts?: { readonly readOnly?: boolean },
): ParamEntry<Schema.decodeTo<Schema.Literals<[Domain, ...Domain[]]>, UInt16Schema>> => {
  const values = [...new Set(Object.values(labels))] as [Domain, ...Domain[]];
  const readOnly = opts?.readOnly ?? false;
  return makeEntry(
    UInt16.pipe(
      Schema.decodeTo(
        Schema.Literals(values),
        SchemaTransformation.transformOrFail<Domain, UInt16>({
          decode: (raw) => {
            const label = labels[raw as number];
            return label !== undefined
              ? Effect.succeed(label)
              : Effect.fail(
                  new SchemaIssue.InvalidValue(
                    { message: `Unknown enum value ${raw} for ${meta.name}` },
                    raw,
                  ),
                );
          },
          encode: readOnly
            ? (value) => readOnlyEncodeFailure(meta.name, value)
            : (value) => {
                const entry = Object.entries(labels).find(([, v]) => v === value);
                return entry
                  ? Effect.succeed(Number(entry[0]) as UInt16)
                  : Effect.fail(
                      new SchemaIssue.InvalidValue(
                        { message: `Invalid value "${value}" for ${meta.name}` },
                        value,
                      ),
                    );
              },
        }),
      ),
    ).annotate({
      description: formatEnumMeta(register, meta, labels as Record<number, string>),
    }),
  ) as ParamEntry<Schema.decodeTo<Schema.Literals<[Domain, ...Domain[]]>, UInt16Schema>>;
};

// ── Bitfield factory ──────────────────────────────────────

/**
 * Minimal structural shape the bitfield factory needs from a
 * {@link Schema.Class}-derived class: it is both a schema (so it can serve as
 * the target of a `decodeTo`) and an instantiable class.
 */
export type AnyBitfieldClass = new (fields: any) => any;

/**
 * Constructor shape produced for the generated patch class. Allows `new`
 * construction with a partial record of booleans.
 */
export type AnyPatchClass = new (props?: Partial<{ readonly [k: string]: boolean }>) => any;

/**
 * The schema a bitfield factory produces: a UInt16 wire word decoded into the
 * flags class instance.
 */
export type BitfieldSchema<F extends AnyBitfieldClass> = Schema.decodeTo<
  Schema.Codec<InstanceType<F>, InstanceType<F>>,
  UInt16Schema
>;

/**
 * A bitfield entry adds a generated `patch` schema (all-optional booleans) and
 * a `merge` function for read-modify-write semantics.
 */
export type BitfieldParamEntry<F extends AnyBitfieldClass> = ParamEntry<BitfieldSchema<F>> & {
  readonly patch: AnyPatchClass;
  readonly merge: (
    base: InstanceType<F>,
    patch: Readonly<Record<string, boolean | undefined>>,
  ) => InstanceType<F>;
};

/**
 * Bitfield parameter: maps a 16-bit wire word to/from a boolean-flag
 * {@link Schema.Class}. Honors arbitrary bit positions (gaps allowed).
 *
 * For writable registers, the factory also generates a `Patch` schema
 * (all-optional booleans over the same keys) and a `merge` function suitable
 * for read-modify-write semantics — the device keeps the original `Schema.Class`
 * so its intent constructors (`CommandWordFlags.runForward`, etc.) survive.
 *
 * Pass `readOnly: true` for monitor registers; the encode path then fails with
 * {@link readOnlyEncodeFailure} and patch/merge remain available but unused.
 */
export const makeBitfieldParam = <F extends AnyBitfieldClass>(
  register: number,
  flagsClass: F,
  bitLayout: Record<keyof InstanceType<F>, number>,
  meta: RegisterMeta,
  opts?: { readonly readOnly?: boolean },
): BitfieldParamEntry<F> => {
  const readOnly = opts?.readOnly ?? false;
  const keys = Object.keys(bitLayout) as Array<keyof InstanceType<F>>;
  const layout = bitLayout as unknown as Record<string, number>;
  type Flags = InstanceType<F>;

  const schema = UInt16.pipe(
    Schema.decodeTo(
      flagsClass as unknown as Schema.Codec<Flags, Flags>,
      SchemaTransformation.transformOrFail<Flags, UInt16>({
        decode: (word) =>
          Effect.succeed(
            new (flagsClass as unknown as new (f: Record<string, boolean>) => Flags)(
              Object.fromEntries(keys.map((k) => [k, (word & bit(layout[k as string]!)) !== 0])),
            ),
          ),
        encode: readOnly
          ? (value) => readOnlyEncodeFailure(meta.name, value)
          : (value) => {
              let word = 0;
              for (const k of keys) {
                if ((value as any)[k]) word |= bit(layout[k as string]!);
              }
              return Number.isInteger(word) && word >= 0 && word <= 0xffff
                ? Effect.succeed(word as UInt16)
                : Effect.fail(
                    new SchemaIssue.InvalidValue(
                      { message: `${meta.name} is out of UInt16 range` },
                      value,
                    ),
                  );
            },
      }),
    ),
  ).annotate({ description: formatBitfieldMeta(register, meta) }) as BitfieldSchema<F>;

  const patchFields: Record<string, Schema.Struct.Fields[string]> = {};
  for (const k of keys) patchFields[k as string] = Schema.optional(Schema.Boolean);
  const patchIdentifier = `${(flagsClass as { name?: string }).name ?? 'Bitfield'}Patch`;
  const patchSchema = Schema.Class<any>(patchIdentifier)(
    patchFields as unknown as Schema.Struct.Fields,
  ) as unknown as AnyPatchClass;

  const merge = (base: Flags, patchObj: Readonly<Record<string, boolean | undefined>>): Flags => {
    const fields: Record<string, boolean> = {};
    for (const k of keys) {
      const p = patchObj[k as string];
      fields[k as string] = p === undefined ? (base as any)[k] : p;
    }
    return new (flagsClass as unknown as new (f: Record<string, boolean>) => Flags)(fields);
  };

  return {
    ...makeEntry(schema),
    patch: patchSchema,
    merge,
  } as BitfieldParamEntry<F>;
};

// ── Lookup factory ────────────────────────────────────────

/**
 * The schema a lookup factory produces.
 *
 * The runtime target is `Schema.String` (or the supplied `domain`), but decoded
 * values are `Domain` by construction — both the `labels` table and `fallback`
 * produce `Domain`. This is the one place the engine states a `Schema.Codec<…>`
 * explicitly rather than inferring, because no runtime schema captures the
 * "labels ∪ fallback results" set.
 */
export type LookupSchema<Domain extends string> = Schema.decodeTo<
  Schema.Codec<Domain, string>,
  UInt16Schema
>;

/**
 * Lookup parameter: maps a wire integer → `Domain` string via a fixed `labels`
 * table, routing unknown codes through a `fallback`. Inherently decode-only
 * (encode always fails with {@link readOnlyEncodeFailure}); use for monitor
 * registers that report fault/alarm/model codes as human-readable text.
 */
export const makeLookupParam = <Domain extends string>(
  register: number,
  labels: Record<number, Domain>,
  fallback: (raw: number) => Domain,
  meta: RegisterMeta,
  opts?: { readonly domain?: Schema.Codec<Domain, any, any, any> },
): ParamEntry<LookupSchema<Domain>> => {
  const domain = opts?.domain ?? Schema.String;
  return makeEntry(
    UInt16.pipe(
      Schema.decodeTo(
        domain,
        SchemaTransformation.transformOrFail<any, UInt16>({
          decode: (raw) => Effect.succeed(labels[raw] ?? fallback(raw)),
          encode: (value) => readOnlyEncodeFailure(meta.name, value),
        }),
      ),
    ).annotate({ description: formatLookupMeta(register, meta) }) as LookupSchema<Domain>,
  );
};

// ── Config object types ──────────────────────────────────────

/**
 * Base shared by all config variants.
 */
export interface ConfigBase<R extends RegisterMeta = RegisterMeta> {
  readonly register: number;
  readonly kind: ParamKind;
  readonly meta: R;
}

export interface UInt16ParamConfig<R extends RegisterMeta = RegisterMeta> extends ConfigBase<R> {
  readonly kind: ParamKind.UInt16;
  readonly readOnly?: boolean;
}

export interface ScaledParamConfig<
  R extends RegisterMeta = RegisterMeta,
  D extends Schema.Codec<any, any> = Schema.Number,
> extends ConfigBase<R> {
  readonly kind: ParamKind.Scaled;
  readonly factor: number;
  readonly domain?: D;
  readonly readOnly?: boolean;
}

export interface SignedScaledParamConfig<
  R extends RegisterMeta = RegisterMeta,
  D extends Schema.Codec<any, any> = Schema.Number,
> extends ConfigBase<R> {
  readonly kind: ParamKind.SignedScaled;
  readonly factor: number;
  readonly domain?: D;
  readonly readOnly?: boolean;
}

export interface EnumParamConfig<
  R extends RegisterMeta = RegisterMeta,
  Domain extends string = string,
> extends ConfigBase<R> {
  readonly kind: ParamKind.Enum;
  readonly labels: Record<number, Domain>;
  readonly readOnly?: boolean;
}

export interface BitfieldParamConfig<
  R extends RegisterMeta = RegisterMeta,
  F extends AnyBitfieldClass = AnyBitfieldClass,
> extends ConfigBase<R> {
  readonly kind: ParamKind.Bitfield;
  readonly flagsClass: F;
  readonly bitLayout: Record<keyof InstanceType<F>, number>;
  readonly readOnly?: boolean;
}

export interface LookupParamConfig<
  R extends RegisterMeta = RegisterMeta,
  Domain extends string = string,
> extends ConfigBase<R> {
  readonly kind: ParamKind.Lookup;
  readonly labels: Record<number, Domain>;
  readonly fallback: (raw: number) => Domain;
  readonly domain?: Schema.Codec<Domain, any, any, any>;
}

export type ParamConfig<R extends RegisterMeta = RegisterMeta> =
  | UInt16ParamConfig<R>
  | ScaledParamConfig<R, any>
  | SignedScaledParamConfig<R, any>
  | EnumParamConfig<R, any>
  | BitfieldParamConfig<R, any>
  | LookupParamConfig<R, any>;

/**
 * Maps a {@link ParamConfig} to the {@link ParamEntry} {@link fromConfig} returns
 * for it, preserving the concrete schema type.
 *
 * The scaled branches discriminate on the *presence* of `domain` rather than
 * using `infer D` against the optional property: inferring from an absent
 * optional property yields the constraint (`Schema.Codec<any, any>`), not the
 * declared default, which would silently degrade the value type to `any`.
 */
export type ParamEntryOfConfig<C extends ParamConfig<any>> = C extends {
  readonly kind: ParamKind.Scaled | ParamKind.SignedScaled;
}
  ? C extends { readonly domain: infer D extends Schema.Codec<any, any> }
    ? ParamEntry<Schema.decodeTo<D, UInt16Schema>>
    : ParamEntry<Schema.decodeTo<Schema.Number, UInt16Schema>>
  : C extends EnumParamConfig<any, infer Domain>
    ? ParamEntry<Schema.decodeTo<Schema.Literals<[Domain, ...Domain[]]>, UInt16Schema>>
    : C extends BitfieldParamConfig<any, infer F>
      ? BitfieldParamEntry<F & AnyBitfieldClass>
      : C extends LookupParamConfig<any, infer Domain>
        ? ParamEntry<LookupSchema<Domain>>
        : ParamEntry<UInt16Schema>;

// ── fromConfig dispatch ──────────────────────────────────────

export function fromConfig<C extends ParamConfig<any>>(config: C): ParamEntryOfConfig<C>;
export function fromConfig(config: ParamConfig<any>): unknown {
  switch (config.kind) {
    case ParamKind.UInt16:
      return makeParam(config.register, config.meta);
    case ParamKind.Scaled:
      return config.domain
        ? makeScaledParam(config.register, config.factor, config.meta, {
            domain: config.domain,
            readOnly: config.readOnly,
          })
        : makeScaledParam(config.register, config.factor, config.meta, {
            readOnly: config.readOnly,
          });
    case ParamKind.SignedScaled:
      return config.domain
        ? makeSignedScaledParam(config.register, config.factor, config.meta, {
            domain: config.domain,
            readOnly: config.readOnly,
          })
        : makeSignedScaledParam(config.register, config.factor, config.meta, {
            readOnly: config.readOnly,
          });
    case ParamKind.Enum:
      return makeEnumParam(config.register, config.labels, config.meta, {
        readOnly: config.readOnly,
      });
    case ParamKind.Bitfield:
      return makeBitfieldParam(config.register, config.flagsClass, config.bitLayout, config.meta, {
        readOnly: config.readOnly,
      });
    case ParamKind.Lookup:
      return makeLookupParam(config.register, config.labels, config.fallback, config.meta, {
        domain: config.domain,
      });
    default:
      return undefined;
  }
}
