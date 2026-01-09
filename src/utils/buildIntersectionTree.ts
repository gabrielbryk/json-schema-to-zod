import { SchemaRepresentation } from "../Types.js";
import { half } from "./half.js";

export const buildIntersectionTree = (members: SchemaRepresentation[]): SchemaRepresentation => {
  if (members.length === 0) {
    return { expression: "z.never()", type: "z.ZodNever" };
  }
  if (members.length === 1) {
    return members[0]!;
  }
  if (members.length === 2) {
    const [left, right] = members;
    return {
      expression: `z.intersection(${left.expression}, ${right.expression})`,
      type: `z.ZodIntersection<${left.type}, ${right.type}>`,
    };
  }

  const [leftItems, rightItems] = half(members);
  const left = buildIntersectionTree(leftItems);
  const right = buildIntersectionTree(rightItems);

  return {
    expression: `z.intersection(${left.expression}, ${right.expression})`,
    type: `z.ZodIntersection<${left.type}, ${right.type}>`,
  };
};
