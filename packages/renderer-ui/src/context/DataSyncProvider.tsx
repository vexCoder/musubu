import type { ProcedureOutput } from '@/lib/types'
import DataSync from '@components/common/DataSync'
import { DataSyncContext } from '@context/DataSyncContext'
import { trpc } from '@lib/trpc'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

export default function DataSyncProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [step, setStep] = useState<string>()
  const [progress, setProgress] = useState(0)

  const handleStart = (data: ProcedureOutput.OnDataSync) => {
    if (data.event !== 'start') {
      console.warn('Data sync event is not start:', data.event)
      return
    }

    console.log('Data sync started:', data)
    if (data.payload.isFirstRun) {
      navigate({
        to: '/welcome',
      })

      return
    }

    toast.custom(() => (
      <DataSync />
    ), { duration: Infinity })
  }

  const handleProgress = (data: ProcedureOutput.OnDataSync) => {
    if (data.event !== 'progress') {
      console.warn('Data sync event is not progress:', data.event)
      return
    }

    const step = [
      'download',
      'unzip',
      'parseXml',
      'saveToDb:Append',
      'saveToDb:Save',
    ]

    let dataType = data.type as string
    if (data.type === 'saveToDb') {
      dataType = `${data.type}:${data.payload.type}`
    }

    setStep(dataType)

    let progress = step.indexOf(dataType) / step.length

    progress = progress + ((data.payload?.progress || 0) / 100 / step.length)

    setProgress(progress * 100)
  }

  trpc.sync.onDatasync.useSubscription(undefined, {
    onData(data) {
      console.log('Payload received:', data)
      if (data.event === 'start') {
        handleStart(data)
      }
      else if (data.event === 'progress') {
        handleProgress(data)
      }
    },
    onError(err) {
      console.error('Error during data sync:', err)
    },
  })

  const contextValue = useMemo(() => ({
    step,
    progress,
  }), [step, progress])

  return (
    <DataSyncContext
      value={contextValue}
    >
      {children}
    </DataSyncContext>
  )
}
