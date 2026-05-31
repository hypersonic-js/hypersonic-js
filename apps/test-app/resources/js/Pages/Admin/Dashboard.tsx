import { Link } from '@inertiajs/react'

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
              href={`${prefix}/${model.urlSlug}`}
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
