import { SchemaRepresentation } from "../Types.js";

export const parseNull = (): SchemaRepresentation => ({
  expression: "z.null()",
  type: "z.ZodNull",
});
