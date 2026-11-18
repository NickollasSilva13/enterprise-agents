import {
  type AreaFromTemplate,
  type AreaLinkInput,
  areaCreatedSchema,
  areaLinkSchema,
  areaLinksSchema,
  boardSchema,
  requestsSchema,
  type ScheduleInputValue,
  scheduleSchema,
  schedulesSchema,
  type ScheduleUpdate,
  type TaskRequestInput,
  type TaskCreateInput,
  taskDetailSchema,
  taskSummarySchema,
  tasksWaitingSchema,
  type TaskUpdate,
  type TemplateExport,
  type TemplateFromArea,
  templateExportSchema,
  templateImportResultSchema,
  type TemplateUpdate,
  workflowSchema,
  workflowTemplateListSchema,
  workflowTemplateSummarySchema,
  type WorkflowUpdate,
} from '@ea/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiFetch, apiSend } from './api';

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

/** A template as a document that can be saved to a file (Phase 18, D4). */
export const fetchTemplateExport = (templateId: string): Promise<TemplateExport> =>
  apiFetch(`/api/workflow-templates/${enc(templateId)}/export`, templateExportSchema);

function useRefreshTemplates() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['workflow-templates'] });
}

/** Saves the flow of an area, and the agents on it, as a template (D3). */
export function useSaveTemplate() {
  const refresh = useRefreshTemplates();
  return useMutation({
    mutationFn: (input: TemplateFromArea) =>
      apiSend('POST', '/api/workflow-templates', workflowTemplateSummarySchema, input),
    onSuccess: refresh,
  });
}

export function useUpdateTemplate() {
  const refresh = useRefreshTemplates();
  return useMutation({
    mutationFn: ({ templateId, patch }: { templateId: string; patch: TemplateUpdate }) =>
      apiSend(
        'PATCH',
        `/api/workflow-templates/${enc(templateId)}`,
        workflowTemplateSummarySchema,
        patch,
      ),
    onSuccess: refresh,
  });
}

export function useDeleteTemplate() {
  const refresh = useRefreshTemplates();
  return useMutation({
    mutationFn: (templateId: string) => apiDelete(`/api/workflow-templates/${enc(templateId)}`),
    onSuccess: refresh,
  });
}

/** Adds the template of a file. The file is checked by the server, not here. */
export function useImportTemplate() {
  const refresh = useRefreshTemplates();
  return useMutation({
    mutationFn: (document: unknown) =>
      apiSend('POST', '/api/workflow-templates/import', templateImportResultSchema, document),
    onSuccess: refresh,
  });
}

// ---- Schedules (Phase 19) -----------------------------------------------------

export const useSchedules = () =>
  useQuery({
    queryKey: ['schedules'],
    queryFn: async () => (await apiFetch('/api/schedules', schedulesSchema)).schedules,
    // The clock creates tasks by itself: the last result shows up without a reload.
    refetchInterval: 30_000,
  });

function useRefreshSchedules() {
  const queryClient = useQueryClient();
  const refreshTasks = useRefreshTasks();
  return () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: ['schedules'] }), refreshTasks()]);
}

export function useCreateSchedule() {
  const refresh = useRefreshSchedules();
  return useMutation({
    mutationFn: (input: ScheduleInputValue) =>
      apiSend('POST', '/api/schedules', scheduleSchema, input),
    onSuccess: refresh,
  });
}

export function useUpdateSchedule() {
  const refresh = useRefreshSchedules();
  return useMutation({
    mutationFn: ({ scheduleId, patch }: { scheduleId: string; patch: ScheduleUpdate }) =>
      apiSend('PATCH', `/api/schedules/${enc(scheduleId)}`, scheduleSchema, patch),
    onSuccess: refresh,
  });
}

export function useDeleteSchedule() {
  const refresh = useRefreshSchedules();
  return useMutation({
    mutationFn: (scheduleId: string) => apiDelete(`/api/schedules/${enc(scheduleId)}`),
    onSuccess: refresh,
  });
}

/** "Criar agora": a task now, without moving the next time. */
export function useRunSchedule() {
  const refresh = useRefreshSchedules();
  return useMutation({
    mutationFn: (scheduleId: string) =>
      apiSend('POST', `/api/schedules/${enc(scheduleId)}/run`, scheduleSchema),
    onSuccess: refresh,
  });
}

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
      queryClient.invalidateQueries({ queryKey: ['requests'] }),
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

// ---- Requests between areas (Phase 17) ----------------------------------------

export const useRequests = () =>
  useQuery({
    queryKey: ['requests'],
    queryFn: async () => (await apiFetch('/api/requests', requestsSchema)).requests,
    refetchInterval: BOARD_REFRESH_MS,
  });

export const useAreaLinks = () =>
  useQuery({
    queryKey: ['area-links'],
    queryFn: async () => (await apiFetch('/api/area-links', areaLinksSchema)).links,
  });

/** A rule changes which areas a task may ask, shown on the task page. */
function useRefreshLinks() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['area-links'] }),
      queryClient.invalidateQueries({ queryKey: ['task'] }),
    ]);
}

export function useCreateAreaLink() {
  const refresh = useRefreshLinks();
  return useMutation({
    mutationFn: (input: AreaLinkInput) => apiSend('POST', '/api/area-links', areaLinkSchema, input),
    onSuccess: refresh,
  });
}

export function useUpdateAreaLink() {
  const refresh = useRefreshLinks();
  return useMutation({
    mutationFn: ({ linkId, requiresApproval }: { linkId: string; requiresApproval: boolean }) =>
      apiSend('PATCH', `/api/area-links/${enc(linkId)}`, areaLinkSchema, { requiresApproval }),
    onSuccess: refresh,
  });
}

export function useDeleteAreaLink() {
  const refresh = useRefreshLinks();
  return useMutation({
    mutationFn: (linkId: string) => apiDelete(`/api/area-links/${enc(linkId)}`),
    onSuccess: refresh,
  });
}

export function useRequestFromTask() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({ taskId, request }: { taskId: string; request: TaskRequestInput }) =>
      apiSend('POST', `/api/tasks/${enc(taskId)}/requests`, taskSummarySchema, request),
    onSuccess: refresh,
  });
}

/** The user lets a request into the other area, or turns it down. */
export function useDecideRequest() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({ taskId, approve, note }: { taskId: string; approve: boolean; note?: string }) =>
      approve
        ? apiSend('POST', `/api/tasks/${enc(taskId)}/approve-request`, taskSummarySchema)
        : apiSend('POST', `/api/tasks/${enc(taskId)}/refuse-request`, taskSummarySchema, {
            note: note ?? '',
          }),
    onSettled: refresh,
  });
}
