import { z } from 'zod';
import { CreateAreaPayloadSchema } from '../shared/index.ts';
import type { ThingsCliService } from '../things-cli.ts';
import { requireAuth, isAuthTokenError, authTokenErrorResponse } from '../auth.ts';

const UpdateAreaBodySchema = z.object({
  title: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
});

export async function handleGetAreas(req: Request, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;
  return Response.json(await cli.getAreas());
}

export async function handleGetArea(req: any, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const area = await cli.getAreaById(req.params.id);
  if (!area) return new Response('Not found', { status: 404 });
  return Response.json(area);
}

export async function handleCreateArea(req: Request, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const body = await req.json();
  const parsed = CreateAreaPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', details: parsed.error }, { status: 400 });
  }

  let newId: string;
  try {
    newId = await cli.createArea(parsed.data);
  } catch (err) {
    if (isAuthTokenError(err)) return authTokenErrorResponse(err as Error);
    throw err;
  }
  const area = await cli.getAreaById(newId);

  return Response.json({ id: newId, area }, { status: 201 });
}

export async function handleUpdateArea(req: any, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const { id } = req.params;
  const existing = await cli.getAreaById(id);
  if (!existing) return new Response('Not found', { status: 404 });

  const body = await req.json();
  const parsed = UpdateAreaBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request', details: parsed.error }, { status: 400 });
  }

  try {
    await cli.updateArea(id, {
      title: parsed.data.title,
      tags: parsed.data.tags,
    });
  } catch (err) {
    if (isAuthTokenError(err)) return authTokenErrorResponse(err as Error);
    throw err;
  }

  const area = await cli.getAreaById(id);
  return Response.json({ area });
}

export async function handleDeleteArea(req: any, cli: ThingsCliService, token: string): Promise<Response> {
  const auth = requireAuth(req, token);
  if (auth) return auth;

  const { id } = req.params;
  const existing = await cli.getAreaById(id);
  if (!existing) return new Response('Not found', { status: 404 });

  try {
    await cli.deleteArea(id);
  } catch (err) {
    if (isAuthTokenError(err)) return authTokenErrorResponse(err as Error);
    throw err;
  }

  return Response.json({ deleted: true });
}
