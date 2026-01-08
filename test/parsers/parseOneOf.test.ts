import { parseOneOf } from "../../src/parsers/parseOneOf.js";
import { suite } from "../suite.js";

suite("parseOneOf", (test) => {
  it("should create a simple union by default", () => {
    expect(
      parseOneOf(
        {
          oneOf: [{ type: "string" }, { type: "number" }],
        },
        { path: [], seen: new Map() }
      )
    ).toEqual({
      expression: "z.xor([z.string(), z.number()])",
      type: "z.ZodXor<readonly [z.ZodString, z.ZodNumber]>",
    });
  });

  test("should create a strict union with superRefine when strictOneOf is enabled", (assert) => {
    assert(
      parseOneOf(
        {
          oneOf: [
            {
              type: "string",
            },
            { type: "number" },
          ],
        },
        { path: [], seen: new Map(), strictOneOf: true }
      ),
      "z.xor([z.string(), z.number()])"
    );
  });

  test("should extract a single schema", (assert) => {
    assert(
      parseOneOf({ oneOf: [{ type: "string" }] }, { path: [], seen: new Map() }),
      "z.string()"
    );
  });

  test("supports enum discriminators in discriminated unions", (assert) => {
    assert(
      parseOneOf(
        {
          oneOf: [
            {
              type: "object",
              properties: {
                kind: { enum: ["a", "b"] },
                value: { type: "string" },
              },
              required: ["kind", "value"],
            },
            {
              type: "object",
              properties: {
                kind: { const: "c" },
              },
              required: ["kind"],
            },
          ],
        },
        { path: [], seen: new Map() }
      ),
      'z.discriminatedUnion("kind", [z.looseObject({ "kind": z.enum(["a", "b"]), "value": z.string() }), z.looseObject({ "kind": z.literal("c") })])'
    );
  });

  test("should return z.any() if array is empty", (assert) => {
    assert(parseOneOf({ oneOf: [] }, { path: [], seen: new Map() }), "z.any()");
  });
});
