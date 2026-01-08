# Tooling Guide

This document provides an overview of all the automated tooling configured in this project.

## 🔍 Code Quality Tools

### ESLint

- **Purpose**: Static code analysis and linting
- **Config**: `eslint.config.js` (ESLint v9 flat config)
- **Run**: `pnpm run lint` or `pnpm run lint:fix`
- **Features**:
  - TypeScript ESLint rules
  - Enforced no `require` imports

### Prettier

- **Purpose**: Code formatting
- **Config**: `.prettierrc`
- **Run**: `pnpm run format:write` or `pnpm run format:check`
- **Settings**:
  - Double quotes
  - Semicolons
  - 100 character line width
  - 2 space indentation

### TypeScript

- **Purpose**: Type checking and compilation
- **Config**: `tsconfig.json`
- **Run**: `pnpm run build:esm`

## ✅ Commit Quality

### Commitlint

- **Purpose**: Enforce conventional commit messages
- **Config**: `commitlint.config.js`
- **Hook**: `.husky/commit-msg`
- **Format**: `type: subject` (e.g., `feat: add new feature`)
- **Allowed types**:
  - `feat`, `fix`, `docs`, `style`, `refactor`
  - `perf`, `test`, `build`, `ci`, `chore`, `revert`

### Husky

- **Purpose**: Git hooks management
- **Config**: `.husky/` directory
- **Hooks**:
  - `pre-commit`: Runs lint-staged
  - `commit-msg`: Runs commitlint

### Lint-staged

- **Purpose**: Run linters on staged files only
- **Config**: `.lintstagedrc.json`
- **Actions**:
  - Format with Prettier
  - Fix with ESLint

## 🧪 Testing

### Jest

- **Purpose**: Unit testing
- **Config**: `jest.config.mjs`
- **Run**: `pnpm run test` or `pnpm run dev` (watch mode)

## 📦 Build & Package

- **Build**: `pnpm run build` (generates index, runs tests, and emits ESM + types)
- **Smoke test**: `pnpm run smoke:esm`

## 📝 Version Management

### Changesets

- **Purpose**: Version management and changelog generation
- **Config**: `.changeset/config.json`
- **Usage**:
  ```bash
  pnpx changeset
  pnpm run local-release
  ```
- **Features**:
  - Semantic versioning
  - Automatic CHANGELOG.md generation

## 🤖 CI/CD

### GitHub Actions - CI Workflow

- **File**: `.github/workflows/ci.yml`
- **Trigger**: Push and Pull Requests
- **Steps**:
  1. Install dependencies with pnpm
  2. Run full CI pipeline (`pnpm run ci`)

### GitHub Actions - Release Workflow

- **File**: `.github/workflows/release.yml`
- **Trigger**: Push to `main` branch
- **Steps**:
  1. Build package
  2. Create Release PR (if changesets exist)
  3. Publish to npm (when Release PR is merged)
- **Setup**: See `.github/RELEASE_SETUP.md`

### GitHub Actions - Security Audit

- **File**: `.github/workflows/security.yml`
- **Trigger**: Weekly schedule and dependency changes
- **Steps**:
  1. Run `pnpm audit`
  2. Warn on high/critical vulnerabilities

### Dependabot

- **File**: `.github/dependabot.yml`
- **Purpose**: Automated dependency updates
- **Schedule**: Weekly on Mondays at 9:00 AM UTC
- **Features**:
  - Groups minor/patch updates
  - Updates GitHub Actions

## 🔄 Workflow Summary

### Development Workflow

```bash
# 1. Make changes
git checkout -b feature/my-feature

# 2. Write code and tests

# 3. Commit (commitlint validates, lint-staged runs)
git commit -m "feat: add new feature"

# 4. Push and create PR
git push origin feature/my-feature

# 5. CI runs automatically on PR
# 6. Merge when CI passes
```

### Release Workflow

```bash
# 1. Create a changeset
pnpx changeset

# 2. Commit changeset
git commit -m "chore: add changeset"

# 3. Push to main (or create a PR)
git push origin main

# 4. The workflow creates a Release PR automatically
# 5. Review and merge Release PR to publish
```

## 📊 Quality Gates

All PRs must pass:

- ✅ Build succeeds
- ✅ Code is formatted (Prettier)
- ✅ No linting errors (ESLint)
- ✅ Tests pass (Jest)
