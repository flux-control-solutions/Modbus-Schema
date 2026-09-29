---
'@flux-control/modbus-schema': minor
---

Move to `effect` 4.0.0-rc.118. The `effect` peer dependency is now `^4.0.0-rc.118`.

The schema factories now use `SchemaTransformation.transformEffect`. The `effect` 4.0.0-rc.118 release removes `SchemaTransformation.transformOrFail`. The public API of this package does not change.
