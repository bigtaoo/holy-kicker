import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appleKeys, gcPayload, keyUrlOk, verifiedPlayer } from './gameCenter';
import type { GcIdentity } from './protocol';

// A self-signed certificate standing in for Apple's, in DER as static.gc.apple.com serves it, made once with
//   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -noenc -keyout gc-test.key.pem
//     -outform DER -out gc-test.cer -subj "/CN=Holy Kicker test Game Center key"
//     -not_before 20260101000000Z -not_after 20270101000000Z
// Its key is a test key of no other use, kept beside it so the tests can sign.
const CERT = readFileSync(new URL('./fixtures/gc-test.cer', import.meta.url));
const PRIVATE = createPrivateKey(readFileSync(new URL('./fixtures/gc-test.key.pem', import.meta.url)));
const VALID_FROM = Date.parse('2026-01-01T00:00:00Z');
const VALID_TO = Date.parse('2027-01-01T00:00:00Z');
const NOW = Date.parse('2026-10-22T12:00:00Z');
const DAY = 24 * 3600_000;
const URL_10 = 'https://static.gc.apple.com/public-key/gc-prod-10.cer';

type Get = typeof fetch;

/** A fetch that answers every URL with `answer` and records what it was asked. */
function fakeGet(answer: () => Response | Promise<Response> = () => new Response(CERT)) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const get = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return answer();
  }) as Get;
  return { get, calls };
}

function clock(t = NOW) {
  const c = { t, now: () => c.t };
  return c;
}

describe('keyUrlOk', () => {
  it('turns down what is not a URL at all', () => {
    expect(keyUrlOk('not a url')).toBe(false);
    expect(keyUrlOk('')).toBe(false);
  });
});

describe('appleKeys', () => {
  it('never fetches a URL that is not https://static.gc.apple.com', async () => {
    const { get, calls } = fakeGet();
    const keyOf = appleKeys(get, clock().now);
    for (const url of [
      'http://static.gc.apple.com/public-key/gc-prod-10.cer',
      'https://static.gc.apple.com.evil.example/k.cer',
      'https://evil.example/static.gc.apple.com/k.cer',
      'https://static.gc.apple.com:8443/k.cer',
      'https://user@static.gc.apple.com/k.cer',
      'https://user:pass@static.gc.apple.com/k.cer',
      'file:///etc/passwd',
      'nonsense',
    ]) {
      expect(await keyOf(url)).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });

  it('fetches with redirects refused and a timeout', async () => {
    const { get, calls } = fakeGet();
    await appleKeys(get, clock().now)(URL_10);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(URL_10);
    expect(calls[0].init?.redirect).toBe('error');
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('gives null for a failed response, a body that is not a certificate, or a fetch that throws', async () => {
    expect(await appleKeys(fakeGet(() => new Response(CERT, { status: 404 })).get, clock().now)(URL_10)).toBeNull();
    expect(await appleKeys(fakeGet(() => new Response(CERT, { status: 500 })).get, clock().now)(URL_10)).toBeNull();
    expect(await appleKeys(fakeGet(() => new Response('<html>not a key</html>')).get, clock().now)(URL_10)).toBeNull();
    expect(await appleKeys(fakeGet(() => new Response(new Uint8Array(0))).get, clock().now)(URL_10)).toBeNull();
    expect(await appleKeys(fakeGet(() => { throw new TypeError('fetch failed'); }).get, clock().now)(URL_10)).toBeNull();
    const timedOut = () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    expect(await appleKeys(fakeGet(timedOut).get, clock().now)(URL_10)).toBeNull();
  });

  it('gives null for a certificate not yet valid or expired', async () => {
    expect(await appleKeys(fakeGet().get, clock(VALID_FROM - 1000).now)(URL_10)).toBeNull();
    expect(await appleKeys(fakeGet().get, clock(VALID_TO + 1000).now)(URL_10)).toBeNull();
    expect(await appleKeys(fakeGet().get, clock(VALID_FROM).now)(URL_10)).not.toBeNull();
    expect(await appleKeys(fakeGet().get, clock(VALID_TO).now)(URL_10)).not.toBeNull();
  });

  it("gives the certificate's key, which checks a Game Center signature end to end", async () => {
    const keyOf = appleKeys(fakeGet().get, clock().now);
    const key = await keyOf(URL_10);
    expect(key?.asymmetricKeyType).toBe('ec');
    const id: GcIdentity = { player: 'T:team1', alt: 'G:game1', bundle: 'com.gamestao.corgi', key: URL_10, sig: '', salt: Buffer.from('salty').toString('base64'), ts: NOW - 1000 };
    const signed = (player: string) => sign('sha256', gcPayload(player, id.bundle, id.ts, Buffer.from(id.salt, 'base64')), PRIVATE).toString('base64');
    expect(await verifiedPlayer({ ...id, sig: signed('T:team1') }, 'corgi', NOW, keyOf)).toBe('team:T:team1');
    expect(await verifiedPlayer({ ...id, sig: signed('G:game1') }, 'corgi', NOW, keyOf)).toBe('game:G:game1');
    expect(await verifiedPlayer({ ...id, sig: signed('T:someone-else') }, 'corgi', NOW, keyOf)).toBeNull();
    expect(await verifiedPlayer({ ...id, sig: signed('T:team1') }, 'monk', NOW, keyOf)).toBeNull();
    const noKey = appleKeys(fakeGet(() => new Response('', { status: 404 })).get, clock().now);
    expect(await verifiedPlayer({ ...id, sig: signed('T:team1') }, 'corgi', NOW, noKey)).toBeNull();
  });

  it('keeps a key a day, then fetches it again', async () => {
    const { get, calls } = fakeGet();
    const c = clock();
    const keyOf = appleKeys(get, c.now);
    const first = await keyOf(URL_10);
    c.t += DAY - 1;
    expect(await keyOf(URL_10)).toBe(first);
    expect(calls).toHaveLength(1);
    c.t += 1;
    expect(await keyOf(URL_10)).not.toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("never keeps a key past its certificate's end", async () => {
    const { get, calls } = fakeGet();
    const c = clock(VALID_TO - 3600_000);
    const keyOf = appleKeys(get, c.now);
    expect(await keyOf(URL_10)).not.toBeNull();
    c.t = VALID_TO - 1;
    expect(await keyOf(URL_10)).not.toBeNull();
    expect(calls).toHaveLength(1);
    c.t = VALID_TO + 1;
    expect(await keyOf(URL_10)).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('does not keep a failure', async () => {
    let ok = false;
    const { get, calls } = fakeGet(() => new Response(CERT, { status: ok ? 200 : 503 }));
    const keyOf = appleKeys(get, clock().now);
    expect(await keyOf(URL_10)).toBeNull();
    ok = true;
    expect(await keyOf(URL_10)).not.toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('keeps each URL apart and forgets them all past 20', async () => {
    const { get, calls } = fakeGet();
    const keyOf = appleKeys(get, clock().now);
    const url = (i: number) => `https://static.gc.apple.com/public-key/gc-prod-${i}.cer`;
    for (let i = 0; i < 21; i++) await keyOf(url(i));
    expect(calls).toHaveLength(21);
    for (let i = 0; i < 21; i++) await keyOf(url(i));
    expect(calls).toHaveLength(21);
    await keyOf(url(21)); // the 22nd clears the 21 kept before it
    expect(calls).toHaveLength(22);
    await keyOf(url(21));
    expect(calls).toHaveLength(22);
    await keyOf(url(0));
    expect(calls).toHaveLength(23);
  });
});
