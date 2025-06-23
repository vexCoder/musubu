import { join } from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({ path: join(import.meta.dirname, '..', '.env') })

interface OverrideEnv {
  NODE_ENV?: 'development' | 'production'
}

const schema = z.object({
  // import.meta.env built-in
  NODE_ENV: z.enum(['development', 'production']),

  // Custom environment variables
  RENDERER_URL: z.string().url().catch('http://localhost:5173'),
  OVERLAY_URL: z.string().url().catch('http://localhost:5174'),
})

export function parseEnv(opts: OverrideEnv) {
  const config = schema.parse({ ...process.env, ...opts })
  return config
}
