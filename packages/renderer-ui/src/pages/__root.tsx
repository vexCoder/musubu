import type { AppRouter } from '@musubu/electron-app/trpc/router'
import { QueryClient } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useState } from 'react'
import { electronLink, trpc } from '@/lib/trpc'

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}

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
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <Outlet />
    </trpc.Provider>
  )
}
