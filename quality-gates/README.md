# Quality Gates

This directory is synchronized from ArchKit and owned by this project.

## Run

```bash
pnpm run gate
```

Official layers: generic

Add project-specific `.js` gates under `gates/`. Each module exports `check(projectRoot)` and returns `string[]` or `Promise<string[]>`.
