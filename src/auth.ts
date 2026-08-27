export function requireAuth(req: Request, token: string): Response | null {
  const header = req.headers.get('Authorization');
  if (header !== `Bearer ${token}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}

export function isAuthTokenError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('auth token');
}

export function authTokenErrorResponse(err: Error): Response {
  return Response.json({ error: err.message }, { status: 503 });
}
