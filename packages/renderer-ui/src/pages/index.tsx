import { createFileRoute } from '@tanstack/react-router'
import { trpc } from '@/lib/trpc'
import { useState } from 'react'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function getStepText(step: string | undefined): string {
  switch (step) {
    case 'download':
      return 'Downloading data...'
    case 'unzip':
      return 'Unzipping data...'
    case 'parseXml':
      return 'Parsing XML data...'
    case 'saveToDb':
      return 'Saving data to database...'
    default:
      return 'Initializing...'
  }
}

function RouteComponent() {
  const [step, setStep] = useState<string>()
  const [progress, setProgress] = useState(0)
  trpc.sync.onDatasync.useSubscription(undefined, {
    onData(data) {
      const step = [
        'download',
        'unzip',
        'parseXml',
        'saveToDb',
      ]

      setStep(data.type)

      let progress = step.indexOf(data.type) / step.length

      if (data.type === 'parseXml') {
        progress = progress + ((data.payload?.progress || 0) / 100 / step.length)
      }

      if (data.type === 'download') {
        progress = progress + ((data.payload?.percentage || 0) / 100 / step.length)
      }

      if (data.type === 'unzip') {
        progress = progress + ((data.payload?.progress || 0) / 100 / step.length)
      }

      if (data.type === 'saveToDb') {
        progress = progress + ((data.payload?.progress || 0) / 100 / step.length)
      }

      setProgress(progress * 100)
    },
    onError(err) {
      console.error('Error during data sync:', err);
    },
  })

  return (
    <div className="flex">
      <video
        loop
        autoPlay
        muted
        src='/Image_Generation_Request_Failed.mp4'
        className='absolute top-0 left-0 w-full h-full object-cover -z-10 opacity-45'
      />
      
      <div className="flex flex-col items-center justify-center w-full h-screen text-white">
        <div className="w-full max-w-md rounded-lg p-6">
            <div className="text-sm text-gray-700 mb-2 flex justify-between">
              <p>{getStepText(step)}</p>
              <p className="text-sm text-gray-700">Progress: {Math.round(progress)}%</p>
            </div>
            <div className="h-1 bg-gray-400 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-700 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
      </div>
    </div>
  )
}
