export interface AuthConfig {
  agentToken: string;
  clientToken?: string;
}

export function authenticateAgent(req: Request, config: AuthConfig): boolean {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  return token === config.agentToken;
}

export function authenticateClient(req: Request, config: AuthConfig): boolean {
  if (!config.clientToken) {
    return true;
  }

  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  return token === config.clientToken;
}
