import { JsonSchema, JsonSchemaObject } from "../Types.js";
import { generateNameFromPath, NameForPathHook } from "./namingService.js";
import { buildRefRegistry } from "./buildRefRegistry.js";
import { resolveRef } from "./resolveRef.js";
import { resolveUri } from "./resolveUri.js";

type LiftOptions = {
  enable?: boolean;
  nameForPath?: NameForPathHook;
  parentName?: string;
  dedup?: boolean;
  allowInDefs?: boolean;
};

export type LiftResult = {
  schema: JsonSchema;
  defs: Record<string, JsonSchema>;
  addedDefNames: string[];
  pathToDefName: Map<string, string>;
};

/**
 * Conservatively lift inline object-like schemas into top-level $defs.
 * Skips when disabled or when candidates are ambiguous (contains $ref/dynamicRef).
 */
export const liftInlineObjects = (schema: JsonSchema, options: LiftOptions): LiftResult => {
  if (!options.enable || typeof schema !== "object" || schema === null) {
    return { schema, defs: getDefs(schema), addedDefNames: [], pathToDefName: new Map() };
  }

  // Clone to avoid mutating user-provided schema
  const root: JsonSchemaObject = JSON.parse(JSON.stringify(schema));
  const defs = getDefs(root);
  const existingNames = new Set(Object.keys(defs));
  const addedDefNames: string[] = [];
  const pathToDefName = new Map<string, string>();
  const hashToDef = new Map<string, string>();
  const { registry: refRegistry, rootBaseUri } = buildRefRegistry(root);
  const cyclePaths = computeCyclicPaths(root, refRegistry, rootBaseUri);

  const parentBase = options.parentName ?? (typeof root.title === "string" ? root.title : "Root");

  const transformed = visit(root, {
    path: [],
    inDefs: false,
    parentName: parentBase,
    defs,
    existingNames,
    addedDefNames,
    pathToDefName,
    nameForPath: options.nameForPath,
    dedup: options.dedup === true,
    hashToDef,
    refRegistry,
    rootBaseUri,
    allowInDefs: options.allowInDefs !== false,
    rootSchema: root,
    cyclePaths,
  });

  // Persist defs back on root
  (transformed as JsonSchemaObject).$defs = defs;

  return { schema: transformed, defs, addedDefNames, pathToDefName };
};

type VisitContext = {
  path: (string | number)[];
  inDefs: boolean;
  parentName?: string;
  parentSchemaTitle?: string; // Title from parent schema (e.g., oneOf branch title)
  defs: Record<string, JsonSchema>;
  existingNames: Set<string>;
  addedDefNames: string[];
  pathToDefName: Map<string, string>;
  nameForPath?: NameForPathHook;
  context?: ContextKind;
  dedup: boolean;
  hashToDef: Map<string, string>;
  refRegistry: Map<string, { schema: JsonSchema; path: (string | number)[]; baseUri: string }>;
  rootBaseUri: string;
  allowInDefs: boolean;
  rootSchema: JsonSchemaObject;
  cyclePaths: Set<string>;
};

type ContextKind =
  | "root"
  | "properties"
  | "patternProperties"
  | "additionalProperties"
  | "items"
  | "additionalItems"
  | "dependentSchemas"
  | "contains"
  | "unevaluatedProperties"
  | "not"
  | "if"
  | "then"
  | "else"
  | "allOf"
  | "anyOf"
  | "oneOf";

const allowedHoistContexts: ContextKind[] = [
  "properties",
  "patternProperties",
  "additionalProperties",
  "items",
  "additionalItems",
  "dependentSchemas",
  "contains",
  "unevaluatedProperties",
];

const visit = (node: unknown, ctx: VisitContext): JsonSchema => {
  if (Array.isArray(node)) {
    return node.map((entry, index) =>
      visit(entry, { ...ctx, path: [...ctx.path, index], context: ctx.context }),
    ) as unknown as JsonSchema;
  }

  if (typeof node !== "object" || node === null) return node as JsonSchema;

  const obj = node as Record<string, unknown>;

  const isRef = typeof obj.$ref === "string" || typeof obj.$dynamicRef === "string";
  const isObjectLike = isObjectSchema(obj);

  const canLift =
    isObjectLike &&
    !isRef &&
    ctx.path.length > 0 &&
    ctx.context !== undefined &&
    allowedHoistContexts.includes(ctx.context) &&
    !subtreeHasCycle(obj, ctx, ctx.path) &&
    // Allow refs inside the candidate; only block if the candidate itself is a ref/dynamicRef (handled above).
    !isRecursiveRef(obj, ctx) &&
    !isMetaOnly(obj);

  if (canLift) {
    const branchInfo = extractCallConst(ctx);
    // Use schema's own title, fall back to parent schema title (e.g., from oneOf branch)
    const schemaTitle = typeof obj.title === "string" ? obj.title : ctx.parentSchemaTitle;
    const defName = generateNameFromPath({
      parentName: ctx.parentName,
      path: ctx.path,
      existingNames: ctx.existingNames,
      branchInfo,
      schemaTitle,
      nameForPath: ctx.nameForPath,
    });

    ctx.existingNames.add(defName);
    ctx.addedDefNames.push(defName);
    ctx.pathToDefName.set(ctx.path.join("/"), defName);

    const candidateClone = deepTransform(obj, ctx, false);
    const hash = ctx.dedup ? structuralHash(candidateClone) : null;

    if (hash && ctx.hashToDef.has(hash)) {
      const existingName = ctx.hashToDef.get(hash)!;
      return { $ref: `#/$defs/${existingName}` } as JsonSchemaObject;
    }

    if (hash) {
      ctx.hashToDef.set(hash, defName);
    }

    ctx.defs[defName] = candidateClone;

    return { $ref: `#/$defs/${defName}` } as JsonSchemaObject;
  }

  return deepTransform(obj, ctx, false);
};

const deepTransform = (obj: Record<string, unknown>, ctx: VisitContext, forceInDefs: boolean): JsonSchemaObject => {
  const nextInDefs = ctx.inDefs || forceInDefs;
  const clone: Record<string, unknown> = { ...obj };

  // Extract current object's title to pass to children (e.g., oneOf branch title)
  const currentTitle = typeof obj.title === "string" ? obj.title : undefined;

  // $defs are handled via ctx.defs; skip hoisting inside them.

  // properties - pass current schema's title as parentSchemaTitle for child properties
  if (clone.properties && typeof clone.properties === "object") {
    const newProps: Record<string, JsonSchema> = {};
    for (const [key, value] of Object.entries(clone.properties as Record<string, unknown>)) {
      newProps[key] = visit(value, {
        ...ctx,
        path: [...ctx.path, key],
        inDefs: nextInDefs,
        context: "properties",
        parentSchemaTitle: currentTitle,
      });
    }
    clone.properties = newProps;
  }

  // $defs traversal (hoist inside defs if allowed)
  if (clone.$defs && typeof clone.$defs === "object" && ctx.allowInDefs) {
    const defsObj = clone.$defs as Record<string, unknown>;
    for (const [key, value] of Object.entries(defsObj)) {
      const visited = visit(value, { ...ctx, path: [...ctx.path, "$defs", key], inDefs: true, context: "root" });
      ctx.defs[key] = visited;
    }
    clone.$defs = ctx.defs;
  }

  // patternProperties
  if (clone.patternProperties && typeof clone.patternProperties === "object") {
    const newPatterns: Record<string, JsonSchema> = {};
    for (const [key, value] of Object.entries(clone.patternProperties as Record<string, unknown>)) {
      newPatterns[key] = visit(value, { ...ctx, path: [...ctx.path, key], inDefs: nextInDefs, context: "patternProperties" });
    }
    clone.patternProperties = newPatterns;
  }

  // additionalProperties
  if (clone.additionalProperties && typeof clone.additionalProperties === "object") {
    clone.additionalProperties = visit(clone.additionalProperties, {
      ...ctx,
      path: [...ctx.path, "additionalProperties"],
      inDefs: nextInDefs,
      context: "additionalProperties",
    });
  }

  // items / additionalItems
  if (clone.items) {
    clone.items = visit(clone.items, { ...ctx, path: [...ctx.path, "items"], inDefs: nextInDefs, context: "items" });
  }
  if (clone.additionalItems) {
    clone.additionalItems = visit(clone.additionalItems, {
      ...ctx,
      path: [...ctx.path, "additionalItems"],
      inDefs: nextInDefs,
      context: "additionalItems",
    });
  }

  // compositions
  for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
    if (Array.isArray(clone[keyword])) {
      clone[keyword] = (clone[keyword] as unknown[]).map((entry, index) =>
        visit(entry, { ...ctx, path: [...ctx.path, keyword, index], inDefs: nextInDefs, context: keyword }),
      );
    }
  }

  // conditionals
  for (const keyword of ["if", "then", "else", "not", "contains", "unevaluatedProperties"] as const) {
    if (clone[keyword]) {
      clone[keyword] = visit(clone[keyword], { ...ctx, path: [...ctx.path, keyword], inDefs: nextInDefs, context: keyword });
    }
  }

  // dependentSchemas
  if (clone.dependentSchemas && typeof clone.dependentSchemas === "object") {
    const newDeps: Record<string, JsonSchema> = {};
    for (const [key, value] of Object.entries(clone.dependentSchemas as Record<string, unknown>)) {
      newDeps[key] = visit(value, {
        ...ctx,
        path: [...ctx.path, "dependentSchemas", key],
        inDefs: nextInDefs,
        context: "dependentSchemas",
      });
    }
    clone.dependentSchemas = newDeps;
  }

  return clone as JsonSchemaObject;
};

const getDefs = (schema: JsonSchema): Record<string, JsonSchema> => {
  if (typeof schema === "object" && schema !== null && typeof (schema as JsonSchemaObject).$defs === "object") {
    return { ...(schema as JsonSchemaObject).$defs } as Record<string, JsonSchema>;
  }
  return {};
};

const isObjectSchema = (schema: Record<string, unknown>): boolean => {
  if (schema.type === "object") return true;
  return Boolean(schema.properties || schema.patternProperties || schema.additionalProperties || schema.required || schema.unevaluatedProperties);
};

const isMetaOnly = (schema: Record<string, unknown>): boolean => {
  const keys = Object.keys(schema);
  return keys.every((k) => ["title", "description", "$id", "$schema", "$anchor", "$dynamicAnchor", "examples"].includes(k));
};

const isRecursiveRef = (schema: Record<string, unknown>, ctx: VisitContext): boolean => {
  // Only guard when refs are present on the schema itself
  const ref = typeof schema.$ref === "string" ? schema.$ref : typeof schema.$dynamicRef === "string" ? schema.$dynamicRef : null;
  if (!ref) return false;

  const resolved = resolveRef(schema as JsonSchemaObject, ref, {
    path: ctx.path,
    seen: new Map(),
    refRegistry: ctx.refRegistry,
    rootBaseUri: ctx.rootBaseUri,
    root: ctx.defs,
  });

  if (!resolved) return false;

  // If the resolved schema is this schema (self) or an ancestor along the path, treat as recursive
  const pointerKey = resolved.pointerKey;
  if (!pointerKey) return false;

  // Check if pointer resolves back to current path or its prefix
  const currentPathStr = ctx.path.join("/");
  const targetPathStr = resolved.path.join("/");

  return targetPathStr === currentPathStr || currentPathStr.startsWith(targetPathStr);
};

const structuralHash = (schema: unknown): string => {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const entries = Object.entries(obj)
        .filter(([key]) => !["title", "description"].includes(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalize(v)]);
      return Object.fromEntries(entries);
    }
    return value;
  };
  const normalized = normalize(schema);
  return JSON.stringify(normalized);
};

const extractCallConst = (ctx: VisitContext): string | undefined => {
  // Inspect the parent object (path minus last segment) for a call const to use as branch info
  if (!ctx.rootSchema || ctx.path.length === 0) return undefined;
  const parentPath = ctx.path.slice(0, -1);
  const parentNode = getAtPath(ctx.rootSchema, parentPath);
  if (parentNode && typeof parentNode === "object" && (parentNode as Record<string, unknown>).properties) {
    const props = (parentNode as Record<string, unknown>).properties as Record<string, unknown>;
    const callProp = props["call"];
    if (callProp && typeof callProp === "object" && (callProp as Record<string, unknown>).const) {
      const v = (callProp as Record<string, unknown>).const;
      if (typeof v === "string") return v;
    }
  }
  return undefined;
};

const getAtPath = (root: JsonSchemaObject, path: (string | number)[]): unknown => {
  let current: unknown = root;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) return undefined;
    if (typeof segment === "number") {
      if (Array.isArray(current) && segment < current.length) {
        current = current[segment];
      } else {
        return undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
};

const normalizePath = (path: (string | number)[]): string => {
  const skip = new Set(["properties", "patternProperties", "dependentSchemas"]);
  const normalized: (string | number)[] = [];
  for (const segment of path) {
    if (typeof segment === "string" && skip.has(segment)) continue;
    normalized.push(segment);
  }
  return normalized.join("/");
};

const computeCyclicPaths = (
  schema: JsonSchemaObject,
  refRegistry: Map<string, { schema: JsonSchema; path: (string | number)[]; baseUri: string }>,
  rootBaseUri: string,
): Set<string> => {
  const edges = new Map<string, Set<string>>();
  const nodes = new Set<string>();

  const addEdge = (from: string, to: string) => {
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from)!.add(to);
  };

  const walk = (node: JsonSchema, path: (string | number)[], baseUri: string, ownerPath: (string | number)[]) => {
    if (typeof node !== "object" || node === null) return;
    const obj = node as JsonSchemaObject;
    const pathStr = normalizePath(path);
    const ownerStr = normalizePath(ownerPath);
    nodes.add(pathStr);
    nodes.add(ownerStr);

    const nextBase = typeof obj.$id === "string" ? resolveUri(baseUri, obj.$id) : baseUri;

    const ref = typeof obj.$ref === "string" ? obj.$ref : typeof obj.$dynamicRef === "string" ? obj.$dynamicRef : obj.$recursiveRef;
    if (typeof ref === "string") {
      const resolved = resolveRef(obj, ref, {
        path,
        refRegistry,
        rootBaseUri,
        root: schema,
        currentBaseUri: nextBase,
        seen: new Map(),
      });
      if (resolved) {
        const targetPath = normalizePath(resolved.path);
        addEdge(ownerStr, targetPath);
        nodes.add(targetPath);
      }
    }

    // $defs
    if (obj.$defs && typeof obj.$defs === "object") {
      for (const [defKey, defVal] of Object.entries(obj.$defs as Record<string, unknown>)) {
        const childPath = [...path, "$defs", defKey];
        addEdge(ownerStr, normalizePath(childPath));
        walk(defVal as JsonSchema, childPath, nextBase, childPath);
      }
    }

    // properties
    if (obj.properties && typeof obj.properties === "object") {
      for (const [propKey, propVal] of Object.entries(obj.properties as Record<string, unknown>)) {
        const childPath = [...path, propKey];
        addEdge(ownerStr, normalizePath(childPath));
        walk(propVal as JsonSchema, childPath, nextBase, childPath);
      }
    }

    // patternProperties
    if (obj.patternProperties && typeof obj.patternProperties === "object") {
      for (const [patKey, patVal] of Object.entries(obj.patternProperties as Record<string, unknown>)) {
        const childPath = [...path, patKey];
        addEdge(ownerStr, normalizePath(childPath));
        walk(patVal as JsonSchema, childPath, nextBase, childPath);
      }
    }

    // dependentSchemas
    if (obj.dependentSchemas && typeof obj.dependentSchemas === "object") {
      for (const [depKey, depVal] of Object.entries(obj.dependentSchemas as Record<string, unknown>)) {
        const childPath = [...path, depKey];
        addEdge(ownerStr, normalizePath(childPath));
        walk(depVal as JsonSchema, childPath, nextBase, childPath);
      }
    }

    // additionalProperties / items / contains / unevaluatedProperties / not / if / then / else
    const singleKeys: (keyof JsonSchemaObject)[] = [
      "additionalProperties",
      "items",
      "additionalItems",
      "contains",
      "unevaluatedProperties",
      "not",
      "if",
      "then",
      "else",
    ];
    for (const key of singleKeys) {
      const value = (obj as Record<string, unknown>)[key];
      if (value && typeof value === "object") {
        const childPath = [...path, key];
        addEdge(ownerStr, normalizePath(childPath));
        walk(value as JsonSchema, childPath, nextBase, childPath);
      }
    }

    // compositions
    for (const key of ["allOf", "anyOf", "oneOf"] as const) {
      const value = (obj as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        value.forEach((v, i) => {
          const childPath = [...path, key, i];
          if (typeof v === "object" && v !== null) addEdge(ownerStr, normalizePath(childPath));
          walk(v as JsonSchema, childPath, nextBase, childPath);
        });
      }
    }
  };

  walk(schema, [], rootBaseUri, []);

  const cycles = new Set<string>();
  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let currentIndex = 0;

  const strongConnect = (v: string) => {
    index.set(v, currentIndex);
    lowLink.set(v, currentIndex);
    currentIndex += 1;
    stack.push(v);
    onStack.add(v);

    const targets = edges.get(v) ?? new Set();
    for (const w of targets) {
      if (!index.has(w)) {
        strongConnect(w);
        lowLink.set(v, Math.min(lowLink.get(v)!, lowLink.get(w)!));
      } else if (onStack.has(w)) {
        lowLink.set(v, Math.min(lowLink.get(v)!, index.get(w)!));
      }
    }

    if (lowLink.get(v) === index.get(v)) {
      const scc: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w === undefined) break;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      const hasSelfLoop = (edges.get(v) ?? new Set()).has(v);
      if (scc.length > 1 || hasSelfLoop) {
        scc.forEach((n) => cycles.add(n));
      }
    }
  };

  nodes.forEach((n) => {
    if (!index.has(n)) strongConnect(n);
  });

  return cycles;
};

const subtreeHasCycle = (node: Record<string, unknown>, ctx: VisitContext, pathPrefix: (string | number)[]): boolean => {
  // Keywords that create structural recursion (require z.lazy()) vs property references
  // When a schema is reached through these keywords and participates in a cycle,
  // it will generate z.lazy() which causes type annotation issues when lifted
  const structuralKeywords = new Set([
    "additionalProperties", "items", "additionalItems", "contains",
    "unevaluatedProperties", "not", "if", "then", "else",
    "allOf", "anyOf", "oneOf"
  ]);

  const rootPathStr = normalizePath(pathPrefix);

  const walk = (value: unknown, path: (string | number)[], parentContext: string | null): boolean => {
    if (typeof value !== "object" || value === null) return false;
    const obj = value as Record<string, unknown>;

    // Check if this node has a $ref that points back to the root or an ancestor
    // This would create self-referential recursion which blocks lifting
    const ref = typeof obj.$ref === "string" ? obj.$ref : typeof obj.$dynamicRef === "string" ? obj.$dynamicRef : null;
    if (ref) {
      // Resolve the ref to see if it points to root or an ancestor
      if (ref.startsWith("#/")) {
        const refPath = ref.slice(2).split("/");
        const refPathStr = normalizePath(refPath);
        // If the ref points to the root path or a prefix of it, this is self-referential
        if (refPathStr === rootPathStr || rootPathStr.startsWith(refPathStr + "/")) {
          return true;
        }
      }
      // Otherwise, $ref to external definitions don't create inline recursion
      return false;
    }

    const pathStr = normalizePath(path);
    // Only check cycle membership if we got here through a structural keyword
    // (not through "properties" which just creates named refs, not z.lazy())
    // For the root node, use the context from the visitor (ctx.context)
    const effectiveContext = parentContext ?? ctx.context;
    if (effectiveContext !== undefined && structuralKeywords.has(effectiveContext)) {
      if (ctx.cyclePaths.has(pathStr)) return true;
    }

    for (const [key, child] of Object.entries(obj)) {
      if (walk(child, [...path, key], key)) return true;
    }
    return false;
  };

  return walk(node, pathPrefix, null);
};
