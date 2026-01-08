import { parseNumber } from "../../src/parsers/parseNumber.js";
import { suite } from "../suite.js";

suite("parseNumber", (test) => {
  test("should handle integer", (assert) => {
    assert(
      parseNumber({
        type: "integer",
      }),
      `z.number().int()`
    );

    assert(
      parseNumber({
        type: "integer",
        multipleOf: 1
      }),
      `z.number().int()`
    );

    assert(
      parseNumber({
        type: "number",
        multipleOf: 1
      }),
      `z.number().int()`
    );
  });

  test("should handle maximum with exclusiveMinimum", (assert) => {
    assert(
      parseNumber({
        type: "number",
        exclusiveMinimum: true,
        minimum: 2,
      }),
      `z.number().gt(2)`
    );
  });

  test("should handle maximum with exclusiveMinimum", (assert) => {
    assert(
      parseNumber({
        type: "number",
        minimum: 2,
      }),
      `z.number().gte(2)`
    );
  });

  test("should handle maximum with exclusiveMaximum", (assert) => {
    assert(
      parseNumber({
        type: "number",
        exclusiveMaximum: true,
        maximum: 2,
      }),
      `z.number().lt(2)`
    );
  });

  test("should handle numeric exclusiveMaximum", (assert) => {
    assert(
      parseNumber({
        type: "number",
        exclusiveMaximum: 2,
      }),
      `z.number().lt(2)`
    );
  });

  test("should map numeric formats to Zod v4 helpers", (assert) => {
    assert(
      parseNumber({ type: "number", format: "int32" }),
      "z.int32()",
    );

    assert(
      parseNumber({ type: "number", format: "uint32" }),
      "z.uint32()",
    );

    assert(
      parseNumber({ type: "number", format: "float32" }),
      "z.float32()",
    );

    assert(
      parseNumber({ type: "number", format: "float64" }),
      "z.float64()",
    );

    assert(
      parseNumber({ type: "number", format: "safeint", errorMessage: { format: "err" } }),
      'z.safeint({ error: "err" })',
    );
  });

  test("should accept errorMessage", (assert) => {
    assert(
      parseNumber({
        type: "number",
        format: "int64",
        exclusiveMinimum: 0,
        maximum: 2,
        multipleOf: 2,
        errorMessage: {
          format: "ayy",
          multipleOf: "lmao",
          exclusiveMinimum: "deez",
          maximum: "nuts",
        },
      }),

      'z.int64({ error: "ayy" }).multipleOf(2, { error: "lmao" }).gt(0, { error: "deez" }).lte(2, { error: "nuts" })',
    );
  });

  test("should map bigint formats", (assert) => {
    assert(parseNumber({ type: "number", format: "int64" }), "z.int64()");
    assert(parseNumber({ type: "number", format: "uint64" }), "z.uint64()");
  });
});
