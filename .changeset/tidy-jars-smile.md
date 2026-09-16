---
'@flux-control/modbus-schema': patch
---

Tighten the published types and reject an empty enum label map.

`makeEnumParam` now throws when `labels` is empty, rather than handing an empty
array to `Schema.Literals` and producing a parameter that can never decode. An
enum with no labels is a construction mistake, so it fails where it is written.

Three exported signatures changed shape, none of which affects a call site that
was already following the documented contract:

- `AnyBitfieldClass` now states both roles it has always required — a schema
  (the target of the internal `decodeTo`) and an instantiable class — instead of
  naming only the constructor and asserting the schema role back in.
- `makeBitfieldParam`'s `bitLayout` is keyed by `string & keyof InstanceType<F>`,
  matching the string-named fields the factory actually reads.
- `readOnlyEncodeFailure` is generic over the rejected value instead of taking
  `unknown`. It accepts everything it accepted before.

The rest of the release is internal: unchecked indexing and widening assertions
replaced with narrower types, and the assertions that remain now carry a comment
naming the invariant that makes them safe.
