import { z } from 'zod';

export const SendMessageInput = z.object({
  channel: z.string().min(1),
  text: z.string().min(1),
  threadTs: z.string().optional(),
});

export const SendMessageOutput = z.object({
  ts: z.string(),
  channel: z.string(),
  ok: z.boolean(),
});

export type SendMessageInput = z.infer<typeof SendMessageInput>;
export type SendMessageOutput = z.infer<typeof SendMessageOutput>;
