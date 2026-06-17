# Frontend (Inertia + React)

Hypersonic uses [Inertia.js](https://inertiajs.com) to bridge the Express backend and the React frontend. There is no separate REST API — your server renders page components directly, passing props from Express route handlers.

## How it works

1. A route handler calls `res.inertia!('PageName', props)`.
2. Inertia serialises the props to JSON and sends them to the browser.
3. React renders the matching page component with those props.
4. Subsequent navigations happen client-side via Inertia's router — no full page reloads.

## Page components

Every page is a React component under `resources/js/Pages/`. The component name passed to `res.inertia!` maps directly to a file path:

```tsx
// resources/js/Pages/Posts/Show.tsx

interface Props {
  post: {
    id: number
    title: string
    body: string
  }
}

export default function PostsShow({ post }: Props) {
  return (
    <main>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </main>
  )
}
```

Always type your props with a TypeScript interface. Props are serialised to JSON by the server, so they must be plain objects — no class instances, no functions.

## Client-side navigation

Use `<Link>` from `@inertiajs/react` instead of `<a>` for internal navigation. It intercepts clicks and performs a client-side Inertia visit instead of a full page load:

```tsx
import { Link } from '@inertiajs/react'

export default function Nav() {
  return (
    <nav>
      <Link href="/posts">Posts</Link>
      <Link href="/dashboard">Dashboard</Link>
    </nav>
  )
}
```

For programmatic navigation, use `router.visit`:

```tsx
import { router } from '@inertiajs/react'

router.visit('/posts')
router.visit('/login', { replace: true })
```

## Forms with useForm

`useForm` from `@inertiajs/react` manages form state, submission, and validation errors. It automatically reads and sends the CSRF token — no extra setup required.

```tsx
import { useForm } from '@inertiajs/react'

export default function NewPost() {
  const form = useForm({ title: '', body: '' })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    form.post('/posts', {
      onSuccess: () => form.reset(),
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={form.data.title}
        onChange={(e) => form.setData('title', e.target.value)}
      />
      {form.errors.title && <p>{form.errors.title}</p>}

      <textarea
        value={form.data.body}
        onChange={(e) => form.setData('body', e.target.value)}
      />

      <button type="submit" disabled={form.processing}>
        {form.processing ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
```

`form.post`, `form.put`, `form.patch`, and `form.delete` map to the corresponding HTTP methods.

## CSRF protection

Hypersonic mounts a CSRF cookie middleware automatically. Inertia's `useForm` reads the `XSRF-TOKEN` cookie and sends it as the `X-XSRF-TOKEN` header on every mutation — you never touch CSRF manually.

## Tailwind CSS

Tailwind 4 is pre-configured. Import it once in `resources/css/app.css`:

```css
@import "tailwindcss";
```

That CSS file is imported by `resources/js/app.tsx`, so Tailwind classes are available in every page component.

## Entry point

`resources/js/app.tsx` is the Inertia entry point. It maps component names to files using Vite's `import.meta.glob`:

```tsx
import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import '../css/app.css'

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('./Pages/**/*.tsx', { eager: true })
    const page = pages[`./Pages/${name}.tsx`]
    if (!page) throw new Error(`Inertia page not found: ${name}`)
    return page as never
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />)
  },
})
```

Every `.tsx` file under `resources/js/Pages/` is automatically available as a page — no registration needed.

## Running the frontend

During development, Vite runs alongside the Express server. The `npm run dev` script starts both:

```bash
npm run dev
```

For production, build the frontend first:

```bash
npm run build   # writes compiled assets to public/
npm start       # starts the Express server
```