# @gabrielbryk/json-schema-to-zod

## 2.7.4

### Patch Changes

- 82aa953: Fix patternProperties validation under Zod v4 by preserving regex patterns and handling missing `ctx.path`.
- a501e7d: Adjust release workflow to rely on the default npm from setup-node and drop unused tokens.
- 43f2abc: Update object record generation to use `z.record(z.string(), …)` for Zod v4 compatibility.

## 2.7.3

### Patch Changes

- d727121: Fix internal logic; publish patched release.
