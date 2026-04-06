import { z } from 'zod';
import { CreateTaskPayloadSchema } from '../shared/index.ts';
import type { ThingsCliService } from '../things-cli.ts';
import type { ChangeLog } from '../change-log.ts';
import { requireAuth } from '../auth.ts';

function isAuthTokenError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('auth token');
}

function authTokenErrorResponse(err: Error): Response {
  return Response.json({ error: err.message }, { status: 503 });
}

const UpdateBodySchema = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
  when: z.enum(['today', 'evening', 'tomorrow', 'this-weekend', 'next-week', 'someday']).nullable().optional(),
  whenDate: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export async function handleCreateTask(
  req: Request,
  cli: ThingsCliService,
  changeLog: ChangeLog,
  token: string
): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const body = await req.json();
  const parsed = CreateTaskPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', details: parsed.error }, { status: 400 });
  }

  let newId: string;
  try {
    newId = await cli.createTask(parsed.data);
  } catch (err) {
    if (isAuthTokenError(err)) return authTokenErrorResponse(err as Error);
    throw err;
  }
  const after = await cli.getTaskById(newId);

  const entry = changeLog.record({ operation: 'create', taskId: newId, before: null, after });

  return Response.json({ id: newId, task: after, entryId: entry.id }, { status: 201 });
}

export async function handleUpdateTask(
  req: any,
  cli: ThingsCliService,
  changeLog: ChangeLog,
  token: string
): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const { id } = req.params;
  const before = await cli.getTaskById(id);
  if (!before) return new Response('Not found', { status: 404 });

  const body = await req.json();
  const parsed = UpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', details: parsed.error }, { status: 400 });
  }

  try {
    await cli.updateTask(id, {
      title: parsed.data.title,
      notes: parsed.data.notes,
      when: parsed.data.when ?? undefined,
      whenDate: parsed.data.whenDate ?? undefined,
      deadline: parsed.data.deadline ?? undefined,
      tags: parsed.data.tags,
    });
  } catch (err) {
    if (isAuthTokenError(err)) return authTokenErrorResponse(err as Error);
    throw err;
  }

  const after = await cli.getTaskById(id);
  const entry = changeLog.record({ operation: 'update', taskId: id, before, after });

  return Response.json({ task: after, entryId: entry.id });
}

export async function handleCompleteTask(
  req: any,
  cli: ThingsCliService,
  changeLog: ChangeLog,
  token: string
): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const { id } = req.params;
  const before = await cli.getTaskById(id);
  if (!before) return new Response('Not found', { status: 404 });

  try {
    await cli.completeTask(id);
  } catch (err) {
    if (isAuthTokenError(err)) return authTokenErrorResponse(err as Error);
    throw err;
  }
  const after = await cli.getTaskById(id);
  const entry = changeLog.record({ operation: 'complete', taskId: id, before, after });

  return Response.json({ task: after, entryId: entry.id });
}

export async function handleCancelTask(
  req: any,
  cli: ThingsCliService,
  changeLog: ChangeLog,
  token: string
): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const { id } = req.params;
  const before = await cli.getTaskById(id);
  if (!before) return new Response('Not found', { status: 404 });

  try {
    await cli.cancelTask(id);
  } catch (err) {
    if (isAuthTokenError(err)) return authTokenErrorResponse(err as Error);
    throw err;
  }
  const after = await cli.getTaskById(id);
  const entry = changeLog.record({ operation: 'cancel', taskId: id, before, after });

  return Response.json({ task: after, entryId: entry.id });
}

export async function handleDeleteTask(
  req: any,
  cli: ThingsCliService,
  changeLog: ChangeLog,
  token: string
): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const { id } = req.params;
  const before = await cli.getTaskById(id);
  if (!before) return new Response('Not found', { status: 404 });

  try {
    await cli.deleteTask(id);
  } catch (err) {
    if (isAuthTokenError(err)) return authTokenErrorResponse(err as Error);
    throw err;
  }
  const entry = changeLog.record({ operation: 'delete', taskId: id, before, after: null });

  return Response.json({ entryId: entry.id });
}
