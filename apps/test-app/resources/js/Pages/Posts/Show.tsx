import { router, Link } from '@inertiajs/react'
import type { PostsShowPageProps } from '../../types'

export default function PostsShow({ post, user }: PostsShowPageProps) {
  function handleDelete() {
    if (!confirm('Delete this post?')) return
    router.delete(`/posts/${post.id}`, {
      onSuccess: () => router.visit('/posts'),
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <Link href="/posts" className="text-sm text-indigo-600 hover:underline">
          ← Back to posts
        </Link>
        <span className="text-sm text-gray-600">{user.name}</span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <article className="bg-white rounded-2xl shadow p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">{post.title}</h1>
            <button
              onClick={handleDelete}
              className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>

          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{post.body}</p>

          <footer className="mt-8 pt-4 border-t border-gray-100 text-xs text-gray-400">
            By {post.user.name} ·{' '}
            {new Date(post.createdAt).toLocaleDateString()}
          </footer>
        </article>
      </main>
    </div>
  )
}