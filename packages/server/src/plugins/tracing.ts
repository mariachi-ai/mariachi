import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function tracingPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const traceId = req.serverCtx?.traceId ?? crypto.randomUUID();
    reply.header('x-trace-id', traceId);
    return payload;
  });
}
