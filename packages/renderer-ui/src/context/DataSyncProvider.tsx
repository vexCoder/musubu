import type { ProcedureOutput } from '@/lib/types'
import DataSync from '@components/common/DataSync'
import { DataSyncContext } from '@context/DataSyncContext'
import { trpc } from '@lib/trpc'
import { useRouter } from '@tanstack/react-router'
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
  const [toastId, setToastId] = useState<string | number | null>(null)
  const [stepProgress, setStepProgress] = useState<Record<string, number>>({})

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

    const id = toast.custom(() => (
      <DataSync />
    ), { duration: Infinity })
    setToastId(id)
  }

  const handleFinish = (data: ProcedureOutput.OnDataSync) => {
    if (data.event !== 'finish') {
      console.warn('Data sync event is not finish:', data.event)
      return
    }

    console.log('Data sync finished')

    if (toastId) {
      toast.dismiss(toastId)
      toast.success('Data sync completed successfully!')
    }

    if (data.payload?.error) {
      console.error('Data sync error:', data.payload.error)
      toast.error(`Data sync failed: ${data.payload.error.message || 'Unknown error'}`)
    }

    if (router.state.location.pathname === '/welcome') {
      router.navigate({
        to: '/',
      })
    }

    setStep('')
    setStepProgress({})
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
      else if (data.event === 'finish') {
        handleFinish(data)
      }
    },
    onError(err) {
      console.error('Error during data sync:', err)
      if (toastId) {
        toast.dismiss(toastId)
      }

      toast.error('Data sync failed due to a connection error.')

      if (router.state.location.pathname === '/welcome') {
        router.navigate({
          to: '/',
        })
      }
    },
  })

  const contextValue = useMemo(() => {
    let progress = 0

    for (const stepId of DATASYNC_STEPS) {
      const stepCurrentCompletion = stepProgress[stepId] || 0
      const stepWeight = DATASYNC_STEP_WEIGHTS[stepId] || 0

      progress += (stepCurrentCompletion * stepWeight) * 100
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
