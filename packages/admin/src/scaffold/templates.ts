/**
 * Template source for resources/js/Pages/Admin/Dashboard.tsx.
 * Shows all admin-managed models with record counts and navigation links.
 */
export const DASHBOARD_TEMPLATE = `import { Link } from '@inertiajs/react'

interface ModelCard {
  name: string
  urlSlug: string
  recordCount: number
}

interface Props {
  models: ModelCard[]
  prefix: string
}

export default function AdminDashboard({ models, prefix }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>

        {models.length === 0 && (
          <p className="text-gray-500">No models are visible. Check your mountAdmin configuration.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((model) => (
            <Link
              key={model.urlSlug}
              href={\`\${prefix}/\${model.urlSlug}\`}
              className="block bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-500 transition-colors"
            >
              <h2 className="text-lg font-semibold text-gray-800">{model.name}</h2>
              <p className="text-3xl font-bold text-blue-600 mt-2">{model.recordCount}</p>
              <p className="text-sm text-gray-500 mt-1">records</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
`

/**
 * Template source for resources/js/Pages/Admin/ModelIndex.tsx.
 * Renders a paginated table for any model, driven entirely by the model metadata
 * passed as Inertia props — no per-model customisation needed.
 */
export const MODEL_INDEX_TEMPLATE = `import { Link, router } from '@inertiajs/react'

interface FieldMeta {
  name: string
  isId: boolean
}

interface ModelMeta {
  name: string
  urlSlug: string
  displayName: string
  idField: string
  listFields: FieldMeta[]
}

interface PaginationMeta {
  page: number
  perPage: number
  total: number
  totalPages: number
}

interface Props {
  model: ModelMeta
  records: Record<string, unknown>[]
  pagination: PaginationMeta
  models: Array<{ name: string; urlSlug: string }>
  prefix: string
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (value instanceof Date) return value.toLocaleDateString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function AdminModelIndex({ model, records, pagination, models, prefix }: Props) {
  function handleDelete(id: unknown) {
    if (window.confirm(\`Delete this \${model.name}?\`)) {
      router.delete(\`\${prefix}/\${model.urlSlug}/\${String(id)}\`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href={prefix} className="text-blue-600 hover:underline text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">{model.displayName}</h1>
          </div>
          <Link
            href={\`\${prefix}/\${model.urlSlug}/new\`}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            New {model.name}
          </Link>
        </div>

        {records.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-500">No {model.displayName.toLowerCase()} yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {model.listFields.map((f) => (
                    <th key={f.name} className="px-4 py-3 text-left font-medium text-gray-600">
                      {f.name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((record, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {model.listFields.map((f) => (
                      <td key={f.name} className="px-4 py-3 text-gray-800">
                        {displayValue(record[f.name])}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right space-x-2">
                      <Link
                        href={\`\${prefix}/\${model.urlSlug}/\${String(record[model.idField])}\`}
                        className="text-blue-600 hover:underline"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(record[model.idField])}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <div className="flex gap-2">
              {pagination.page > 1 && (
                <Link
                  href={\`\${prefix}/\${model.urlSlug}?page=\${pagination.page - 1}\`}
                  className="px-3 py-1 border rounded hover:bg-gray-50"
                >
                  Previous
                </Link>
              )}
              {pagination.page < pagination.totalPages && (
                <Link
                  href={\`\${prefix}/\${model.urlSlug}?page=\${pagination.page + 1}\`}
                  className="px-3 py-1 border rounded hover:bg-gray-50"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
`

/**
 * Template source for resources/js/Pages/Admin/ModelForm.tsx.
 * Renders a create or edit form for any model using Inertia's useForm hook.
 * The mode (create vs edit) is determined by whether 'record' is null.
 * FK scalar fields are rendered as <select> dropdowns populated from relatedOptions.
 */
export const MODEL_FORM_TEMPLATE = `import { useForm } from '@inertiajs/react'
import { Link } from '@inertiajs/react'

type FieldKind = 'scalar' | 'relation' | 'enum'

interface FieldMeta {
  name: string
  prismaType: string
  kind: FieldKind
  isRequired: boolean
  isForeignKey: boolean
  relatedModelName?: string
  enumValues?: string[]
}

interface ModelMeta {
  name: string
  urlSlug: string
  displayName: string
  idField: string
  formFields: FieldMeta[]
}

interface Props {
  model: ModelMeta
  record: Record<string, unknown> | null
  models: Array<{ name: string; urlSlug: string }>
  errors: Record<string, string>
  prefix: string
  relatedOptions: Record<string, Array<{ id: string; label: string }>>
}

function buildInitialData(
  formFields: FieldMeta[],
  record: Record<string, unknown> | null,
): Record<string, string> {
  return Object.fromEntries(
    formFields.map((f) => {
      const value = record?.[f.name]
      if (value instanceof Date) return [f.name, value.toISOString().slice(0, 16)]
      return [f.name, value !== null && value !== undefined ? String(value) : '']
    }),
  )
}

export default function AdminModelForm({ model, record, models, errors, prefix, relatedOptions }: Props) {
  const isEdit = record !== null
  const { data, setData, post, patch, processing } = useForm(
    buildInitialData(model.formFields, record),
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEdit) {
      patch(\`\${prefix}/\${model.urlSlug}/\${String(record![model.idField])}\`)
    } else {
      post(\`\${prefix}/\${model.urlSlug}\`)
    }
  }

  function renderInput(field: FieldMeta) {
    const value = data[field.name] ?? ''
    const error = errors[field.name]
    const baseClass = 'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
    const errorClass = error ? ' border-red-500' : ' border-gray-300'

    if (field.isForeignKey) {
      const options = relatedOptions[field.name] ?? []
      return (
        <select
          value={value}
          onChange={(e) => setData(field.name, e.target.value)}
          className={baseClass + errorClass}
        >
          {!field.isRequired && <option value="">— select —</option>}
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      )
    }

    if (field.kind === 'enum' && field.enumValues) {
      return (
        <select
          value={value}
          onChange={(e) => setData(field.name, e.target.value)}
          className={baseClass + errorClass}
        >
          {!field.isRequired && <option value="">— select —</option>}
          {field.enumValues.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      )
    }

    if (field.prismaType === 'Boolean') {
      return (
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => setData(field.name, String(e.target.checked))}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
        />
      )
    }

    const inputType =
      field.prismaType === 'Int' || field.prismaType === 'Float'
        ? 'number'
        : field.prismaType === 'DateTime'
          ? 'datetime-local'
          : 'text'

    return (
      <input
        type={inputType}
        value={value}
        onChange={(e) => setData(field.name, e.target.value)}
        required={field.isRequired}
        className={baseClass + errorClass}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href={\`\${prefix}/\${model.urlSlug}\`}
            className="text-blue-600 hover:underline text-sm"
          >
            ← {model.displayName}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? \`Edit \${model.name}\` : \`New \${model.name}\`}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
          {model.formFields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.name}
                {field.isRequired && <span className="text-red-500 ml-1">*</span>}
              </label>
              {renderInput(field)}
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
              {processing ? 'Saving…' : isEdit ? 'Update' : 'Create'}
            </button>
            <Link
              href={\`\${prefix}/\${model.urlSlug}\`}
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
`