import type { DataSyncRendererPayload } from '@services/DataSyncService'
import { on } from 'node:events'
import { DataSyncService } from '@services/DataSyncService'
import { trpc } from '@trpc/trpc'

const syncRouter = trpc.router({
  onDatasync: trpc.procedure.subscription(async function* () {
    const emitter = DataSyncService.getInstance()

    for await (const [data] of on(emitter, 'update')) {
      const progress = data as DataSyncRendererPayload
      yield progress
    }
  }),
})

export default syncRouter
