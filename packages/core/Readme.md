# @hypersonic-js/complete

**Hypersonic.js** — everything in one installation. This package re-exports the full public API of every Hypersonic package so you don't have to manage individual package versions.

📖 **[hypersonic-js.com](https://hypersonic-js.com)**

## Install

```bash
npm install @hypersonic-js/complete
npm install --save-dev prisma @prisma/client
```

## When to use this

Use `@hypersonic-js/complete` if you want a single dependency that tracks the full framework. Use the individual packages (e.g. `@hypersonic-js/core`) if you need fine-grained control over which parts of the framework you include.

## Quick start

```ts
import { defineConfig, createApp, loadConfig } from '@hypersonic-js/complete'
```

Everything exported by `@hypersonic-js/complete` is identical to the same export from its source package — no wrappers, no overhead.

Full documentation at **[hypersonic-js.com](https://hypersonic-js.com)**.

## License

MIT © [Joaquim Dalton-Pereira](https://github.com/Zesuperaker)