export type NameForPathHook = (
  path: (string | number)[],
  ctx: { parentName?: string; existingNames: Set<string>; branchInfo?: unknown }
) => string;

export type GenerateNameOptions = {
  parentName?: string;
  path: (string | number)[];
  existingNames: Set<string>;
  branchInfo?: unknown;
  nameForPath?: NameForPathHook;
  schemaTitle?: string;
};

/**
 * Generate a stable PascalCase name for a lifted inline schema.
 * - Uses parentName as a base (default: Root).
 * - Adds path segments (properties/indices) to disambiguate.
 * - Applies suffixes to avoid collisions.
 * - Allows an optional hook to override naming.
 */
export const generateNameFromPath = (options: GenerateNameOptions): string => {
  const { parentName, path, existingNames, branchInfo, nameForPath, schemaTitle } = options;

  if (nameForPath) {
    const custom = nameForPath(path, { parentName, existingNames, branchInfo });
    if (custom) {
      return ensureUnique(custom, existingNames);
    }
  }

  const baseParent = parentName ? toPascalCase(parentName) : "Root";
  const branchSegment = branchInfo ? toPascalCase(String(branchInfo)) : undefined;
  const segments = path.map((segment) => {
    if (typeof segment === "number") {
      return `Option${segment}`;
    }
    const pascal = toPascalCase(segment);
    return pascal || "Anon";
  });

  const preferredTitle = schemaTitle ? toPascalCase(schemaTitle) : undefined;
  if (preferredTitle && !existingNames.has(preferredTitle)) {
    return preferredTitle;
  }

  const prefix = branchSegment ? [baseParent, branchSegment] : [baseParent];
  let fallbackBase = [...prefix, ...segments].join("") || baseParent;

  for (let k = 1; k <= segments.length; k += 1) {
    const candidate = [...prefix, ...segments.slice(-k)].join("");
    if (candidate && !existingNames.has(candidate)) {
      return candidate;
    }
  }

  // If we still collide, prefer the title with suffix if available, otherwise suffix the full path.
  if (preferredTitle) {
    fallbackBase = preferredTitle;
  }

  return ensureUnique(fallbackBase, existingNames);
};

const ensureUnique = (candidate: string, existingNames: Set<string>): string => {
  if (!existingNames.has(candidate)) return candidate;

  let i = 2;
  while (existingNames.has(`${candidate}${i}`)) {
    i += 1;
  }
  return `${candidate}${i}`;
};

const toPascalCase = (value: string): string => {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
};
