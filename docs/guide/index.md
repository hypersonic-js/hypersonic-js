# Introduction

Hypersonic.js is a full-stack TypeScript framework inspired by Django's "batteries included" philosophy. One installation gives you a production-ready Express backend, a React frontend with Inertia.js, Prisma ORM, and Better Auth — all pre-wired and type-safe end to end.

## Philosophy

Most TypeScript stacks require you to glue together six or seven packages yourself, figure out how they interact, and maintain that wiring forever. Hypersonic takes the opposite approach: make the common case zero-config and keep everything in one cohesive layer.

You write controllers (Express route handlers), views (React components), and a Prisma schema. The framework handles the rest.

## Core stack

| Layer | Library |
|---|---|
| HTTP server | Express 5 |
| Database ORM | Prisma 7 |
| Frontend bridge | Inertia.js + React 19 |
| Styling | Tailwind CSS 4 |
| Authentication | Better Auth |

## Packages

| Package | Description |
|---|---|
| `@hypersonic-js/complete` | Everything in one install — recommended |
| `@hypersonic-js/core` | Server, Inertia, config, and auth only |
| `@hypersonic-js/admin` | Auto-generated Prisma admin dashboard |
| `@hypersonic-js/cli` | Developer CLI (`hypersonic admin …`) |

## Ready to build?

Follow the [Quick Start](/guide/quickstart) to go from zero to a running app in under ten minutes.