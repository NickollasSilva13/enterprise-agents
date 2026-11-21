import { describe, expect, it } from 'vitest';
import { profileSchema, searchKey, searchQuerySchema, searchRank } from './frame';

describe('search (Phase 21)', () => {
  it('ignores case and accents', () => {
    expect(searchKey('Relatório de AÇÕES')).toBe('relatorio de acoes');
    expect(searchRank('Relatório', 'relat')).toBe(0);
    expect(searchRank('Relatorio', 'RELATÓ')).toBe(0);
  });

  it('ranks the start before a word before the middle', () => {
    expect(searchRank('Vendas do mês', 'ven')).toBe(0);
    expect(searchRank('Fechar vendas', 'ven')).toBe(1);
    expect(searchRank('Eventos', 'ven')).toBe(2);
    expect(searchRank('Marketing', 'ven')).toBeNull();
  });

  it('takes wildcards of SQL as plain letters', () => {
    expect(searchRank('100% pronto', '100%')).toBe(0);
    expect(searchRank('nome_tecnico', '_')).toBe(2);
    expect(searchRank('qualquer coisa', '%')).toBeNull();
  });

  it('refuses an empty or long query', () => {
    expect(searchQuerySchema.safeParse({ q: '   ' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    expect(searchQuerySchema.parse({ q: ' ana ' })).toEqual({ q: 'ana' });
  });
});

describe('profile (Phase 21)', () => {
  it('keeps both fields optional and turns a blank name into none', () => {
    expect(profileSchema.parse({ name: '  ', appearance: null })).toEqual({
      name: null,
      appearance: null,
    });
    expect(profileSchema.parse({ name: ' Nick ', appearance: null }).name).toBe('Nick');
  });

  it('refuses a long name and unknown fields', () => {
    expect(profileSchema.safeParse({ name: 'x'.repeat(41), appearance: null }).success).toBe(false);
    expect(profileSchema.safeParse({ name: null, appearance: null, email: 'a' }).success).toBe(
      false,
    );
  });
});
