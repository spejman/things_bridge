import type { ThingsCliService } from '../things-cli.ts';
import { requireAuth } from '../auth.ts';

export async function handleGetTasks(req: Request, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? undefined;
  const projectId = url.searchParams.get('projectId') ?? undefined;
  const areaId = url.searchParams.get('areaId') ?? undefined;
  const tag = url.searchParams.get('tag') ?? undefined;

  let tasks = await cli.getSnapshot();

  if (status) tasks = tasks.filter((t) => t.status === status);
  if (projectId) tasks = tasks.filter((t) => t.projectId === projectId);
  if (areaId) tasks = tasks.filter((t) => t.areaId === areaId);
  if (tag) tasks = tasks.filter((t) => t.tags.includes(tag));

  return Response.json(tasks);
}

export async function handleGetTask(req: any, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const task = await cli.getTaskById(req.params.id);
  if (!task) return new Response('Not found', { status: 404 });
  return Response.json(task);
}

export async function handleGetTags(req: Request, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;
  return Response.json(await cli.getTags());
}
