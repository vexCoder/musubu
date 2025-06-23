import { router } from '@core/router'
import { TrpcIpcManager } from '@trpc/handler'

export default function initializeIpc() {
  TrpcIpcManager.createTrpcHandler({
    router,
    createContext: async () => ({}),
  })
}
