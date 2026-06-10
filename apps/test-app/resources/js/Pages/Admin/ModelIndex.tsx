import { Link, router } from '@inertiajs/react'

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
    if (window.confirm(`Delete this ${model.name}?`)) {
      router.delete(`${prefix}/${model.urlSlug}/${String(id)}`)
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
            href={`${prefix}/${model.urlSlug}/new`}
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
                        href={`${prefix}/${model.urlSlug}/${String(record[model.idField])}`}
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
                  href={`${prefix}/${model.urlSlug}?page=${pagination.page - 1}`}
                  className="px-3 py-1 border rounded hover:bg-gray-50"
                >
                  Previous
                </Link>
              )}
              {pagination.page < pagination.totalPages && (
                <Link
                  href={`${prefix}/${model.urlSlug}?page=${pagination.page + 1}`}
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