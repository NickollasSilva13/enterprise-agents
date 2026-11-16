import type { NetGuardOptions } from '../net-guard';
import { ToolRegistry } from '../registry';
import { delegateTool } from './delegate';
import { createFetchUrlTool } from './fetch-url';
import { listDirTool, readFileTool, writeFileTool } from './files';
import { createRunScriptTool } from './run-script';
import { commentTaskTool, moveTaskTool } from './tasks';

export const DELEGATE_TOOL_NAME = delegateTool.name;

/** The tools that ship with the application. To add one, register it here. */
export function createBuiltinRegistry(options: { net?: NetGuardOptions } = {}): ToolRegistry {
  return new ToolRegistry()
    .register(readFileTool)
    .register(listDirTool)
    .register(writeFileTool)
    .register(createFetchUrlTool(options.net))
    .register(delegateTool)
    .register(createRunScriptTool())
    .register(moveTaskTool)
    .register(commentTaskTool);
}
