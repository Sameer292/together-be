import { fail } from '@shared/errors/app-error';

type RequestServer = { requestIP: (request: Request) => { address: string } | null } | null;
export type RateLimit = (request: Request, server: RequestServer, operation: string) => void;

export const createRateLimit = (): RateLimit => {
  const attempts = new Map<string, { count: number; until: number }>();
  return (request, server, operation): void => {
    const address = server?.requestIP(request)?.address ?? 'unknown';
    const key = `${address}:${operation}`;
    const now = Date.now();
    if (attempts.size >= 10000)
      for (const [storedKey, stored] of attempts) if (stored.until <= now) attempts.delete(storedKey);
    const current = attempts.get(key);
    if (!current || current.until <= now) {
      if (attempts.size >= 10000) fail(429, 'rate_limited', 'Too many requests');
      attempts.set(key, { count: 1, until: now + 60000 });
      return;
    }
    if (current.count >= 10) fail(429, 'rate_limited', 'Too many requests');
    current.count += 1;
  };
};
