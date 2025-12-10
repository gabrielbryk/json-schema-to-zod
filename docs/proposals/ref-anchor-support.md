# Proposal: Robust `$ref` / `$id` / `$anchor` / `$dynamicRef` Support

## Goals
- Resolve `$ref` using full URI semantics (RFC 3986), not just `#/` pointers.
- Support `$id`/`$anchor`/`$dynamicAnchor`/`$dynamicRef` (and legacy `$recursiveRef/$recursiveAnchor`).
- Keep resolver logic in the analyzer/IR layer so emitters/strategies stay SOLID (SRP/OCP).
- Provide hooks for external schema resolution and unresolved-ref handling.
- Preserve existing `$defs`/JSON Pointer behavior for compatibility.

## Architecture alignment (with bundle refactor)
- Implement ref/anchor logic in the analyzer; emitters consume IR edges, not URIs.
- Define a pluggable `RefResolutionStrategy` used by the analyzer:
  - Inputs: `ref`, `contextBaseUri`, `dynamicStack`, `registry`, optional `externalResolver`, `onUnresolvedRef`.
  - Output: resolved IR node (or unresolved marker/fallback).
- Registry and dynamic stacks are built/maintained during analysis; IR carries resolved targets keyed by URI+fragment.

## Plan

### 1) Build a URI/anchor registry (analyzer prepass)
- Walk the schema once, tracking base URI (respect `$id`).
- Register base URI entries, `$anchor` (base#anchor), `$dynamicAnchor` (base#anchor, dynamic flag).
- Handle relative `$id` resolution per RFC 3986.
- Attach registry to IR/context.

### 2) URI-based ref resolution
- `resolveRef(ref, contextBaseUri, registry, dynamicStack)`:
  - Resolve against `contextBaseUri` → absolute URI; split base/fragment.
  - For `$dynamicRef`, search `dynamicStack` top-down for matching anchor; else fallback to registry lookup.
  - For normal `$ref`, look up base+fragment in registry; empty fragment hits base entry.
  - On miss: invoke `onUnresolvedRef` hook and return unresolved marker.
- Analyzer produces IR references keyed by resolved URI+fragment; name generation uses this key.

### 3) Thread base URI & dynamic stack in analyzer
- Extend analyzer traversal context (similar to Refs) with `currentBaseUri`, `dynamicAnchors`.
- On `$id`, compute new base; pass to children.
- On `$dynamicAnchor`, push onto stack for node scope; pop on exit.
- Emitters receive IR that already encodes resolved refs.

### 4) Legacy recursive keywords
- Treat `$recursiveAnchor` as a special dynamic anchor name.
- Treat `$recursiveRef` like `$dynamicRef` targeting that name.

### 5) External refs (optional, pluggable)
- Analyzer option `resolveExternalRef(uri)` (sync/async) to fetch external schemas.
- On external base URI miss, call resolver, prewalk and cache registry for that URI, then resolve.
- Guard against cycles with in-progress cache.

### 6) Naming & cycles
- Key ref names by resolved URI+fragment; store map in IR for consistent imports/aliases.
- Preserve cycle detection using these names.

### 7) Error/warning handling
- Option `onUnresolvedRef(uri, path)` for logging/throwing.
- Policy for fallback (`z.any()`/`z.unknown()` or error) lives in emitter/strategy but is driven by analyzer’s unresolved marker.

### 8) Tests
- Analyzer-level tests: `$id`/`$anchor` resolution (absolute/relative), `$dynamicAnchor`/`$dynamicRef` scoping, legacy recursive, external resolver stub, cycles, backward-compatible `#/` refs.
- Strategy/emitter tests: bundle imports for cross-file refs, naming stability with URI keys.

### 9) Migration steps
- Add registry prepass and URI resolver in analyzer.
- Thread `currentBaseUri`/`dynamicAnchors` through analysis context.
- Produce IR refs keyed by resolved URI; update naming map/cycle tracking.
- Add resolver hooks and unresolved handling.
- Add tests/fixtures; keep emitters unchanged except to consume new IR ref keys.
