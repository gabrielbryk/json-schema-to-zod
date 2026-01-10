import type { SchemaNode, SchemaRepresentation } from "../Types.js";
import { fromNode } from "./schemaRepresentation.js";

type NormalizeUnionOptions = {
  foldNullable?: boolean;
};

const ensureNode = (rep: SchemaRepresentation): SchemaNode => {
  if (!rep.node) {
    throw new Error("SchemaRepresentation node missing (no-fallback mode).");
  }
  return rep.node;
};

const extractUnionMembers = (rep: SchemaRepresentation): SchemaRepresentation[] | undefined => {
  const node = ensureNode(rep);
  if (node.kind !== "union") {
    return undefined;
  }
  return node.options.map((option) => fromNode(option));
};

const isPlainNull = (rep: SchemaRepresentation): boolean => ensureNode(rep).kind === "null";

const isNullable = (rep: SchemaRepresentation): boolean => ensureNode(rep).kind === "nullable";

const makeNullable = (rep: SchemaRepresentation): SchemaRepresentation => {
  if (isNullable(rep)) return rep;
  return fromNode({
    kind: "nullable",
    inner: ensureNode(rep),
  });
};

const hashNode = (node: SchemaNode): string => JSON.stringify(node);

export const normalizeUnionMembers = (
  members: SchemaRepresentation[],
  options?: NormalizeUnionOptions
): SchemaRepresentation[] => {
  const flattened: SchemaRepresentation[] = [];

  for (const member of members) {
    const extracted = extractUnionMembers(member);
    if (extracted) {
      flattened.push(...extracted);
    } else {
      flattened.push(member);
    }
  }

  const seen = new Set<string>();
  const unique: SchemaRepresentation[] = [];

  for (const member of flattened) {
    const key = hashNode(ensureNode(member));
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(member);
  }

  if (options?.foldNullable) {
    const nullIndex = unique.findIndex(isPlainNull);
    if (nullIndex !== -1) {
      const nonNull = unique.filter((_, index) => index !== nullIndex);
      if (nonNull.length === 1) {
        return [makeNullable(nonNull[0]!)];
      }
    }
  }

  return unique;
};
