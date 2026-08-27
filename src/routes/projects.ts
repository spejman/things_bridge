import { z } from 'zod';
import { CreateProjectPayloadSchema } from '../shared/index.ts';
import type { ThingsCliService } from '../things-cli.ts';
import { requireAuth, isAuthTokenError, authTokenErrorResponse } from '../auth.ts';

const UpdateProjectBodySchema = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
  areaId: z.string().nullable().optional(),
  when: z.enum(['today', 'evening', 'tomorrow', 'this-weekend', 'next-week', 'someday']).nullable().optional(),
  whenDate: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  completed: z.boolean().optional(),
  canceled: z.boolean().optional(),
});

export async function handleGetProjects(req: Request, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;
  const url = new URL(req.url);
  const areaId = url.searchParams.get('areaId') ?? undefined;
  let projects = await cli.getProjects();
  if (areaId) projects = projects.filter((p) => p.areaId === areaId);
  return Response.json(projects);
}

export async function handleGetProject(req: any, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const project = await cli.getProjectById(req.params.id);
  if (!project) return new Response('Not found', { status: 404 });
  return Response.json(project);
}

export async function handleCreateProject(req: Request, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const body = await req.json();
  const parsed = CreateProjectPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', details: parsed.error }, { status: 400 });
  }

  let newId: string;
  try {
    newId = await cli.createProject(parsed.data);
  } catch (err) {
    if (isAuthTokenError(err)) return authTokenErrorResponse(err as Error);
    throw err;
  }
  const project = await cli.getProjectById(newId);

  return Response.json({ id: newId, project }, { status: 201 });
}

export async function handleUpdateProject(req: any, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const { id } = req.params;
  const existing = await cli.getProjectById(id);
  if (!existing) return new Response('Not found', { status: 404 });

  const body = await req.json();
  const parsed = UpdateProjectBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', details: parsed.error }, { status: 400 });
  }

  try {
    await cli.updateProject(id, {
      title: parsed.data.title,
      notes: parsed.data.notes,
      areaId: parsed.data.areaId ?? undefined,
      when: parsed.data.when ?? undefined,
      whenDate: parsed.data.whenDate ?? undefined,
      deadline: parsed.data.deadline ?? undefined,
      tags: parsed.data.tags,
      completed: parsed.data.completed,
      canceled: parsed.data.canceled,
    });
  } catch (err) {
    if (isAuthTokenError(err)) return authTokenErrorResponse(err as Error);
    throw err;
  }

  const project = await cli.getProjectById(id);
  return Response.json({ project });
}

export async function handleDeleteProject(req: any, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const { id } = req.params;
  const existing = await cli.getProjectById(id);
  if (!existing) return new Response('Not found', { status: 404 });

  try {
    await cli.deleteProject(id);
  } catch (err) {
    if (isAuthTokenError(err)) return authTokenErrorResponse(err as Error);
    throw err;
  }

  return Response.json({ deleted: true });
}
