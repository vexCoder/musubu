import { createReadStream, stat } from 'fs-extra'
import sax from 'sax'

type ParsedType = null | string | number | boolean

function parseValue(value: string): ParsedType {
  if (value == null || value === '')
    return null // Use == null to catch undefined too
  const trimmedValue = value.trim()
  if (/^true$/i.test(trimmedValue))
    return true
  if (/^false$/i.test(trimmedValue))
    return false
  if (/^\d+$/.test(trimmedValue))
    return Number.parseInt(trimmedValue, 10)
  if (/^\d+\.\d+$/.test(trimmedValue))
    return Number.parseFloat(trimmedValue)
  return value as string // Return original string if no other type matches
}

export interface XmlProgress {
  totalSize: number
  bytesRead: number
  currentFile: string
  progress: number
  // eslint-disable-next-line ts/no-explicit-any
  data?: any
}

interface StreamParseXmlOptions {
  filePath: string
  recordTags: string[]
  onError?: (error: Error) => void
  onData?: (data: unknown) => void | Promise<void>
}

export async function* streamParseXml({
  filePath,
  recordTags,
  onError = () => {},
  onData = () => {},
}: StreamParseXmlOptions) {
  const sourceStream = createReadStream(filePath)
  const recordTagRegex = new RegExp(`^(${recordTags.join('|')})$`, 'i')
  const saxStream = sax.createStream(true, { trim: true, normalize: true })

  const stats = await stat(filePath)
  const totalSizeInBytes = stats.size

  let currentRecord: Record<string, ParsedType> | null = null
  let currentTag: string | null = null
  let streamError: Error | null = null

  const yieldQueue: unknown[] = []
  let lastReportedProgress = -1

  let notifyConsumer = () => {}

  saxStream.on('opentag', (node) => {
    if (!currentRecord && recordTagRegex.test(node.name)) {
      currentRecord = { type: node.name }
      // console.log('start', node.name)
    }
    else if (currentRecord) {
      // console.log('Open tag:', node.name)
      currentTag = node.name
      currentRecord[currentTag] = ''
    }
  })

  saxStream.on('text', (text) => {
    if (currentRecord && currentTag) {
      currentRecord[currentTag] += text
    }
  })

  saxStream.on('closetag', (tagName) => {
    // We've reached the end of a record.
    if (recordTagRegex.test(tagName) && currentRecord && currentRecord.type === tagName) {
      // console.log('end', tagName)
      yieldQueue.push(currentRecord)
      currentRecord = null
      notifyConsumer()
    }
    else if (currentTag === tagName && currentRecord) {
      currentRecord[currentTag] = parseValue(currentRecord[currentTag] as string)
      currentTag = null
    }
  })

  saxStream.on('error', (err) => {
    streamError = err
    notifyConsumer()
  })

  sourceStream.on('end', () => {
    notifyConsumer()
  })

  sourceStream.pipe(saxStream)

  while (!sourceStream.closed || yieldQueue.length > 0) {
    if (streamError) {
      onError(streamError)
      return
    }

    if (totalSizeInBytes > 0 && yieldQueue.length > 0) {
      const bytesRead = sourceStream.bytesRead
      const percentage = (bytesRead / totalSizeInBytes) * 100
      const data = yieldQueue.shift()
      lastReportedProgress = Math.floor(percentage)

      if (yieldQueue.length === 0 && bytesRead >= totalSizeInBytes) {
        lastReportedProgress = 100
      }

      try {
        await onData(data)
      }
      catch (error) {
        onError(error as Error)
      }

      yield {
        totalSize: totalSizeInBytes,
        bytesRead,
        currentFile: filePath,
        progress: lastReportedProgress,
        data,
      }
    }

    else {
      await new Promise<void>((resolve) => {
        notifyConsumer = resolve
      })
    }
  }
}
