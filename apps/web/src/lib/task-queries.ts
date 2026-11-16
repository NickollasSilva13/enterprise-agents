import {
  type AreaFromTemplate,
  areaCreatedSchema,
  boardSchema,
  type TaskCreateInput,
  taskDetailSchema,
  taskSummarySchema,
  tasksWaitingSchema,
  type TaskUpdate,
  workflowSchema,
  workflowTemplateListSchema,
  type WorkflowUpdate,
} from '@ea/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend } from './api';

// The task board (Phase 16). Runs start and end on the server by themselves,
// so the board and an open task are refreshed often while anything works.

const enc = encodeURIComponent;
/** While agents work, the board follows them closely. */
export const BOARD_REFRESH_MS = 3_000;

export const useWorkflowTemplates = () =>
  useQuery({
    queryKey: ['workflow-templates'],
    queryFn: async () =>
      (await apiFetch('/api/workflow-templates', workflowTemplateListSchema)).templates,
  });

export const useBoard = (areaId: string | undefined) =>
  useQuery({
    queryKey: ['board', areaId],
    queryFn: () => apiFetch(`/api/areas/${enc(areaId ?? '')}/board`, boardSchema),
    enabled: areaId !== undefined,
    refetchInterval: BOARD_REFRESH_MS,
  });

export const useWorkflow = (areaId: string | undefined) =>
  useQuery({
    queryKey: ['workflow', areaId],
    queryFn: () => apiFetch(`/api/areas/${enc(areaId ?? '')}/workflow`, workflowSchema),
    enabled: areaId !== undefined,
  });

export const useTask = (taskId: string | undefined) =>
  useQuery({
    queryKey: ['task', taskId],
    queryFn: () => apiFetch(`/api/tasks/${enc(taskId ?? '')}`, taskDetailSchema),
    enabled: taskId !== undefined,
    refetchInterval: BOARD_REFRESH_MS,
  });

export const useWaitingTasks = () =>
  useQuery({
    queryKey: ['tasks-waiting'],
    queryFn: async () => (await apiFetch('/api/tasks/waiting', tasksWaitingSchema)).tasks,
    refetchInterval: BOARD_REFRESH_MS,
  });

/** Anything that changes a task may change the board, the task and the waiting list. */
function useRefreshTasks() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['board'] }),
      queryClient.invalidateQueries({ queryKey: ['task'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks-waiting'] }),
      queryClient.invalidateQueries({ queryKey: ['workflow'] }),
    ]);
}

export function useCreateAreaFromTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AreaFromTemplate) =>
      apiSend('POST', '/api/areas/from-template', areaCreatedSchema, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['agents'] }),
        queryClient.invalidateQueries({ queryKey: ['office'] }),
      ]),
  });
}

export function useSaveWorkflow() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({ areaId, workflow }: { areaId: string; workflow: WorkflowUpdate }) =>
      apiSend('PUT', `/api/areas/${enc(areaId)}/workflow`, workflowSchema, workflow),
    onSuccess: refresh,
  });
}

export function useCreateTask() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({ areaId, task }: { areaId: string; task: TaskCreateInput }) =>
      apiSend('POST', `/api/areas/${enc(areaId)}/tasks`, taskSummarySchema, task),
    onSuccess: refresh,
  });
}

export function useEditTask() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: TaskUpdate }) =>
      apiSend('PATCH', `/api/tasks/${enc(taskId)}`, taskSummarySchema, patch),
    onSuccess: refresh,
  });
}

export function useMoveTask() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({
      taskId,
      toStageId,
      note,
    }: {
      taskId: string;
      toStageId: string;
      note: string;
    }) => apiSend('POST', `/api/tasks/${enc(taskId)}/move`, taskSummarySchema, { toStageId, note }),
    onSettled: refresh,
  });
}

export function useCommentTask() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({ taskId, text }: { taskId: string; text: string }) =>
      apiSend('POST', `/api/tasks/${enc(taskId)}/comments`, taskSummarySchema, { text }),
    onSuccess: refresh,
  });
}

/** Cancel, or let a stopped task flow again. */
export function useTaskAction() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({ taskId, action }: { taskId: string; action: 'cancel' | 'resume' }) =>
      apiSend('POST', `/api/tasks/${enc(taskId)}/${action}`, taskSummarySchema),
    onSettled: refresh,
  });
}
