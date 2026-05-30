# Contributing

## Prerequisites

- Node.js `^24.0.0`
- pnpm `11.3.0` (`npm install -g pnpm@11.3.0`)

## Setup

```bash
git clone https://github.com/hypersonic-js/hypersonic-js/
cd hypersonic-js
pnpm install
```

## Common commands

| Command | Description                          |
|---|--------------------------------------|
| `pnpm install` | Install packages                     |
| `pnpm build` | Build all packages                   |
| `pnpm test` | Run all tests                        |
| `pnpm test:coverage` | Run tests with coverage              |
| `pnpm lint` | Lint all packages                    |
| `pnpm docs:dev` | Start the docs dev server            |
| `pnpm docs:build` | Build the docs                       |
| `pnpm run licenses` | Regenerate `THIRD_PARTY_LICENSES.md` |

To target a specific package:

```bash
pnpm test --filter @hypersonic/core
pnpm build --filter @hypersonic/core
```

## Releases

This repo uses [Changesets](https://github.com/changesets/changesets).

On each release run the following:

| Command | Description                                |
|---|--------------------------------------------|
| `pnpm changeset` | Describe what changed (patch/minor/major)  |
| `pnpm changeset version` | Bump versions + update CHANGELOG.md        |
| `pnpm release` | Build + generate licenses + publish to npm |


## Code Quality

All PRs should come with tests, with a target of 90% test coverage.

## Security Issues

If you find a security vulnerability please don't open a PR, rather use GitHub Security Advisories for this repository.
