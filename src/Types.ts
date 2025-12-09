export type Serializable =
  | { [key: string]: Serializable }
  | Serializable[]
  | string
  | number
  | boolean
  | null;

export type JsonSchema = JsonSchemaObject | boolean;
export type JsonSchemaObject = {
  // left permissive by design
  type?: string | string[];
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  definitions?: Record<string, JsonSchema>;
  title?: string;
  description?: string;
  examples?: Serializable[];
  deprecated?: boolean;
  dependentSchemas?: Record<string, JsonSchema>;
  contains?: JsonSchema;
  minContains?: number;
  maxContains?: number;

  // object
  properties?: { [key: string]: JsonSchema };
  additionalProperties?: JsonSchema;
  unevaluatedProperties?: boolean | JsonSchema;
  patternProperties?: { [key: string]: JsonSchema };
  minProperties?: number;
  maxProperties?: number;
  required?: string[] | boolean;
  propertyNames?: JsonSchema;

  // array
  items?: JsonSchema | JsonSchema[];
  additionalItems?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // string
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  // number
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  multipleOf?: number;

  // unions
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];

  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;

  // shared
  const?: Serializable;
  enum?: Serializable[];

  errorMessage?: { [key: string]: string | undefined };
} & { [key: string]: any };

export type ParserSelector = (schema: JsonSchemaObject, refs: Refs) => string;
export type ParserOverride = (
  schema: JsonSchemaObject,
  refs: Refs,
) => string | void;

export type Options = {
  name?: string;
  module?: "cjs" | "esm" | "none";
  withoutDefaults?: boolean;
  withoutDescribes?: boolean;
  withJsdocs?: boolean;
  /** Use .meta() instead of .describe() - includes id, title, description */
  withMeta?: boolean;
  parserOverride?: ParserOverride;
  depth?: number;
  type?: boolean | string;
  noImport?: boolean;
  /** Export all generated reference schemas (for $refs) when using ESM */
  exportRefs?: boolean;
  /**
   * Store original JSON Schema constructs in .meta({ __jsonSchema: {...} })
   * for features that can't be natively represented in Zod (patternProperties,
   * if/then/else, etc.). This enables round-trip conversion back to JSON Schema.
   */
  preserveJsonSchemaForRoundTrip?: boolean;
  /**
   * Use z.unknown() instead of z.any() for fallback cases.
   * This provides better type safety as z.unknown() requires type checking
   * before using the value, while z.any() bypasses TypeScript checks entirely.
   * @default false
   */
  useUnknown?: boolean;
  /**
   * Enforce strict oneOf semantics where exactly one schema must match.
   * When false (default), oneOf behaves like "at least one must match" (same as Zod union).
   * When true, adds superRefine to enforce "exactly one must match".
   *
   * Note: Strict enforcement often fails with schemas that have overlapping base types.
   * @default false
   */
  strictOneOf?: boolean;
};

export type Refs = Options & {
  path: (string | number)[];
  seen: Map<object | boolean, { n: number; r: string | undefined }>;
  root?: JsonSchema;
  declarations?: Map<string, string>;
  inProgress?: Set<string>;
  refNameByPointer?: Map<string, string>;
  usedNames?: Set<string>;
  currentSchemaName?: string;
};

export type SimpleDiscriminatedOneOfSchema<D extends string = string> = JsonSchemaObject & {
  oneOf: (JsonSchemaObject & {
    type: "object";
    properties: {
      [K in D]: JsonSchemaObject & { type: "string" };
    } & {
      [key: string]: JsonSchemaObject
    };
  })[];
  discriminator: {
    propertyName: D;
  };
}
