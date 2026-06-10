import { useState } from 'react'
import { useForm, Link } from '@inertiajs/react'

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

interface FkOption {
  id: string
  label: string
}

interface FieldOptionsState {
  options: FkOption[]
  hasMore: boolean
  page: number
  loading: boolean
}

interface Props {
  model: ModelMeta
  record: Record<string, unknown> | null
  models: Array<{ name: string; urlSlug: string }>
  errors: Record<string, string>
  prefix: string
  relatedOptions: Record<string, { options: FkOption[]; hasMore: boolean }>
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

  const [fkOptions, setFkOptions] = useState<Record<string, FieldOptionsState>>(() =>
    Object.fromEntries(
      Object.entries(relatedOptions).map(([key, val]) => [
        key,
        { options: val.options, hasMore: val.hasMore, page: 1, loading: false },
      ]),
    ),
  )

  async function loadMore(fieldName: string, relatedModelName: string): Promise<void> {
    const current = fkOptions[fieldName]
    if (current === undefined || current.loading) return

    setFkOptions((prev) => ({
      ...prev,
      [fieldName]: { ...prev[fieldName]!, loading: true },
    }))

    try {
      const slug = relatedModelName.charAt(0).toLowerCase() + relatedModelName.slice(1)
      const nextPage = current.page + 1
      const res = await fetch(`${prefix}/related-options/${slug}?page=${nextPage}`)
      const payload = (await res.json()) as { options: FkOption[]; hasMore: boolean }
      setFkOptions((prev) => ({
        ...prev,
        [fieldName]: {
          options: [...prev[fieldName]!.options, ...payload.options],
          hasMore: payload.hasMore,
          page: nextPage,
          loading: false,
        },
      }))
    } catch {
      setFkOptions((prev) => ({
        ...prev,
        [fieldName]: { ...prev[fieldName]!, loading: false },
      }))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEdit) {
      patch(`${prefix}/${model.urlSlug}/${String(record![model.idField])}`)
    } else {
      post(`${prefix}/${model.urlSlug}`)
    }
  }

  function renderInput(field: FieldMeta) {
    const value = data[field.name] ?? ''
    const error = errors[field.name]
    const baseClass = 'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
    const errorClass = error ? ' border-red-500' : ' border-gray-300'

    if (field.isForeignKey) {
      const state = fkOptions[field.name] ?? { options: [], hasMore: false, page: 1, loading: false }
      return (
        <div>
          <select
            value={value}
            onChange={(e) => setData(field.name, e.target.value)}
            className={baseClass + errorClass}
          >
            {!field.isRequired && <option value="">— select —</option>}
            {state.options.map((opt) => (
              <option key={String(opt.id)} value={String(opt.id)}>{opt.label}</option>
            ))}
          </select>
          {state.hasMore && (
            <button
              type="button"
              onClick={() => void loadMore(field.name, field.relatedModelName!)}
              disabled={state.loading}
              className="mt-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
            >
              {state.loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
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
            href={`${prefix}/${model.urlSlug}`}
            className="text-blue-600 hover:underline text-sm"
          >
            ← {model.displayName}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? `Edit ${model.name}` : `New ${model.name}`}
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