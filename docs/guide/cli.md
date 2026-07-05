# CLI

Hypersonic ships a CLI for scaffolding projects and managing the admin dashboard. A scaffolded project also gets two `npm run db:*` scripts that wrap the Prisma CLI — they're included below since you'll reach for them just as often.

```bash
npm install -g @hypersonic-js/cli
```

## Quick reference

| Command | Description |
|---------|--------------|
| [`hypersonic new`](#hypersonic-new) | Scaffolds a new project interactively |
| [`hypersonic admin scaffold`](#hypersonic-admin-scaffold) | Copies the four admin page components into your project |
| [`hypersonic admin generate-meta`](#hypersonic-admin-generate-meta) | Generates `prisma/admin-meta.json` from your Prisma schema |
| [`hypersonic admin create-admin`](#hypersonic-admin-create-admin) | Creates a user with `role: admin` in your database |
| [`npm run db:migrate`](#npm-run-db-migrate) | Applies pending Prisma migrations (`prisma migrate dev`) |
| [`npm run db:generate`](#npm-run-db-generate) | Regenerates the Prisma client after schema changes (`prisma generate`) |

## hypersonic new

Scaffolds a new project interactively. Run this once to create a project — see [Quick Start](/guide/quickstart) for the full walkthrough.

```bash
hypersonic new
```

## hypersonic admin

The `admin` group contains three subcommands for managing the admin dashboard.

### hypersonic admin scaffold

Copies the four admin page components into your project. `hypersonic new` runs this automatically, so you only need it if you deleted the files or are setting up manually.

```bash
hypersonic admin scaffold
```

Writes the following files into `resources/js/Pages/Admin/`:

- `Dashboard.tsx`
- `ModelIndex.tsx`
- `ModelForm.tsx`
- `UserCreate.tsx`

These components are schema-driven and never need to be regenerated after schema changes — only `generate-meta` needs to re-run.

| Option | Default | Description |
|--------|---------|-------------|
| `--target-dir <dir>` | `resources/js/Pages` | Directory to scaffold admin pages into |
| `-f, --force` | `false` | Overwrite existing files |

### hypersonic admin generate-meta

Reads your Prisma schema and writes `prisma/admin-meta.json` — the static metadata the admin dashboard uses at runtime to know which models exist and how to display them.

```bash
hypersonic admin generate-meta
```

**Re-run this every time you change your Prisma schema.** Commit `prisma/admin-meta.json` to your repository.

| Option | Default | Description |
|--------|---------|-------------|
| `--schema <path>` | `prisma/schema.prisma` | Path to Prisma schema file |
| `--output <path>` | `prisma/admin-meta.json` | Output path for the generated meta file |

### hypersonic admin create-admin

Creates a user with `role: admin` in your database. `hypersonic new` runs this automatically at the end of setup. Use it again to add a second admin account from the command line.

```bash
hypersonic admin create-admin
```

Prompts interactively:

```
Email: you@example.com
Name: Your Name
Password:
```

`DATABASE_URL` and `BETTER_AUTH_SECRET` must be set in your `.env` before running this command.

## Database commands

These come from the `db:migrate` and `db:generate` scripts in your scaffolded `package.json` — thin wrappers around the Prisma CLI, not part of the `hypersonic` binary itself.

### npm run db:migrate

Runs `prisma migrate dev`, applying any pending migrations and creating a new one if your schema has changed since the last run.

```bash
npm run db:migrate
```

`hypersonic new` runs this once automatically (as `prisma migrate dev --name init`) while scaffolding your project.

### npm run db:generate

Runs `prisma generate`, regenerating the Prisma client from your current schema.

```bash
npm run db:generate
```

**Re-run this every time you change your Prisma schema** — anywhere you import `@prisma/client` will otherwise be working against a stale client. `hypersonic new` runs this once automatically during setup.