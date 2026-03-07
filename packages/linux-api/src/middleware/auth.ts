export interface AuthConfig {
  agentToken: string;
  clientToken?: string;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7);
}

export function authenticateAgent(req: Request, config: AuthConfig): boolean {
  const token = extractBearerToken(req);
  return token === config.agentToken;
}

export function authenticateClient(req: Request, config: AuthConfig): boolean {
  if (!config.clientToken) {
    return true;
  }

  const token = extractBearerToken(req);
  return token === config.clientToken;
}
