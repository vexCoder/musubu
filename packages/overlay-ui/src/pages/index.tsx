import { createFileRoute } from '@tanstack/react-router'
import { trpc } from '@/lib/trpc'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { data: stateData } = trpc.game.state.useQuery(undefined, {
    refetchInterval: 1500,
  })

  const { mutateAsync: saveState } = trpc.game.save.useMutation()
  const { mutateAsync: loadState } = trpc.game.load.useMutation()

  const handleSaveState = async () => {
    try {
      await saveState()
    }
    catch (error) {
      console.error('Error saving state:', error)
    }
  }

  const handleLoadState = async () => {
    try {
      await loadState()
    }
    catch (error) {
      console.error('Error loading state:', error)
    }
  }

  return (
    <div className=" fixed inset-0 z-50 flex h-full w-full items-center justify-center text-white">
      <div className="rounded bg-gray-800 p-4 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold">Welcome to the Overlay UI</h1>
        <p className="text-gray-300">This is a placeholder for your overlay content.</p>
        <p className="mt-2 text-gray-400">You can customize this page as needed.</p>

        <div className="mt-4 flex gap-2">
          <button
            className=" rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700"
            onClick={handleSaveState}
          >
            Save State
          </button>
          <button
            className=" rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
            onClick={handleLoadState}
          >
            Load State
          </button>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 z-50 flex flex-col gap-2 rounded-tl-lg bg-gray-900 p-4 text-white shadow-lg">
        <h2 className="text-lg font-semibold">Game State</h2>
        <pre className="overflow-x-auto rounded bg-gray-800 p-2 text-xs">
          {stateData ? JSON.stringify(stateData, null, 2) : 'Loading...'}
        </pre>
      </div>
    </div>
  )
}
