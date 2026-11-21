import {
  ACCESSORIES,
  type AgentState,
  APPEARANCE_LABELS,
  type Appearance,
  FACIAL_HAIR,
  HAIR_STYLES,
  OUTFITS,
  PATTERNS,
  SKIN_TONES,
} from '@ea/shared';
import {
  Bot,
  CalendarPlus,
  ListPlus,
  ListTodo,
  Palette,
  Pencil,
  TriangleAlert,
  UserPlus,
} from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { ActivityFeed, type Activity } from '../../components/ActivityFeed';
import { AgentCard, AgentCardSkeleton } from '../../components/AgentCard';
import { Avatar } from '../../components/Avatar';
import {
  CHARACTER_HEIGHT,
  CHARACTER_WIDTH,
  PixelStill,
} from '../../components/pixel-art/character';
import type { Direction } from '../../components/pixel-art/figure';
import { Button, IconButton } from '../../components/Button';
import { Switch } from '../../components/Form';
import { IndicatorCard } from '../../components/IndicatorCard';
import { FormError, Notice, ToneText } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { QuickAction } from '../../components/QuickAction';
import { RunStatusPill } from '../../components/RunStatusPill';
import { SectionTabs } from '../../components/SectionTabs';
import { StatusPill } from '../../components/StatusPill';
import { TextLink } from '../../components/TextLink';
import { AGENT_STATE_ORDER } from '../../lib/agent-state';
import { type Tone, TONES } from '../../lib/tone';

/*
 * Reference of the visual system (Phase 20). This page exists only in
 * development and in the build of the end-to-end tests (router.tsx): every
 * value here is an example, which the product itself never shows (rule 5).
 * The E2E compares each section with a stored screenshot.
 */

const ANA: Appearance = {
  kind: 'person',
  skin: 'tan',
  hair: 'curly',
  hairColor: 'black',
  outfit: 'hoodie',
  outfitColor: 'violet',
  pants: 'denim',
  accessory: 'headset',
  eyes: 'brown',
  facialHair: 'none',
  shoes: 'white',
  pattern: 'plain',
};

const BRUNO: Appearance = {
  kind: 'person',
  skin: 'light',
  hair: 'short',
  hairColor: 'blonde',
  outfit: 'shirt',
  outfitColor: 'teal',
  pants: 'khaki',
  accessory: 'glasses',
  eyes: 'blue',
  facialHair: 'stubble',
  shoes: 'brown',
  pattern: 'badge',
};

// Fixed instants, so the screenshot does not change with the clock.
const ACTIVITY: Activity[] = [
  {
    id: '1',
    kind: 'task',
    text: 'Exemplo: tarefa "Revisar o contrato" concluída',
    at: '2026-11-16T14:32:00',
    to: '/referencia',
  },
  {
    id: '2',
    kind: 'approval',
    text: 'Exemplo: escrever arquivo espera sua aprovação',
    at: '2026-11-16T14:20:00',
  },
  {
    id: '3',
    kind: 'schedule',
    text: 'Exemplo: agendamento criou "Fechamento"',
    at: '2026-11-16T09:00:00',
  },
  {
    id: '4',
    kind: 'delivery',
    text: 'Exemplo: Marketing entregou o pedido',
    at: '2026-11-16T08:47:00',
  },
  {
    id: '5',
    kind: 'failure',
    text: 'Exemplo: execução parou por limite de passos',
    at: '2026-11-16T08:15:00',
  },
];

const COLOURS = [
  ['ink', 'bg-ink', 'Fundo da página'],
  ['sheet', 'bg-sheet', 'Painel'],
  ['sheet-raised', 'bg-sheet-raised', 'Elevado'],
  ['accent', 'bg-accent', 'Ação principal'],
  ['glow', 'bg-glow', 'Borda acesa e foco'],
  ['line-strong', 'bg-line-strong', 'Borda de campo'],
] as const;

const TONE_NAMES: Record<Tone, string> = {
  ok: 'Concluído',
  wait: 'Aguardando você',
  fail: 'Com falha',
  info: 'Informação',
  idle: 'Ocioso',
  glow: 'Agendado',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StateLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-xs text-dim">{children}</p>;
}

const DIRECTIONS: readonly Direction[] = ['sw', 'se', 'nw', 'ne'];

/** One still frame, drawn three times its pixels so the shading shows. */
function Still(props: Parameters<typeof PixelStill>[0] & { label: string }) {
  const { label, ...still } = props;
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg
        viewBox={`0 0 ${CHARACTER_WIDTH} ${CHARACTER_HEIGHT}`}
        width={CHARACTER_WIDTH * 3}
        height={CHARACTER_HEIGHT * 3}
        aria-hidden
        className="rounded-lg bg-sheet-raised"
      >
        <PixelStill {...still} />
      </svg>
      <figcaption className="text-xs text-dim">{label}</figcaption>
    </figure>
  );
}

const DIRECTION_NAMES: Record<Direction, string> = {
  sw: 'Frente, esquerda',
  se: 'Frente, direita',
  nw: 'Costas, esquerda',
  ne: 'Costas, direita',
};

function Characters() {
  const rows: { title: string; id: string; look: Appearance | null }[] = [
    { title: 'Pessoa', id: 'ref-ana', look: ANA },
    { title: 'Robô', id: 'ref-robo', look: null },
  ];
  return (
    <div className="space-y-6">
      {rows.map((row) => (
        <div key={row.title} className="space-y-3">
          <h3 className="font-semibold">{row.title}</h3>
          <div className="flex flex-wrap gap-3">
            {DIRECTIONS.map((facing) => (
              <Still
                key={facing}
                agentId={row.id}
                appearance={row.look}
                facing={facing}
                label={DIRECTION_NAMES[facing]}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {[0, 1, 2, 3].map((frame) => (
              <Still
                key={frame}
                agentId={row.id}
                appearance={row.look}
                pose="walk"
                frame={frame}
                label={`Andando, quadro ${frame + 1}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Still
              agentId={row.id}
              appearance={row.look}
              pose="sit"
              activity="typing"
              label="Sentado digitando"
            />
            <Still
              agentId={row.id}
              appearance={row.look}
              pose="sit"
              raisedHand
              label="Esperando você"
            />
            <Still
              agentId={row.id}
              appearance={row.look}
              facing="se"
              pose="sit"
              raisedHand
              label="Esperando, à direita"
            />
            <Still agentId={row.id} appearance={row.look} holding="cup" label="Com café" />
            <Still
              agentId={row.id}
              appearance={row.look}
              facing="se"
              holding="paper"
              label="Com o resultado"
            />
            <Still agentId={row.id} appearance={row.look} activity="talking" label="Conversando" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Every option of a look, one at a time over Ana's look, front and back. */
function Options() {
  const variants: { label: string; look: Appearance }[] = [
    ...HAIR_STYLES.map((hair) => ({
      label: APPEARANCE_LABELS.hair[hair],
      look: { ...ANA, hair, accessory: 'none' as const },
    })),
    ...OUTFITS.map((outfit) => ({
      label: APPEARANCE_LABELS.outfit[outfit],
      look: { ...ANA, outfit },
    })),
    ...ACCESSORIES.map((accessory) => ({
      label: APPEARANCE_LABELS.accessory[accessory],
      look: { ...BRUNO, accessory },
    })),
    ...FACIAL_HAIR.map((facialHair) => ({
      label: APPEARANCE_LABELS.facialHair[facialHair],
      look: { ...BRUNO, accessory: 'none' as const, facialHair },
    })),
    ...PATTERNS.map((pattern) => ({
      label: APPEARANCE_LABELS.pattern[pattern],
      look: { ...BRUNO, pattern },
    })),
    ...SKIN_TONES.map((skin) => ({ label: APPEARANCE_LABELS.skin[skin], look: { ...ANA, skin } })),
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {variants.map((variant, index) => (
        <div key={index} className="flex gap-1">
          <Still agentId="ref-ana" appearance={variant.look} label={variant.label} />
          <Still agentId="ref-ana" appearance={variant.look} facing="nw" label="Costas" />
        </div>
      ))}
      {['ref-robo-1', 'ref-robo-2', 'ref-robo-3', 'ref-robo-4'].map((id) => (
        <Still key={id} agentId={id} appearance={null} label="Robô" />
      ))}
    </div>
  );
}

export function ReferencePage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Sistema visual"
        description="Referência das peças da interface e de seus estados. Só existe no desenvolvimento: todos os valores são exemplos e não vêm dos seus dados."
      />

      <Section title="Cores">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {COLOURS.map(([name, swatch, use]) => (
            <li key={name} className="rounded-xl border border-line bg-sheet p-2">
              <span className={`block h-10 rounded-lg border border-line ${swatch}`} />
              <p className="mt-1.5 text-sm font-semibold">{name}</p>
              <p className="text-xs text-dim">{use}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tipo">
        <div className="space-y-1 rounded-2xl border border-line bg-sheet p-4">
          <p className="text-3xl font-bold tracking-tight">Título de página, 30 px</p>
          <p className="text-xl font-semibold">Título de seção, 20 px</p>
          <p className="text-base">Texto corrido, 16 px</p>
          <p className="text-sm text-dim">Texto de apoio, 14 px</p>
          <p className="text-xs text-dim">Menor tamanho permitido, 13 px</p>
        </div>
      </Section>

      <Section title="Superfícies">
        <div className="office-stage grid gap-3 rounded-2xl p-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-sheet p-4">Painel</div>
          <div className="rounded-2xl border border-line bg-sheet-raised p-4">Elevado</div>
          <div className="surface-glass rounded-2xl p-4">Vidro, sobre a cena</div>
        </div>
      </Section>

      <Section title="Pílulas de estado">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TONES) as Tone[]).map((tone) => (
            <StatusPill key={tone} tone={tone} live={tone === 'ok'}>
              {TONE_NAMES[tone]}
            </StatusPill>
          ))}
        </div>
      </Section>

      <Section title="Avisos e links">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3">
            <Notice tone="wait" icon={<TriangleAlert className="size-4.5" aria-hidden />}>
              Exemplo de aviso: o que acontece antes de uma ação.
            </Notice>
            <Notice tone="fail">Exemplo de problema a corrigir antes de salvar.</Notice>
            <Notice tone="info">Exemplo de informação que ajuda a decidir.</Notice>
          </div>
          <div className="space-y-3 text-sm">
            <FormError>Exemplo de erro da ação que acabou de ser tentada.</FormError>
            <p>
              Um <TextLink to="/referencia">link no meio do texto</TextLink> leva a outra tela.
            </p>
            <p className="flex flex-wrap gap-2">
              {(['running', 'completed', 'waiting_approval', 'failed', 'cancelled'] as const).map(
                (status) => (
                  <RunStatusPill key={status} status={status} />
                ),
              )}
            </p>
            <p className="text-dim">
              <ToneText tone="fail">Texto no tom</ToneText>, para uma linha que não é pílula.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Indicadores">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <StateLabel>Com dados</StateLabel>
            <IndicatorCard
              label="Concluídas hoje"
              explain="Exemplo: tarefas que chegaram à etapa final hoje, contra as de ontem até a mesma hora."
              status={{
                kind: 'ready',
                value: '12',
                delta: { text: '+3 contra ontem', tone: 'ok' },
                series: [4, 6, 5, 8, 7, 9, 12],
                seriesLabel: 'Exemplo, últimos 7 dias: 4, 6, 5, 8, 7, 9 e 12',
              }}
            />
          </div>
          <div>
            <StateLabel>Sem dados</StateLabel>
            <IndicatorCard
              label="Tempo médio"
              explain="Exemplo: média, nos últimos 7 dias, entre criar e concluir uma tarefa."
              status={{ kind: 'empty', message: 'Ainda não há tarefas concluídas.' }}
            />
          </div>
          <div>
            <StateLabel>Carregando</StateLabel>
            <IndicatorCard label="Sem falha" explain="Exemplo." status={{ kind: 'loading' }} />
          </div>
          <div>
            <StateLabel>Erro</StateLabel>
            <IndicatorCard
              label="Na semana"
              explain="Exemplo."
              status={{ kind: 'error', message: 'Não foi possível calcular.', onRetry: () => {} }}
            />
          </div>
        </div>
      </Section>

      <Section title="Cartões de agente">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AgentCard
            agentId="ref-ana"
            name="Exemplo Ana"
            role="Atendimento"
            appearance={ANA}
            state="working"
            activity="Respondendo o pedido de reembolso"
            meta="3 passos · 2 min"
            to="/referencia"
          />
          <AgentCard
            agentId="ref-bruno"
            name="Exemplo Bruno"
            role="Financeiro"
            appearance={BRUNO}
            state="waiting"
            activity="Quer sua aprovação para escrever um arquivo"
            to="/referencia"
            selected
          />
          <AgentCard
            agentId="ref-robo"
            name="Exemplo Robô"
            role="Dados"
            appearance={null}
            state="idle"
            activity={null}
            to="/referencia"
          />
          <AgentCard
            agentId="ref-falha"
            name="Exemplo Caio"
            role="Conteúdo"
            appearance={null}
            state="failed"
            activity="Parou: o provedor não respondeu"
            to="/referencia"
          />
          <AgentCard
            agentId="ref-dora"
            name="Exemplo Dora"
            role="Pesquisa · Modelo de exemplo"
            appearance={null}
            state="inactive"
            meta="Com ações no pé, como na tela de Agentes."
            to="/referencia"
            dimmed
            actions={
              <>
                <Switch checked={false} onChange={() => {}} label="Exemplo Dora ativo">
                  <span className="text-dim">Desligado</span>
                </Switch>
                <span className="ml-auto">
                  <IconButton label="Editar Exemplo Dora">
                    <Pencil className="size-4.5" aria-hidden />
                  </IconButton>
                </span>
              </>
            }
          />
          <AgentCardSkeleton />
        </div>
      </Section>

      <Section title="Atividade">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-line bg-sheet p-2">
            <StateLabel>Com itens</StateLabel>
            <ActivityFeed
              label="Atividade recente"
              status={{ kind: 'ready', items: ACTIVITY }}
              emptyText=""
            />
          </div>
          <div className="rounded-2xl border border-line bg-sheet p-2">
            <StateLabel>Vazia</StateLabel>
            <ActivityFeed
              label="Atividade vazia"
              status={{ kind: 'ready', items: [] }}
              emptyText="Tarefas, entregas, agendamentos e aprovações aparecem aqui."
            />
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-line bg-sheet p-2">
              <StateLabel>Carregando</StateLabel>
              <ActivityFeed label="Atividade" status={{ kind: 'loading' }} emptyText="" />
            </div>
            <div className="rounded-2xl border border-line bg-sheet p-2">
              <StateLabel>Erro</StateLabel>
              <ActivityFeed
                label="Atividade"
                status={{ kind: 'error', error: new Error('Exemplo de falha.'), onRetry: () => {} }}
                emptyText=""
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Ações rápidas">
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickAction
            icon={ListPlus}
            label="Criar tarefa"
            description="Exemplo: no quadro de uma área"
            to="/referencia"
          />
          <QuickAction
            icon={UserPlus}
            label="Novo agente"
            description="Exemplo: com papel e aparência"
            to="/referencia"
          />
          <QuickAction
            icon={CalendarPlus}
            label="Agendar tarefa"
            description="Exemplo"
            to="/referencia"
            disabledReason="Exemplo: crie uma área antes de agendar."
          />
        </div>
      </Section>

      <Section title="Avatares">
        <div className="flex flex-wrap items-end gap-4">
          <Avatar agentId="ref-ana" appearance={ANA} size="lg" state="working" />
          <Avatar agentId="ref-bruno" appearance={BRUNO} size="md" state="waiting" />
          {AGENT_STATE_ORDER.map((state: AgentState) => (
            <Avatar
              key={state}
              agentId={`ref-${state}`}
              appearance={null}
              size="sm"
              state={state}
            />
          ))}
        </div>
      </Section>

      <Section title="Personagens">
        <Characters />
      </Section>

      <Section title="Opções de aparência">
        <Options />
      </Section>

      <Section title="Botões">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">Principal</Button>
          <Button>Secundário</Button>
          <Button variant="ghost">Discreto</Button>
          <Button variant="danger">Excluir</Button>
          <Button variant="primary" disabled>
            Desligado
          </Button>
        </div>
      </Section>

      {/* The current tab is this page; the others lead to real screens. */}
      <Section title="Abas de seção">
        <SectionTabs
          label="Exemplo de abas"
          tabs={[
            { to: '/referencia', label: 'Sistema visual', icon: Palette },
            { to: '/tarefas', label: 'Tarefas', icon: ListTodo },
            { to: '/agentes', label: 'Agentes', icon: Bot },
          ]}
        />
      </Section>
    </div>
  );
}
