import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { extname, join } from "path";
import yaml from "js-yaml";
import jsonSchemaToZod from "../src/index.js";
import { JsonSchema } from "../src/Types.js";
import { suite } from "./suite.js";

type Fixture = {
  filePath: string;
  exportName: string;
  validData?: unknown;
  invalidData?: unknown;
};

const orderValidPayload = {
  orderId: "ORDER-1234",
  status: "pending",
  customer: {
    id: "123e4567-e89b-12d3-a456-426614174000",
    email: "customer@example.com",
    address: {
      line1: "123 Main St",
      city: "NYC",
      country: "US",
      postalCode: null,
    },
  },
  items: [
    { sku: "SKU-1", quantity: 1, price: 19.99 },
    { sku: "SKU-2", quantity: 2, price: 9.5 },
  ],
  notes: "Leave at the back door",
  tags: ["gift", "priority"],
  metadata: { priority: "high", retries: 1, ack: true, alt: null },
};

const orderInvalidPayload = {
  orderId: "order-1", // fails pattern
  status: "unknown", // not in enum
  customer: {
    id: "not-a-uuid",
    email: "not-an-email",
  },
  items: [], // minItems
  tags: ["dup", "dup"], // uniqueItems
};

const fixtures: Fixture[] = [
  {
    filePath: "test/fixtures/order-schema.json",
    exportName: "OrderFromJson",
    validData: orderValidPayload,
    invalidData: orderInvalidPayload,
  },
  {
    filePath: "test/fixtures/order-schema.yaml",
    exportName: "OrderFromYaml",
    validData: orderValidPayload,
    invalidData: orderInvalidPayload,
  },
  {
    filePath: "test/fixtures/workflow-spec.yaml",
    exportName: "WorkflowSpecSchema",
  },
];

suite("compiled zod output", (test) => {
  for (const { filePath, exportName, validData, invalidData } of fixtures) {
    test(`generates and compiles schema from ${filePath}`, (assert) => {
      const schema = loadSchemaFromFile(filePath) as JsonSchema;
      const generated = jsonSchemaToZod(schema, {
        name: exportName,
        exportRefs: true,
      });

      const compiledModule = compileTypeScriptModule(generated, exportName);
      assert(compiledModule && typeof compiledModule === "object");
      assert(compiledModule.hasExport);
      assert(compiledModule.hasSafeParse);

      // For validation tests, we need to run the schema directly
      if (validData !== undefined || invalidData !== undefined) {
        const validationResult = compileAndValidate(generated, exportName, validData, invalidData);
        if (validData !== undefined) {
          assert(validationResult.validSuccess);
        }
        if (invalidData !== undefined) {
          assert(validationResult.invalidSuccess === false);
        }
      }
    });
  }
});

function loadSchemaFromFile(filePath: string) {
  const raw = readFileSync(filePath, "utf8");
  const extension = extname(filePath).toLowerCase();

  if (extension === ".yaml" || extension === ".yml") {
    return yaml.load(raw);
  }

  return JSON.parse(raw);
}

function compileTypeScriptModule(source: string, exportName: string) {
  // Keep the temp file inside the repo so Node resolution finds local node_modules/zod
  const dir = mkdtempSync(join(process.cwd(), ".tmp-compiled-"));
  const schemaPath = join(dir, "schema.ts");
  const runnerPath = join(dir, "runner.ts");

  writeFileSync(schemaPath, source);

  // Create a runner that imports the schema and outputs JSON with results
  const runner = `import { ${exportName} } from './schema.js';

console.log(JSON.stringify({
  hasExport: Boolean(${exportName}),
  hasSafeParse: typeof ${exportName} === 'object' && typeof ${exportName}.safeParse === 'function',
}));
`;

  writeFileSync(runnerPath, runner);

  // Use tsx to run TypeScript directly
  const tsxPath = join(process.cwd(), "node_modules/.bin/tsx");
  const { status, stdout, stderr, error } = spawnSync(tsxPath, [runnerPath], {
    encoding: "utf8",
    cwd: dir,
  });

  rmSync(dir, { recursive: true, force: true });

  if (status !== 0) {
    throw new Error(
      stderr || (error ? String(error) : "Failed to run compiled schema"),
    );
  }

  return JSON.parse(stdout);
}

function compileAndValidate(
  source: string,
  exportName: string,
  validData: unknown,
  invalidData: unknown,
) {
  const dir = mkdtempSync(join(process.cwd(), ".tmp-compiled-"));
  const schemaPath = join(dir, "schema.ts");
  const runnerPath = join(dir, "runner.ts");

  writeFileSync(schemaPath, source);

  const runner = `import { ${exportName} } from './schema.js';

const validData = ${JSON.stringify(validData)};
const invalidData = ${JSON.stringify(invalidData)};

const validResult = validData !== null ? ${exportName}.safeParse(validData) : null;
const invalidResult = invalidData !== null ? ${exportName}.safeParse(invalidData) : null;

console.log(JSON.stringify({
  validSuccess: validResult ? validResult.success : null,
  invalidSuccess: invalidResult ? invalidResult.success : null,
}));
`;

  writeFileSync(runnerPath, runner);

  const tsxPath = join(process.cwd(), "node_modules/.bin/tsx");
  const { status, stdout, stderr, error } = spawnSync(tsxPath, [runnerPath], {
    encoding: "utf8",
    cwd: dir,
  });

  rmSync(dir, { recursive: true, force: true });

  if (status !== 0) {
    throw new Error(
      stderr || (error ? String(error) : "Failed to run validation"),
    );
  }

  return JSON.parse(stdout);
}
