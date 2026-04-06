import type { ThingsCliService } from '../things-cli.ts';
import type { ChangeLog } from '../change-log.ts';
import { requireAuth } from '../auth.ts';

export async function handleGetLog(
  req: Request,
  changeLog: ChangeLog,
  token: string
): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const result = changeLog.list({ limit, offset });
  return Response.json(result);
}

export async function handleUndo(
  req: any,
  cli: ThingsCliService,
  changeLog: ChangeLog,
  token: string
): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const entry = changeLog.get(req.params.entryId);
  if (!entry) return new Response('Not found', { status: 404 });

  let undoEntryId: string;

  switch (entry.operation) {
    case 'create': {
      // Undo a create → delete the task
      if (!entry.after) return Response.json({ error: 'Cannot undo: missing after state' }, { status: 422 });
      const before = await cli.getTaskById(entry.after.id);
      await cli.deleteTask(entry.after.id);
      const undoEntry = changeLog.record({ operation: 'undo', taskId: entry.after.id, before, after: null });
      undoEntryId = undoEntry.id;
      break;
    }
    case 'update':
    case 'complete': {
      // Undo by restoring before state
      if (!entry.before) return Response.json({ error: 'Cannot undo: missing before state' }, { status: 422 });
      const taskId = entry.before.id;
      const before = await cli.getTaskById(taskId);
      await cli.updateTask(taskId, {
        title: entry.before.title,
        notes: entry.before.notes ?? undefined,
        whenDate: entry.before.whenDate ?? undefined,
        deadline: entry.before.deadline ?? undefined,
        completed: entry.operation === 'complete' ? false : undefined,
      });
      const after = await cli.getTaskById(taskId);
      const undoEntry = changeLog.record({ operation: 'undo', taskId, before, after });
      undoEntryId = undoEntry.id;
      break;
    }
    case 'cancel':
    case 'delete': {
      // Undo a cancel/delete → recreate the task from before snapshot
      if (!entry.before) return Response.json({ error: 'Cannot undo: missing before state' }, { status: 422 });
      const newId = await cli.recreateTask(entry.before);
      const after = await cli.getTaskById(newId);
      const undoEntry = changeLog.record({ operation: 'undo', taskId: newId, before: null, after });
      undoEntryId = undoEntry.id;
      break;
    }
    case 'undo': {
      return Response.json({ error: 'Undo of undo not yet supported' }, { status: 422 });
    }
    default:
      return Response.json({ error: `Cannot undo operation: ${entry.operation}` }, { status: 422 });
  }

  changeLog.markUndone(entry.id);
  return Response.json({ entryId: undoEntryId });
}
