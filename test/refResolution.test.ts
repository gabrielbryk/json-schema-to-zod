import { analyzeSchema } from "../src/core/analyzeSchema.js";
import { emitZod } from "../src/core/emitZod.js";
import { JsonSchema } from "../src/Types.js";

const evalZod = (code: string) => eval(`const { z } = require("zod"); ${code}`);

describe("ref resolution", () => {
  test("resolves $id + $anchor", () => {
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
    const mod = evalZod(code);
    const result = mod.default.safeParse({ foo: "ok" });
    expect(result.success).toBe(true);
  });

  test("resolves $dynamicRef to nearest $dynamicAnchor", () => {
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
    const mod = evalZod(code);

    expect(mod.default.safeParse({ value: "a" }).success).toBe(true);
    expect(mod.default.safeParse({ value: "a", child: { value: "b" } }).success).toBe(true);
    expect(mod.default.safeParse({ value: "a", child: { child: { value: 1 } } }).success).toBe(false);
  });

  test("unresolved ref invokes hook", () => {
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
    const mod = evalZod(code);
    const result = mod.default.safeParse({ bad: 1 });
    expect(result.success).toBe(true); // falls back to unknown/any
    expect(seen).toEqual(["#/missing"]);
  });

  test("legacy $recursiveRef/$recursiveAnchor", () => {
    const schema: JsonSchema = {
      $recursiveAnchor: true,
      type: "object",
      properties: {
        value: { type: "string" },
        next: { $recursiveRef: "#" },
      },
      required: ["value"],
    } as any;

    const analysis = analyzeSchema(schema);
    const code = emitZod(analysis);
    const mod = evalZod(code);

    expect(mod.default.safeParse({ value: "a" }).success).toBe(true);
    expect(mod.default.safeParse({ value: "a", next: { value: "b" } }).success).toBe(true);
    expect(mod.default.safeParse({ value: "a", next: { value: 1 } }).success).toBe(false);
  });

  test("external ref resolver", () => {
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
    const mod = evalZod(code);

    expect(mod.default.safeParse({ foo: "ok" }).success).toBe(true);
    expect(mod.default.safeParse({ foo: "x" }).success).toBe(false);
  });
});
