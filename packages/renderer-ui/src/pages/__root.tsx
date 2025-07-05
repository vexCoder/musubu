import { QueryClient } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useState } from 'react'
import { Toaster } from 'sonner'
import DataSyncProvider from '@/context/DataSyncProvider'
import { electronLink, trpc } from '@/lib/trpc'

export const Route = createRootRoute({
  component: Root,
})

function Root() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        retry: false,
        retryDelay: 100,
      },
    },
  }))

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        electronLink,
      ],
    }),
  )

  return (
    // eslint-disable-next-line react/no-context-provider
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <DataSyncProvider>
        <Toaster />
        <Outlet />
      </DataSyncProvider>
    </trpc.Provider>
  )
}
