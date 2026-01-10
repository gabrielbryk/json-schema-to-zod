import { JsonSchema, SchemaNode, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "../parsers/parseSchema.js";
import { expandJsdocs } from "../utils/jsdocs.js";
import { AnalysisResult } from "./analyzeSchema.js";
import {
  collectRefNames,
  emitExpression,
  emitType,
  nodeHasGetter,
  nodeHasLazy,
} from "../utils/schemaRepresentation.js";
import { EsmEmitter } from "../utils/esmEmitter.js";
import { resolveTypeName } from "../utils/schemaNaming.js";

const splitObjectMethodChain = (
  node: SchemaNode
): { base: SchemaNode; methodChain: string | null } => {
  const chain: string[] = [];
  let current: SchemaNode | undefined = node;

  while (current) {
    switch (current.kind) {
      case "object":
        return {
          base: current,
          methodChain: chain.length ? chain.reverse().join("") : null,
        };
      case "readonly":
        chain.push(".readonly()");
        current = current.inner;
        break;
      case "describe":
        chain.push(`.describe(${JSON.stringify(current.description)})`);
        current = current.inner;
        break;
      case "meta":
        chain.push(`.meta(${current.meta})`);
        current = current.inner;
        break;
      case "default":
        chain.push(`.default(${JSON.stringify(current.value)})`);
        current = current.inner;
        break;
      case "catchall":
        chain.push(`.catchall(${emitExpression(current.catchall)})`);
        current = current.base;
        break;
      case "superRefine":
        chain.push(`.superRefine(${current.refine})`);
        current = current.base;
        break;
      case "refine":
        chain.push(`.refine(${current.refine})`);
        current = current.base;
        break;
      case "transform":
        chain.push(`.transform(${current.transform})`);
        current = current.base;
        break;
      case "pipe":
        chain.push(`.pipe(${emitExpression(current.second)}${current.params ?? ""})`);
        current = current.first;
        break;
      case "chain":
        chain.push(`.${current.method}`);
        current = current.base;
        break;
      default:
        return { base: node, methodChain: null };
    }
  }

  return { base: node, methodChain: null };
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

  // Add dependencies from IR
  const names = Array.from(repByName.keys());
  for (const [name, rep] of entries) {
    const deps = depGraph.get(name) ?? new Set<string>();
    if (!rep.node) {
      throw new Error(`Missing IR node for ${name} (no-fallback mode).`);
    }
    const node = rep.node;
    const refs = collectRefNames(node);
    for (const refName of refs) {
      if (refName !== name && repByName.has(refName)) {
        deps.add(refName);
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
  const {
    schema,
    options,
    refNameByPointer,
    cycleRefNames,
    cycleComponentByName,
    baseNameBySchema,
    rootBaseName,
  } = analysis;

  const { name, type, naming, noImport, exportRefs, typeExports, withMeta, ...rest } = options;

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
    naming,
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
  const usedTypeNames = new Set<string>();

  const resolveDeclarationTypeName = (schemaName: string): string | undefined => {
    if (!naming) return schemaName;
    const baseName = baseNameBySchema.get(schemaName) ?? schemaName;
    return resolveTypeName(baseName, naming, { isRoot: false, isLifted: true }, usedTypeNames);
  };

  if (!noImport) {
    emitter.addNamedImport("z", "zod");
  }

  if (declarations.size) {
    for (const [refName, rep] of orderDeclarations(
      Array.from(declarations.entries()),
      dependencies
    )) {
      if (!rep.node) {
        throw new Error(`Missing IR node for ${refName} (no-fallback mode).`);
      }
      const node = rep.node;
      const expression = emitExpression(node);
      const hintedType = rep.type;
      const effectiveHint = hintedType === "z.ZodTypeAny" ? undefined : hintedType;

      const hasLazy = nodeHasLazy(node);
      const hasGetter = nodeHasGetter(node);

      // Check if this schema references any cycle members (recursive schemas)
      // This can cause TS7056 when TypeScript tries to serialize the expanded type
      let referencesRecursiveSchema = false;
      const refs = collectRefNames(node);
      for (const refName of refs) {
        if (cycleRefNames.has(refName)) {
          referencesRecursiveSchema = true;
          break;
        }
      }

      // Per Zod v4 docs: type annotations should be on GETTERS for recursive types, not on const declarations.
      // TypeScript can infer the type of const declarations.
      // Exceptions that need explicit type annotation:
      // 1. z.lazy() without getters
      // 2. Any schema that references recursive schemas (to prevent TS7056)
      const needsTypeAnnotation = (hasLazy && !hasGetter) || referencesRecursiveSchema;
      const storedType = needsTypeAnnotation ? (effectiveHint ?? emitType(node)) : undefined;

      // Rule 2 from Zod v4: Don't chain methods on recursive types
      // If the schema has getters (recursive), we need to split it:
      // 1. Emit base schema as _RefName
      // 2. Emit decorated schema as RefName = _RefName.methods()
      if (hasGetter) {
        const { base, methodChain } = splitObjectMethodChain(node);

        if (methodChain) {
          // Emit base schema (internal, not exported)
          // No type annotation needed - type is on getters, TypeScript infers the rest
          const baseName = `_${refName}`;
          emitter.addConst({
            name: baseName,
            expression: emitExpression(base),
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
            const typeName = resolveDeclarationTypeName(refName);
            emitter.addTypeExport({
              name: typeName ?? refName,
              type: `z.infer<typeof ${refName}>`,
            });
            if (typeName) {
              usedTypeNames.add(typeName);
            }
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
        const typeName = resolveDeclarationTypeName(refName);
        emitter.addTypeExport({
          name: typeName ?? refName,
          type: `z.infer<typeof ${refName}>`,
        });
        if (typeName) {
          usedTypeNames.add(typeName);
        }
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
    const rootTypeName =
      typeof type === "string"
        ? type
        : naming && rootBaseName
          ? resolveTypeName(rootBaseName, naming, { isRoot: true, isLifted: false }, usedTypeNames)
          : `${name[0].toUpperCase()}${name.substring(1)}`;

    if (rootTypeName) {
      emitter.addTypeExport({
        name: rootTypeName,
        type: `z.infer<typeof ${name}>`,
      });
      usedTypeNames.add(rootTypeName);
    }
  }

  return emitter.render();
};
