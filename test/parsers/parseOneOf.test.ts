import { parseOneOf } from "../../src/parsers/parseOneOf.js";
import { suite } from "../suite.js";

suite("parseOneOf", (test) => {
  test("should create a simple union by default", (assert) => {
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
        { path: [], seen: new Map() },
      ),
      `z.union([z.string(), z.number()])`,
    );
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
        { path: [], seen: new Map(), strictOneOf: true },
      ),
      `z.union([z.string(), z.number()]).superRefine((x, ctx) => {
    const schemas = [z.string(), z.number()];
    const errors = schemas.reduce<z.ZodError[]>(
      (errors, schema) =>
        ((result) =>
          result.error ? [...errors, result.error] : errors)(
          schema.safeParse(x),
        ),
      [],
    );
    if (schemas.length - errors.length !== 1) {
      ctx.addIssue({
        path: [],
        code: "invalid_union",
        errors: errors.map(e => e.issues),
        message: "Invalid input: Should pass single schema",
      });
    }
  })`,
    );
  });

  test("should extract a single schema", (assert) => {
    assert(
      parseOneOf(
        { oneOf: [{ type: "string" }] },
        { path: [], seen: new Map() },
      ),
      "z.string()",
    );
  });

  test("should return z.any() if array is empty", (assert) => {
    assert(parseOneOf({ oneOf: [] }, { path: [], seen: new Map() }), "z.any()");
  });
});
