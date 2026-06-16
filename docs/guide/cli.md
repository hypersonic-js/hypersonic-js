# CLI

Hypersonic ships a CLI for scaffolding projects and managing the admin dashboard.

```bash
npm install -g @hypersonic-js/cli
```

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