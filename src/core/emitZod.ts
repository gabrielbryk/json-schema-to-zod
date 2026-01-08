import { JsonSchema, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "../parsers/parseSchema.js";
import { expandJsdocs } from "../utils/jsdocs.js";
import { AnalysisResult } from "./analyzeSchema.js";
import { inferTypeFromExpression } from "../utils/schemaRepresentation.js";
import { EsmEmitter } from "../utils/esmEmitter.js";

/**
 * Split a z.object({...}).method1().method2() expression into base and method chain.
 * This is needed for Rule 2: Don't chain methods on recursive types.
 *
 * Only splits if the TOP-LEVEL z.object() contains a getter (not nested ones in .and() etc.)
 */
const splitObjectMethodChain = (expr: string): { base: string; methodChain: string | null } => {
  if (!expr.startsWith("z.object(")) {
    return { base: expr, methodChain: null };
  }

  // Find the matching closing brace for z.object({
  let depth = 1;
  let i = 9; // length of "z.object("

  // Find the opening { of the object literal
  while (i < expr.length && expr[i] !== "{") {
    i++;
  }
  if (i >= expr.length) {
    return { base: expr, methodChain: null };
  }
  const objectLiteralStart = i;
  i++; // move past the {

  // Find the matching }
  while (i < expr.length && depth > 0) {
    const char = expr[i];
    if (char === "{" || char === "(" || char === "[") {
      depth++;
    } else if (char === "}" || char === ")" || char === "]") {
      depth--;
    }
    i++;
  }
  const objectLiteralEnd = i - 1; // position of closing }

  // Extract just the top-level object literal content
  const objectLiteralContent = expr.substring(objectLiteralStart, objectLiteralEnd + 1);

  // Check if the TOP-LEVEL object has a getter (not nested ones)
  // A getter in the top-level object would appear as "get " at depth 1
  if (!hasTopLevelGetter(objectLiteralContent)) {
    return { base: expr, methodChain: null };
  }

  // Now find the closing ) for z.object(
  while (i < expr.length && expr[i] !== ")") {
    i++;
  }
  if (i >= expr.length) {
    return { base: expr, methodChain: null };
  }
  i++; // move past the )

  // Everything after is the method chain
  const base = expr.substring(0, i);
  const methodChain = expr.substring(i);

  // Only return a method chain if there actually is one (like .strict() or .meta())
  // Don't split if the method chain is .and() since that's adding more schema, not metadata
  if (!methodChain || methodChain.length === 0 || methodChain.startsWith(".and(")) {
    return { base: expr, methodChain: null };
  }

  return { base, methodChain };
};

/**
 * Check if an object literal has a getter at its top level (not nested).
 */
const hasTopLevelGetter = (objectLiteral: string): boolean => {
  let depth = 0;
  for (let i = 0; i < objectLiteral.length - 4; i++) {
    const char = objectLiteral[i];
    if (char === "{" || char === "(" || char === "[") {
      depth++;
    } else if (char === "}" || char === ")" || char === "]") {
      depth--;
    } else if (depth === 1 && objectLiteral.substring(i, i + 4) === "get ") {
      // Found "get " at depth 1 (inside the top-level object, not nested)
      return true;
    }
  }
  return false;
};

const orderDeclarations = (
  entries: Array<[string, SchemaRepresentation]>,
  dependencies: Map<string, Set<string>>
): Array<[string, SchemaRepresentation]> => {
  const repByName = new Map<string, SchemaRepresentation>(entries);
  const depGraph = new Map<string, Set<string>>();

  // Seed graph with empty deps for all nodes
  for (const [name] of entries) {
    depGraph.set(name, new Set<string>());
  }

  // Add explicit dependencies (analyzeSchema) filtered to known names
  for (const [from, set] of dependencies.entries()) {
    const onlyKnown = new Set<string>();
    for (const dep of set) {
      if (repByName.has(dep) && dep !== from) {
        onlyKnown.add(dep);
      }
    }
    const current = depGraph.get(from) ?? new Set<string>();
    onlyKnown.forEach((d) => current.add(d));
    depGraph.set(from, current);
  }

  // Add regex-detected dependencies from expressions
  const names = Array.from(repByName.keys());
  for (const [name, rep] of entries) {
    const deps = depGraph.get(name) ?? new Set<string>();
    for (const candidate of names) {
      if (candidate === name) continue;
      const matcher = new RegExp(`\\b${candidate}\\b`);
      if (matcher.test(rep.expression)) {
        deps.add(candidate);
      }
    }
    depGraph.set(name, deps);
  }

  // Kahn's algorithm with stable ordering
  const indegree = new Map<string, number>();
  for (const name of names) indegree.set(name, 0);
  for (const [name, deps] of depGraph.entries()) {
    const count = deps.size;
    if (count > 0) {
      indegree.set(name, (indegree.get(name) ?? 0) + count);
    }
  }

  const queue: string[] = names.filter((n) => (indegree.get(n) ?? 0) === 0);
  const ordered: string[] = [];

  while (queue.length) {
    const current = queue.shift() as string;
    ordered.push(current);
    for (const dep of depGraph.get(current) ?? []) {
      indegree.set(dep, (indegree.get(dep) ?? 1) - 1);
      if ((indegree.get(dep) ?? 0) === 0) {
        queue.push(dep);
      }
    }
  }

  // Fallback in case of cycles: append any remaining nodes
  if (ordered.length < names.length) {
    for (const name of names) {
      if (!ordered.includes(name)) ordered.push(name);
    }
    // const remaining = names.filter((n) => !ordered.includes(n)).sort();
    // ordered.push(...remaining);
  }

  return ordered.map((name) => [name, repByName.get(name)!]);
};

export const emitZod = (analysis: AnalysisResult): string => {
  const { schema, options, refNameByPointer, cycleRefNames, cycleComponentByName } = analysis;

  const { name, type, noImport, exportRefs, typeExports, withMeta, ...rest } = options;

  const declarations = new Map<string, SchemaRepresentation>();
  const dependencies = new Map<string, Set<string>>();

  // Fresh name registry for the emission pass.
  // Seed only with reserved ref names (from $ref resolution) and the root name to keep names stable
  // without inheriting inline allocations from the first pass.
  const emitUsedNames = new Set<string>([...refNameByPointer.values()]);
  if (name) emitUsedNames.add(name);

  const parsedSchema = parseSchema(schema as JsonSchema, {
    name,
    path: [],
    seen: new Map(),
    declarations,
    dependencies,
    inProgress: new Set(),
    refNameByPointer,
    usedNames: emitUsedNames,
    root: schema,
    currentSchemaName: name,
    cycleRefNames,
    cycleComponentByName,
    refRegistry: analysis.refRegistry,
    rootBaseUri: analysis.rootBaseUri,
    ...rest,
    withMeta,
  });

  const jsdocs =
    rest.withJsdocs && typeof schema === "object" && schema !== null && "description" in schema
      ? expandJsdocs(
          typeof (schema as { description?: unknown }).description === "string"
            ? (schema as { description: string }).description
            : ""
        )
      : "";

  const emitter = new EsmEmitter();

  if (!noImport) {
    emitter.addNamedImport("z", "zod");
  }

  if (declarations.size) {
    for (const [refName, rep] of orderDeclarations(
      Array.from(declarations.entries()),
      dependencies
    )) {
      const expression = typeof rep === "string" ? rep : (rep as { expression: string }).expression;
      if (typeof expression !== "string") {
        throw new Error(`Expected declaration expression for ${refName}`);
      }
      const hintedType =
        typeof rep === "object" &&
        rep &&
        "type" in rep &&
        typeof (rep as { type?: string }).type === "string"
          ? (rep as { type?: string }).type
          : undefined;
      const effectiveHint = hintedType === "z.ZodTypeAny" ? undefined : hintedType;

      const hasLazy = expression.includes("z.lazy(");
      const hasGetter = expression.includes("get ");

      // Check if this schema references any cycle members (recursive schemas)
      // This can cause TS7056 when TypeScript tries to serialize the expanded type
      const referencesRecursiveSchema = Array.from(cycleRefNames).some((cycleName) =>
        new RegExp(`\\b${cycleName}\\b`).test(expression)
      );

      // Per Zod v4 docs: type annotations should be on GETTERS for recursive types, not on const declarations.
      // TypeScript can infer the type of const declarations.
      // Exceptions that need explicit type annotation:
      // 1. z.lazy() without getters
      // 2. Any schema that references recursive schemas (to prevent TS7056)
      const needsTypeAnnotation = (hasLazy && !hasGetter) || referencesRecursiveSchema;
      const storedType = needsTypeAnnotation
        ? (effectiveHint ?? inferTypeFromExpression(expression))
        : undefined;

      // Rule 2 from Zod v4: Don't chain methods on recursive types
      // If the schema has getters (recursive), we need to split it:
      // 1. Emit base schema as _RefName
      // 2. Emit decorated schema as RefName = _RefName.methods()
      if (hasGetter && expression.startsWith("z.object(")) {
        const { base, methodChain } = splitObjectMethodChain(expression);

        if (methodChain) {
          // Emit base schema (internal, not exported)
          // No type annotation needed - type is on getters, TypeScript infers the rest
          const baseName = `_${refName}`;
          emitter.addConst({
            name: baseName,
            expression: base,
            exported: false,
          });

          // Emit decorated schema (exported)
          emitter.addConst({
            name: refName,
            expression: `${baseName}${methodChain}`,
            exported: exportRefs,
            typeAnnotation: storedType !== "z.ZodTypeAny" ? storedType : undefined,
          });

          // Export type for this declaration if typeExports is enabled
          if (typeExports && exportRefs) {
            emitter.addTypeExport({
              name: refName,
              type: `z.infer<typeof ${refName}>`,
            });
          }
          continue;
        }
      }

      emitter.addConst({
        name: refName,
        expression,
        exported: exportRefs,
        typeAnnotation: storedType !== "z.ZodTypeAny" ? storedType : undefined,
      });

      // Export type for this declaration if typeExports is enabled
      if (typeExports && exportRefs) {
        emitter.addTypeExport({
          name: refName,
          type: `z.infer<typeof ${refName}>`,
        });
      }
    }
  }

  if (name) {
    emitter.addConst({
      name,
      expression: parsedSchema.expression,
      exported: true,
      jsdoc: jsdocs,
    });
  } else {
    emitter.addDefaultExport({
      expression: parsedSchema.expression,
      jsdoc: jsdocs,
    });
  }

  // Export type for root schema if type option is set, or if typeExports is enabled
  if (name && (type || typeExports)) {
    const typeName =
      typeof type === "string" ? type : `${name[0].toUpperCase()}${name.substring(1)}`;
    emitter.addTypeExport({
      name: typeName,
      type: `z.infer<typeof ${name}>`,
    });
  }

  return emitter.render();
};
