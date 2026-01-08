import { generateSchemaBundle } from "../src/index.js";
import { normalizeCode } from "./utils/normalizeCode.js";
import { suite } from "./suite.js";

suite("generateSchemaBundle snapshots", (test) => {
  test("emits full files for simple address/user bundle", (assert) => {
    const schema = {
      $defs: {
        address: {
          type: "object",
          properties: { line1: { type: "string" }, city: { type: "string" } },
          required: ["line1"],
        },
        user: {
          type: "object",
          properties: {
            name: { type: "string" },
            address: { $ref: "#/$defs/address" },
          },
          required: ["name", "address"],
        },
      },
      type: "object",
      properties: { user: { $ref: "#/$defs/user" } },
      required: ["user"],
    };

    const result = generateSchemaBundle(schema, { name: "RootSchema", type: "Root" });
    const normalizeFiles = (files: { fileName: string; contents: string }[]) =>
      files.map((f) => ({ ...f, contents: normalizeCode(f.contents) }));

    const expected = {
      defNames: ["address", "user"],
      files: [
        {
          fileName: "address.schema.ts",
          contents: `import { z } from "zod"

export const AddressSchema = z.looseObject({ "line1": z.string(), "city": z.string().exactOptional() })
export type Address = z.infer<typeof AddressSchema>
`,
        },
        {
          fileName: "user.schema.ts",
          contents: `import { z } from "zod"
import { AddressSchema } from './address.schema.js';

export const UserSchema = z.looseObject({ "name": z.string(), "address": AddressSchema })
export type User = z.infer<typeof UserSchema>
`,
        },
        {
          fileName: "workflow.schema.ts",
          contents: `import { z } from "zod"
import { UserSchema } from './user.schema.js';

export const RootSchema = z.looseObject({ "user": UserSchema })
export type Root = z.infer<typeof RootSchema>
`,
        },
      ],
    };

    assert(
      { ...result, files: normalizeFiles(result.files) },
      { ...expected, files: normalizeFiles(expected.files) }
    );
  });
});
