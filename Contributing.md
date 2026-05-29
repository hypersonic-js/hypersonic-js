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

1. Make your changes and open a PR.
2. Run `pnpm changeset` and follow the prompts to describe the change.
3. Commit the generated changeset file alongside your code.
4. On merge to `main`, the release PR is updated automatically.
5. Merging the release PR publishes to npm and tags the release.


## Code Quality

All PRs should come with tests, with a target of 99% test coverage.

## Security Issues

If you find a security vulnerability please don't open a PR, rather use GitHub Security Advisories for this repository.
