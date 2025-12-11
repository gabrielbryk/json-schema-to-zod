#!/bin/bash
# Quick script to generate and typecheck workflow schema

# Create a temporary ESM script
cat > .tmp-wf-check.ts << 'EOF'
import yaml from 'js-yaml';
import { readFileSync, writeFileSync } from 'fs';
import { jsonSchemaToZod } from './src/jsonSchemaToZod.js';

const schema = yaml.load(readFileSync('test/fixtures/workflow.yaml', 'utf8'));
const output = jsonSchemaToZod(schema, { name: 'workflowSchema' });
writeFileSync('.tmp-workflow-schema-output.ts', output);
console.log('Generated .tmp-workflow-schema-output.ts');
EOF

pnpm tsx .tmp-wf-check.ts

echo ""
echo "Type-checking..."
pnpm tsc --noEmit --module NodeNext --moduleResolution nodenext --target ES2022 --strict --skipLibCheck .tmp-workflow-schema-output.ts
