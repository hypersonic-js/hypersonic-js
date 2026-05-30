# @hypersonic/complete

**Hypersonic.js** — everything in one install. This package re-exports the full public API of every Hypersonic package so you don't have to manage individual package versions.

📖 **[hypersonic-js.com](https://hypersonic-js.com)**

## Install

```bash
npm install @hypersonic/complete
npm install --save-dev prisma @prisma/client
```

## When to use this

Use `@hypersonic/complete` if you want a single dependency that tracks the full framework. Use the individual packages (e.g. `@hypersonic/core`) if you need fine-grained control over which parts of the framework you include.

## Quick start

```ts
import { defineConfig, createApp, loadConfig } from '@hypersonic/complete'
```

Everything exported by `@hypersonic/complete` is identical to the same export from its source package — no wrappers, no overhead.

Full documentation at **[hypersonic-js.com](https://hypersonic-js.com)**.

## License

MIT © MIT © Joaquim Dalton-Pereira