import type { ProcedureOutput } from '@/lib/types'
import DataSync from '@components/common/DataSync'
import { DataSyncContext } from '@context/DataSyncContext'
import { trpc } from '@lib/trpc'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

const DATASYNC_STEPS = [
  'download',
  'unzip',
  'parseXml',
  'saveToDb:Append',
  'saveToDb:Save',
]

const DATASYNC_STEP_WEIGHTS: Record<string, number> = {
  'download': 0.2,
  'unzip': 0.05,
  'parseXml': 0.25,
  'saveToDb:Append': 0.3,
  'saveToDb:Save': 0.2,
}

export default function DataSyncProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [step, setStep] = useState<string>()
  const [stepProgress, setStepProgress] = useState<Record<string, number>>({})

  console.log(`Weights: ${
    Object.entries(DATASYNC_STEP_WEIGHTS)
      .reduce((acc, [_key, value]) => {
        return acc + value
      }, 0)
  }`)

  const handleStart = (data: ProcedureOutput.OnDataSync) => {
    if (data.event !== 'start') {
      console.warn('Data sync event is not start:', data.event)
      return
    }

    console.log('Data sync started:', data)
    if (data.payload.isFirstRun) {
      router.navigate({
        to: '/welcome',
      })

      return
    }

    if (router.state.location.pathname === '/welcome') {
      router.navigate({
        to: '/',
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

    let dataType = data.type as string
    if (data.type === 'saveToDb') {
      dataType = `${data.type}:${data.payload.type}`
    }

    setStep(dataType)
    setStepProgress((prev) => {
      const clampedProgressPercent = Math.max(0, Math.min(100, data.payload?.progress || 0))
      return ({
        ...prev,
        [dataType]: clampedProgressPercent / 100,
      })
    })
  }

  trpc.sync.onDatasync.useSubscription(undefined, {
    onData(data) {
      if (data.event === 'start') {
        setStepProgress({
          'download': 0,
          'unzip': 0,
          'parseXml': 0,
          'saveToDb:Append': 0,
          'saveToDb:Save': 0,
        })

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

  const contextValue = useMemo(() => {
    let progress = 0

    for (const stepId of DATASYNC_STEPS) {
      const stepCurrentCompletion = stepProgress[stepId] || 0
      const stepWeight = DATASYNC_STEP_WEIGHTS[stepId] || 0

      progress += (stepCurrentCompletion * stepWeight) * 100

      console.log({ progress, stepProgress })
    }

    return ({
      step,
      progress,
    })
  }, [step, stepProgress])

  return (
    <DataSyncContext
      value={contextValue}
    >
      {children}
    </DataSyncContext>
  )
}
