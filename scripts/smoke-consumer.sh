#!/usr/bin/env bash
set -euo pipefail

# Pack the built dist into a tarball
TARBALL=$(pnpm pack --pack-destination /tmp 2>/dev/null | tail -1)

# Install it in a clean directory with only production deps
SMOKE_DIR=$(mktemp -d)
cd "$SMOKE_DIR"
npm install --omit=dev "$TARBALL" 2>/dev/null

# Verify the library and its runtime deps actually load
node --input-type=module <<'EOF'
import { jsonSchemaToZod } from "@gabrielbryk/json-schema-to-zod";
const result = jsonSchemaToZod({ type: "object", properties: { name: { type: "string" } } });
if (!result.includes("z.looseObject")) throw new Error("Unexpected output: " + result);
console.log("Consumer smoke test passed");
EOF
