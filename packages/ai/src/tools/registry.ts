import type { ToolDefinition } from '../types';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) throw new Error(`Invalid input for tool ${name}: ${parsed.error.message}`);
    return tool.handler(parsed.data);
  }
}
