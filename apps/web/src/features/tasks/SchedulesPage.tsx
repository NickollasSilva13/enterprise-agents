import type { Schedule, ScheduleKind, ScheduleRule } from '@ea/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, buttonClass, IconButton } from '../../components/Button';
import { SelectField, Switch, TextAreaField, TextField } from '../../components/Form';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { TasksTabs } from './TasksTabs';
import { Panel } from '../../components/Panel';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { useProjects } from '../../lib/queries';
import {
  useCreateSchedule,
  useDeleteSchedule,
  useRunSchedule,
  useSchedules,
  useUpdateSchedule,
} from '../../lib/task-queries';
import { LINK } from '../../components/TextLink';
import { FormError, ToneText } from '../../components/Notice';
import { Tip } from '../../components/Tip';

// Scheduled tasks (Phase 19): a task created on an area's board at set
// times, which then follows the area's flow. Times are this machine's.

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** Monday first, as on a calendar here. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const KIND_LABEL: Record<ScheduleKind, string> = {
  once: 'Uma vez',
  daily: 'Todo dia',
  weekly: 'Toda semana',
  monthly: 'Todo mês',
};

const list = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;

/** The rule in words: "Toda segunda e sexta às 18:00". */
export function describeRule(rule: ScheduleRule): string {
  switch (rule.kind) {
    case 'once': {
      const [date = '', time = ''] = rule.at.split('T');
      const [year, month, day] = date.split('-');
      return `Uma vez, em ${day}/${month}/${year} às ${time}`;
    }
    case 'daily':
      return `Todo dia às ${rule.time}`;
    case 'weekly': {
      const days = WEEK_ORDER.filter((day) => rule.days.includes(day)).map(
        (day) => WEEKDAYS[day] ?? '',
      );
      return `Toda ${list(days)} às ${rule.time}`;
    }
    case 'monthly':
      return rule.day > 28
        ? `Todo mês, no dia ${rule.day} (ou no último dia, se o mês for mais curto), às ${rule.time}`
        : `Todo mês, no dia ${rule.day}, às ${rule.time}`;
  }
}

function LastResult({ schedule }: { schedule: Schedule }) {
  if (!schedule.lastRunAt || !schedule.lastOutcome) {
    return <p className="text-dim">Ainda não criou nenhuma tarefa.</p>;
  }
  const when = formatDateTime(schedule.lastRunAt);
  const task = schedule.lastTaskId ? (
    <Link to={`/tarefas/${encodeURIComponent(schedule.lastTaskId)}`} className={LINK}>
      {schedule.lastTaskTitle ?? 'tarefa'}
    </Link>
  ) : null;
  switch (schedule.lastOutcome) {
    case 'created':
      return (
        <p>
          Em {when}, criou a tarefa {task}.
        </p>
      );
    case 'skipped':
      return (
        <p>
          Em {when}, não criou uma tarefa nova: {task} ainda estava aberta.
        </p>
      );
    case 'failed':
      return (
        <ToneText tone="fail" className="block">
          Em {when}, não conseguiu criar a tarefa: a área está sem fluxo.
        </ToneText>
      );
  }
}

interface FormValues {
  areaId: string;
  title: string;
  description: string;
  acceptance: string;
  priority: 'normal' | 'high';
  kind: ScheduleKind;
  at: string;
  time: string;
  days: number[];
  day: string;
}

function initialValues(schedule: Schedule | null, areaId: string): FormValues {
  const rule = schedule?.rule;
  return {
    areaId: schedule?.areaId ?? areaId,
    title: schedule?.title ?? '',
    description: schedule?.description ?? '',
    acceptance: schedule?.acceptance ?? '',
    priority: schedule?.priority ?? 'normal',
    kind: rule?.kind ?? 'weekly',
    at: rule?.kind === 'once' ? rule.at : '',
    time: rule && rule.kind !== 'once' ? rule.time : '09:00',
    days: rule?.kind === 'weekly' ? [...rule.days] : [1],
    day: rule?.kind === 'monthly' ? String(rule.day) : '1',
  };
}

function ruleOf(values: FormValues): ScheduleRule {
  switch (values.kind) {
    case 'once':
      return { kind: 'once', at: values.at };
    case 'daily':
      return { kind: 'daily', time: values.time };
    case 'weekly':
      return { kind: 'weekly', days: [...values.days].sort(), time: values.time };
    case 'monthly':
      return { kind: 'monthly', day: Number(values.day), time: values.time };
  }
}

/** Creates a schedule, or edits one (the area of a schedule does not change). */
function ScheduleDialog({
  schedule,
  areas,
  onClose,
}: {
  schedule: Schedule | null;
  areas: readonly { id: string; name: string }[];
  onClose: () => void;
}) {
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const notify = useToast();
  const [values, setValues] = useState(() => initialValues(schedule, areas[0]?.id ?? ''));
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const mutation = schedule ? update : create;
  const errors = mutation.error ? fieldErrors(mutation.error) : {};
  const ruleError =
    errors['rule.at'] ?? errors['rule.time'] ?? errors['rule.days'] ?? errors['rule.day'];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const fields = {
      title: values.title,
      description: values.description,
      acceptance: values.acceptance,
      priority: values.priority,
      rule: ruleOf(values),
    };
    const done = (saved: Schedule) => {
      notify(schedule ? 'Agendamento atualizado.' : `Agendamento "${saved.title}" criado.`);
      onClose();
    };
    if (schedule) {
      update.mutate({ scheduleId: schedule.id, patch: fields }, { onSuccess: done });
    } else {
      create.mutate({ ...fields, areaId: values.areaId }, { onSuccess: done });
    }
  };

  const toggleDay = (day: number) =>
    set(
      'days',
      values.days.includes(day)
        ? values.days.filter((entry) => entry !== day)
        : [...values.days, day],
    );

  return (
    <Modal
      title={schedule ? `Editar ${schedule.title}` : 'Novo agendamento'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="schedule" disabled={mutation.isPending}>
            {schedule ? 'Salvar' : 'Criar agendamento'}
          </Button>
        </>
      }
    >
      <form id="schedule" onSubmit={submit} className="space-y-4">
        <SelectField
          label="Área"
          value={values.areaId}
          onChange={(event) => set('areaId', event.target.value)}
          disabled={schedule !== null}
          error={errors.areaId}
          hint={
            schedule
              ? 'A área de um agendamento não muda: crie outro para outra área.'
              : 'A tarefa entra na primeira etapa do fluxo desta área.'
          }
        >
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Título da tarefa"
          value={values.title}
          onChange={(event) => set('title', event.target.value)}
          error={errors.title}
          required
        />
        <TextAreaField
          label="Descrição"
          value={values.description}
          onChange={(event) => set('description', event.target.value)}
          error={errors.description}
          rows={3}
        />
        <TextAreaField
          label="Critérios de aceite"
          value={values.acceptance}
          onChange={(event) => set('acceptance', event.target.value)}
          error={errors.acceptance}
          rows={3}
        />
        <SelectField
          label="Prioridade"
          value={values.priority}
          onChange={(event) => set('priority', event.target.value === 'high' ? 'high' : 'normal')}
        >
          <option value="normal">Normal</option>
          <option value="high">Alta (passa à frente na fila do agente)</option>
        </SelectField>
        <SelectField
          label="Repetição"
          value={values.kind}
          onChange={(event) => set('kind', event.target.value as ScheduleKind)}
        >
          {(Object.keys(KIND_LABEL) as ScheduleKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABEL[kind]}
            </option>
          ))}
        </SelectField>
        {values.kind === 'once' ? (
          <TextField
            label="Data e hora"
            type="datetime-local"
            value={values.at}
            onChange={(event) => set('at', event.target.value)}
            required
          />
        ) : (
          <TextField
            label="Hora"
            type="time"
            value={values.time}
            onChange={(event) => set('time', event.target.value)}
            required
          />
        )}
        {values.kind === 'weekly' && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Dias da semana</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {WEEK_ORDER.map((day) => (
                <label key={day} className="inline-flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values.days.includes(day)}
                    onChange={() => toggleDay(day)}
                    className="size-4 accent-accent"
                  />
                  {WEEKDAYS[day]}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {values.kind === 'monthly' && (
          <TextField
            label="Dia do mês"
            type="number"
            min={1}
            max={31}
            value={values.day}
            onChange={(event) => set('day', event.target.value)}
            hint="Em meses mais curtos, vale o último dia."
            required
          />
        )}
        {ruleError && <FormError>{ruleError}</FormError>}
        <p className="text-sm text-dim">
          O horário é o desta máquina. Se a plataforma estiver desligada na hora marcada, a tarefa é
          criada uma vez quando ela voltar. Enquanto a tarefa anterior deste agendamento estiver
          aberta, nenhuma nova é criada.
        </p>
        {mutation.error && !ruleError && !errors.title && !errors.areaId && (
          <FormError>{errorMessage(mutation.error)}</FormError>
        )}
      </form>
    </Modal>
  );
}

function ScheduleItem({
  schedule,
  areas,
}: {
  schedule: Schedule;
  areas: readonly { id: string; name: string }[];
}) {
  const update = useUpdateSchedule();
  const remove = useDeleteSchedule();
  const run = useRunSchedule();
  const notify = useToast();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const error = update.error ?? remove.error ?? run.error;

  return (
    <li className="space-y-2 px-4 py-4 text-sm" data-schedule={schedule.id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{schedule.title}</h3>
        <span className="flex items-center gap-1">
          <IconButton label={`Editar ${schedule.title}`} onClick={() => setEditing(true)}>
            <Pencil className="size-4.5" aria-hidden />
          </IconButton>
          <IconButton label={`Excluir ${schedule.title}`} onClick={() => setRemoving(true)}>
            <Trash2 className="size-4.5" aria-hidden />
          </IconButton>
        </span>
      </div>
      <p className="text-dim">
        Área {schedule.areaName} · {describeRule(schedule.rule)}
      </p>
      <p>
        {schedule.nextRunAt
          ? `Próxima: ${formatDateTime(schedule.nextRunAt)}.`
          : schedule.enabled
            ? 'Sem próxima vez: o horário único já passou.'
            : 'Pausado.'}
      </p>
      <LastResult schedule={schedule} />
      <div className="flex flex-wrap items-center gap-3">
        <Switch
          checked={schedule.enabled}
          disabled={update.isPending}
          onChange={(enabled) =>
            update.mutate(
              { scheduleId: schedule.id, patch: { enabled } },
              {
                onSuccess: () => notify(enabled ? 'Agendamento retomado.' : 'Agendamento pausado.'),
              },
            )
          }
          label={`Ativo: ${schedule.title}`}
        >
          Ativo
        </Switch>
        <Button
          disabled={run.isPending}
          onClick={() =>
            run.mutate(schedule.id, {
              onSuccess: (result) =>
                notify(
                  result.lastOutcome === 'created'
                    ? 'Tarefa criada.'
                    : result.lastOutcome === 'skipped'
                      ? 'A tarefa anterior ainda está aberta: nenhuma nova foi criada.'
                      : 'Não foi possível criar a tarefa: a área está sem fluxo.',
                  result.lastOutcome === 'created' ? 'ok' : 'fail',
                ),
            })
          }
        >
          Criar agora
        </Button>
      </div>
      {error && <FormError>{errorMessage(error)}</FormError>}
      {editing && (
        <ScheduleDialog schedule={schedule} areas={areas} onClose={() => setEditing(false)} />
      )}
      {removing && (
        <ConfirmDialog
          title={`Excluir o agendamento ${schedule.title}?`}
          confirmLabel="Excluir"
          busy={remove.isPending}
          onCancel={() => setRemoving(false)}
          onConfirm={() =>
            remove.mutate(schedule.id, {
              onSuccess: () => {
                setRemoving(false);
                notify('Agendamento excluído.');
              },
            })
          }
        >
          Nenhuma tarefa nova será criada por ele. As tarefas que ele já criou continuam no quadro.
        </ConfirmDialog>
      )}
    </li>
  );
}

export function SchedulesPage() {
  const schedules = useSchedules();
  const projects = useProjects();
  // "Agendar tarefa" in the office's quick actions opens the form here (Phase 29, D6).
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('novo') === '1');
  const stopCreating = () => {
    setCreating(false);
    if (params.has('novo'))
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('novo');
          return next;
        },
        { replace: true },
      );
  };
  const areas = projects.data ?? [];
  const error = schedules.error ?? projects.error;

  return (
    <>
      <TasksTabs />
      <PageHeader
        title="Agendamentos"
        description="Tarefas criadas sozinhas no quadro de uma área, uma vez ou em horários que se repetem. Cada tarefa segue o fluxo da área, como qualquer outra."
        actions={
          <Button onClick={() => setCreating(true)} disabled={areas.length === 0}>
            <Plus className="size-4.5" aria-hidden />
            Novo agendamento
          </Button>
        }
      />
      <Tip id="schedules-no-repeat" className="mb-4">
        Um agendamento não cria uma tarefa nova enquanto a anterior dele estiver aberta: o quadro
        não enche de repetidas.
      </Tip>
      {(schedules.isPending || projects.isPending) && (
        <LoadingState label="Carregando os agendamentos…" />
      )}
      {error && <ErrorState title="Não foi possível carregar os agendamentos." error={error} />}
      {schedules.data && projects.data && (
        <Panel title="Seus agendamentos">
          {schedules.data.length > 0 ? (
            <ul className="divide-y divide-line">
              {schedules.data.map((schedule) => (
                <ScheduleItem key={schedule.id} schedule={schedule} areas={areas} />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nenhum agendamento ainda."
              action={
                areas.length === 0 ? (
                  <Link to="/tarefas" className={buttonClass('primary')}>
                    Criar uma área
                  </Link>
                ) : (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    Criar o primeiro agendamento
                  </Button>
                )
              }
            >
              {areas.length === 0
                ? 'Crie uma área antes: uma tarefa agendada entra no quadro de uma área.'
                : 'Use “Novo agendamento” para criar uma tarefa toda semana, todo mês ou numa data.'}
            </EmptyState>
          )}
        </Panel>
      )}
      {/* The form picks the first area when it opens: it waits for the areas. */}
      {creating && areas.length > 0 && (
        <ScheduleDialog schedule={null} areas={areas} onClose={stopCreating} />
      )}
    </>
  );
}
