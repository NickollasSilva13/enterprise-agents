import type { Project, Schedule, TaskDetail } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, noContent, type RecordedRequest, renderApp } from '../../test/render';
import { describeRule } from './SchedulesPage';

// Scheduled tasks (Phase 19): the list, creating and changing a schedule, and
// where a task came from.

const area: Project = {
  id: 'p1',
  name: 'Dados',
  description: '',
  agentCount: 2,
  createdAt: '2026-11-16T12:00:00.000Z',
  updatedAt: '2026-11-16T12:00:00.000Z',
};

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 'sc1',
  areaId: 'p1',
  areaName: 'Dados',
  title: 'Relatório de vendas',
  description: '',
  acceptance: '',
  priority: 'normal',
  rule: { kind: 'weekly', days: [5, 1], time: '09:00' },
  enabled: true,
  nextRunAt: '2026-11-20T12:00:00.000Z',
  lastRunAt: '2026-11-16T12:00:00.000Z',
  lastOutcome: 'created',
  lastTaskId: 't9',
  lastTaskTitle: 'Relatório de vendas',
  createdAt: '2026-11-10T12:00:00.000Z',
  ...overrides,
});

const base = { '/api/projects': { projects: [area] } };

describe('describeRule', () => {
  it('says each kind of repetition in words', () => {
    expect(describeRule({ kind: 'once', at: '2026-11-20T09:30' })).toBe(
      'Uma vez, em 20/11/2026 às 09:30',
    );
    expect(describeRule({ kind: 'daily', time: '07:00' })).toBe('Todo dia às 07:00');
    expect(describeRule({ kind: 'weekly', days: [0, 5, 1], time: '18:00' })).toBe(
      'Toda segunda, sexta e domingo às 18:00',
    );
    expect(describeRule({ kind: 'monthly', day: 10, time: '08:00' })).toBe(
      'Todo mês, no dia 10, às 08:00',
    );
    expect(describeRule({ kind: 'monthly', day: 31, time: '08:00' })).toMatch(/último dia/);
  });
});

describe('the schedules screen (Phase 19)', () => {
  it('lists each schedule with its rule, next time and last result', async () => {
    renderApp('/tarefas/agendamentos', {
      ...base,
      '/api/schedules': {
        schedules: [
          schedule(),
          schedule({
            id: 'sc2',
            title: 'Fechamento',
            enabled: false,
            nextRunAt: null,
            lastOutcome: 'skipped',
          }),
          schedule({ id: 'sc3', title: 'Backup', lastOutcome: 'failed', lastTaskId: null }),
        ],
      },
    });
    const first = within(
      (await screen.findByRole('heading', { name: 'Relatório de vendas' })).closest('li')!,
    );
    expect(first.getByText('Área Dados · Toda segunda e sexta às 09:00')).toBeTruthy();
    expect(first.getByText(/^Próxima: /)).toBeTruthy();
    expect(first.getByRole('link', { name: 'Relatório de vendas' }).getAttribute('href')).toBe(
      '/tarefas/t9',
    );
    const paused = within(screen.getByRole('heading', { name: 'Fechamento' }).closest('li')!);
    expect(paused.getByText('Pausado.')).toBeTruthy();
    expect(paused.getByText(/ainda estava aberta/)).toBeTruthy();
    expect(
      paused.getByRole('switch', { name: 'Ativo: Fechamento' }).getAttribute('aria-checked'),
    ).toBe('false');
    expect(screen.getByText(/a área está sem fluxo/)).toBeTruthy();
  });

  it('says what is missing when there is no area', async () => {
    renderApp('/tarefas/agendamentos', {
      '/api/projects': { projects: [] },
      '/api/schedules': { schedules: [] },
    });
    expect(await screen.findByText(/Crie uma área antes/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Novo agendamento' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('opens the new schedule form from the office quick action (Phase 29)', async () => {
    renderApp('/tarefas/agendamentos?novo=1', { ...base, '/api/schedules': { schedules: [] } });
    expect(await screen.findByRole('dialog', { name: 'Novo agendamento' })).toBeTruthy();
  });

  it('creates a weekly schedule', async () => {
    const { writes } = renderApp('/tarefas/agendamentos', {
      ...base,
      '/api/schedules': { schedules: [] },
      'POST /api/schedules': () => json(201, schedule()),
    });
    // The button opens once the areas are known.
    await screen.findByText('Nenhum agendamento ainda.');
    fireEvent.click(screen.getByRole('button', { name: 'Novo agendamento' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Novo agendamento' }));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Título da tarefa' }), {
      target: { value: 'Relatório de vendas' },
    });
    // Monday is chosen to start with; Friday is added.
    fireEvent.click(dialog.getByRole('checkbox', { name: 'sexta' }));
    fireEvent.change(dialog.getByLabelText('Hora'), { target: { value: '08:30' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Criar agendamento' }));
    expect(await screen.findByText('Agendamento "Relatório de vendas" criado.')).toBeTruthy();
    expect(writes()).toEqual([
      {
        method: 'POST',
        url: '/api/schedules',
        body: {
          areaId: 'p1',
          title: 'Relatório de vendas',
          description: '',
          acceptance: '',
          priority: 'normal',
          rule: { kind: 'weekly', days: [1, 5], time: '08:30' },
        },
      },
    ]);
  });

  it('shows why the server refused the time', async () => {
    renderApp('/tarefas/agendamentos', {
      ...base,
      '/api/schedules': { schedules: [] },
      'POST /api/schedules': () =>
        json(400, {
          code: 'validation_error',
          message: 'Os dados enviados são inválidos.',
          details: [{ path: 'rule.at', message: 'Escolha um horário no futuro.' }],
        }),
    });
    // The button opens once the areas are known.
    await screen.findByText('Nenhum agendamento ainda.');
    fireEvent.click(screen.getByRole('button', { name: 'Novo agendamento' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Título da tarefa' }), {
      target: { value: 'Uma vez' },
    });
    fireEvent.change(dialog.getByRole('combobox', { name: 'Repetição' }), {
      target: { value: 'once' },
    });
    fireEvent.change(dialog.getByLabelText('Data e hora'), {
      target: { value: '2020-01-01T09:00' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Criar agendamento' }));
    expect(await dialog.findByText('Escolha um horário no futuro.')).toBeTruthy();
  });

  it('pauses, creates now, edits and deletes', async () => {
    const { writes } = renderApp('/tarefas/agendamentos', {
      ...base,
      '/api/schedules': { schedules: [schedule()] },
      'PATCH /api/schedules/sc1': (request: RecordedRequest) =>
        json(200, schedule(request.body as Partial<Schedule>)),
      'POST /api/schedules/sc1/run': schedule({ lastOutcome: 'skipped' }),
      'DELETE /api/schedules/sc1': noContent,
    });
    fireEvent.click(await screen.findByRole('switch', { name: 'Ativo: Relatório de vendas' }));
    expect(await screen.findByText('Agendamento pausado.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Criar agora' }));
    expect(
      await screen.findByText('A tarefa anterior ainda está aberta: nenhuma nova foi criada.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Editar Relatório de vendas' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('combobox', { name: 'Área' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(dialog.getByRole('combobox', { name: 'Repetição' }), {
      target: { value: 'monthly' },
    });
    fireEvent.change(dialog.getByRole('spinbutton', { name: /Dia do mês/ }), {
      target: { value: '31' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Agendamento atualizado.');

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Relatório de vendas' }));
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: /Excluir o agendamento/ })).getByRole(
        'button',
        { name: 'Excluir' },
      ),
    );
    await waitFor(() =>
      expect(writes()).toEqual([
        { method: 'PATCH', url: '/api/schedules/sc1', body: { enabled: false } },
        { method: 'POST', url: '/api/schedules/sc1/run', body: undefined },
        {
          method: 'PATCH',
          url: '/api/schedules/sc1',
          body: {
            title: 'Relatório de vendas',
            description: '',
            acceptance: '',
            priority: 'normal',
            rule: { kind: 'monthly', day: 31, time: '09:00' },
          },
        },
        { method: 'DELETE', url: '/api/schedules/sc1', body: undefined },
      ]),
    );
  });
});

describe('a scheduled task (Phase 19)', () => {
  it('says which schedule created it', async () => {
    const detail: TaskDetail = {
      task: {
        id: 't9',
        areaId: 'p1',
        areaName: 'Dados',
        title: 'Relatório de vendas',
        description: '',
        acceptance: '',
        priority: 'normal',
        state: 'open',
        stageId: 's1',
        stageName: 'Fila',
        stageKind: 'human',
        roleName: null,
        agentId: null,
        agentName: null,
        attention: null,
        working: false,
        queued: false,
        returns: 0,
        runCount: 0,
        parentTaskId: null,
        waitingOn: 0,
        createdAt: '2026-11-16T12:00:00.000Z',
        updatedAt: '2026-11-16T12:00:00.000Z',
      },
      events: [],
      moves: [],
      parent: null,
      children: [],
      requestTargets: [],
      schedule: { id: 'sc1', title: 'Relatório de vendas' },
    };
    renderApp('/tarefas/t9', { '/api/tasks/t9': detail });
    const panel = within(await screen.findByRole('region', { name: 'Agendamento' }));
    expect(panel.getByRole('link', { name: 'Relatório de vendas' }).getAttribute('href')).toBe(
      '/tarefas/agendamentos',
    );
  });
});
