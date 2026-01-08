import { parseSchema } from "../../src/parsers/parseSchema.js";
import { suite } from "../suite.js";

suite("parseSchema", (test) => {
  test("should be usable without providing refs", (assert) => {
    assert(parseSchema({ type: "string" }), "z.string()");
  });

  test("should return a seen and processed ref", (assert) => {
    const seen = new Map();
    const schema = {
      type: "object",
      properties: {
        prop: {
          type: "string"
        }
      }
    };
    assert(
      parseSchema(schema, { seen, path: [] })
    );
    assert(
      parseSchema(schema, { seen, path: [] })
    );
  });

  test("should be possible to describe a readonly schema", (assert) => {
    assert(
      parseSchema({ type: "string", readOnly: true }),
      "z.string().readonly()",
    );
  });

  test("should handle nullable", (assert) => {
    assert(
      parseSchema(
        {
          type: "string",
          nullable: true,
        },
        { path: [], seen: new Map() },
      ),
      'z.string().nullable()',
    );
  });

  test("should handle enum", (assert) => {
    assert(
      parseSchema({ enum: ["someValue", 57] }),
      `z.union([z.literal("someValue"), z.literal(57)])`,
    );
  });

  test("should handle multiple type", (assert) => {
    assert(
      parseSchema({
        type: [
          "string", "number"
        ]
      }),
      `z.union([z.string(), z.number()])`,
    );
  });

  test("should handle if-then-else type", (assert) => {
    assert(
      parseSchema({
        if: { type: 'string' },
        then: { type: 'number' },
        else: { type: 'boolean' }
      }),
      `z.union([z.number(), z.boolean()]).superRefine((value,ctx) => {
  const result = z.string().safeParse(value).success
    ? z.number().safeParse(value)
    : z.boolean().safeParse(value);
  if (!result.success) {
    const issues = result.error.issues;
    issues.forEach((issue) => ctx.addIssue({ ...issue }))
  }
})`,
    );
  });

  test("should handle anyOf", (assert) => {
    assert(
      parseSchema({
        anyOf: [
          {
            type: "string",
          },
          { type: "number" },
        ]
      }),
      "z.union([z.string(), z.number()])",
    );
  });

  test("should handle oneOf with simple union by default", (assert) => {
    assert(
      parseSchema({
        oneOf: [
          {
            type: "string",
          },
          { type: "number" },
        ]
      }),
      "z.xor([z.string(), z.number()])",
    );
  });
});
