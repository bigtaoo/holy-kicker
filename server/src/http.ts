import type { IncomingMessage } from 'node:http';
import { LIMITS } from './protocol';

// Reading a request off the wire, apart from the process (index.ts) so it can be tested.

/** A request body's limit: a problem report carries a replay, everything else is small. */
export const MAX_BODY = 32 * 1024;
export const maxBody = (path: string) => (path === '/v1/reports' ? LIMITS.reportBytes : MAX_BODY);

export function readBody(req: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', reject);
  });
}

/**
 * The caller: the Cloudflare tunnel is the only way in and names the client in CF-Connecting-IP
 * (X-Forwarded-For first, as a fallback for other proxies).
 */
export function ipOf(req: IncomingMessage): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || '?';
}
