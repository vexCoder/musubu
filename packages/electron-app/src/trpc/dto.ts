import { z } from 'zod'

export const ping = {
  input: z.object({
    pong: z.string(),
  }),
  output: z.object({
    value: z.string(),
    ts: z.date(),
  }),
}

export type PingInput = z.infer<typeof ping.input>
export type PingOutput = z.infer<typeof ping.output>
