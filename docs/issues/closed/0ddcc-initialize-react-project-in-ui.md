---
id: 0ddcc
status: closed
created_at: 2026-08-31T04:00:25.314Z
updated_at: 2026-08-31T04:03:54.847Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-08-31T04:00:36.199Z
closed_at: 2026-08-31T04:03:54.847Z
---

# Initialize React project in ui

## Background

Add the production React + TypeScript + Vite module under `ui/`.

## Scope

- Generate the Vite React TypeScript module in `ui/`.
- Install the requested runtime and development dependencies.
- Configure Tailwind, routing, providers, MSW, and the test script.

## Non-goals

- None.

## Acceptance Criteria

- [x] `ui/` contains a working React TypeScript Vite app.
- [x] `pnpm build` and `pnpm test` pass from `ui/`.
- [x] Root ArchKit inspection passes.

## Implementation

- Generated `ui/` with Vite React TypeScript.
- Added dependencies, Tailwind Vite integration, routing, Query Provider, MSW, and Vitest.

## Verification

- `pnpm build` from `ui/` passed.
- `pnpm test` from `ui/` passed (1 test).
- Root `archkit inspect .` passed.

## Related ADRs

- None.
