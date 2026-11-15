import type { ToolDefinition } from './types';

const NAME_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;

/** The catalogue of tools that exist. It grants nothing: see PermissionEngine. */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register<Input>(tool: ToolDefinition<Input>): this {
    if (!NAME_PATTERN.test(tool.name)) throw new Error(`Invalid tool name: ${tool.name}`);
    if (this.tools.has(tool.name)) throw new Error(`Tool registered twice: ${tool.name}`);
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }
}
