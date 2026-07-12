import { Link, router } from '@inertiajs/react'

type FieldKind = 'scalar' | 'relation' | 'enum' | 'file'

interface FieldMeta {
  name: string
  isId: boolean
  prismaType: string
  kind: FieldKind
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

function displayValue(value: unknown, prismaType: string): string {
  if (value === null || value === undefined) return '—'
  if (prismaType === 'DateTime') {
    const date = value instanceof Date ? value : new Date(String(value))
    return date.toLocaleString()
  }
  if (value instanceof Date) return value.toLocaleString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Renders a list-view table cell. File fields render a "View" link (through
 * the admin server's presigned-download redirect route) instead of the raw
 * S3 key, since the key alone isn't useful to a human reader.
 */
function renderCellValue(
  field: FieldMeta,
  record: Record<string, unknown>,
  model: ModelMeta,
  prefix: string,
): React.ReactNode {
  if (field.kind === 'file') {
    const value = record[field.name]
    if (typeof value !== 'string' || value === '') return '—'
    const href = `${prefix}/${model.urlSlug}/${String(record[model.idField])}/files/${field.name}`
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
        View
      </a>
    )
  }

  return displayValue(record[field.name], field.prismaType)
}

export default function AdminModelIndex({ model, records, pagination, prefix }: Props) {
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
                {records.map((record) => (
                  <tr key={String(record[model.idField])} className="hover:bg-gray-50">
                    {model.listFields.map((f) => (
                      <td key={f.name} className="px-4 py-3 text-gray-800">
                        {renderCellValue(f, record, model, prefix)}
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