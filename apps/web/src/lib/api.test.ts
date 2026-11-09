import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiHealth } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('getApiHealth', () => {
  it('reports not-configured without a base URL', async () => {
    expect(await getApiHealth(undefined)).toEqual({ state: 'not-configured' });
  });

  it('reports online with the server version', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok', version: '0.0.1' }), { status: 200 })));
    expect(await getApiHealth('https://api.example.test/')).toEqual({ state: 'online', version: '0.0.1' });
  });

  it('never throws when the server is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await getApiHealth('https://api.example.test')).toEqual({ state: 'offline', reason: 'TypeError' });
  });

  it('treats an error status as offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    expect(await getApiHealth('https://api.example.test')).toEqual({ state: 'offline', reason: 'HTTP 503' });
  });
});
