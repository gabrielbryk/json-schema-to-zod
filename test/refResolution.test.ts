import { createRequire } from "module";
import { pathToFileURL } from "url";
import { analyzeSchema } from "../src/core/analyzeSchema.js";
import { emitZod } from "../src/core/emitZod.js";
import { JsonSchema } from "../src/Types.js";

const _require = createRequire(import.meta.url);

const evalZod = async (code: string) => {
  // Substitute an absolute file:// URL for the bare "zod" specifier so that
  // the module can be resolved from a data: URI context. jest@30 can no
  // longer do bare-specifier resolution from data: URLs (no filesystem base),
  // so we pre-resolve the path here and embed it directly.
  const zodUrl = pathToFileURL(_require.resolve("zod")).href;
  const resolvedCode = code.replace(`from "zod"`, `from ${JSON.stringify(zodUrl)}`);
  const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(resolvedCode)}`;
  return import(url);
};

describe("ref resolution", () => {
  test("resolves $id + $anchor", async () => {
    const schema = {
      $id: "http://example.com/root.json",
      $defs: {
        inner: {
          $anchor: "inner",
          type: "string",
        },
      },
      type: "object",
      properties: {
        foo: { $ref: "http://example.com/root.json#inner" },
      },
    };

    const analysis = analyzeSchema(schema);
    const code = emitZod(analysis);
    const mod = await evalZod(code);
    const result = mod.default.safeParse({ foo: "ok" });
    expect(result.success).toBe(true);
  });

  test("resolves $dynamicRef to nearest $dynamicAnchor", async () => {
    const schema = {
      $id: "http://example.com/root.json",
      $defs: {
        boxed: {
          $dynamicAnchor: "node",
          type: "object",
          properties: {
            value: { type: "string" },
            child: { $dynamicRef: "#node" },
          },
          required: ["value"],
        },
      },
      $ref: "#/$defs/boxed",
    };

    const analysis = analyzeSchema(schema);
    const code = emitZod(analysis);
    const mod = await evalZod(code);

    expect(mod.default.safeParse({ value: "a" }).success).toBe(true);
    expect(mod.default.safeParse({ value: "a", child: { value: "b" } }).success).toBe(true);
    expect(mod.default.safeParse({ value: "a", child: { child: { value: 1 } } }).success).toBe(
      true
    );
  });

  test("unresolved ref invokes hook", async () => {
    const seen: string[] = [];
    const schema = {
      type: "object",
      properties: {
        bad: { $ref: "#/missing" },
      },
    };
    const analysis = analyzeSchema(schema, {
      onUnresolvedRef: (ref) => seen.push(ref),
    });
    const code = emitZod(analysis);
    const mod = await evalZod(code);
    const result = mod.default.safeParse({ bad: 1 });
    expect(result.success).toBe(true);
    expect(seen).toContain("#/missing");
  });

  test("legacy $recursiveRef/$recursiveAnchor", async () => {
    const schema: JsonSchema = {
      $recursiveAnchor: true,
      type: "object",
      properties: {
        value: { type: "string" },
        next: { $recursiveRef: "#" },
      },
      required: ["value"],
    };

    const analysis = analyzeSchema(schema);
    const code = emitZod(analysis);
    const mod = await evalZod(code);

    expect(mod.default.safeParse({ value: "a" }).success).toBe(true);
    expect(mod.default.safeParse({ value: "a", next: { value: "b" } }).success).toBe(true);
    expect(mod.default.safeParse({ value: "a", next: { value: 1 } }).success).toBe(true);
  });

  test("external ref resolver", async () => {
    const external: JsonSchema = {
      $id: "http://example.com/external.json",
      type: "string",
      minLength: 2,
    };

    const schema: JsonSchema = {
      type: "object",
      properties: {
        foo: { $ref: "http://example.com/external.json" },
      },
    };

    const analysis = analyzeSchema(schema, {
      resolveExternalRef: (uri) => {
        if (uri === "http://example.com/external.json") return external;
        return undefined;
      },
    });
    const code = emitZod(analysis);
    const mod = await evalZod(code);

    expect(mod.default.safeParse({ foo: "ok" }).success).toBe(true);
    expect(mod.default.safeParse({ foo: "x" }).success).toBe(false);
  });

  test("oneOf with direct self-reference uses union (not xor)", async () => {
    // This test verifies the fix for EventConsumptionStrategy-like patterns
    // where oneOf contains a branch with a direct self-reference.
    // z.xor() validation fails on direct self-references during parsing,
    // so we must detect this and use z.union() instead.
    const schema: JsonSchema = {
      $defs: {
        // Pattern similar to EventConsumptionStrategy from serverless workflow spec
        consumptionStrategy: {
          oneOf: [
            // Simple cases
            { type: "object", properties: { all: { type: "boolean" } } },
            { type: "object", properties: { any: { type: "boolean" } } },
            // Self-referencing case (the problematic pattern)
            {
              allOf: [
                { $ref: "#/$defs/consumptionStrategy" },
                { type: "object", properties: { until: { type: "string" } } },
              ],
            },
          ],
        },
      },
      type: "object",
      properties: {
        strategy: { $ref: "#/$defs/consumptionStrategy" },
      },
    };

    const analysis = analyzeSchema(schema);
    const code = emitZod(analysis);

    // Verify that the generated code uses z.union for the recursive oneOf
    // (not z.xor which would fail on self-references)
    expect(code).toContain("z.union");

    // Also verify it does NOT use z.xor for this pattern
    // (xor validation fails when self-references are evaluated)
    expect(code).not.toContain("z.xor");

    // Verify the self-reference is wrapped in z.lazy()
    expect(code).toContain("z.lazy(() => ConsumptionStrategySchema)");

    // Verify the schema structure is correct
    expect(code).toContain("ConsumptionStrategySchema");
    expect(code).toContain("z.intersection");
  });
});
