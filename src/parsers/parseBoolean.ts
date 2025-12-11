import { SchemaRepresentation } from "../Types.js";

export const parseBoolean = (): SchemaRepresentation => ({
  expression: "z.boolean()",
  type: "z.ZodBoolean",
});
