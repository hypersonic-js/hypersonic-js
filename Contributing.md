# Contributing

## Prerequisites

- Node.js `^24.0.0`
- pnpm `pnpm@latest`
- Docker (required for the test app's Postgres database)

## Setup

```bash
git clone https://github.com/hypersonic-js/hypersonic-js/
cd hypersonic-js
pnpm install
```

## Common commands

| Command | Description |
|---|---|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm lint` | Lint all packages |
| `pnpm docs:dev` | Start the docs dev server |
| `pnpm docs:build` | Build the docs |
| `pnpm run licenses` | Regenerate `THIRD_PARTY_LICENSES.md` |

To target a specific package:

```bash
pnpm test --filter @hypersonic-js/test-app
```
```bash
pnpm build --filter @hypersonic-js/test-app
```

## Test app

`apps/test-app` is a Hypersonic.js application used for testing features with a live app and Postgres database. Some tests in the suite require docker it to be running.

First-time setup for `apps/test-app`:

```bash
cd apps/test-app
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:generate
```

See [`apps/test-app/README.md`](./apps/test-app/Readme.md) for full details including admin setup and available database commands.

## Releases

This repo uses [Changesets](https://github.com/changesets/changesets).

| Command                  | Description                                |
|--------------------------|--------------------------------------------|
| `pnpm changeset`         | Describe what changed (patch/minor/major)  |
| `pnpm changeset version` | Bump versions + update CHANGELOG.md        |
| `npm login`              | Authenticate through the terminal          |
| `pnpm release`           | Build + generate licenses + publish to npm |

## Code Quality

All PRs should come with tests, with a target of 99% test coverage.

## Security Issues

If you find a security vulnerability please don't open a PR — use [GitHub Security Advisories](https://github.com/hypersonic-js/hypersonic-js/security/advisories) for this repository instead.