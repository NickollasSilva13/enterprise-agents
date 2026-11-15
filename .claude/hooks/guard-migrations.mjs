// PreToolUse (Write|Edit): impede editar à mão uma migração que já tem SQL.
// A regra "nunca edite migração já aplicada" deixa de depender de instrução no prompt.
// Deixa passar: um arquivo de migração personalizada ainda vazio (só comentários),
// gerado por `drizzle-kit generate --custom` para ser preenchido.
import { readFileSync } from 'node:fs';

function decide(file) {
  if (!file) return null;
  const path = file.replace(/\\/g, '/');
  if (!path.includes('apps/server/drizzle/')) return null;

  if (path.includes('/drizzle/meta/')) {
    return 'O diário do Drizzle (drizzle/meta/) é gerado: edite o esquema e rode `npm run db:generate`.';
  }
  if (!path.endsWith('.sql')) return null;

  let sql = '';
  try {
    sql = readFileSync(file, 'utf8');
  } catch {
    return null; // arquivo novo: é a criação de uma migração personalizada
  }
  const hasStatements = sql
    .split('\n')
    .some((line) => line.trim() !== '' && !line.trim().startsWith('--'));
  if (!hasStatements) return null;

  return 'Esta migração já tem SQL e pode estar aplicada. Nunca edite migração aplicada: altere o esquema Drizzle e gere uma nova migração (`npm run db:generate`, ou `npx drizzle-kit generate --custom --name <nome>` em apps/server para SQL à mão).';
}

let payload = null;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  payload = null;
}

const reason = decide(payload?.tool_input?.file_path);
if (reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
}
