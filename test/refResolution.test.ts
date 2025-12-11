import { analyzeSchema } from "../src/core/analyzeSchema.js";
import { emitZod } from "../src/core/emitZod.js";
import { JsonSchema } from "../src/Types.js";

const evalZod = async (code: string) => {
  const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
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
    expect(mod.default.safeParse({ value: "a", child: { child: { value: 1 } } }).success).toBe(true);
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
    expect(result.success).toBe(false);
    expect(seen).toEqual([]);
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
});
