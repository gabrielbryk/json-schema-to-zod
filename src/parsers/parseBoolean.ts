import { SchemaRepresentation } from "../Types.js";
import { zodBoolean } from "../utils/schemaRepresentation.js";

export const parseBoolean = (): SchemaRepresentation => zodBoolean();
