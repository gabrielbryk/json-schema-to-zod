import { JsonSchema } from "../Types.js";

export const findRefDependencies = (
  schema: JsonSchema | undefined,
  validDefNames: string[]
): Set<string> => {
  const deps = new Set<string>();

  function traverse(obj: unknown): void {
    if (obj === null || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      obj.forEach(traverse);
      return;
    }

    const record = obj as Record<string, unknown>;

    if (typeof record["$ref"] === "string") {
      const ref = record["$ref"];
      const match = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
      if (match && validDefNames.includes(match[1])) {
        deps.add(match[1]);
      }
    }

    for (const value of Object.values(record)) {
      traverse(value);
    }
  }

  traverse(schema);
  return deps;
};

export const detectCycles = (defNames: string[], deps: Map<string, Set<string>>): Set<string> => {
  const cycleNodes = new Set<string>();
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (recursionStack.has(node)) {
      const cycleStart = path.indexOf(node);
      for (let i = cycleStart; i < path.length; i++) {
        cycleNodes.add(path[i]);
      }
      cycleNodes.add(node);
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    recursionStack.add(node);

    const targets = deps.get(node);
    if (targets) {
      for (const dep of targets) {
        dfs(dep, [...path, node]);
      }
    }

    recursionStack.delete(node);
  }

  for (const defName of defNames) {
    if (!visited.has(defName)) dfs(defName, []);
  }

  return cycleNodes;
};

export const computeScc = (
  defNames: string[],
  deps: Map<string, Set<string>>
): { cycleMembers: Set<string>; componentByName: Map<string, number> } => {
  // Tarjan's algorithm, keeps mapping for quick "is this ref in my cycle?"
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const componentByName = new Map<string, number>();
  const cycleMembers = new Set<string>();
  let currentIndex = 0;
  let componentId = 0;

  const strongConnect = (v: string) => {
    index.set(v, currentIndex);
    lowlink.set(v, currentIndex);
    currentIndex += 1;
    stack.push(v);
    onStack.add(v);

    const neighbors = deps.get(v);
    if (neighbors) {
      for (const w of neighbors) {
        if (!index.has(w)) {
          strongConnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
        }
      }
    }

    if (lowlink.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w === undefined) break;
        onStack.delete(w);
        component.push(w);
        componentByName.set(w, componentId);
      } while (w !== v);

      if (component.length > 1) {
        component.forEach((name) => cycleMembers.add(name));
      }

      componentId += 1;
    }
  };

  for (const name of defNames) {
    if (!index.has(name)) {
      strongConnect(name);
    }
  }

  return { cycleMembers, componentByName };
};
