import { buildPresetLayout, type Office, type OfficeLayoutInput } from '@ea/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptySummary, json, renderApp } from '../../../test/render';

const office: Office = {
  layout: buildPresetLayout('compact', [{ projectId: 'p1', agents: 1 }]),
  customized: true,
  projects: [{ id: 'p1', name: 'Atendimento', description: '' }],
  agents: [
    {
      id: 'a1',
      name: 'Triagem',
      objective: '',
      projectId: 'p1',
      appearance: null,
      state: 'idle',
      currentRun: null,
      lastError: null,
      pendingApproval: null,
      delegatingTo: [],
      idleSince: null,
      visit: null,
    },
  ],
};

const render = (extra: Record<string, unknown> = {}) =>
  renderApp('/escritorio/editar', {
    '/api/dashboard/summary': emptySummary,
    '/api/office': office,
    'PUT /api/office/layout': () => json(200, office.layout),
    ...extra,
  });

const areas = () => within(screen.getByRole('list', { name: 'Áreas' }));
const props = () => within(screen.getByRole('complementary', { name: 'Propriedades' }));

describe('OfficeEditorPage', () => {
  it('lists the areas and edits one with the forms, then saves the whole layout', async () => {
    const view = render();
    await screen.findByRole('list', { name: 'Áreas' });
    expect(
      areas()
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Recepção · Recepção', 'Copa · Copa', 'Atendimento · Sala de projeto']);
    expect(screen.getByRole('button', { name: 'Salvar' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(areas().getByRole('button', { name: /^Atendimento/ }));
    const form = within(screen.getByRole('region', { name: /^Área: Atendimento/ }));
    fireEvent.change(form.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Sala azul' },
    });
    fireEvent.change(form.getByRole('combobox', { name: 'Piso' }), {
      target: { value: 'carpet_blue' },
    });
    expect(screen.getByRole('heading', { name: 'Alterações não salvas' })).toBeTruthy();

    // The surroundings change with the layout (Phase 15).
    fireEvent.change(screen.getByRole('combobox', { name: 'Entorno' }), {
      target: { value: 'house' },
    });
    expect(
      document.querySelector('[data-editor-canvas] [data-surroundings="house"]'),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(view.writes()).toHaveLength(1));
    const write = view.writes()[0];
    expect(write?.method).toBe('PUT');
    const body = write?.body as OfficeLayoutInput;
    expect(body.surroundings).toBe('house');
    expect(body.areas[2]).toMatchObject({
      name: 'Sala azul',
      floor: 'carpet_blue',
      projectId: 'p1',
    });
    // Ids are the server's to give.
    expect(JSON.stringify(body)).not.toContain('"id"');
    expect(await screen.findByText('Escritório salvo.')).toBeTruthy();
  });

  it('refuses to save a layout with problems and says which', async () => {
    const view = render();
    await screen.findByRole('list', { name: 'Áreas' });
    fireEvent.click(areas().getByRole('button', { name: /^Copa/ }));
    fireEvent.click(props().getByRole('button', { name: 'Apagar área' }));
    const alert = within(await screen.findByRole('alert'));
    expect(alert.getByText('O escritório precisa de exatamente uma área "Copa".')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salvar' }).hasAttribute('disabled')).toBe(true);
    // Undo brings it back.
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(view.writes()).toEqual([]);
  });

  it('gives a desk to an agent and moves furniture with the keyboard', async () => {
    const view = render();
    await screen.findByRole('list', { name: 'Áreas' });
    const desk = within(screen.getByRole('list', { name: 'Móveis' })).getAllByRole('button', {
      name: /^Mesa de trabalho/,
    })[0];
    if (!desk) throw new Error('no desk');
    fireEvent.click(desk);
    fireEvent.change(props().getByRole('combobox', { name: 'De quem é a mesa' }), {
      target: { value: 'a1' },
    });
    const before = desk.textContent;
    // The plan takes the arrows: the desk moves one tile and back.
    const plan = screen.getByRole('application');
    fireEvent.keyDown(plan, { key: 'ArrowDown' });
    fireEvent.keyDown(plan, { key: 'ArrowUp' });
    expect(desk.textContent).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(view.writes()).toHaveLength(1));
    const body = view.writes()[0]?.body as OfficeLayoutInput;
    expect(body.items.filter((item) => item.agentId === 'a1')).toHaveLength(1);
  });

  it('gives a colour to the pieces that can take one (Phase 23)', async () => {
    const view = render();
    await screen.findByRole('list', { name: 'Áreas' });
    const pieces = within(screen.getByRole('list', { name: 'Móveis' }));
    fireEvent.click(pieces.getAllByRole('button', { name: /^Mesa de trabalho/ })[0]!);
    expect(props().queryByRole('combobox', { name: 'Cor' })).toBeNull();
    fireEvent.click(pieces.getAllByRole('button', { name: /^Banqueta/ })[0]!);
    fireEvent.change(props().getByRole('combobox', { name: 'Cor' }), {
      target: { value: 'teal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(view.writes()).toHaveLength(1));
    const body = view.writes()[0]?.body as OfficeLayoutInput;
    expect(body.items.filter((item) => item.color === 'teal')).toMatchObject([
      { kind: 'bar_stool' },
    ]);
  });

  it('applies a ready-made layout and goes back to the automatic one on request', async () => {
    const view = render({ 'DELETE /api/office/layout': () => new Response(null, { status: 204 }) });
    await screen.findByRole('list', { name: 'Áreas' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Modelo pronto' }), {
      target: { value: 'complete' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Usar este modelo' }));
    expect(areas().getAllByRole('button')).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao automático' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Voltar ao layout automático?' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Voltar ao automático' }));
    await waitFor(() =>
      expect(view.writes()).toMatchObject([{ method: 'DELETE', url: '/api/office/layout' }]),
    );
  });

  it('shows the plan without inline style or text elements', async () => {
    render();
    await screen.findByRole('list', { name: 'Áreas' });
    expect(document.querySelector('[data-editor-canvas]')).not.toBeNull();
    expect(document.querySelector('main [style]')).toBeNull();
    expect(document.querySelector('main svg text')).toBeNull();
  });
});
