import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createRequire } from "module";
import vm from "vm";
import { extname, join } from "path";
import yaml from "js-yaml";
import jsonSchemaToZod from "../src/index.js";
import { JsonSchema } from "../src/Types.js";
import { suite } from "./suite";

const require = createRequire(import.meta.url);

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
        module: "cjs",
        name: exportName,
      });

      const compiledModule = compileCjsModule(generated);
      assert(compiledModule && typeof compiledModule === "object");

      const generatedSchema = (compiledModule as Record<string, unknown>)[exportName] as
        | { safeParse: (value: unknown) => { success: boolean } }
        | undefined;
      assert(generatedSchema && typeof generatedSchema.safeParse === "function");

      if (validData !== undefined) {
        const validResult = generatedSchema.safeParse(validData);
        assert(validResult.success);
      }

      if (invalidData !== undefined) {
        const invalidResult = generatedSchema.safeParse(invalidData);
        assert(invalidResult.success === false);
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

function compileCjsModule(source: string) {
  // Keep the temp file inside the repo so Node resolution finds local node_modules/zod
  const dir = mkdtempSync(join(process.cwd(), ".tmp-compiled-"));
  const filePath = join(dir, "schema.cjs");

  writeFileSync(filePath, source);

  try {
    const context: {
      require: NodeRequire;
      module: { exports: unknown };
      exports: unknown;
      __dirname: string;
      __filename: string;
      console: typeof console;
    } = {
      require,
      module: { exports: {} },
      exports: {},
      __dirname: dir,
      __filename: filePath,
      console,
    };
    vm.runInNewContext(readFileSync(filePath, "utf8"), context, {
      filename: filePath,
    });
    return context.module.exports;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
