#!/bin/bash
# Generate and typecheck workflow schema with inline object lifting enabled

# Create a temporary ESM script
cat > .tmp-wf-check-lift.ts << 'EOF'
import yaml from 'js-yaml';
import { readFileSync, writeFileSync } from 'fs';
import { jsonSchemaToZod } from './src/jsonSchemaToZod.js';

const schema = yaml.load(readFileSync('test/fixtures/workflow.yaml', 'utf8'));
const output = jsonSchemaToZod(schema, {
  name: 'workflowSchemaLifted',
  liftInlineObjects: { enable: true },
});
writeFileSync('.tmp-workflow-schema-output-lift.ts', output);
console.log('Generated .tmp-workflow-schema-output-lift.ts');
EOF

pnpm tsx .tmp-wf-check-lift.ts

echo ""
echo "Type-checking lifted..."
pnpm tsc --noEmit --module NodeNext --moduleResolution nodenext --target ES2022 --strict --skipLibCheck .tmp-workflow-schema-output-lift.ts
