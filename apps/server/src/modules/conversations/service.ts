import type { ChatMessageView, ConversationDetail, ConversationSummary } from '@ea/shared';
import { asc, count, desc, eq } from 'drizzle-orm';
import { ConflictError, NotFoundError } from '../../core/errors';
import type { Db } from '../../db/client';
import { agents, conversations, messages } from '../../db/schema';
import { findActiveRunOfConversation, listRunsOfConversation } from '../runs/repository';
import { messageText } from '../runs/service';

type ConversationRow = typeof conversations.$inferSelect;

function messageCounts(db: Db): Map<string, number> {
  const rows = db
    .select({ conversationId: messages.conversationId, total: count() })
    .from(messages)
    .groupBy(messages.conversationId)
    .all();
  return new Map(rows.map((row) => [row.conversationId, row.total]));
}

const toSummary = (row: ConversationRow, messageCount: number): ConversationSummary => ({
  id: row.id,
  agentId: row.agentId,
  title: row.title,
  messageCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

function findConversation(db: Db, id: string): ConversationRow {
  const row = db.select().from(conversations).where(eq(conversations.id, id)).get();
  if (!row) throw new NotFoundError('Conversa não encontrada.');
  return row;
}

/** Conversations of an agent, most recently used first. */
export function listConversations(db: Db, agentId: string): ConversationSummary[] {
  const agent = db.select({ id: agents.id }).from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) throw new NotFoundError('Agente não encontrado.');
  const counts = messageCounts(db);
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.agentId, agentId))
    .orderBy(desc(conversations.updatedAt), desc(conversations.id))
    .all()
    .map((row) => toSummary(row, counts.get(row.id) ?? 0));
}

export function getConversation(db: Db, id: string): ConversationDetail {
  const row = findConversation(db, id);
  const history: ChatMessageView[] = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.id))
    .all()
    .flatMap((message) =>
      message.role === 'tool'
        ? []
        : [
            {
              id: message.id,
              role: message.role,
              text: messageText(message.content),
              runId: message.runId,
              createdAt: message.createdAt,
            },
          ],
    );
  return {
    conversation: toSummary(row, history.length),
    messages: history,
    runs: listRunsOfConversation(db, id),
    activeRunId: findActiveRunOfConversation(db, id)?.id ?? null,
  };
}

/** Removes the conversation and its messages. Its runs stay in the logs. */
export function deleteConversation(db: Db, id: string): void {
  findConversation(db, id);
  if (findActiveRunOfConversation(db, id)) {
    throw new ConflictError(
      'conversation_busy',
      'Esta conversa tem uma execução em andamento. Interrompa a execução antes de excluir.',
    );
  }
  db.delete(conversations).where(eq(conversations.id, id)).run();
}
