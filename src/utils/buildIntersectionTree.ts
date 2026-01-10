import { SchemaRepresentation } from "../Types.js";
import { half } from "./half.js";
import { zodIntersection, zodNever } from "./schemaRepresentation.js";

export const buildIntersectionTree = (members: SchemaRepresentation[]): SchemaRepresentation => {
  if (members.length === 0) {
    return zodNever();
  }
  if (members.length === 1) {
    return members[0]!;
  }
  if (members.length === 2) {
    const [left, right] = members;
    return zodIntersection(left, right);
  }

  const [leftItems, rightItems] = half(members);
  const left = buildIntersectionTree(leftItems);
  const right = buildIntersectionTree(rightItems);

  return zodIntersection(left, right);
};
