import { useForm, Link } from '@inertiajs/react'

interface ModelMeta {
  name: string
  urlSlug: string
  displayName: string
}

interface Props {
  model: ModelMeta
  roles: string[]
  models: Array<{ name: string; urlSlug: string }>
  errors: Record<string, string>
  prefix: string
}

export default function AdminUserCreate({ model, roles, errors, prefix }: Props) {
  const { data, setData, post, processing } = useForm({
    name: '',
    email: '',
    password: '',
    role: roles[0] ?? '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    post(`${prefix}/${model.urlSlug}`)
  }

  const inputClass =
    'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href={`${prefix}/${model.urlSlug}`}
            className="text-blue-600 hover:underline text-sm"
          >
            ← {model.displayName}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">New {model.name}</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg border border-gray-200 p-6 space-y-5"
        >
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={data.name}
              onChange={(e) => setData('name', e.target.value)}
              required
              className={inputClass + (errors['name'] ? ' border-red-500' : ' border-gray-300')}
            />
            {errors['name'] && (
              <p className="mt-1 text-xs text-red-600">{errors['name']}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={data.email}
              onChange={(e) => setData('email', e.target.value)}
              required
              className={inputClass + (errors['email'] ? ' border-red-500' : ' border-gray-300')}
            />
            {errors['email'] && (
              <p className="mt-1 text-xs text-red-600">{errors['email']}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={data.password}
              onChange={(e) => setData('password', e.target.value)}
              required
              className={inputClass + (errors['password'] ? ' border-red-500' : ' border-gray-300')}
            />
            {errors['password'] && (
              <p className="mt-1 text-xs text-red-600">{errors['password']}</p>
            )}
          </div>

          {/* Role */}
          {roles.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                role <span className="text-red-500">*</span>
              </label>
              <select
                value={data.role}
                onChange={(e) => setData('role', e.target.value)}
                className={inputClass + (errors['role'] ? ' border-red-500' : ' border-gray-300')}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {errors['role'] && (
                <p className="mt-1 text-xs text-red-600">{errors['role']}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={processing}
              className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {processing ? 'Creating…' : 'Create'}
            </button>
            <Link
              href={`${prefix}/${model.urlSlug}`}
              className="text-gray-600 hover:underline text-sm"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}