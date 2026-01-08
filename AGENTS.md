# Repository Guidelines

## Project Structure & Module Organization

- `src/`: TypeScript source; CLI entry in `src/cli.ts`, library entry in `src/index.ts`, conversion logic in `src/jsonSchemaToZod.ts`, parsers under `src/parsers/`, and helpers in `src/utils/`.
- `test/`: TS test suite executed via `tsx`; fixtures live in `test/fixtures/`; snapshots in `test/generateSchemaBundle.snap.test.ts`.
- `docs/`: Design proposals. Build outputs land in `dist/`; do not edit generated files.
- `scripts/` and `createIndex.ts`: Codegen utilities used during builds.

## Build, Test, and Development Commands

- Install with `pnpm install` (pinned `pnpm@10.x`).
- `pnpm gen`: Regenerate index exports.
- `pnpm test`: Run the TSX-based test suite.
- `pnpm lint`: Lint `src/` and `test/` with ESLint + @typescript-eslint.
- `pnpm build`: Generate exports, run tests, clear `dist/`, and emit types + CJS/ESM bundles.
- `pnpm dev`: Watch tests for rapid iteration.
- `pnpm smoke:esm`: Quick check that the ESM bundle imports and runs.

## Coding Style & Naming Conventions

- Language: TypeScript with NodeNext/ESM; keep `.js` extensions on internal imports. Package ships ESM-only with flat `dist/`; avoid adding CJS outputs or require-based entrypoints. Build config lives in `tsconfig.build.json`.
- Indentation: 2 spaces; include semicolons; prefer camelCase for functions/vars and PascalCase for types.
- Avoid CommonJS `require`; ESLint forbids it. Keep functions small and pure.
- Use existing utility patterns (e.g., `withMessage`, `buildRefRegistry`) before adding helpers.

## Code Quality & Best Practices

- Type safety first: prefer explicit generics and narrow types over `any`; keep option shapes well-typed and avoid implicit `unknown` casts.
- Embrace SOLID: single-purpose parsers/utilities, extract shared helpers, and inject collaborators instead of hard-coding globals.
- Validate boundary cases: cyclical refs, `$ref` resolution, discriminated unions, and recursion depth—add targeted tests when touching those paths.
- Keep emitted code deterministic; avoid data-dependent randomness or network calls in conversion paths.

## Testing Guidelines

- Tests use a lightweight harness in `test/suite.ts`; add new suites under `test/` mirroring module paths.
- Prefer fixtures in `test/fixtures/` for schema examples; extend snapshots only when behavior intentionally changes.
- Cover new parsing paths; add regression cases for edge refs/recursion.
- Run `pnpm test` (or `pnpm dev`) before opening a PR.

## Commit & Pull Request Guidelines

- Open an issue first; PRs without one are usually not considered (`CONTRIBUTING.md`).
- Commit messages are short and imperative; gitmoji is welcome but optional. Keep related changes in separate commits.
- PRs should describe the problem, approach, and risks; link the issue and note test coverage or added fixtures. Screenshots are unnecessary unless CLI UX changes.
- Keep PR scope tight; avoid editing generated `dist/` files. Mention breaking changes explicitly.

## Security & Configuration Tips

- Avoid adding runtime dependencies that fetch remotely; conversions should stay deterministic and offline.
- When touching CLI paths, ensure `--module`, `--type`, and `$ref` handling stay backward compatible; add tests for recursion and bundle ordering when modifying ref logic.
