import { useForm, router, Link } from '@inertiajs/react'
import { authClient } from '../../lib/auth-client'
import type { PostsIndexPageProps } from '../../types'

export default function PostsIndex({ posts, user }: PostsIndexPageProps) {
  const form = useForm({ title: '', body: '' })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    form.post('/posts', {
      onSuccess: () => form.reset(),
    })
  }

  async function handleSignOut() {
    await authClient.signOut()
    router.visit('/login')
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this post?')) return
    router.delete(`/posts/${id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Posts</h1>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>{user.name}</span>
          <button
            onClick={handleSignOut}
            className="text-red-600 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Create form */}
        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-base font-medium text-gray-900 mb-4">New post</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text"
              placeholder="Title"
              value={form.data.title}
              onChange={(e) => form.setData('title', e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {form.errors.title && (
              <p className="text-xs text-red-600">{form.errors.title}</p>
            )}
            <textarea
              placeholder="Body"
              rows={3}
              value={form.data.body}
              onChange={(e) => form.setData('body', e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {form.errors.body && (
              <p className="text-xs text-red-600">{form.errors.body}</p>
            )}
            <button
              type="submit"
              disabled={form.processing}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {form.processing ? 'Creating…' : 'Create post'}
            </button>
          </form>
        </section>

        {/* Posts list */}
        <section className="space-y-3">
          {posts.length === 0 && (
            <p className="text-sm text-gray-500">No posts yet.</p>
          )}
          {posts.map((post) => (
            <article
              key={post.id}
              className="bg-white rounded-2xl shadow p-5 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <Link
                  href={`/posts/${post.id}`}
                  className="font-medium text-gray-900 hover:text-indigo-600 truncate block"
                >
                  {post.title}
                </Link>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{post.body}</p>
              </div>
              <button
                onClick={() => handleDelete(post.id)}
                className="shrink-0 text-sm text-red-600 hover:underline"
              >
                Delete
              </button>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}