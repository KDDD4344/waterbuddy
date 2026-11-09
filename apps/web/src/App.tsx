import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Profile } from './data/db';
import { ToastProvider } from './ui/toast';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { History } from './screens/History';
import { You } from './screens/You';
import './ui.css';

type Tab = 'today' | 'history' | 'you';
const LOADING = Symbol('loading');

export default function App() {
  const profile = useLiveQuery(() => db.profile.get('me'), [], LOADING as unknown as Profile | undefined | typeof LOADING);
  return <ToastProvider>{profile === LOADING ? <Splash /> : profile ? <Main profile={profile} /> : <Onboarding />}</ToastProvider>;
}

function Splash() {
  return (
    <main className="screen splash" aria-busy="true">
      <p className="wordmark">WaterBuddy</p>
    </main>
  );
}

function Main({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>('today');
  return (
    <div className="app">
      {tab === 'today' && <Today profile={profile} />}
      {tab === 'history' && <History profile={profile} />}
      {tab === 'you' && <You profile={profile} />}
      <nav className="tabbar" aria-label="Main">
        <TabButton id="today" current={tab} onSelect={setTab} label="Today">
          <path d="M6 3h12l-1.5 17a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2z" />
          <path d="M6.5 11c2-1 3.5 1 5.5 0s3.5-1 5.5 0" />
        </TabButton>
        <TabButton id="history" current={tab} onSelect={setTab} label="History">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </TabButton>
        <TabButton id="you" current={tab} onSelect={setTab} label="You">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </TabButton>
      </nav>
    </div>
  );
}

function TabButton({ id, current, onSelect, label, children }: { id: Tab; current: Tab; onSelect: (t: Tab) => void; label: string; children: React.ReactNode }) {
  const active = id === current;
  return (
    <button type="button" className="tab" aria-current={active ? 'page' : undefined} onClick={() => onSelect(id)}>
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      {label}
    </button>
  );
}
