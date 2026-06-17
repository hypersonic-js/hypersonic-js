# Quick Start

Get a full-stack Hypersonic.js app running in under two minutes.

## Prerequisites

- **Node.js 24 or later** — [nodejs.org](https://nodejs.org)

## 1. Install the CLI

```bash
npm install -g @hypersonic-js/cli
```

## 2. Scaffold a new project

```bash
hypersonic new
```

The CLI will ask two questions:

```
Where would you like to create your project?
  1. Create a new directory
  2. Use current directory
Choice [x]:

Project name: my-app
```

Then it runs every setup step automatically:

- Installs dependencies with `npm install`
- Creates the SQLite database and runs migrations
- Generates the Prisma client
- Scaffolds the admin dashboard pages
- Generates admin metadata from your schema
- Prompts you to create your first admin account:

```
Email: you@example.com
Name: Your Name
Password:
```

## 3. Start the dev server

```bash
cd my-app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — your app is running.

## Next steps

- **[Configuration](/guide/configuration)** — all `hypersonic.config.ts` options
- **[Routing & Controllers](/guide/routing)** — writing Express route handlers
- **[Frontend](/guide/frontend)** — Inertia props, navigation, and forms
- **[Authentication](/guide/authentication)** — protecting routes and OAuth providers