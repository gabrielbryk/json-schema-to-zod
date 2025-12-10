import {
  JSONSchema4,
  JSONSchema6Definition,
  JSONSchema7Definition,
} from "json-schema";
import jsonSchemaToZod from "../src";
import { suite } from "./suite";

suite("jsonSchemaToZod", (test) => {
  test("should accept json schema 7 and 4", (assert) => {
    const schema = { type: "string" } as unknown;

    assert(jsonSchemaToZod(schema as JSONSchema4));
    assert(jsonSchemaToZod(schema as JSONSchema6Definition));
    assert(jsonSchemaToZod(schema as JSONSchema7Definition));
  });

  test("should produce a string of JS code creating a Zod schema from a simple JSON schema", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "string",
        },
        { module: "esm" },
      ),
      `import { z } from "zod"

export default z.string()
`,
    );
  });

  test("should be possible to skip the import line", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "string",
        },
        { module: "esm", noImport: true },
      ),
      `export default z.string()
`,
    );
  });

  test("should be possible to add types", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "string",
        },
        { name: "mySchema", module: "esm", type: true },
      ),
      `import { z } from "zod"

export const mySchema = z.string()
export type MySchema = z.infer<typeof mySchema>
`,
    );
  });

  test("should be possible to add types with a custom name template", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "string",
        },
        { name: "mySchema", module: "esm", type: "MyType" },
      ),
      `import { z } from "zod"

export const mySchema = z.string()
export type MyType = z.infer<typeof mySchema>
`,
    );
  });

  test("should throw when given module cjs and type", (assert) => {
    let didThrow = false;

    try {
      jsonSchemaToZod(
        { type: "string" },
        { name: "hello", module: "cjs", type: true },
      );
    } catch {
      didThrow = true;
    }

    assert(didThrow);
  });

  test("should throw when given type but no name", (assert) => {
    let didThrow = false;

    try {
      jsonSchemaToZod({ type: "string" }, { module: "esm", type: true });
    } catch {
      didThrow = true;
    }

    assert(didThrow);
  });

  test("should include defaults", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "string",
          default: "foo",
        },
        { module: "esm" },
      ),
      `import { z } from "zod"

export default z.string().default("foo")
`,
    );
  });

  test("should include falsy defaults", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "string",
          default: "",
        },
        { module: "esm" },
      ),
      `import { z } from "zod"

export default z.string().default("")
`,
    );
  });

  test("should include falsy defaults", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "string",
          const: "",
        },
        { module: "esm" },
      ),
      `import { z } from "zod"

export default z.literal("")
`,
    );
  });

  test("can exclude defaults", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "string",
          default: "foo",
        },
        { module: "esm", withoutDefaults: true },
      ),
      `import { z } from "zod"

export default z.string()
`,
    );
  });

  test("should include describes", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "string",
          description: "foo",
        },
        { module: "esm" },
      ),
      `import { z } from "zod"

export default z.string().meta({"description":"foo"})
`,
    );
  });

  test("can exclude describes", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "string",
          description: "foo",
        },
        { module: "esm", withoutDescribes: true },
      ),
      `import { z } from "zod"

export default z.string()
`,
    );
  });

  test("can include jsdocs", (assert) => {
    assert(
      jsonSchemaToZod({
        type: "object",
        description: "Description for schema",
        properties: {
          prop: {
            type: "string",
            description: "Description for prop"
          },
          obj: {
            type: "object",
            description: "Description for object that is multiline\nMore content\n\nAnd whitespace",
            properties: {
              nestedProp: {
                type: "string",
                description: "Description for nestedProp"
              },
              nestedProp2: {
                type: "string",
                description: "Description for nestedProp2"
              },
            },
          }
        }
      }, { module: "esm", withJsdocs: true }),
      `import { z } from "zod"

/**Description for schema*/
export default z.object({ 
/**Description for prop*/
"prop": z.string().meta({"description":"Description for prop"}).optional(), 
/**
* Description for object that is multiline
* More content
* 
* And whitespace
*/
"obj": z.object({ 
/**Description for nestedProp*/
"nestedProp": z.string().meta({"description":"Description for nestedProp"}).optional(), 
/**Description for nestedProp2*/
"nestedProp2": z.string().meta({"description":"Description for nestedProp2"}).optional() }).meta({"description":"Description for object that is multiline\\nMore content\\n\\nAnd whitespace"}).optional() }).meta({"description":"Description for schema"})
`);
  });

  test("will remove optionality if default is present", (assert) => {
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
        { module: "esm" },
      ),
      `import { z } from "zod"

export default z.object({ "prop": z.string().default("def") })
`,
    );
  });

  test("will handle falsy defaults", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "boolean",
          default: false,
        },
        { module: "esm" },
      ),
      `import { z } from "zod"

export default z.boolean().default(false)
`,
    );
  });

  test("will ignore undefined as default", (assert) => {
    assert(
      jsonSchemaToZod(
        {
          type: "null",
          default: undefined,
        },
        { module: "esm" },
      ),
      `import { z } from "zod"

export default z.null()
`,
    );
  });

  test("should be possible to define a custom parser", (assert) => {
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
          // module: false,
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

      `z.intersection(z.string(), z.intersection(z.number(), myCustomZodSchema))`,
    );
  });

  test("can output with cjs and a name", (assert) => {
    assert(jsonSchemaToZod({
      type: "string"
    }, { module: "cjs", name: "someName" }), `const { z } = require("zod")

module.exports = { "someName": z.string() }
`);
  });

  test("can output with cjs and no name", (assert) => {
    assert(jsonSchemaToZod({
      type: "string"
    }, { module: "cjs" }), `const { z } = require("zod")

module.exports = z.string()
`);
  });

  test("can output with name only", (assert) => {
    assert(jsonSchemaToZod({
      type: "string"
    }, { name: "someName" }), "const someName = z.string()");
  });

  test("can exclude name", (assert) => {
    assert(jsonSchemaToZod(true), "z.any()");
  });

  test("declares $refs as named schemas and uses getters for recursion", (assert) => {
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

    assert(
      jsonSchemaToZod(schema, { module: "esm" }),
      `import { z } from "zod"

export const Node = z.object({ "value": z.string(), get "next"(){ return z.lazy(() => Node).optional() } })

export default Node
`,
    );
  });

  test("uses upgraded discriminatedUnion map syntax", (assert) => {
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
      jsonSchemaToZod(schema, { module: "esm" }),
      `import { z } from "zod"

export default z.discriminatedUnion("kind", [z.object({ "kind": z.literal("a"), "value": z.string() }), z.object({ "kind": z.literal("b"), "flag": z.boolean() })])
`,
    );
  });

  test("supports propertyNames validation", (assert) => {
    const schema = {
      type: "object",
      propertyNames: { pattern: "^foo" },
    };

    const output = jsonSchemaToZod(schema, { module: "esm", name: "s" });

    assert(output.includes("Invalid property name"));
    assert(output.includes("^foo"));
  });

  test("supports dependentSchemas", (assert) => {
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

    const output = jsonSchemaToZod(schema, { module: "esm", name: "s" });

    assert(output.includes("Dependent schema failed"));
  });

  test("supports contains with min/max contains", (assert) => {
    const schema = {
      type: "array",
      contains: { type: "string" },
      minContains: 2,
      maxContains: 3,
    };

    const output = jsonSchemaToZod(schema, { module: "esm", name: "arr" });

    assert(output.includes("matches < 2"));
    assert(output.includes("> 3"));
  });

  test("supports contains on tuples", (assert) => {
    const schema = {
      type: "array",
      items: [{ type: "string" }, { type: "number" }],
      contains: { type: "number" },
      minContains: 1,
    };

    const output = jsonSchemaToZod(schema, { module: "esm", name: "tuple" });

    assert(output.includes("Array contains too few matching items"));
    assert(output.includes("z.tuple"));
  });

  test("supports unevaluatedProperties schema", (assert) => {
    const schema = {
      type: "object",
      properties: { known: { type: "string" } },
      unevaluatedProperties: { type: "number" },
    };

    const output = jsonSchemaToZod(schema, { module: "esm", name: "obj" });

    assert(output.includes("Invalid unevaluated property"));
  });

  test("can export reference declarations when requested", (assert) => {
    const schema = {
      $defs: {
        node: {
          type: "object",
          properties: { value: { type: "string" }, next: { $ref: "#/$defs/node" } },
        },
      },
      $ref: "#/$defs/node",
    };

    const output = jsonSchemaToZod(schema, { module: "esm", name: "Node", exportRefs: true });

    assert(output.includes("export const Node2"));
    assert(output.includes("export const Node = Node2"));
  });
});
