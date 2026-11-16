import type { ToolPermission } from '@ea/shared';
import type { ToolRegistry } from './registry';
import { maxPermission } from './types';

export type PermissionReason =
  | 'unknown_tool'
  | 'not_granted'
  | 'denied'
  | 'tool_disabled'
  | 'granted'
  | 'task_tool'
  | 'not_in_task';

export interface PermissionDecision {
  readonly permission: ToolPermission;
  readonly reason: PermissionReason;
}

export interface PermissionQuery {
  readonly toolName: string;
  /** What this agent was granted, by tool name. Anything absent is denied. */
  readonly grants: ReadonlyMap<string, ToolPermission>;
  /** Tools that are off by default and that the user has switched on. */
  readonly enabledTools: ReadonlySet<string>;
  /** The run works on a task of the board (Phase 16). */
  readonly inTask?: boolean;
}

const DENY = (reason: PermissionReason): PermissionDecision => ({ permission: 'deny', reason });

/**
 * The only place that decides whether a tool call may happen (SECURITY C-15,
 * C-16). It is asked on every call and looks only at configuration stored by
 * the user: nothing the model writes can change the answer.
 *
 * - a tool that does not exist, or was not granted to this agent, is denied;
 * - a tool that is off for the installation is denied whatever the grant;
 * - a high-risk tool is never allowed outright: "allow" becomes "ask";
 * - a task tool is allowed only in a run that works on a task, and denied
 *   everywhere else whatever was granted; what it may do is then bounded by
 *   the workflow, which the tasks module enforces (Phase 16, D4).
 */
export class PermissionEngine {
  constructor(private readonly registry: ToolRegistry) {}

  decide(query: PermissionQuery): PermissionDecision {
    const tool = this.registry.get(query.toolName);
    if (!tool) return DENY('unknown_tool');
    if (tool.scope === 'task') {
      return query.inTask === true
        ? { permission: 'allow', reason: 'task_tool' }
        : DENY('not_in_task');
    }

    const granted = query.grants.get(tool.name);
    if (granted === undefined) return DENY('not_granted');
    if (granted === 'deny') return DENY('denied');
    if (tool.offByDefault && !query.enabledTools.has(tool.name)) return DENY('tool_disabled');

    const permission = granted === 'allow' && maxPermission(tool.risk) === 'ask' ? 'ask' : granted;
    return { permission, reason: 'granted' };
  }
}
