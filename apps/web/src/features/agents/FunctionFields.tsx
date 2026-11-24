import { PROJECT_LIMITS, type Team, type WorkflowTemplateSummary } from '@ea/shared';
import { Info, Plus, Users } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { TextField } from '../../components/Form';
import { Notice } from '../../components/Notice';
import {
  chooseTeam,
  chooseTemplate,
  describeFunction,
  freeTeamName,
  type FunctionValues,
  rolesFor,
  teamsFor,
} from './team-role';

// "Função na empresa" (Phase 39, D2): template → team → role, each a row of
// cards the user picks with a click or the arrow keys, and a sentence below
// that says where the agent goes in.

const CARD =
  'relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-sheet px-3 py-2 text-sm transition-colors hover:border-line-strong has-[:checked]:border-glow has-[:checked]:bg-sheet-raised has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-glow';
const RADIO = 'absolute inset-0 size-full cursor-pointer opacity-0';

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden="true"
          className="grid size-5 place-items-center rounded-full bg-sheet-raised text-xs text-dim"
        >
          {number}
        </span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

export function FunctionFields({
  values,
  onChange,
  teams,
  templates,
  agentId,
  newTeamError,
}: {
  values: FunctionValues;
  onChange: (values: FunctionValues) => void;
  teams: readonly Team[];
  templates: readonly WorkflowTemplateSummary[];
  agentId: string | null;
  newTeamError?: string | undefined;
}) {
  const name = useId();
  const offered = teamsFor(values.templateId, teams);
  const roles = rolesFor(values, teams, templates, agentId);
  const template = templates.find((entry) => entry.id === values.templateId);

  return (
    <div className="space-y-5">
      <Step number={1} title="Modelo de fluxo">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
          {templates.map((entry) => (
            <label key={entry.id} className={CARD}>
              <input
                type="radio"
                name={`${name}-template`}
                className={RADIO}
                checked={values.templateId === entry.id}
                onChange={() => onChange(chooseTemplate(entry.id, teams, templates))}
              />
              <span className="min-w-0 leading-tight font-semibold">{entry.name}</span>
            </label>
          ))}
          <label className={CARD}>
            <input
              type="radio"
              name={`${name}-template`}
              className={RADIO}
              checked={values.templateId === null}
              onChange={() =>
                onChange({
                  ...chooseTemplate(null, teams, templates),
                  // Without a template, the team chosen stays if there was one.
                  ...(values.team.kind === 'existing'
                    ? { team: values.team, roleKey: values.roleKey }
                    : {}),
                })
              }
            />
            <span className="min-w-0 leading-tight text-dim">Qualquer equipe</span>
          </label>
        </div>
        {template && <p className="text-sm text-dim">{template.description}</p>}
      </Step>

      <Step number={2} title="Equipe">
        <div className="grid gap-2 sm:grid-cols-2">
          {values.templateId === null && (
            <label className={CARD}>
              <input
                type="radio"
                name={`${name}-team`}
                className={RADIO}
                checked={values.team.kind === 'none'}
                onChange={() => onChange({ ...values, team: { kind: 'none' }, roleKey: null })}
              />
              <span className="text-dim">Sem equipe</span>
            </label>
          )}
          {offered.map((team) => (
            <label key={team.areaId} className={CARD}>
              <input
                type="radio"
                name={`${name}-team`}
                className={RADIO}
                checked={values.team.kind === 'existing' && values.team.areaId === team.areaId}
                onChange={() =>
                  onChange(
                    chooseTeam(values, { kind: 'existing', areaId: team.areaId }, teams, templates),
                  )
                }
              />
              <Users aria-hidden="true" className="size-4 shrink-0 text-dim" />
              <span className="min-w-0 leading-tight">
                <span className="block font-semibold">{team.areaName}</span>
                <span className="block text-xs text-dim">
                  {team.roles.reduce((total, role) => total + role.agents.length, 0)} agente(s) em{' '}
                  {team.roles.length} papel(éis)
                </span>
              </span>
            </label>
          ))}
          {template && (
            <label className={CARD}>
              <input
                type="radio"
                name={`${name}-team`}
                className={RADIO}
                checked={values.team.kind === 'new'}
                onChange={() =>
                  onChange(
                    chooseTeam(
                      values,
                      {
                        kind: 'new',
                        name: freeTeamName(
                          template.name,
                          teams.map((team) => team.areaName),
                        ),
                      },
                      teams,
                      templates,
                    ),
                  )
                }
              />
              <Plus aria-hidden="true" className="size-4 shrink-0 text-dim" />
              <span className="font-semibold">Nova equipe de {template.name}</span>
            </label>
          )}
        </div>
        {values.team.kind === 'new' && (
          <TextField
            label="Nome da nova equipe"
            maxLength={PROJECT_LIMITS.name}
            value={values.team.name}
            error={newTeamError}
            hint="A equipe nasce com as etapas e os papéis do modelo, sem outros agentes. Ganha uma sala no Escritório."
            onChange={(event) =>
              onChange({ ...values, team: { kind: 'new', name: event.target.value } })
            }
          />
        )}
      </Step>

      {values.team.kind !== 'none' && (
        <Step number={3} title="Papel no fluxo">
          {roles.length === 0 ? (
            <p className="text-sm text-dim">
              Esta equipe ainda não tem papéis. Crie os papéis no fluxo da equipe (Tarefas → Fluxo).
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <label key={role.key} className={CARD}>
                  <input
                    type="radio"
                    name={`${name}-role`}
                    className={RADIO}
                    checked={values.roleKey === role.key}
                    onChange={() => onChange({ ...values, roleKey: role.key })}
                  />
                  <span className="leading-tight">
                    <span className="block font-semibold">{role.name}</span>
                    <span className="block text-xs text-dim">
                      {role.others.length === 0
                        ? 'ninguém ainda'
                        : `${role.others.length} agente(s)`}
                    </span>
                  </span>
                </label>
              ))}
              <label className={CARD}>
                <input
                  type="radio"
                  name={`${name}-role`}
                  className={RADIO}
                  checked={values.roleKey === null}
                  onChange={() => onChange({ ...values, roleKey: null })}
                />
                <span className="text-dim">Sem papel</span>
              </label>
            </div>
          )}
        </Step>
      )}

      <Notice tone="info" icon={<Info className="size-4" aria-hidden="true" />}>
        <span aria-live="polite">{describeFunction(values, teams, templates, agentId)}</span>
      </Notice>
    </div>
  );
}
