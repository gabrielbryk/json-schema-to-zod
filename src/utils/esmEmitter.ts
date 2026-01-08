import ts from "typescript";

/**
 * Small structured emitter for ESM/TypeScript snippets using the TS printer.
 * Keeps formatting deterministic (double newlines between statements, trailing newline)
 * while avoiding ad-hoc string concatenation.
 */
export type ConstStatement = {
  name: string;
  expression: string;
  exported?: boolean;
  typeAnnotation?: string;
  jsdoc?: string;
};

export type DefaultExport = {
  expression: string;
  jsdoc?: string;
};

export type TypeExport = {
  name: string;
  type: string;
  jsdoc?: string;
};

const normalizeJsdoc = (jsdoc?: string): string | undefined => {
  if (!jsdoc) return undefined;
  const trimmed = jsdoc.trim();
  if (!trimmed.startsWith("/**")) return `* ${trimmed}`;

  // Strip /** and */ and keep inner content
  const withoutStart = trimmed.replace(/^\/\*\*/, "");
  const withoutEnd = withoutStart.replace(/\*\/$/, "");
  return withoutEnd.trim();
};

const attachJsdoc = <T extends ts.Node>(node: T, jsdoc?: string): T => {
  const normalized = normalizeJsdoc(jsdoc);
  if (!normalized) return node;
  return ts.addSyntheticLeadingComment(
    node,
    ts.SyntaxKind.MultiLineCommentTrivia,
    normalized,
    true
  );
};

const parseExpression = (expression: string): ts.Expression => {
  const sf = ts.createSourceFile(
    "expr.ts",
    `${expression};`,
    ts.ScriptTarget.ES2020,
    false,
    ts.ScriptKind.TS
  );
  const stmt = sf.statements[0];
  if (stmt && ts.isExpressionStatement(stmt)) {
    return stmt.expression;
  }
  throw new Error(`Failed to parse expression: ${expression}`);
};

const parseType = (type: string): ts.TypeNode => {
  const sf = ts.createSourceFile(
    "type.ts",
    `type __T = ${type};`,
    ts.ScriptTarget.ES2020,
    false,
    ts.ScriptKind.TS
  );
  const stmt = sf.statements[0];
  if (stmt && ts.isTypeAliasDeclaration(stmt)) {
    return stmt.type;
  }
  throw new Error(`Failed to parse type: ${type}`);
};

export class EsmEmitter {
  #imports = new Map<string, Set<string>>();
  #statements: Array<{ node: ts.Statement; compact?: boolean }> = [];

  addNamedImport(name: string, source: string): void {
    const set = this.#imports.get(source) ?? new Set<string>();
    set.add(name);
    this.#imports.set(source, set);
  }

  addConst(statement: ConstStatement): void {
    const initializer = parseExpression(statement.expression);
    const typeNode = statement.typeAnnotation ? parseType(statement.typeAnnotation) : undefined;
    const decl = ts.factory.createVariableDeclaration(
      statement.name,
      undefined,
      typeNode,
      initializer
    );
    const modifiers = statement.exported
      ? [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)]
      : undefined;
    const varStmt = ts.factory.createVariableStatement(
      modifiers,
      ts.factory.createVariableDeclarationList([decl], ts.NodeFlags.Const)
    );
    this.#statements.push({ node: attachJsdoc(varStmt, statement.jsdoc) });
  }

  addDefaultExport(statement: DefaultExport): void {
    const assignment = ts.factory.createExportAssignment(
      undefined,
      false,
      parseExpression(statement.expression)
    );
    this.#statements.push({ node: attachJsdoc(assignment, statement.jsdoc) });
  }

  addTypeExport(statement: TypeExport): void {
    const modifiers = [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)];
    const typeAlias = ts.factory.createTypeAliasDeclaration(
      modifiers,
      statement.name,
      undefined,
      parseType(statement.type)
    );
    this.#statements.push({ node: attachJsdoc(typeAlias, statement.jsdoc), compact: true });
  }

  render(): string {
    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
    });
    const sf = ts.createSourceFile("out.ts", "", ts.ScriptTarget.ES2020, false, ts.ScriptKind.TS);

    const importStmts = [...this.#imports.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([source, names]) =>
        ts.factory.createImportDeclaration(
          undefined,
          ts.factory.createImportClause(
            false,
            undefined,
            ts.factory.createNamedImports(
              [...names]
                .sort()
                .map((name) =>
                  ts.factory.createImportSpecifier(
                    false,
                    undefined,
                    ts.factory.createIdentifier(name)
                  )
                )
            )
          ),
          ts.factory.createStringLiteral(source)
        )
      );

    const allStatements: Array<{ node: ts.Statement; compact?: boolean }> = [
      ...importStmts.map((node) => ({ node })),
      ...this.#statements,
    ];
    if (allStatements.length === 0) return "";

    const file = ts.factory.updateSourceFile(
      sf,
      ts.factory.createNodeArray(allStatements.map((s) => s.node))
    );
    const printed = printer.printFile(file);

    return printed.endsWith("\n") ? printed : `${printed}\n`;
  }
}
