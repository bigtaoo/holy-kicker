import type { IncomingMessage } from 'node:http';
import { LIMITS } from './protocol';

// Reading a request off the wire, apart from the process (index.ts) so it can be tested.

/** A request body's limit: a problem report, a challenge run and a collected replay carry a replay, everything else is small. */
export const MAX_BODY = 32 * 1024;
const BIG = ['/v1/reports', '/v1/runs', '/v1/challenge/runs', '/v1/replays'];
export const maxBody = (path: string) => (BIG.includes(path) ? LIMITS.reportBytes : MAX_BODY);

/**
 * Big bodies (up to LIMITS.reportBytes each) read at once; one more is turned away with 503, so slow
 * uploads cannot pile up memory. Old clients drop a run or a report on a 503 rather than retry, and
 * every run end sends its replay next to its run, so there is room for a burst; BODY_MS keeps a slow
 * upload from holding a place.
 */
export const BIG_READS = 32;
/** A body not fully read by then is cut off (408). */
export const BODY_MS = 20_000;

/** Counts the big bodies being read: take() before reading one (false: too many already), give() when done. */
export class BodyGate {
  private open = 0;
  constructor(private readonly limit = BIG_READS) {}
  take(): boolean {
    if (this.open >= this.limit) return false;
    this.open++;
    return true;
  }
  give(): void {
    this.open = Math.max(0, this.open - 1);
  }
}

export function readBody(req: IncomingMessage, limit: number, ms = BODY_MS): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error('too slow'));
      req.destroy();
    }, ms);
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
    // a client gone mid-body may end with neither 'end' nor 'error'; settled promises ignore this
    req.on('close', () => reject(new Error('closed')));
  });
  return read.finally(() => clearTimeout(timer));
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

/** The privacy policy's language: `?lang=` first, then the browser's first language, English otherwise. */
export function pageLang(query: URLSearchParams, accept: string | undefined): 'en' | 'zh' {
  const q = query.get('lang');
  if (q === 'en' || q === 'zh') return q;
  return accept?.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
