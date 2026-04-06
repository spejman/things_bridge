export function requireAuth(req: Request, token: string): Response | null {
  const header = req.headers.get('Authorization');
  if (header !== `Bearer ${token}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}
