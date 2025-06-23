import type { Buffer } from 'node:buffer'
import path from 'node:path'

// eslint-disable-next-line ts/no-require-imports
const addon = require(path.join(__dirname, '..', 'build', 'Release', 'tracker.node'))

export interface ActiveWindow {
  title: string
  handle: number
  pid: number
  parentPid: number
}
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export type TrackerEvent =
  | { type: 'move', payload: WindowBounds }
  | { type: 'close' }

export interface WindowTracker {
  // Update the startTracking signature to use the single callback and new event type
  startTracking: (
    target: string | number,
    callback: (event: TrackerEvent) => void,
  ) => void

  stopTracking: () => void
  getActiveWindows: () => ActiveWindow[]
  takeScreenshot: (handle: number) => Buffer
  setWindowOwner: (childHandle: number, ownerHandle: number) => void
}

const { getActiveWindows, startTracking, stopTracking, takeScreenshot, setWindowOwner } = addon as WindowTracker

export { getActiveWindows, setWindowOwner, startTracking, stopTracking, takeScreenshot }
export default addon as WindowTracker
