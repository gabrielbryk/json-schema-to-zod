import { NamingContext, NamingOptions } from "../Types.js";

export const defaultSchemaName = (baseName: string): string => `${baseName}Schema`;

export const sanitizeIdentifier = (value: string): string => {
  const cleaned = value.replace(/^[^a-zA-Z_$]+/, "").replace(/[^a-zA-Z0-9_$]/g, "");
  return cleaned || "Ref";
};

export const ensureUnique = (candidate: string, used?: Set<string>): string => {
  if (!used) return candidate;
  if (!used.has(candidate)) return candidate;

  let counter = 2;
  let unique = `${candidate}${counter}`;
  while (used.has(unique)) {
    counter += 1;
    unique = `${candidate}${counter}`;
  }
  return unique;
};

export const resolveSchemaName = (
  baseName: string,
  naming: NamingOptions,
  ctx: NamingContext,
  used?: Set<string>
): string => {
  const schemaNameFn = naming.schemaName ?? defaultSchemaName;
  const candidate = sanitizeIdentifier(schemaNameFn(baseName, ctx));
  return ensureUnique(candidate, used);
};

export const resolveTypeName = (
  baseName: string,
  naming: NamingOptions,
  ctx: NamingContext,
  used?: Set<string>
): string | undefined => {
  const typeNameFn = naming.typeName ?? ((name: string) => name);
  const candidate = typeNameFn(baseName, ctx);
  if (!candidate) return undefined;
  const sanitized = sanitizeIdentifier(candidate);
  return ensureUnique(sanitized, used);
};
