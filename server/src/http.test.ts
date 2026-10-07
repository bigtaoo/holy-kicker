import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { ipOf, MAX_BODY, maxBody, pageLang, readBody } from './http';
import { LIMITS } from './protocol';

/** A request that delivers `chunks` once read; `destroyed` tells whether it was cut off. */
function request(chunks: string[] = [], headers: Record<string, string | string[]> = {}, remote = '9.9.9.9') {
  const req = Object.assign(new EventEmitter(), {
    headers,
    socket: { remoteAddress: remote },
    destroyed: false,
    destroy() {
      req.destroyed = true;
    },
  });
  setTimeout(() => {
    for (const c of chunks) if (!req.destroyed) req.emit('data', Buffer.from(c));
    req.emit('end');
  });
  return req as typeof req & IncomingMessage;
}

describe('readBody', () => {
  it('parses the JSON a client sends, in as many pieces as it arrives', async () => {
    expect(await readBody(request(['{"a":', '[1,2]}']), 100)).toEqual({ a: [1, 2] });
  });

  it('reads an empty or broken body as nothing, for the checks to refuse', async () => {
    expect(await readBody(request(), 100)).toBeUndefined();
    expect(await readBody(request(['{"a":']), 100)).toBeUndefined();
  });

  it('cuts off a body past its limit', async () => {
    const req = request(['x'.repeat(60), 'x'.repeat(60)]);
    await expect(readBody(req, 100)).rejects.toThrow('too large');
    expect(req.destroyed).toBe(true);
  });

  it('gives a problem report room for its replay and keeps everything else small', () => {
    expect(maxBody('/v1/reports')).toBe(LIMITS.reportBytes);
    expect(maxBody('/v1/events')).toBe(MAX_BODY);
    expect(maxBody('/v1/runs')).toBe(MAX_BODY);
  });
});

describe('ipOf', () => {
  it('takes the tunnel\'s client address first, then the first forwarded one, then the socket', () => {
    expect(ipOf(request([], { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(ipOf(request([], { 'x-forwarded-for': ' 2.2.2.2 , 3.3.3.3' }))).toBe('2.2.2.2');
    expect(ipOf(request([], { 'x-forwarded-for': ['4.4.4.4, 5.5.5.5'] }))).toBe('4.4.4.4');
    expect(ipOf(request([], {}))).toBe('9.9.9.9');
    expect(ipOf(request([], {}, ''))).toBe('?');
  });
});

describe('pageLang', () => {
  it('takes ?lang= first, then a Chinese browser, else English', () => {
    expect(pageLang(new URLSearchParams('lang=zh'), 'de-DE')).toBe('zh');
    expect(pageLang(new URLSearchParams('lang=en'), 'zh-CN,zh')).toBe('en');
    expect(pageLang(new URLSearchParams('lang=xx'), 'zh-TW')).toBe('zh');
    expect(pageLang(new URLSearchParams(), 'fr-FR,zh;q=0.5')).toBe('en');
    expect(pageLang(new URLSearchParams(), undefined)).toBe('en');
  });
});
