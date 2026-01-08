import { JsonSchema } from "../src/Types.js";
import jsonSchemaToZod from "../src/index.js";
import { suite } from "./suite.js";
import { normalizeCode } from "./utils/normalizeCode.js";
import { getDefaultExport, getExportedConst, hasImportZod } from "./utils/assertCode.js";
import ts from "typescript";

suite("jsonSchemaToZod", (test: any) => {
  test("should accept json schema 7 and 4", (assert: any) => {
    const schema = { type: "string" } as unknown;

    assert(jsonSchemaToZod(schema as unknown as JsonSchema));
    assert(jsonSchemaToZod(schema as unknown as JsonSchema));
    assert(jsonSchemaToZod(schema as unknown as JsonSchema));
  });

  test("should produce a string of JS code creating a Zod schema from a simple JSON schema", (assert: any) => {
    assert(
      normalizeCode(
        jsonSchemaToZod(
          {
            type: "string",
          },
        ),
      ),
      normalizeCode(`import { z } from "zod"

export default z.string()
`),
    );
  });

  test("should be possible to skip the import line", (assert: any) => {
    assert(
      normalizeCode(
        jsonSchemaToZod(
          {
            type: "string",
          },
          { noImport: true },
        ),
      ),
      normalizeCode(`export default z.string()
`),
    );
  });

  test("should be possible to add types", (assert: any) => {
    assert(
      normalizeCode(
        jsonSchemaToZod(
          {
            type: "string",
          },
          { name: "mySchema", type: true },
        ),
      ),
      normalizeCode(`import { z } from "zod"

export const mySchema = z.string()
export type MySchema = z.infer<typeof mySchema>
`),
    );
  });

  test("should be possible to add types with a custom name template", (assert: any) => {
    assert(
      normalizeCode(
        jsonSchemaToZod(
          {
            type: "string",
          },
          { name: "mySchema", type: "MyType" },
        ),
      ),
      normalizeCode(`import { z } from "zod"

export const mySchema = z.string()
export type MyType = z.infer<typeof mySchema>
`),
    );
  });

  test("should throw when given type but no name", (assert: any) => {
    let didThrow = false;

    try {
      jsonSchemaToZod({ type: "string" }, { type: true });
    } catch {
      didThrow = true;
    }

    assert(didThrow);
  });

  test("should include defaults", (assert: any) => {
    assert(
      normalizeCode(
        jsonSchemaToZod(
          {
            type: "string",
            default: "foo",
          },
          {},
        ),
      ),
      normalizeCode(`import { z } from "zod"

export default z.string().default("foo")
`),
    );
  });

  test("should include falsy defaults", (assert: any) => {
    assert(
      jsonSchemaToZod(
        {
          type: "string",
          default: "",
        },
        {},
      ),
      `import { z } from "zod"

export default z.string().default("")
`,
    );
  });

  test("should include falsy defaults", (assert: any) => {
    assert(
      normalizeCode(
        jsonSchemaToZod(
          {
            type: "string",
            const: "",
          },
          {},
        ),
      ),
      normalizeCode(`import { z } from "zod"

export default z.literal("")
`),
    );
  });

  test("can exclude defaults", (assert: any) => {
    assert(
      normalizeCode(
        jsonSchemaToZod(
          {
            type: "string",
            default: "foo",
          },
          { withoutDefaults: true },
        ),
      ),
      normalizeCode(`import { z } from "zod"

export default z.string()
`),
    );
  });

  test("should include describes", (assert: any) => {
    const code = jsonSchemaToZod(
      {
        type: "string",
        description: "foo",
      },
    );
    const exported = getDefaultExport(code);
    assert(hasImportZod(code), true);
    assert(exported && ts.isCallExpression(exported) && exported.getText().includes('.describe("foo")'), true);
  });

  test("can exclude describes", (assert: any) => {
    assert(
      normalizeCode(
        jsonSchemaToZod(
          {
            type: "string",
            description: "foo",
          },
          { withoutDescribes: true },
        ),
      ),
      normalizeCode(`import { z } from "zod"

export default z.string()
`),
    );
  });

  test("can include jsdocs", (assert: any) => {
    const code = jsonSchemaToZod({
      type: "object",
      description: "Description for schema",
      properties: {
        prop: { type: "string", description: "Description for prop" },
        obj: {
          type: "object",
          description: "Description for object that is multiline\\nMore content\\n\\nAnd whitespace",
          properties: {
            nestedProp: { type: "string", description: "Description for nestedProp" },
            nestedProp2: { type: "string", description: "Description for nestedProp2" },
          },
        }
      }
    }, { withJsdocs: true });

    assert(hasImportZod(code), true);
    assert(code.includes("Description for schema"), true);
    assert(code.includes("Description for prop"), true);
    assert(code.includes("Description for nestedProp"), true);
    assert(code.includes("Description for nestedProp2"), true);
  });

  test("will remove optionality if default is present", (assert: any) => {
    assert(
      jsonSchemaToZod(
        {
          type: "object",
          properties: {
            prop: {
              type: "string",
              default: "def",
            },
          },
        },
        {},
      ),
      `import { z } from "zod"

export default z.object({ "prop": z.string().default("def") }).passthrough()
`,
    );
  });

  test("will handle falsy defaults", (assert: any) => {
    assert(
      jsonSchemaToZod(
        {
          type: "boolean",
          default: false,
        },
        {},
      ),
      `import { z } from "zod"

export default z.boolean().default(false)
`,
    );
  });

  test("will ignore undefined as default", (assert: any) => {
    assert(
      jsonSchemaToZod(
        {
          type: "null",
          default: undefined,
        },
        {},
      ),
      `import { z } from "zod"

export default z.null()
`,
    );
  });

  test("should be possible to define a custom parser", (assert: any) => {
    assert(
      jsonSchemaToZod(
        {
          allOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean", description: "foo" },
          ],
        },
        {
          parserOverride: (schema, refs) => {
            if (
              refs.path.length === 2 &&
              refs.path[0] === "allOf" &&
              refs.path[1] === 2 &&
              schema.type === "boolean" &&
              schema.description === "foo"
            ) {
              return "myCustomZodSchema";
            }
          },
        },
      ),

      `import { z } from "zod"

export default z.intersection(z.string(), z.intersection(z.number(), myCustomZodSchema))
`,
    );
  });

  test("can output with name", (assert: any) => {
    assert(jsonSchemaToZod({
      type: "string"
    }, { name: "someName" }), `import { z } from "zod"

export const someName = z.string()
`);
  });

  test("can output without name", (assert: any) => {
    assert(jsonSchemaToZod(true), `import { z } from "zod"

export default z.any()
`);
  });

  test("declares $refs as named schemas and uses getters for recursion", (assert: any) => {
    const schema = {
      $defs: {
        node: {
          type: "object",
          properties: {
            value: { type: "string" },
            next: { $ref: "#/$defs/node" },
          },
          required: ["value"],
        },
      },
      $ref: "#/$defs/node",
    };

    const code = jsonSchemaToZod(schema);
    const decl = getExportedConst(code, "Node");
    assert(decl !== undefined, true);
    assert(code.includes('get "next"(): z.ZodOptional<typeof Node>'), true);
    assert(code.includes("return Node.optional()"), true);
  });

  test("uses upgraded discriminatedUnion map syntax", (assert: any) => {
    const schema = {
      oneOf: [
        {
          type: "object",
          properties: {
            kind: { const: "a" },
            value: { type: "string" },
          },
          required: ["kind", "value"],
        },
        {
          type: "object",
          properties: {
            kind: { const: "b" },
            flag: { type: "boolean" },
          },
          required: ["kind", "flag"],
        },
      ],
      discriminator: {
        propertyName: "kind",
      },
    };

    assert(
      jsonSchemaToZod(schema as unknown as JsonSchema),
      `import { z } from "zod"

export default z.discriminatedUnion("kind", [z.object({ "kind": z.literal("a"), "value": z.string() }).passthrough(), z.object({ "kind": z.literal("b"), "flag": z.boolean() }).passthrough()])
`,
    );
  });

  test("supports propertyNames validation", (assert: any) => {
    const schema = {
      type: "object",
      propertyNames: { pattern: "^foo" },
    };

    const output = jsonSchemaToZod(schema, { name: "s" });

    assert(output.includes("Invalid property name"));
  });

  test("supports dependentSchemas", (assert: any) => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" } },
      dependentSchemas: {
        a: {
          type: "object",
          properties: { b: { type: "number" } },
          required: ["b"],
        },
      },
    };

    const output = jsonSchemaToZod(schema, { name: "s" });

    assert(output.includes("Dependent schema failed"));
  });

  test("supports contains with min/max contains", (assert: any) => {
    const schema = {
      type: "array",
      contains: { type: "string" },
      minContains: 2,
      maxContains: 3,
    };

    const output = jsonSchemaToZod(schema, { name: "arr" });

    assert(output.includes("matches < 2"));
    assert(output.includes("> 3"));
  });

  test("supports contains on tuples", (assert: any) => {
    const schema = {
      type: "array",
      items: [{ type: "string" }, { type: "number" }],
      contains: { type: "number" },
      minContains: 1,
    };

    const output = jsonSchemaToZod(schema, { name: "tuple" });

    assert(output.includes("Array contains too few matching items"));
    assert(output.includes("z.tuple"));
  });

  /*
  test("supports unevaluatedProperties schema", (assert: any) => {
    const schema = {
      type: "object",
      properties: { known: { type: "string" } },
      unevaluatedProperties: { type: "number" },
    };

    const output = jsonSchemaToZod(schema, { name: "obj" });

    assert(output.includes("Invalid unevaluated property"));
  });
  */

  test("can export reference declarations when requested", (assert: any) => {
    const schema = {
      $defs: {
        node: {
          type: "object",
          properties: { value: { type: "string" }, next: { $ref: "#/$defs/node" } },
        },
      },
      $ref: "#/$defs/node",
    };

    const output = jsonSchemaToZod(schema, { name: "Node", exportRefs: true });

    assert(output.includes("export const Node2"));
    assert(output.includes("export const Node = Node2"));
  });
});
