import { inspect } from 'node:util'
import { Paths } from '@lib/paths'
import chalk from 'chalk'
import dayjs from 'dayjs'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

const levelColors = {
  error: chalk.bold.red,
  warn: chalk.yellow,
  warning: chalk.yellow,
  info: chalk.green,
  http: chalk.magenta,
  verbose: chalk.cyan,
  debug: chalk.blue,
  silly: chalk.gray,
} as Record<string, (text: string) => string>

const levelIcons = {
  error: '❌',
  warn: '⚠️',
  warning: '⚠️',
  info: 'ℹ️',
  http: '🌐',
  verbose: '🔍',
  debug: '🐛',
  silly: '🤪',
} as Record<string, string>

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new DailyRotateFile({
      level: 'info',
      dirname: Paths.logs,
      filename: 'info-%DATE%.log',
    }),

    new DailyRotateFile({
      level: 'error',
      dirname: Paths.logs,
      filename: 'error-%DATE%.log',
    }),

    new winston.transports.Console({
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.printf((info) => {
          let { timestamp, level, message, stack, ...metadata } = info

          if (level === 'warn' || level === 'warning') {
            level = 'warn'
          }

          const emoji = levelIcons[level] ?? '❓'
          const levelColor = levelColors[level] ?? chalk.white
          const formattedLevel = levelColor(level.toUpperCase())
          let coloredMessage = chalk.white(message)
          const formattedDate = chalk.gray(`[${dayjs(timestamp as string).format('HH:mm:ss')}]`)

          if (level === 'debug' || level === 'silly') {
            coloredMessage = chalk.dim(message)
          }

          let log = `${emoji} ${formattedDate} ${formattedLevel} ${coloredMessage}`

          if (stack) {
            log += `\n${chalk.dim(stack)}`
          }

          if (Object.keys(metadata).length > 0) {
            log += ` ${inspect(metadata, {
              colors: true,
              depth: 2,
              maxArrayLength: 10,
              breakLength: 100,
              compact: false,
            })}`
          }

          return log
        }),
      ),
    }),
  ],
})

export default logger
