import { AIError } from '@mariachi/core';
import type { PromptTemplate } from '../types';

export class PromptRegistry {
  private prompts = new Map<string, PromptTemplate>();

  register(prompt: PromptTemplate): void {
    const key = `${prompt.name}@${prompt.version}`;
    this.prompts.set(key, prompt);
  }

  get(name: string, version?: string): PromptTemplate | undefined {
    if (version) {
      return this.prompts.get(`${name}@${version}`);
    }
    const entries = Array.from(this.prompts.entries()).filter(([k]) => k.startsWith(`${name}@`));
    if (entries.length === 0) return undefined;
    // Numeric-aware so `@10` sorts after `@9`.
    return entries.sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }))[0][1];
  }

  render(name: string, variables: Record<string, string>): string {
    const prompt = this.get(name);
    if (!prompt) throw new AIError('ai/prompt-not-found', `Prompt ${name} not found`, { name });
    // A function replacer, so `$&` or `$1` in a value is inserted literally.
    return prompt.template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
      Object.prototype.hasOwnProperty.call(variables, key) ? variables[key]! : match,
    );
  }
}
