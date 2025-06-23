import type { DataSyncProgressEventPayload } from '@services/DataSync'
import { on } from 'node:events'
import { DataSyncService } from '@services/DataSync'
import { trpc } from '@trpc/trpc'

const syncRouter = trpc.router({
  onDatasync: trpc.procedure.subscription(async function* () {
    const emitter = DataSyncService.getInstance()

    for await (const [data] of on(emitter, 'progress')) {
      const progress = data as DataSyncProgressEventPayload
      yield progress
    }
  }),
})

export default syncRouter
