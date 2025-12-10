import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateSchemaBundle } from "../src";
import { suite } from "./suite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

suite("generateSchemaBundle", (test) => {
  test("emits per-def files with stitched imports", (assert) => {
    const schema = {
      $defs: {
        alpha: {
          type: "object",
          properties: { beta: { $ref: "#/$defs/beta" } },
          required: ["beta"],
        },
        beta: { type: "string" },
      },
      type: "object",
      properties: { alpha: { $ref: "#/$defs/alpha" } },
      required: ["alpha"],
    };

    const result = generateSchemaBundle(schema, {
      module: "esm",
      name: "WorkflowSchema",
      type: "Workflow",
    });

    assert(result.defNames, ["alpha", "beta"]);

    assert(result.files, [
      {
        fileName: "alpha.schema.ts",
        contents: `import { z } from "zod"\nimport { BetaSchema } from './beta.schema.js';\n\nexport const AlphaSchema = z.object({ "beta": BetaSchema })\nexport type Alpha = z.infer<typeof AlphaSchema>\n`,
      },
      {
        fileName: "beta.schema.ts",
        contents: `import { z } from "zod"\n\nexport const BetaSchema = z.string()\nexport type Beta = z.infer<typeof BetaSchema>\n`,
      },
      {
        fileName: "workflow.schema.ts",
        contents: `import { z } from "zod"\nimport { AlphaSchema } from './alpha.schema.js';\n\nexport const WorkflowSchema = z.object({ "alpha": AlphaSchema })\nexport type Workflow = z.infer<typeof WorkflowSchema>\n`,
      },
    ]);
  });

  test("preserves inline $defs inside a definition", (assert) => {
    const schema = {
      $defs: {
        wrapper: {
          type: "object",
          $defs: {
            inner: { type: "number" },
          },
          properties: {
            val: { $ref: "#/$defs/inner" },
          },
          required: ["val"],
        },
      },
      type: "object",
      properties: {
        wrapper: { $ref: "#/$defs/wrapper" },
      },
    };

    const result = generateSchemaBundle(schema, {
      module: "esm",
      name: "RootSchema",
      type: "Root",
    });

    const wrapper = result.files.find((f) => f.fileName === "wrapper.schema.ts")!;
    assert(wrapper.contents.includes("export const Inner = z.number()"));
    assert(wrapper.contents.includes("\"val\": Inner"));
  });

  test("unknown refs fall back to unknown", (assert) => {
    const schema = {
      $defs: {
        alpha: {
          $ref: "#/$defs/missing",
        },
      },
      type: "object",
      properties: {
        alpha: { $ref: "#/$defs/alpha" },
      },
    };

    const result = generateSchemaBundle(schema, { module: "esm", useUnknown: true });
    const alphaFile = result.files.find((f) => f.fileName === "alpha.schema.ts")!;
    assert(alphaFile.contents.includes("z.unknown()"));
  });

  test("cycles across defs can be emitted lazily", (assert) => {
    const schema = {
      $defs: {
        a: {
          type: "object",
          properties: { b: { $ref: "#/$defs/b" } },
        },
        b: {
          type: "object",
          properties: { a: { $ref: "#/$defs/a" } },
        },
      },
      type: "object",
      properties: {
        a: { $ref: "#/$defs/a" },
      },
      required: ["a"],
    };

    const result = generateSchemaBundle(schema, {
      module: "esm",
      refResolution: { lazyCrossRefs: true },
    });

    const bundleFile = result.files.find((f) => f.fileName === "a.schema.ts")!;
    assert(bundleFile.contents.includes("export const ASchema = z.object"));
    assert(bundleFile.contents.includes("export const BSchema = z.object"));
    assert(bundleFile.contents.includes("z.lazy(() => BSchema)"));
    assert(bundleFile.contents.includes("z.lazy(() => ASchema)"));
  });

  test("cycles in unions/arrays use lazy refs outside object properties", (assert) => {
    const schema = {
      $defs: {
        node: {
          oneOf: [
            {
              type: "object",
              properties: { next: { $ref: "#/$defs/node" }, value: { type: "string" } },
              required: ["value"],
            },
            {
              type: "array",
              items: { $ref: "#/$defs/node" },
            },
          ],
        },
      },
      type: "object",
      properties: { root: { $ref: "#/$defs/node" } },
      required: ["root"],
    };

    const result = generateSchemaBundle(schema, { module: "esm" });
    const nodeFile = result.files.find((f) => f.fileName === "node.schema.ts")!;

    assert(nodeFile.contents.includes('get "next"(){ return NodeSchema.optional() }'));
    assert(nodeFile.contents.includes("z.array(z.lazy(() => NodeSchema))"));
    assert(!nodeFile.contents.includes("z.union([() =>"));
  });

  test("inline defs use scoped names to reduce collisions", (assert) => {
    const schema = {
      $defs: {
        a: {
          type: "object",
          $defs: {
            x: { type: "number" },
          },
          properties: { v: { $ref: "#/$defs/a/$defs/x" } },
          required: ["v"],
        },
        b: {
          type: "object",
          $defs: {
            x: { type: "string" },
          },
          properties: { v: { $ref: "#/$defs/b/$defs/x" } },
          required: ["v"],
        },
      },
      type: "object",
      properties: {
        a: { $ref: "#/$defs/a" },
        b: { $ref: "#/$defs/b" },
      },
    };

    const result = generateSchemaBundle(schema, { module: "esm" });
    const aFile = result.files.find((f) => f.fileName === "a.schema.ts")!;
    const bFile = result.files.find((f) => f.fileName === "b.schema.ts")!;

    assert(aFile.contents.includes("export const ADefsX = z.number()"));
    assert(aFile.contents.includes("\"v\": ADefsX"));
    assert(bFile.contents.includes("export const BDefsX = z.string()"));
    assert(bFile.contents.includes("\"v\": BDefsX"));
  });

  test("generated error handling uses ZodError.issues", (assert) => {
    const schema = {
      $defs: {
        check: {
          if: { type: "string" },
          then: { type: "number" },
          else: { type: "boolean" },
        },
      },
      type: "object",
      properties: { check: { $ref: "#/$defs/check" } },
    };

    const result = generateSchemaBundle(schema, { module: "esm" });
    const checkFile = result.files.find((f) => f.fileName === "check.schema.ts")!;

    assert(!checkFile.contents.includes(".errors"));
    assert(checkFile.contents.includes("result.error.issues"));
  });

  test("inline defs with cycles fall back to default parsing (no import rewrite)", (assert) => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures/inline-defs-cycle.json"), "utf8"),
    );

    const result = generateSchemaBundle(schema, { module: "esm" });
    const outerFile = result.files.find((f) => f.fileName === "outer.schema.ts")!;
    assert(outerFile.contents.includes("export const OuterDefsInner"));
    assert(!outerFile.contents.includes("import { OuterSchema }"));
  });

  test("root definitions and inline definitions both resolve", (assert) => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures/definitions-shadow.json"), "utf8"),
    );

    const result = generateSchemaBundle(schema, { module: "esm" });
    const alphaFile = result.files.find((f) => f.fileName === "alpha.schema.ts")!;
    // Inline definitions/shared should be number, root definitions/shared should be string
    assert(alphaFile.contents.includes("export const AlphaDefsShared = z.number()"));
    assert(alphaFile.contents.includes("Shared = z.string()")); // from root definitions
  });

  test("nested types file captures titled inline objects", (assert) => {
    const schema = {
      $defs: {
        item: {
          type: "object",
          properties: {
            meta: {
              title: "ItemMeta",
              type: "object",
              properties: { tag: { type: "string" } },
              required: ["tag"],
            },
          },
          required: ["meta"],
        },
      },
      type: "object",
      properties: {
        config: {
          title: "Config",
          type: "object",
          properties: {
            flag: { type: "boolean" },
            nestedArr: {
              title: "NestedArray",
              type: "array",
              items: {
                title: "NestedArrayItem",
                type: "object",
                properties: { val: { type: "number" } },
              },
            },
          },
        },
        item: { $ref: "#/$defs/item" },
      },
    };

    const result = generateSchemaBundle(schema, {
      module: "esm",
      name: "RootSchema",
      type: "Root",
      nestedTypes: { enable: true, fileName: "nested-types.ts" },
    });

    const nestedFile = result.files.find((f) => f.fileName === "nested-types.ts")!;
    assert(nestedFile.contents.includes("import type { Root } from './workflow.schema.js';"));
    assert(nestedFile.contents.includes("import type { Item } from './item.schema.js';"));
    assert(nestedFile.contents.includes("export type Config = Access<Root, [\"config\"]>;"));
    assert(nestedFile.contents.includes("export type NestedArray = Access<Root, [\"config\", \"nestedArr\"]>;"));
    assert(nestedFile.contents.includes("export type NestedArrayItem = Access<Root, [\"config\", \"nestedArr\", \"items\"]>;"));
    assert(nestedFile.contents.includes("export type ItemMeta = Access<Item, [\"meta\"]>;"));
  });
});
