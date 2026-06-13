interface Route {
  path: string
  description: string
}

interface Props {
  routes: Route[]
}

export default function Welcome({ routes }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Welcome to Hypersonic.js
        </h1>
        <p className="text-gray-500 mb-8">
          Your app is running. Here&apos;s where to go next.
        </p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100 mb-8">
          {routes.map((route) => (
            <a
              key={route.path}
              href={route.path}
              className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="font-mono text-sm font-medium text-gray-900">
                  {route.path}
                </p>
                <p className="text-sm text-gray-500">{route.description}</p>
              </div>
              <span className="text-gray-300">&rarr;</span>
            </a>
          ))}
        </div>

        <p className="text-center text-sm text-gray-400">
          Read the{' '}
          <a
            href="https://hypersonic-js.com/guide/"
            className="text-indigo-600 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            documentation
          </a>{' '}
          to learn more.
        </p>
      </div>
    </div>
  )
}
