export type Serializable =
  | { [key: string]: Serializable }
  | Serializable[]
  | string
  | number
  | boolean
  | null;

/**
 * Dual representation of a Zod schema - tracks both the runtime expression
 * and its TypeScript type annotation for proper recursive schema typing.
 */
export type SchemaNode =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "null" }
  | { kind: "undefined" }
  | { kind: "any" }
  | { kind: "unknown" }
  | { kind: "never" }
  | { kind: "bigint" }
  | { kind: "date" }
  | { kind: "literal"; value: Serializable }
  | { kind: "enum"; values: Serializable[]; typeStyle?: "array" | "object" }
  | { kind: "ref"; name: string }
  | { kind: "lazy"; inner: SchemaNode; typeArg?: string }
  | { kind: "array"; inner: SchemaNode }
  | { kind: "optional"; inner: SchemaNode }
  | { kind: "exactOptional"; inner: SchemaNode }
  | { kind: "nullable"; inner: SchemaNode; style?: "method" | "wrapper" }
  | { kind: "default"; inner: SchemaNode; value: Serializable }
  | { kind: "readonly"; inner: SchemaNode }
  | { kind: "describe"; inner: SchemaNode; description: string }
  | { kind: "meta"; inner: SchemaNode; meta: string }
  | { kind: "union"; options: SchemaNode[]; readonly?: boolean }
  | { kind: "discriminatedUnion"; discriminator: string; options: SchemaNode[]; readonly?: boolean }
  | { kind: "xor"; options: SchemaNode[]; readonly?: boolean }
  | { kind: "intersection"; left: SchemaNode; right: SchemaNode }
  | { kind: "and"; base: SchemaNode; other: SchemaNode }
  | { kind: "tuple"; items: SchemaNode[]; rest?: SchemaNode | null }
  | { kind: "record"; key: SchemaNode; value: SchemaNode; mode?: "default" | "loose" }
  | { kind: "map"; key: SchemaNode; value: SchemaNode }
  | { kind: "set"; value: SchemaNode }
  | {
      kind: "object";
      shape: Array<{ key: string; value: SchemaNode; isGetter?: boolean; jsdoc?: string }>;
      mode?: "default" | "strict" | "loose";
    }
  | { kind: "catchall"; base: SchemaNode; catchall: SchemaNode }
  | { kind: "superRefine"; base: SchemaNode; refine: string }
  | { kind: "refine"; base: SchemaNode; refine: string }
  | { kind: "transform"; base: SchemaNode; transform: string }
  | { kind: "pipe"; first: SchemaNode; second: SchemaNode; params?: string }
  | { kind: "coerce"; to: "string" | "number" | "boolean" | "date" }
  | { kind: "call"; callee: string; args: string[]; type: string }
  | { kind: "chain"; base: SchemaNode; method: string };

export interface SchemaRepresentation {
  /** The Zod runtime expression, e.g., "z.array(MySchema).optional()" */
  expression: string;
  /** The Zod TypeScript type, e.g., "z.ZodOptional<z.ZodArray<typeof MySchema>>" */
  type: string;
  /** Structured IR node for normalization/optimization (optional during migration). */
  node?: SchemaNode;
}

export type JsonSchema = JsonSchemaObject | boolean;
export type JsonSchemaObject = {
  // left permissive by design
  type?: string | string[];
  $id?: string;
  $ref?: string;
  $anchor?: string;
  $dynamicRef?: string;
  $dynamicAnchor?: string;
  $recursiveRef?: string;
  $recursiveAnchor?: boolean;
  $defs?: Record<string, JsonSchema>;
  definitions?: Record<string, JsonSchema>;
  title?: string;
  description?: string;
  examples?: Serializable | Serializable[];
  deprecated?: boolean;
  dependentSchemas?: Record<string, JsonSchema>;
  dependentRequired?: Record<string, string[]>;
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
  prefixItems?: JsonSchema[];
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
} & Record<string, unknown>;

export type ParserSelector = (schema: JsonSchemaObject, refs: Refs) => SchemaRepresentation;
export type ParserOverride = (schema: JsonSchemaObject, refs: Refs) => SchemaRepresentation | void;

export type NamingContext = { isRoot: boolean; isLifted: boolean };

export type NamingOptions = {
  /** Customize the const name for schemas. Defaults to appending "Schema". */
  schemaName?: (baseName: string, ctx: NamingContext) => string;
  /** Customize the type name for schemas. Defaults to baseName when naming is enabled. */
  typeName?: (baseName: string, ctx: NamingContext) => string | undefined;
};

export type Options = {
  name?: string;
  withoutDefaults?: boolean;
  withoutDescribes?: boolean;
  withJsdocs?: boolean;
  /** Use .meta() instead of .describe() - includes id, title, description */
  withMeta?: boolean;
  /** Customize schema and type naming for root and lifted schemas. */
  naming?: NamingOptions;
  parserOverride?: ParserOverride;
  depth?: number;
  type?: boolean | string;
  noImport?: boolean;
  /** Export all generated reference schemas (for $refs) when using ESM */
  exportRefs?: boolean;
  /**
   * Export TypeScript types for all generated schemas using z.infer.
   * When true, exports a type for each schema (including lifted/ref schemas when exportRefs is true).
   * Type names match their corresponding schema const names.
   * @example
   * // With typeExports: true, exportRefs: true, and name: "MySchema"
   * export const SubSchema = z.object({...});
   * export type SubSchema = z.infer<typeof SubSchema>;
   * export const MySchema = z.object({ sub: SubSchema });
   * export type MySchema = z.infer<typeof MySchema>;
   */
  typeExports?: boolean;
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
  /**
   * Strategy for handling recursive oneOf schemas.
   * - "auto": use union for recursive oneOf when needed (default)
   * - "union": always use z.union for oneOf
   * - "xor": always use z.xor for oneOf
   * @default "auto"
   */
  recursiveOneOfStrategy?: "auto" | "union" | "xor";
  /**
   * Per-schema overrides for oneOf strategy.
   * Keys can match schema const names (e.g. "TaskSchema"), base names (e.g. "Task"),
   * or schema titles.
   */
  oneOfOverrides?: Record<string, "union" | "xor">;
  /**
   * Wrap recursive union schemas in z.lazy() to improve TypeScript inference.
   * This is useful for mutually recursive discriminated unions with optional properties.
   * @default false
   */
  lazyRecursiveUnions?: boolean;
  /**
   * Root schema instance for JSON Pointer resolution (#/...).
   */
  root?: JsonSchema;
  /**
   * Full document root schema instance for cross-reference resolution.
   */
  documentRoot?: JsonSchema;
  /**
   * Called when a string format is encountered that has no built-in mapping.
   * Can be used to log or throw on unknown formats.
   */
  onUnknownFormat?: (format: string, path: (string | number)[]) => void;
  /**
   * Called when a $ref/$dynamicRef cannot be resolved.
   * Can be used to log or throw on unknown references.
   */
  onUnresolvedRef?: (ref: string, path: (string | number)[]) => void;
  /**
   * Optional resolver for external $ref URIs.
   * Return a JsonSchema to register, or undefined if not found.
   */
  resolveExternalRef?: (uri: string) => JsonSchema | Promise<JsonSchema> | undefined;
  /** Root/base URI for the document */
  rootBaseUri?: string;
  /** Prebuilt registry of resolved URIs/anchors */
  refRegistry?: Map<
    string,
    {
      schema: JsonSchema;
      path: (string | number)[];
      baseUri: string;
      dynamic?: boolean;
      anchor?: string;
    }
  >;
  /**
   * Lift inline object schemas into top-level defs to improve reusability.
   * Default is ON; set enable: false to opt out.
   */
  liftInlineObjects?: {
    /** Whether to enable lifting inline object schemas (default: true). */
    enable?: boolean;
    /** Optional hook to override generated names for lifted defs. */
    nameForPath?: (
      path: (string | number)[],
      ctx: { parentName?: string; existingNames: Set<string>; branchInfo?: unknown }
    ) => string;
    /** Deduplicate lifted shapes by structural hash (ignoring titles/descriptions). Default: false. */
    dedup?: boolean;
    /** Allow hoisting inside $defs content (default: true). */
    allowInDefs?: boolean;
  };
};

export type Refs = Options & {
  path: (string | number)[];
  seen: Map<object | boolean, { n: number; r: SchemaRepresentation | undefined }>;
  root?: JsonSchema;
  /** Stores schema declarations with both expression and type */
  declarations?: Map<string, SchemaRepresentation>;
  dependencies?: Map<string, Set<string>>;
  inProgress?: Set<string>;
  refNameByPointer?: Map<string, string>;
  refBaseNameByPointer?: Map<string, string>;
  baseNameBySchema?: Map<string, string>;
  usedNames?: Set<string>;
  usedBaseNames?: Set<string>;
  currentSchemaName?: string;
  cycleRefNames?: Set<string>;
  cycleComponentByName?: Map<string, number>;
  catchallRefNames?: Set<string>;
  /** Base URI in scope while traversing */
  currentBaseUri?: string;
  /** Root/base URI for the document */
  rootBaseUri?: string;
  /** Prebuilt registry of resolved URIs/anchors */
  refRegistry?: Map<
    string,
    {
      schema: JsonSchema;
      path: (string | number)[];
      baseUri: string;
      dynamic?: boolean;
      anchor?: string;
    }
  >;
  definitions?: Record<string, JsonSchema>;
  /** Stack of active dynamic anchors (nearest last) */
  dynamicAnchors?: { name: string; uri: string; path: (string | number)[] }[];
};

export type SimpleDiscriminatedOneOfSchema<D extends string = string> = JsonSchemaObject & {
  oneOf: (JsonSchemaObject & {
    type: "object";
    properties: {
      [K in D]: JsonSchemaObject & { type: "string" };
    } & {
      [key: string]: JsonSchemaObject;
    };
  })[];
  discriminator: {
    propertyName: D;
  };
};
