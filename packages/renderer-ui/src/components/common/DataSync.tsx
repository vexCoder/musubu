import { useDataSyncContext } from '@context/DataSyncContext'

function getStepText(step: string | undefined): string {
  switch (step) {
    case 'download':
      return 'Downloading data...'
    case 'unzip':
      return 'Unzipping data...'
    case 'parseXml':
      return 'Parsing XML data...'
    case 'saveToDb:Append':
      return 'Appending data to queue...'
    case 'saveToDb:Save':
      return 'Saving data to database...'
    default:
      return 'Initializing...'
  }
}

export default function DataSync() {
  const { step, progress } = useDataSyncContext()

  return (
    <div className="w-full max-w-md rounded-lg p-6">
      <div className="mb-2 flex justify-between text-sm text-gray-700">
        <p>{getStepText(step)}</p>
        <p className="text-sm text-gray-700">
          Progress:
          {Math.round(progress)}
          %
        </p>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-gray-400">
        <div
          className="h-full bg-gray-700 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
