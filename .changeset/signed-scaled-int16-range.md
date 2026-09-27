---
'@flux-control/modbus-schema': patch
---

Make `makeSignedScaledParam` fail to encode a value outside the signed 16-bit range.

Before this change, the encoder checked the word only against the `UInt16` range, 0 through 65535.
A rounded value from 32768 through 65535 encoded without change and decoded as a negative value.
A rounded value from -65535 through -32769 wrapped to a positive word.
Encode now fails with a `SchemaIssue.InvalidValue` when `value / factor` rounds to a word outside -32768 through 32767.
