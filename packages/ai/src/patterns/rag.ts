import type { AISession } from '../types';

export interface RAGPipelineConfig {
  search: (query: string) => Promise<string[]>;
  session: AISession;
}

export function createRAGPipeline(config: RAGPipelineConfig) {
  const { search, session } = config;

  return {
    async query(userMessage: string) {
      const docs = await search(userMessage);
      const context = docs.length
        ? `\n\nRelevant context:\n${docs.map((d, i) => `[${i + 1}] ${d}`).join('\n')}\n\n`
        : '';
      const message = `${context}User question: ${userMessage}`;
      return session.send(message);
    },
  };
}
