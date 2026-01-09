import { Refs, SchemaRepresentation } from "../Types.js";

const shouldWrapRecursiveUnion = (refs: Refs): boolean => {
  if (!refs.lazyRecursiveUnions) {
    return false;
  }

  const current = refs.currentSchemaName;
  if (!current) {
    return false;
  }

  return refs.cycleRefNames?.has(current) ?? false;
};

export const wrapRecursiveUnion = (refs: Refs, rep: SchemaRepresentation): SchemaRepresentation => {
  if (!shouldWrapRecursiveUnion(refs)) {
    return rep;
  }

  if (rep.expression.startsWith("z.lazy(")) {
    return rep;
  }

  return {
    expression: `z.lazy(() => ${rep.expression})`,
    type: `z.ZodLazy<${rep.type}>`,
  };
};
