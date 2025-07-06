import { createContext, use } from 'react'

interface DataSyncContextType {
  step: string | undefined
  progress: number
}

export const DataSyncContext = createContext<DataSyncContextType | undefined>(undefined)

export function useDataSyncContext() {
  const context = use(DataSyncContext)
  if (context === undefined) {
    throw new Error('useDataSyncContext must be used within a DataSyncProvider')
  }
  return context
}
