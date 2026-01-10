import { SchemaRepresentation } from "../Types.js";
import { zodNull } from "../utils/schemaRepresentation.js";

export const parseNull = (): SchemaRepresentation => zodNull();
