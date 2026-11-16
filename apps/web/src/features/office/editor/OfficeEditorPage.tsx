import {
  AREA_KIND_INFO,
  AREA_KINDS,
  type AreaKind,
  buildPresetLayout,
  chairOf,
  FLOOR_LABELS,
  FLOORS,
  footprint,
  ITEM_KIND_INFO,
  ITEM_KINDS,
  type ItemKind,
  OFFICE_LIMITS,
  OFFICE_PRESET_INFO,
  OFFICE_PRESETS,
  type Office,
  type OfficeArea,
  type OfficeItem,
  type OfficeLayout,
  type OfficePreset,
  type PresetRoom,
  type Side,
  SIDES,
  type Tile,
  validateLayout,
} from '@ea/shared';
import {
  DoorOpen,
  Eraser,
  LocateFixed,
  MousePointer2,
  Redo2,
  RotateCw,
  Save,
  Sofa,
  SquareDashed,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router';
import { Button, buttonClass } from '../../../components/Button';
import { SelectField, TextField } from '../../../components/Form';
import { ConfirmDialog } from '../../../components/Modal';
import { PageHeader } from '../../../components/PageHeader';
import { ErrorState, LoadingState } from '../../../components/States';
import { useToast } from '../../../components/Toast';
import { ApiRequestError } from '../../../lib/api';
import { errorMessage } from '../../../lib/errors';
import { useOffice, useResetLayout, useSaveLayout } from '../../../lib/queries';
import { areaName, sceneBounds, wallsByBand } from '../art/architecture';
import { Chair, Furniture, isFlat } from '../art/furniture';
import { floorPoints, unproject } from '../art/iso';
import { Floor, Signs } from '../OfficeScene';
import { useViewport } from '../viewport';
import {
  areaAt,
  editorReducer,
  initialEditor,
  itemAt,
  type Selection,
  toInput,
  wallAt,
} from './editor-state';

// The office editor (Phase 14): rooms drawn on the grid, doors, furniture
// from the catalog, all saved at once. Everything the pointer does here can
// also be done with the keyboard and the forms of the side panel.

type Tool =
  | { readonly kind: 'select' }
  | { readonly kind: 'area'; readonly area: AreaKind }
  | { readonly kind: 'item'; readonly item: ItemKind }
  | { readonly kind: 'door' }
  | { readonly kind: 'erase' };

/** Which way each side points on the isometric picture. */
const SIDE_LABEL: Record<Side, string> = {
  s: 'Para baixo, à esquerda',
  e: 'Para baixo, à direita',
  n: 'Para cima, à direita',
  w: 'Para cima, à esquerda',
};
const WALL_LABEL: Record<Side, string> = {
  n: 'Parede de cima, à direita',
  w: 'Parede de cima, à esquerda',
  s: 'Parede de baixo, à esquerda',
  e: 'Parede de baixo, à direita',
};

const ARROWS: Record<string, { dx: number; dy: number }> = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
};

const sameTile = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;

const itemLabel = (item: OfficeItem) =>
  `${ITEM_KIND_INFO[item.kind].label} (${item.x + 1}, ${item.y + 1})`;

export function OfficeEditorPage() {
  const { data, error, isPending, refetch } = useOffice();
  return (
    <>
      <PageHeader
        title="Editar escritório"
        description="Desenhe as salas na grade, abra portas, arrume os móveis e salve. Agentes sem mesa marcada sentam na primeira mesa livre da sala do seu projeto."
        actions={
          <Link to="/escritorio" className={buttonClass('secondary')}>
            Voltar ao escritório
          </Link>
        }
      />
      {isPending && <LoadingState label="Carregando o escritório…" />}
      {error && !data && (
        <ErrorState
          title="Não foi possível carregar o escritório."
          error={error}
          onRetry={() => void refetch()}
        />
      )}
      {data && <Editor office={data} />}
    </>
  );
}

function Editor({ office }: { office: Office }) {
  const [state, dispatch] = useReducer(editorReducer, office.layout, initialEditor);
  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  const [hover, setHover] = useState<Tile | null>(null);
  const [drag, setDrag] = useState<{
    selection: NonNullable<Selection>;
    from: Tile;
    to: Tile;
  } | null>(null);
  const [rect, setRect] = useState<{ from: Tile; to: Tile } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [serverIssues, setServerIssues] = useState<string[]>([]);
  const save = useSaveLayout();
  const reset = useResetLayout();
  const notify = useToast();

  const layout = state.present;
  // While dragging, the picture shows the move before it is made.
  const shown = drag
    ? editorReducer(state, {
        type: 'move',
        selection: drag.selection,
        dx: drag.to.x - drag.from.x,
        dy: drag.to.y - drag.from.y,
      }).present
    : layout;
  const issues = useMemo(() => validateLayout(layout), [layout]);

  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const bounds = useMemo(
    () => sceneBounds({ width: layout.width, height: layout.height }),
    [layout.width, layout.height],
  );

  const pointOf = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const element = svg.current;
    const matrix = element?.getScreenCTM?.();
    if (!element || !matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return unproject({ x: point.x, y: point.y });
  };
  const tileOf = (point: { x: number; y: number }): Tile | null => {
    const tile = { x: Math.floor(point.x), y: Math.floor(point.y) };
    return tile.x >= 0 && tile.y >= 0 && tile.x < layout.width && tile.y < layout.height
      ? tile
      : null;
  };

  const viewport = useViewport(stage, svg, bounds, (event) => {
    if (tool.kind !== 'select') return false;
    const point = pointOf(event.clientX, event.clientY);
    const tile = point && tileOf(point);
    return !tile || (!itemAt(layout, tile) && !areaAt(layout, tile));
  });

  const selectedArea =
    state.selection?.kind === 'area'
      ? layout.areas.find((area) => area.id === state.selection?.id)
      : undefined;
  const selectedItem =
    state.selection?.kind === 'item'
      ? layout.items.find((item) => item.id === state.selection?.id)
      : undefined;

  const down = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const point = pointOf(event.clientX, event.clientY);
    const tile = point && tileOf(point);
    if (!point || !tile) return;
    switch (tool.kind) {
      case 'select': {
        const item = itemAt(layout, tile);
        const area = item ? null : areaAt(layout, tile);
        const selection: Selection = item
          ? { kind: 'item', id: item.id }
          : area
            ? { kind: 'area', id: area.id }
            : null;
        dispatch({ type: 'select', selection });
        if (selection) {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setDrag({ selection, from: tile, to: tile });
        }
        return;
      }
      case 'area':
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setRect({ from: tile, to: tile });
        return;
      case 'item':
        dispatch({ type: 'add-item', kind: tool.item, x: tile.x, y: tile.y });
        return;
      case 'door': {
        const area = areaAt(layout, tile);
        const wall = area && wallAt(area, point);
        if (area && wall) dispatch({ type: 'toggle-door', id: area.id, ...wall });
        return;
      }
      case 'erase': {
        const item = itemAt(layout, tile);
        const area = item ? null : areaAt(layout, tile);
        if (item) dispatch({ type: 'remove', selection: { kind: 'item', id: item.id } });
        else if (area) dispatch({ type: 'remove', selection: { kind: 'area', id: area.id } });
        return;
      }
    }
  };

  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = pointOf(event.clientX, event.clientY);
    const tile = point && tileOf(point);
    setHover(tile);
    if (!tile) return;
    if (drag && !sameTile(drag.to, tile)) setDrag({ ...drag, to: tile });
    if (rect && !sameTile(rect.to, tile)) setRect({ ...rect, to: tile });
  };

  const up = () => {
    if (drag) {
      dispatch({
        type: 'move',
        selection: drag.selection,
        dx: drag.to.x - drag.from.x,
        dy: drag.to.y - drag.from.y,
      });
      setDrag(null);
    }
    if (rect && tool.kind === 'area') {
      dispatch({
        type: 'add-area',
        kind: tool.area,
        x: Math.min(rect.from.x, rect.to.x),
        y: Math.min(rect.from.y, rect.to.y),
        width: Math.abs(rect.to.x - rect.from.x) + 1,
        height: Math.abs(rect.to.y - rect.from.y) + 1,
      });
      setRect(null);
      setTool({ kind: 'select' });
    }
  };

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const control = event.ctrlKey || event.metaKey;
    if (control && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      return;
    }
    if (control && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      dispatch({ type: 'redo' });
      return;
    }
    const selection = state.selection;
    if (!selection) return;
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      dispatch({ type: 'move', selection, ...arrow });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      dispatch({ type: 'remove', selection });
    } else if (event.key.toLowerCase() === 'r' && selection.kind === 'item') {
      dispatch({ type: 'rotate', id: selection.id });
    } else if (event.key === 'Escape') {
      dispatch({ type: 'select', selection: null });
    }
  };

  const doSave = () => {
    setServerIssues([]);
    save.mutate(toInput(layout), {
      onSuccess: (saved) => {
        dispatch({ type: 'load', layout: saved });
        notify('Escritório salvo.');
      },
      onError: (failure) => {
        const details =
          failure instanceof ApiRequestError
            ? failure.fieldIssues.map((issue) => issue.message)
            : [];
        setServerIssues(details.length > 0 ? details : [errorMessage(failure)]);
      },
    });
  };

  const applyPreset = (preset: OfficePreset) => {
    const counts = new Map<string | null, number>();
    for (const agent of office.agents)
      counts.set(agent.projectId, (counts.get(agent.projectId) ?? 0) + 1);
    const rooms: PresetRoom[] = office.projects.map((project) => ({
      projectId: project.id,
      agents: counts.get(project.id) ?? 0,
    }));
    const homeless = counts.get(null) ?? 0;
    if (homeless > 0) rooms.push({ projectId: null, agents: homeless });
    dispatch({ type: 'replace', layout: buildPresetLayout(preset, rooms) });
  };

  const issueAreas = new Set(
    issues.flatMap((issue) => (issue.area === undefined ? [] : [issue.area])),
  );
  const issueItems = new Set(
    issues.flatMap((issue) => (issue.item === undefined ? [] : [issue.item])),
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-3">
        <div role="toolbar" aria-label="Ferramentas" className="flex flex-wrap items-center gap-2">
          <ToolButton
            active={tool.kind === 'select'}
            onClick={() => setTool({ kind: 'select' })}
            icon={<MousePointer2 className="size-4" aria-hidden />}
          >
            Selecionar
          </ToolButton>
          <ToolButton
            active={tool.kind === 'area'}
            onClick={() => setTool({ kind: 'area', area: 'project' })}
            icon={<SquareDashed className="size-4" aria-hidden />}
          >
            Nova área
          </ToolButton>
          <ToolButton
            active={tool.kind === 'item'}
            onClick={() => setTool({ kind: 'item', item: 'desk' })}
            icon={<Sofa className="size-4" aria-hidden />}
          >
            Móvel
          </ToolButton>
          <ToolButton
            active={tool.kind === 'door'}
            onClick={() => setTool({ kind: 'door' })}
            icon={<DoorOpen className="size-4" aria-hidden />}
          >
            Porta
          </ToolButton>
          <ToolButton
            active={tool.kind === 'erase'}
            onClick={() => setTool({ kind: 'erase' })}
            icon={<Eraser className="size-4" aria-hidden />}
          >
            Apagar
          </ToolButton>
          {tool.kind === 'area' && (
            <label className="flex items-center gap-2 text-sm">
              Tipo
              <select
                className="rounded-md border border-line-strong bg-ink px-2 py-1.5"
                value={tool.area}
                onChange={(event) =>
                  setTool({ kind: 'area', area: event.target.value as AreaKind })
                }
              >
                {AREA_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {AREA_KIND_INFO[kind].label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tool.kind === 'item' && (
            <label className="flex items-center gap-2 text-sm">
              Qual
              <select
                className="rounded-md border border-line-strong bg-ink px-2 py-1.5"
                value={tool.item}
                onChange={(event) =>
                  setTool({ kind: 'item', item: event.target.value as ItemKind })
                }
              >
                {ITEM_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {ITEM_KIND_INFO[kind].label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="text-sm text-dim">{TOOL_HINT[tool.kind]}</p>

        <div
          ref={stage}
          tabIndex={0}
          role="application"
          aria-label="Planta do escritório. Com algo selecionado: setas movem, R gira, Delete apaga; Ctrl+Z desfaz."
          onKeyDown={keyDown}
          className="office-stage relative h-[min(70dvh,46rem)] min-h-80 overflow-hidden rounded-xl border border-line"
        >
          <svg
            ref={svg}
            className="absolute inset-0 size-full touch-none select-none"
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={() => setHover(null)}
            aria-hidden
            data-editor-canvas
          >
            <EditorPicture layout={shown} projects={office.projects} />
            <g pointerEvents="none">
              {shown.areas.map((area, index) => {
                const selected = state.selection?.kind === 'area' && state.selection.id === area.id;
                if (!selected && !issueAreas.has(index)) return null;
                return (
                  <polygon
                    key={area.id}
                    points={floorPoints(area.x, area.y, area.width, area.height, 0.5)}
                    fill={selected ? '#7c5cff' : '#ff7b72'}
                    fillOpacity="0.18"
                    stroke={selected ? '#b9a8ff' : '#ff7b72'}
                    strokeWidth="1.2"
                  />
                );
              })}
              {shown.items.map((item, index) => {
                const selected = state.selection?.kind === 'item' && state.selection.id === item.id;
                if (!selected && !issueItems.has(index)) return null;
                return (
                  <g key={item.id}>
                    {footprint(item).map((tile) => (
                      <polygon
                        key={`${tile.x},${tile.y}`}
                        points={floorPoints(tile.x, tile.y, 1, 1, 0.6)}
                        fill="none"
                        stroke={selected ? '#f4f1ff' : '#ff7b72'}
                        strokeWidth="1.2"
                      />
                    ))}
                    {item.kind === 'desk' && selected && (
                      <polygon
                        points={floorPoints(
                          chairOf(item).x + 0.2,
                          chairOf(item).y + 0.2,
                          0.6,
                          0.6,
                          0.6,
                        )}
                        fill="#7cc4ff"
                        fillOpacity="0.5"
                      />
                    )}
                  </g>
                );
              })}
              {rect && (
                <polygon
                  points={floorPoints(
                    Math.min(rect.from.x, rect.to.x),
                    Math.min(rect.from.y, rect.to.y),
                    Math.abs(rect.to.x - rect.from.x) + 1,
                    Math.abs(rect.to.y - rect.from.y) + 1,
                    0.6,
                  )}
                  fill="#7c5cff"
                  fillOpacity="0.3"
                  stroke="#f4f1ff"
                  strokeDasharray="3 2"
                />
              )}
              {hover && !rect && (
                <polygon
                  points={floorPoints(hover.x, hover.y, 1, 1, 0.7)}
                  fill="none"
                  stroke="#f4f1ff"
                  strokeWidth="0.8"
                  strokeOpacity="0.8"
                />
              )}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
            <div
              role="toolbar"
              aria-label="Vista"
              className="pointer-events-auto flex items-center gap-1 rounded-full border border-line-strong bg-ink/90 p-1.5 shadow-lg"
            >
              <BarButton label="Aproximar" onClick={viewport.zoomIn}>
                <ZoomIn className="size-5" aria-hidden />
              </BarButton>
              <BarButton label="Afastar" onClick={viewport.zoomOut}>
                <ZoomOut className="size-5" aria-hidden />
              </BarButton>
              <BarButton label="Mostrar o escritório inteiro" onClick={viewport.fit}>
                <LocateFixed className="size-5" aria-hidden />
              </BarButton>
              <BarButton
                label="Desfazer"
                onClick={() => dispatch({ type: 'undo' })}
                disabled={state.past.length === 0}
              >
                <Undo2 className="size-5" aria-hidden />
              </BarButton>
              <BarButton
                label="Refazer"
                onClick={() => dispatch({ type: 'redo' })}
                disabled={state.future.length === 0}
              >
                <Redo2 className="size-5" aria-hidden />
              </BarButton>
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-4" aria-label="Propriedades">
        <section
          className="rounded-xl border border-line bg-sheet p-4"
          aria-labelledby="editor-save"
        >
          <h2 id="editor-save" className="mb-2 font-bold">
            {state.dirty
              ? 'Alterações não salvas'
              : office.customized
                ? 'Layout salvo'
                : 'Layout automático'}
          </h2>
          {!office.customized && !state.dirty && (
            <p className="mb-3 text-sm text-dim">
              Enquanto você não salvar, o escritório é montado a partir dos projetos e ganha uma
              sala nova a cada projeto criado.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={doSave}
              disabled={issues.length > 0 || save.isPending || !state.dirty}
            >
              <Save className="size-4" aria-hidden />
              Salvar
            </Button>
            <Button
              onClick={() => dispatch({ type: 'load', layout: office.layout })}
              disabled={!state.dirty}
            >
              Descartar alterações
            </Button>
            {office.customized && (
              <Button variant="ghost" onClick={() => setConfirmReset(true)}>
                Voltar ao automático
              </Button>
            )}
          </div>
          {(issues.length > 0 || serverIssues.length > 0) && (
            <div className="mt-3" role="alert">
              <p className="text-sm font-semibold text-fail">
                Corrija antes de salvar ({issues.length + serverIssues.length}):
              </p>
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm">
                {issues.map((issue, index) => (
                  <li key={`${issue.message}-${index}`}>
                    <button
                      type="button"
                      className="text-left text-fail underline-offset-2 hover:underline"
                      onClick={() => {
                        const area =
                          issue.area === undefined ? undefined : layout.areas[issue.area];
                        const item =
                          issue.item === undefined ? undefined : layout.items[issue.item];
                        if (item)
                          dispatch({ type: 'select', selection: { kind: 'item', id: item.id } });
                        else if (area)
                          dispatch({ type: 'select', selection: { kind: 'area', id: area.id } });
                      }}
                    >
                      {issue.message}
                    </button>
                  </li>
                ))}
                {serverIssues.map((message) => (
                  <li key={message} className="text-fail">
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {selectedArea && (
          <AreaForm
            area={selectedArea}
            office={office}
            onChange={(patch) => dispatch({ type: 'update-area', id: selectedArea.id, patch })}
            onRemove={() =>
              dispatch({ type: 'remove', selection: { kind: 'area', id: selectedArea.id } })
            }
            onToggleDoor={(side, offset) =>
              dispatch({ type: 'toggle-door', id: selectedArea.id, side, offset })
            }
          />
        )}
        {selectedItem && (
          <ItemForm
            item={selectedItem}
            office={office}
            onChange={(patch) => dispatch({ type: 'update-item', id: selectedItem.id, patch })}
            onRotate={() => dispatch({ type: 'rotate', id: selectedItem.id })}
            onRemove={() =>
              dispatch({ type: 'remove', selection: { kind: 'item', id: selectedItem.id } })
            }
          />
        )}

        <section
          className="rounded-xl border border-line bg-sheet p-4"
          aria-labelledby="editor-office"
        >
          <h2 id="editor-office" className="mb-3 font-bold">
            Escritório
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Largura da grade"
              value={layout.width}
              min={OFFICE_LIMITS.grid.min}
              max={OFFICE_LIMITS.grid.max}
              onChange={(width) => dispatch({ type: 'grid', width, height: layout.height })}
            />
            <NumberField
              label="Profundidade da grade"
              value={layout.height}
              min={OFFICE_LIMITS.grid.min}
              max={OFFICE_LIMITS.grid.max}
              onChange={(height) => dispatch({ type: 'grid', width: layout.width, height })}
            />
          </div>
          <PresetPicker onApply={applyPreset} />
        </section>

        <section
          className="rounded-xl border border-line bg-sheet p-4"
          aria-labelledby="editor-lists"
        >
          <h2 id="editor-lists" className="mb-2 font-bold">
            Áreas e móveis
          </h2>
          <ul className="space-y-1 text-sm" aria-label="Áreas">
            {layout.areas.map((area) => (
              <li key={area.id}>
                <SelectButton
                  selected={state.selection?.id === area.id}
                  onClick={() =>
                    dispatch({ type: 'select', selection: { kind: 'area', id: area.id } })
                  }
                >
                  {areaName(area, office.projects)} · {AREA_KIND_INFO[area.kind].label}
                </SelectButton>
              </li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">
              Móveis ({layout.items.length})
            </summary>
            <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-sm" aria-label="Móveis">
              {layout.items.map((item) => (
                <li key={item.id}>
                  <SelectButton
                    selected={state.selection?.id === item.id}
                    onClick={() =>
                      dispatch({ type: 'select', selection: { kind: 'item', id: item.id } })
                    }
                  >
                    {itemLabel(item)}
                  </SelectButton>
                </li>
              ))}
            </ul>
          </details>
        </section>
      </aside>

      {confirmReset && (
        <ConfirmDialog
          title="Voltar ao layout automático?"
          confirmLabel="Voltar ao automático"
          busy={reset.isPending}
          error={reset.error ? errorMessage(reset.error) : undefined}
          onCancel={() => setConfirmReset(false)}
          onConfirm={() =>
            reset.mutate(undefined, {
              onSuccess: () => {
                setConfirmReset(false);
                notify('O escritório voltou ao layout automático.');
              },
            })
          }
        >
          O layout salvo será apagado e o escritório passa a ser montado a partir dos projetos. Isso
          não pode ser desfeito.
        </ConfirmDialog>
      )}
    </div>
  );
}

const TOOL_HINT: Record<Tool['kind'], string> = {
  select:
    'Clique numa área ou num móvel para ver e mudar as propriedades; arraste para mover. Arraste o chão vazio para andar pela planta.',
  area: 'Arraste na grade para desenhar a área. Ela nasce com uma porta na parede de baixo.',
  item: 'Clique num ladrilho para pôr o móvel. Depois, R gira e as setas movem.',
  door: 'Clique no ladrilho da borda de uma área para abrir ou fechar a porta daquela parede.',
  erase: 'Clique num móvel ou numa área para apagar. Ctrl+Z desfaz.',
};

/** The editor's picture: the same drawing as the office, without the people. */
function EditorPicture({
  layout,
  projects,
}: {
  layout: OfficeLayout;
  projects: Office['projects'];
}) {
  const { back, front } = useMemo(() => wallsByBand(layout), [layout]);
  const items = new Map<number, ReactNode[]>();
  for (const item of layout.items) {
    if (isFlat(item.kind)) continue;
    const band = Math.max(...footprint(item).map((tile) => tile.x + tile.y));
    const list = items.get(band) ?? [];
    list.push(<Furniture key={item.id} item={item} />);
    if (item.kind === 'desk') {
      const chair = chairOf(item);
      const opposite = { n: 's', s: 'n', e: 'w', w: 'e' } as const;
      const chairList = items.get(chair.x + chair.y) ?? [];
      chairList.push(
        <Chair key={`${item.id}-chair`} x={chair.x} y={chair.y} facing={opposite[item.facing]} />,
      );
      items.set(chair.x + chair.y, chairList);
    }
    items.set(band, list);
  }
  const bands: number[] = [];
  for (let band = -1; band <= layout.width + layout.height; band += 1) bands.push(band);
  return (
    <g>
      <Floor layout={layout} />
      {bands.map((band) => (
        <g key={band}>
          {back.get(band)}
          {items.get(band)}
          {front.get(band)}
        </g>
      ))}
      <Signs layout={layout} projects={projects} />
    </g>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors ${
        active
          ? 'border-accent bg-accent text-white'
          : 'border-line-strong text-chalk hover:bg-sheet-raised'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function BarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-11 place-items-center rounded-full text-chalk transition-colors hover:bg-sheet-raised disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SelectButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
      className={`w-full truncate rounded-md px-2 py-1 text-left ${
        selected ? 'bg-accent/30 font-semibold' : 'hover:bg-sheet-raised'
      }`}
    >
      {children}
    </button>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <TextField
      label={label}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (event.target.value !== '' && Number.isInteger(next) && next >= min && next <= max)
          onChange(next);
      }}
    />
  );
}

function PresetPicker({ onApply }: { onApply: (preset: OfficePreset) => void }) {
  const [preset, setPreset] = useState<OfficePreset>('complete');
  return (
    <div className="mt-4 space-y-2">
      <SelectField
        label="Modelo pronto"
        value={preset}
        hint={OFFICE_PRESET_INFO[preset].hint}
        onChange={(event) => setPreset(event.target.value as OfficePreset)}
      >
        {OFFICE_PRESETS.map((each) => (
          <option key={each} value={each}>
            {OFFICE_PRESET_INFO[each].label}
          </option>
        ))}
      </SelectField>
      <Button onClick={() => onApply(preset)}>Usar este modelo</Button>
      <p className="text-xs text-dim">Substitui o que está na planta. Dá para desfazer.</p>
    </div>
  );
}

function AreaForm({
  area,
  office,
  onChange,
  onRemove,
  onToggleDoor,
}: {
  area: OfficeArea;
  office: Office;
  onChange: (patch: Partial<Omit<OfficeArea, 'id'>>) => void;
  onRemove: () => void;
  onToggleDoor: (side: Side, offset: number) => void;
}) {
  const [doorSide, setDoorSide] = useState<Side>('s');
  const [doorOffset, setDoorOffset] = useState(1);
  const info = AREA_KIND_INFO[area.kind];
  return (
    <section
      className="space-y-3 rounded-xl border border-accent bg-sheet p-4"
      aria-labelledby="editor-area"
    >
      <h2 id="editor-area" className="font-bold">
        Área: {areaName(area, office.projects)}
      </h2>
      <SelectField
        label="Tipo"
        value={area.kind}
        hint={info.hint}
        onChange={(event) => {
          const kind = event.target.value as AreaKind;
          onChange({ kind, projectId: AREA_KIND_INFO[kind].desks ? area.projectId : null });
        }}
      >
        {AREA_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {AREA_KIND_INFO[kind].label}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Nome"
        value={area.name ?? ''}
        maxLength={OFFICE_LIMITS.areaName}
        placeholder={areaName({ ...area, name: null }, office.projects)}
        hint="Vazio usa o nome do projeto ou do tipo."
        onChange={(event) =>
          onChange({ name: event.target.value.trim() === '' ? null : event.target.value })
        }
      />
      {info.desks && (
        <SelectField
          label="Projeto"
          value={area.projectId ?? ''}
          onChange={(event) =>
            onChange({ projectId: event.target.value === '' ? null : event.target.value })
          }
        >
          <option value="">Agentes sem projeto</option>
          {office.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </SelectField>
      )}
      <SelectField
        label="Piso"
        value={area.floor}
        onChange={(event) => onChange({ floor: event.target.value as OfficeArea['floor'] })}
      >
        {FLOORS.map((floor) => (
          <option key={floor} value={floor}>
            {FLOOR_LABELS[floor]}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Coluna"
          value={area.x + 1}
          min={1}
          max={OFFICE_LIMITS.grid.max}
          onChange={(x) => onChange({ x: x - 1 })}
        />
        <NumberField
          label="Linha"
          value={area.y + 1}
          min={1}
          max={OFFICE_LIMITS.grid.max}
          onChange={(y) => onChange({ y: y - 1 })}
        />
        <NumberField
          label="Largura"
          value={area.width}
          min={OFFICE_LIMITS.areaSize.min}
          max={OFFICE_LIMITS.grid.max}
          onChange={(width) => onChange({ width })}
        />
        <NumberField
          label="Profundidade"
          value={area.height}
          min={OFFICE_LIMITS.areaSize.min}
          max={OFFICE_LIMITS.grid.max}
          onChange={(height) => onChange({ height })}
        />
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Portas</h3>
        <ul className="space-y-1 text-sm">
          {area.doors.map((door) => (
            <li
              key={`${door.side}${door.offset}`}
              className="flex items-center justify-between gap-2"
            >
              <span>
                {WALL_LABEL[door.side]}, ladrilho {door.offset + 1}
              </span>
              <Button
                variant="ghost"
                className="min-h-8 px-2"
                onClick={() => onToggleDoor(door.side, door.offset)}
                aria-label={`Fechar a porta: ${WALL_LABEL[door.side]}, ladrilho ${door.offset + 1}`}
              >
                Fechar
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid grid-cols-[1fr_5rem] items-end gap-2">
          <SelectField
            label="Parede"
            value={doorSide}
            onChange={(event) => setDoorSide(event.target.value as Side)}
          >
            {SIDES.map((side) => (
              <option key={side} value={side}>
                {WALL_LABEL[side]}
              </option>
            ))}
          </SelectField>
          <NumberField
            label="Ladrilho"
            value={doorOffset}
            min={1}
            max={OFFICE_LIMITS.grid.max}
            onChange={setDoorOffset}
          />
        </div>
        <Button
          className="mt-2"
          onClick={() => onToggleDoor(doorSide, doorOffset - 1)}
          disabled={area.doors.length >= OFFICE_LIMITS.doors}
        >
          Abrir porta
        </Button>
      </div>
      <Button variant="danger" onClick={onRemove}>
        <Trash2 className="size-4" aria-hidden />
        Apagar área
      </Button>
    </section>
  );
}

function ItemForm({
  item,
  office,
  onChange,
  onRotate,
  onRemove,
}: {
  item: OfficeItem;
  office: Office;
  onChange: (patch: Partial<Omit<OfficeItem, 'id'>>) => void;
  onRotate: () => void;
  onRemove: () => void;
}) {
  const info = ITEM_KIND_INFO[item.kind];
  return (
    <section
      className="space-y-3 rounded-xl border border-accent bg-sheet p-4"
      aria-labelledby="editor-item"
    >
      <h2 id="editor-item" className="font-bold">
        Móvel: {info.label}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Coluna"
          value={item.x + 1}
          min={1}
          max={OFFICE_LIMITS.grid.max}
          onChange={(x) => onChange({ x: x - 1 })}
        />
        <NumberField
          label="Linha"
          value={item.y + 1}
          min={1}
          max={OFFICE_LIMITS.grid.max}
          onChange={(y) => onChange({ y: y - 1 })}
        />
      </div>
      <SelectField
        label={item.kind === 'desk' ? 'Lado da cadeira' : 'Virado para'}
        value={item.facing}
        onChange={(event) => onChange({ facing: event.target.value as Side })}
      >
        {SIDES.map((side) => (
          <option key={side} value={side}>
            {SIDE_LABEL[side]}
          </option>
        ))}
      </SelectField>
      {item.kind === 'desk' && (
        <SelectField
          label="De quem é a mesa"
          value={item.agentId ?? ''}
          hint="Livre: fica para o primeiro agente sem mesa do projeto da sala."
          onChange={(event) =>
            onChange({ agentId: event.target.value === '' ? null : event.target.value })
          }
        >
          <option value="">Livre</option>
          {office.agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </SelectField>
      )}
      {info.hasLabel && (
        <TextField
          label="Texto"
          value={item.label ?? ''}
          maxLength={OFFICE_LIMITS.label}
          onChange={(event) =>
            onChange({ label: event.target.value.trim() === '' ? null : event.target.value })
          }
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRotate}>
          <RotateCw className="size-4" aria-hidden />
          Girar
        </Button>
        <Button variant="danger" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden />
          Apagar móvel
        </Button>
      </div>
    </section>
  );
}
