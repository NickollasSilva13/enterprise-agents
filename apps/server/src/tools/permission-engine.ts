import type { ToolPermission } from '@ea/shared';
import type { ToolRegistry } from './registry';
import { maxPermission } from './types';

export type PermissionReason =
  'unknown_tool' | 'not_granted' | 'denied' | 'tool_disabled' | 'granted';

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
}

const DENY = (reason: PermissionReason): PermissionDecision => ({ permission: 'deny', reason });

/**
 * The only place that decides whether a tool call may happen (SECURITY C-15,
 * C-16). It is asked on every call and looks only at configuration stored by
 * the user: nothing the model writes can change the answer.
 *
 * - a tool that does not exist, or was not granted to this agent, is denied;
 * - a tool that is off for the installation is denied whatever the grant;
 * - a high-risk tool is never allowed outright: "allow" becomes "ask".
 */
export class PermissionEngine {
  constructor(private readonly registry: ToolRegistry) {}

  decide(query: PermissionQuery): PermissionDecision {
    const tool = this.registry.get(query.toolName);
    if (!tool) return DENY('unknown_tool');

    const granted = query.grants.get(tool.name);
    if (granted === undefined) return DENY('not_granted');
    if (granted === 'deny') return DENY('denied');
    if (tool.offByDefault && !query.enabledTools.has(tool.name)) return DENY('tool_disabled');

    const permission = granted === 'allow' && maxPermission(tool.risk) === 'ask' ? 'ask' : granted;
    return { permission, reason: 'granted' };
  }
}
