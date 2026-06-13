# Routing & Controllers

::: warning Coming soon
This guide is under construction. The content below outlines what will be covered.
:::

This guide covers writing Express route handlers the Hypersonic way:

- Registering routes on `app.express`
- Rendering Inertia pages with `res.inertia!()`
- Protecting routes with `createAuthGuard`
- Reading `req.sessionUser` in protected handlers
- Using the built-in error classes (`NotFoundError`, `ForbiddenError`, etc.)
- Organising routes into a separate `src/routes.ts` file

For now, refer to the inline route example in the [Quick Start](/guide/quickstart).