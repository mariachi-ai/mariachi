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
    return entries.sort((a, b) => b[0].localeCompare(a[0]))[0][1];
  }

  render(name: string, variables: Record<string, string>): string {
    const prompt = this.get(name);
    if (!prompt) throw new Error(`Prompt ${name} not found`);
    let result = prompt.template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  }
}
