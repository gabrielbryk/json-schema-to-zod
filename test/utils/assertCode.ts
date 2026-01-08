import ts from "typescript";

const parse = (code: string): ts.SourceFile =>
  ts.createSourceFile("out.ts", code, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);

export const getDefaultExport = (code: string): ts.Expression | undefined => {
  const sf = parse(code);
  const assignment = sf.statements.find(ts.isExportAssignment);
  return assignment?.expression;
};

export const getExportedConst = (code: string, name: string): { initializer: ts.Expression; type?: ts.TypeNode } | undefined => {
  const sf = parse(code);
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    if (!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
        return { initializer: decl.initializer, type: decl.type };
      }
    }
  }
  return undefined;
};

export const getTypeExport = (code: string, name: string): ts.TypeNode | undefined => {
  const sf = parse(code);
  const typeAlias = sf.statements.find(
    (s): s is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(s) &&
      ts.isIdentifier(s.name) &&
      s.name.text === name &&
      (s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false),
  );
  return typeAlias?.type;
};

export const hasImportZod = (code: string): boolean => {
  const sf = parse(code);
  return sf.statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === "zod" &&
      s.importClause?.namedBindings &&
      ts.isNamedImports(s.importClause.namedBindings) &&
      s.importClause.namedBindings.elements.some((el) => el.name.text === "z"),
  );
};
