// Thin client for the Python API. The app must keep working when the API is unreachable,
// so every call resolves to a status instead of throwing.

export type ApiHealth =
  | { state: 'not-configured' }
  | { state: 'online'; version: string }
  | { state: 'offline'; reason: string };

export const apiBaseUrl: string | undefined = import.meta.env.VITE_API_URL || undefined;

export async function getApiHealth(base = apiBaseUrl, timeoutMs = 4000): Promise<ApiHealth> {
  if (!base) return { state: 'not-configured' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, { signal: controller.signal });
    if (!res.ok) return { state: 'offline', reason: `HTTP ${res.status}` };
    const body = (await res.json()) as { status?: string; version?: string };
    return body.status === 'ok'
      ? { state: 'online', version: body.version ?? 'unknown' }
      : { state: 'offline', reason: 'unexpected response' };
  } catch (err) {
    return { state: 'offline', reason: err instanceof Error ? err.name : 'network error' };
  } finally {
    clearTimeout(timer);
  }
}
