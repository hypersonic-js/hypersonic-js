import { useState, useRef } from 'react'
import { useForm, Link } from '@inertiajs/react'

type FieldKind = 'scalar' | 'relation' | 'enum' | 'file'

interface FieldMeta {
  name: string
  prismaType: string
  kind: FieldKind
  isRequired: boolean
  isForeignKey: boolean
  relatedModelName?: string
  relatedModelSlug?: string
  enumValues?: string[]
  /**
   * For `kind: 'file'` fields only — the name of the required companion
   * Boolean field tracking this file's public/private toggle. Rendered
   * inside the file field's own upload widget rather than as a second,
   * independent checkbox in the form.
   */
  filePublicField?: string
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

type RelatedOptionsMap = Record<string, { options: FkOption[]; hasMore: boolean }>

interface FieldOptionsState {
  options: FkOption[]
  hasMore: boolean
  page: number
  loading: boolean
}

interface FileUploadState {
  uploading: boolean
  error: string | null
  /** The name of the file most recently picked, shown while its upload is in flight or has just completed. */
  selectedName: string | null
}

interface Props {
  model: ModelMeta
  record: Record<string, unknown> | null
  models: Array<{ name: string; urlSlug: string }>
  errors: Record<string, string>
  prefix: string
  relatedOptions: RelatedOptionsMap
}

function toLocalDateTimeString(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}T` +
    `${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}:` +
    `${pad(date.getSeconds())}`
  )
}

function buildInitialData(
  formFields: FieldMeta[],
  record: Record<string, unknown> | null,
  relatedOptions: RelatedOptionsMap = {},
): Record<string, string> {
  return Object.fromEntries(
    formFields.map((f) => {
      const value = record?.[f.name]
      if (value instanceof Date) return [f.name, toLocalDateTimeString(value)]
      if (value !== null && value !== undefined) return [f.name, String(value)]

      // New record — use type-aware defaults only for REQUIRED fields so that
      // optional columns are left unset rather than silently written with a
      // synthetic value the user never chose.
      if (f.prismaType === 'Boolean' && f.isRequired) return [f.name, 'false']
      if (f.kind === 'enum' && f.isRequired && f.enumValues !== undefined && f.enumValues.length > 0) {
        return [f.name, f.enumValues[0]!]
      }

      // For required FK fields on create forms, default to the first available
      // option so the controlled <select> value matches what the browser renders
      // as visually selected. Without this the select appears to have a valid
      // selection but the underlying form value is '', which coerceData converts
      // to undefined for required fields, causing a Prisma validation error.
      if (f.isForeignKey && f.isRequired) {
        const firstOption = relatedOptions[f.name]?.options[0]
        if (firstOption !== undefined) {
          return [f.name, String(firstOption.id)]
        }
      }

      return [f.name, '']
    }),
  )
}

export default function AdminModelForm({ model, record, errors, prefix, relatedOptions }: Props) {
  const isEdit = record !== null
  const { data, setData, post, patch, processing } = useForm(
    buildInitialData(model.formFields, record, relatedOptions),
  )

  const [fkOptions, setFkOptions] = useState<Record<string, FieldOptionsState>>(() =>
    Object.fromEntries(
      Object.entries(relatedOptions).map(([key, val]) => [
        key,
        { options: val.options, hasMore: val.hasMore, page: 1, loading: false },
      ]),
    ),
  )

  // Ref-based guard prevents duplicate in-flight requests for the same field.
  // A ref is used (not state) so the guard is updated synchronously — two rapid
  // clicks both read the ref before any setState is committed, ensuring only
  // the first click proceeds.
  const inflight = useRef(new Set<string>())

  async function loadMore(fieldName: string, relatedModelSlug: string): Promise<void> {
    if (inflight.current.has(fieldName)) return

    const current = fkOptions[fieldName]
    if (current === undefined) return

    inflight.current.add(fieldName)
    setFkOptions((prev) => ({
      ...prev,
      [fieldName]: { ...prev[fieldName]!, loading: true },
    }))

    try {
      const nextPage = current.page + 1
      const res = await fetch(`${prefix}/related-options/${relatedModelSlug}?page=${nextPage}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
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
    } finally {
      inflight.current.delete(fieldName)
    }
  }

  const [fileUploads, setFileUploads] = useState<Record<string, FileUploadState>>({})

  function updateFileUpload(fieldName: string, patch: Partial<FileUploadState>) {
    setFileUploads((prev) => {
      const current: FileUploadState = prev[fieldName] ?? {
        uploading: false,
        error: null,
        selectedName: null,
      }
      return { ...prev, [fieldName]: { ...current, ...patch } }
    })
  }

  /**
   * Direct-to-S3 upload: requests a presigned PUT URL from the admin server
   * (which never sees the file's bytes), uploads the file straight to S3,
   * then stores the resulting key in the form's data — the same key the
   * server will persist to the field's String column on submit.
   */
  async function handleFileChange(field: FieldMeta, file: File | undefined): Promise<void> {
    if (file === undefined) return

    updateFileUpload(field.name, { uploading: true, error: null, selectedName: file.name })

    try {
      const presignRes = await fetch(`${prefix}/${model.urlSlug}/files/${field.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mimeType: file.type }),
      })
      if (!presignRes.ok) {
        throw new Error(`Could not get an upload URL (HTTP ${presignRes.status})`)
      }
      const { url, key } = (await presignRes.json()) as { url: string; key: string }

      const uploadRes = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!uploadRes.ok) {
        throw new Error(`Upload failed (HTTP ${uploadRes.status})`)
      }

      setData(field.name, key)
      updateFileUpload(field.name, { uploading: false })
    } catch (err) {
      updateFileUpload(field.name, {
        uploading: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    }
  }

  // Names of Boolean fields that back a file field's public/private toggle —
  // rendered inside the file field's own widget (see renderInput's 'file'
  // branch), so they're skipped when the main form loop below iterates
  // formFields, to avoid rendering them a second time as an independent
  // checkbox. Still present in formFields itself (and therefore still
  // submitted and persisted) — this is a rendering-only filter.
  const hiddenFieldNames = new Set(
    model.formFields
      .filter((f) => f.kind === 'file' && f.filePublicField !== undefined)
      .map((f) => f.filePublicField as string),
  )

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
              onClick={() => void loadMore(field.name, field.relatedModelSlug!)}
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

    if (field.kind === 'file') {
      const uploadState = fileUploads[field.name] ?? { uploading: false, error: null, selectedName: null }
      const hasValue = value !== ''
      const viewHref =
        isEdit && hasValue
          ? `${prefix}/${model.urlSlug}/${String(record![model.idField])}/files/${field.name}`
          : null
      const publicFieldName = field.filePublicField
      const isPublic = publicFieldName !== undefined && data[publicFieldName] === 'true'

      return (
        <div className="space-y-2">
          {hasValue && (
            <div className="text-sm text-gray-600 flex items-center gap-2">
              <span className="truncate">{uploadState.selectedName ?? value}</span>
              {viewHref !== null && (
                <a
                  href={viewHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline shrink-0"
                >
                  View
                </a>
              )}
            </div>
          )}
          <input
            type="file"
            onChange={(e) => void handleFileChange(field, e.target.files?.[0])}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {uploadState.uploading && <p className="text-xs text-gray-500">Uploading…</p>}
          {uploadState.error !== null && <p className="text-xs text-red-600">{uploadState.error}</p>}
          {publicFieldName !== undefined && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setData(publicFieldName, String(e.target.checked))}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              Public
            </label>
          )}
        </div>
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
          {model.formFields
            .filter((field) => !hiddenFieldNames.has(field.name))
            .map((field) => (
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