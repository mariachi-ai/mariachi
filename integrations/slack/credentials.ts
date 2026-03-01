import { z } from 'zod';

export const SlackCredentials = z.object({
  botToken: z.string().min(1),
  signingSecret: z.string().min(1),
});

export type SlackCredentials = z.infer<typeof SlackCredentials>;
