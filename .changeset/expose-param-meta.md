---
'@flux-control/modbus-schema': minor
---

Expose the register facts on every `ParamEntry`.

Each entry now has `register`, `meta`, and `description`. `description` is the same text as the schema `description` annotation. The factories and `fromConfig` keep the literal types of a metadata literal, so an editor shows the register metadata on hover. `ParamEntry` and `BitfieldParamEntry` have a new optional type parameter for the metadata type. It defaults to `RegisterMeta`.
