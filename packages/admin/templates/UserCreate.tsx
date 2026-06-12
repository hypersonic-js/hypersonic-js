import { useForm, Link } from '@inertiajs/react'

type FieldKind = 'scalar' | 'relation' | 'enum'

interface FieldMeta {
  name: string
  prismaType: string
  kind: FieldKind
  isRequired: boolean
  enumValues?: string[]
}

interface ModelMeta {
  name: string
  urlSlug: string
  displayName: string
  formFields: FieldMeta[]
}

interface Props {
  model: ModelMeta
  models: Array<{ name: string; urlSlug: string }>
  errors: Record<string, string>
  prefix: string
}

/**
 * Fields rendered by dedicated hardcoded inputs — excluded from the generic
 * metadata loop. `password` is also hardcoded but is not a Prisma field and
 * therefore never appears in model.formFields.
 */
const CORE_FIELD_NAMES = new Set(['name', 'email'])

export default function AdminUserCreate({ model, errors, prefix }: Props) {
  // All formFields except the two that are rendered by dedicated hardcoded
  // inputs. Includes `role` (if present) and any custom fields.
  const extraFields = model.formFields.filter((f) => !CORE_FIELD_NAMES.has(f.name))

  const extraInitialValues = Object.fromEntries(
    extraFields.map((f) => [
      f.name,
      f.kind === 'enum' && f.enumValues != null && f.enumValues.length > 0
        ? (f.enumValues[0] ?? '')
        : '',
    ]),
  )

  const { data, setData, post, processing } = useForm<Record<string, string>>({
    name: '',
    email: '',
    password: '',
    ...extraInitialValues,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    post(`${prefix}/${model.urlSlug}`)
  }

  const inputClass =
    'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  function borderClass(field: string): string {
    return errors[field] ? ' border-red-500' : ' border-gray-300'
  }

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
          {/* name — hardcoded: always required by the Better Auth createUser API */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={data['name']}
              onChange={(e) => setData('name', e.target.value)}
              required
              className={inputClass + borderClass('name')}
            />
            {errors['name'] && (
              <p className="mt-1 text-xs text-red-600">{errors['name']}</p>
            )}
          </div>

          {/* email — hardcoded: always required by the Better Auth createUser API */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={data['email']}
              onChange={(e) => setData('email', e.target.value)}
              required
              className={inputClass + borderClass('email')}
            />
            {errors['email'] && (
              <p className="mt-1 text-xs text-red-600">{errors['email']}</p>
            )}
          </div>

          {/* password — hardcoded: always required by the Better Auth createUser API.
              Not a Prisma field so it never appears in model.formFields. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={data['password']}
              onChange={(e) => setData('password', e.target.value)}
              required
              className={inputClass + borderClass('password')}
            />
            {errors['password'] && (
              <p className="mt-1 text-xs text-red-600">{errors['password']}</p>
            )}
          </div>

          {/* role and any custom fields — driven from model.formFields metadata */}
          {extraFields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.name}
                {field.isRequired && <span className="text-red-500"> *</span>}
              </label>
              {field.kind === 'enum' && field.enumValues != null ? (
                <select
                  value={data[field.name] ?? ''}
                  onChange={(e) => setData(field.name, e.target.value)}
                  className={inputClass + borderClass(field.name)}
                >
                  {field.enumValues.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={data[field.name] ?? ''}
                  onChange={(e) => setData(field.name, e.target.value)}
                  required={field.isRequired}
                  className={inputClass + borderClass(field.name)}
                />
              )}
              {errors[field.name] && (
                <p className="mt-1 text-xs text-red-600">{errors[field.name]}</p>
              )}
            </div>
          ))}

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