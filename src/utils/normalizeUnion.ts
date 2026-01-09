import type { SchemaRepresentation } from "../Types.js";

type NormalizeUnionOptions = {
  foldNullable?: boolean;
};

const unionPrefix = "z.union([";
const unionSuffix = "])";

const splitTopLevelList = (input: string, options?: { includeAngles?: boolean }): string[] => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let angleDepth = 0;
  let inString: string | null = null;
  let escapeNext = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }

    if (inString) {
      current += char;
      if (char === "\\") {
        escapeNext = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      inString = char;
      current += char;
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      current += char;
      continue;
    }

    if (options?.includeAngles) {
      if (char === "<") {
        angleDepth += 1;
        current += char;
        continue;
      }
      if (char === ">") {
        angleDepth -= 1;
        current += char;
        continue;
      }
    }

    if (char === "," && depth === 0 && angleDepth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
};

const isPlainUnionExpression = (expression: string): boolean =>
  expression.startsWith(unionPrefix) && expression.endsWith(unionSuffix);

const isPlainUnionType = (type: string): boolean =>
  type.startsWith("z.ZodUnion<") && type.endsWith(">");

const extractUnionMembers = (rep: SchemaRepresentation): SchemaRepresentation[] | undefined => {
  if (!isPlainUnionExpression(rep.expression) || !isPlainUnionType(rep.type)) {
    return undefined;
  }

  const exprInner = rep.expression.slice(unionPrefix.length, -unionSuffix.length).trim();
  if (!exprInner) return undefined;

  const typeStart = rep.type.indexOf("[");
  const typeEnd = rep.type.lastIndexOf("]");
  if (typeStart === -1 || typeEnd === -1 || typeEnd <= typeStart) {
    return undefined;
  }

  const typeInner = rep.type.slice(typeStart + 1, typeEnd).trim();
  if (!typeInner) return undefined;

  const expressions = splitTopLevelList(exprInner);
  const types = splitTopLevelList(typeInner, { includeAngles: true });
  if (expressions.length === 0 || expressions.length !== types.length) {
    return undefined;
  }

  return expressions.map((expression, index) => ({
    expression,
    type: types[index] ?? "z.ZodTypeAny",
  }));
};

const isPlainNull = (rep: SchemaRepresentation): boolean =>
  rep.expression === "z.null()" && rep.type === "z.ZodNull";

const isNullable = (rep: SchemaRepresentation): boolean =>
  rep.expression.endsWith(".nullable()") || rep.type.startsWith("z.ZodNullable<");

const makeNullable = (rep: SchemaRepresentation): SchemaRepresentation => {
  if (isNullable(rep)) return rep;

  return {
    expression: `${rep.expression}.nullable()`,
    type: `z.ZodNullable<${rep.type}>`,
  };
};

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
    if (seen.has(member.expression)) continue;
    seen.add(member.expression);
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
