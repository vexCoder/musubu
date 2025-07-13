import logger from '@lib/logger'

declare global {
  // eslint-disable-next-line no-var, import/no-mutable-exports
  export var logger: import('winston').Logger
}

// eslint-disable-next-line no-restricted-globals
global.logger = logger
