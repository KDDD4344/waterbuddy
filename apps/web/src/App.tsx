import { useEffect, useState } from 'react';
import { getApiHealth, type ApiHealth } from './lib/api';
import { useOfflineReady } from './lib/offline';
import { isInstalled, isIos } from './lib/pwa';
import { PipInBottle } from './components/PipInBottle';
import './App.css';

type Check = { id: string; label: string; ok: boolean | null; detail: string };

function apiCheck(h: ApiHealth | null): Check {
  if (!h) return { id: 'api', label: 'Python server', ok: null, detail: 'Checking…' };
  if (h.state === 'online') return { id: 'api', label: 'Python server', ok: true, detail: `Online, version ${h.version}` };
  if (h.state === 'not-configured') return { id: 'api', label: 'Python server', ok: null, detail: 'Not connected in this build' };
  return { id: 'api', label: 'Python server', ok: false, detail: `Unreachable (${h.reason}). The app still works.` };
}

export default function App() {
  const offline = useOfflineReady();
  const [installed] = useState(isInstalled);
  const [health, setHealth] = useState<ApiHealth | null>(null);

  useEffect(() => {
    let alive = true;
    getApiHealth().then((h) => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, []);

  const checks: Check[] = [
    {
      id: 'install',
      label: 'Installed as an app',
      ok: installed ? true : null,
      detail: installed ? 'Running from your home screen' : isIos() ? 'Share, then “Add to Home Screen”' : 'Use your browser’s Install option'
    },
    {
      id: 'offline',
      label: 'Works offline',
      ok: offline ? true : null,
      detail: offline
        ? 'App saved on this device'
        : import.meta.env.DEV
          ? 'Switched off in development; on in the installed build'
          : 'Saving the app for offline use…'
    },
    apiCheck(health)
  ];

  return (
    <main className="shell">
      <header className="masthead">
        <p className="kicker">Phase 0 · foundations</p>
        <h1 className="wordmark">WaterBuddy</h1>
        <p className="tagline">Fill Pip&rsquo;s bottle today. Get a postcard tomorrow.</p>
      </header>

      <PipInBottle className="hero" />

      <section className="checks" aria-labelledby="checks-title">
        <h2 id="checks-title">Foundations check</h2>
        <ul>
          {checks.map((c) => (
            <li key={c.id} className="check" data-state={c.ok === true ? 'ok' : c.ok === false ? 'fail' : 'wait'}>
              <span className="mark" aria-hidden="true">
                {c.ok === true ? '✓' : c.ok === false ? '!' : '…'}
              </span>
              <span className="text">
                <span className="label">{c.label}</span>
                <span className="detail">{c.detail}</span>
              </span>
              <span className="sr-only">{c.ok === true ? 'Done.' : c.ok === false ? 'Problem.' : 'Not yet.'}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="foot">The tracker arrives in Phase 1. Pip and the tidepool arrive in Phase 2.</footer>
    </main>
  );
}
