import type { ToolPermission, ToolRisk } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBuiltinRegistry } from './builtin';
import { PermissionEngine } from './permission-engine';
import { ToolRegistry } from './registry';
import { maxPermission, type ToolDefinition, toToolSpec } from './types';

function tool(name: string, risk: ToolRisk, offByDefault = false): ToolDefinition {
  return {
    name,
    title: name,
    summary: '',
    description: '',
    risk,
    inputSchema: z.strictObject({}),
    offByDefault,
    execute: async () => ({ content: '' }),
  };
}

const registry = new ToolRegistry()
  .register(tool('reader', 'low'))
  .register(tool('writer', 'medium'))
  .register(tool('runner', 'high', true));
const engine = new PermissionEngine(registry);

const decide = (
  toolName: string,
  grants: Record<string, ToolPermission> = {},
  enabled: string[] = [],
) =>
  engine.decide({
    toolName,
    grants: new Map(Object.entries(grants)),
    enabledTools: new Set(enabled),
  });

describe('PermissionEngine (C-15, C-16, C-20)', () => {
  it('denies by default: a tool that was not granted', () => {
    expect(decide('reader')).toEqual({ permission: 'deny', reason: 'not_granted' });
    expect(decide('reader', { writer: 'allow' })).toEqual({
      permission: 'deny',
      reason: 'not_granted',
    });
  });

  it('denies a tool that does not exist, even if something granted it', () => {
    expect(decide('ghost', { ghost: 'allow' })).toEqual({
      permission: 'deny',
      reason: 'unknown_tool',
    });
  });

  it('honours an explicit deny', () => {
    expect(decide('reader', { reader: 'deny' })).toEqual({ permission: 'deny', reason: 'denied' });
  });

  it('returns the grant for low and medium risk tools', () => {
    expect(decide('reader', { reader: 'allow' }).permission).toBe('allow');
    expect(decide('writer', { writer: 'allow' }).permission).toBe('allow');
    expect(decide('writer', { writer: 'ask' }).permission).toBe('ask');
  });

  it('never allows a high-risk tool outright: "allow" becomes "ask"', () => {
    expect(decide('runner', { runner: 'allow' }, ['runner'])).toEqual({
      permission: 'ask',
      reason: 'granted',
    });
    expect(decide('runner', { runner: 'ask' }, ['runner']).permission).toBe('ask');
  });

  it('denies an off-by-default tool until it is switched on, whatever the grant', () => {
    expect(decide('runner', { runner: 'ask' })).toEqual({
      permission: 'deny',
      reason: 'tool_disabled',
    });
    expect(decide('runner', { runner: 'allow' }, ['reader'])).toMatchObject({ permission: 'deny' });
  });

  it('matches tool names exactly', () => {
    expect(decide('Reader', { reader: 'allow', Reader: 'allow' }).permission).toBe('deny');
    expect(decide('reader ', { reader: 'allow' }).permission).toBe('deny');
  });
});

describe('PermissionEngine and task tools (Phase 16)', () => {
  const taskRegistry = new ToolRegistry()
    .register(tool('reader', 'low'))
    .register({ ...tool('mover', 'low'), scope: 'task' });
  const taskEngine = new PermissionEngine(taskRegistry);
  const ask = (toolName: string, inTask: boolean, grants: Record<string, ToolPermission> = {}) =>
    taskEngine.decide({
      toolName,
      grants: new Map(Object.entries(grants)),
      enabledTools: new Set(),
      inTask,
    });

  it('allows a task tool only in a run that works on a task', () => {
    expect(ask('mover', true)).toEqual({ permission: 'allow', reason: 'task_tool' });
    expect(ask('mover', false)).toEqual({ permission: 'deny', reason: 'not_in_task' });
  });

  it('does not let a grant open a task tool outside a task, nor a deny close it inside one', () => {
    expect(ask('mover', false, { mover: 'allow' })).toEqual({
      permission: 'deny',
      reason: 'not_in_task',
    });
    expect(ask('mover', true, { mover: 'deny' }).permission).toBe('allow');
  });

  it('leaves every other tool to the grants, task run or not', () => {
    expect(ask('reader', true)).toEqual({ permission: 'deny', reason: 'not_granted' });
    expect(ask('reader', true, { reader: 'ask' }).permission).toBe('ask');
  });
});

describe('ToolRegistry', () => {
  it('refuses invalid and repeated names', () => {
    expect(() => new ToolRegistry().register(tool('Bad-Name', 'low'))).toThrow();
    expect(() => new ToolRegistry().register(tool('x', 'low'))).toThrow();
    expect(() =>
      new ToolRegistry().register(tool('ok', 'low')).register(tool('ok', 'low')),
    ).toThrow();
  });

  it('ships the built-in tools with the risks of SECURITY section 7', () => {
    const builtin = createBuiltinRegistry().list();
    expect(builtin.map((entry) => [entry.name, entry.risk, maxPermission(entry.risk)])).toEqual([
      ['read_file', 'low', 'allow'],
      ['list_dir', 'low', 'allow'],
      ['write_file', 'medium', 'allow'],
      ['fetch_url', 'medium', 'allow'],
      ['delegate_to_agent', 'medium', 'allow'],
      ['run_script', 'high', 'ask'],
      ['move_task', 'low', 'allow'],
      ['comment_task', 'low', 'allow'],
    ]);
    expect(builtin.filter((entry) => entry.offByDefault).map((entry) => entry.name)).toEqual([
      'run_script',
    ]);
    // The task tools are not granted per agent: they exist only in task runs.
    expect(builtin.filter((entry) => entry.scope === 'task').map((entry) => entry.name)).toEqual([
      'move_task',
      'comment_task',
    ]);
  });

  it('describes every built-in tool to the model as an object schema', () => {
    for (const entry of createBuiltinRegistry().list()) {
      const spec = toToolSpec(entry);
      expect(spec.parameters).toMatchObject({ type: 'object', additionalProperties: false });
      expect(spec.parameters).not.toHaveProperty('$schema');
      expect(spec.description.length).toBeGreaterThan(10);
    }
  });
});
