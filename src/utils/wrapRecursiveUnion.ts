import { Refs, SchemaRepresentation } from "../Types.js";
import { fromNode } from "./schemaRepresentation.js";

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

  if (rep.node?.kind === "lazy") {
    return rep;
  }

  if (!rep.node) {
    throw new Error("SchemaRepresentation node missing (no-fallback mode).");
  }

  const inner = rep.node;
  return fromNode({
    kind: "lazy",
    inner,
  });
};
