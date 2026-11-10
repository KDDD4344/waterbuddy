import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { offlineReady } from './lib/offline';
import { listenForInstallPrompt } from './lib/install';
// Self-hosted fonts, so the app looks right offline (precached by the service worker).
import '@fontsource/young-serif/400.css';
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '@fontsource/atkinson-hyperlegible-mono/500.css';
import '@fontsource/atkinson-hyperlegible-mono/600.css';
import '@fontsource/kalam/latin-400.css';
import './styles/global.css';

listenForInstallPrompt();

registerSW({
  immediate: true,
  onOfflineReady() {
    offlineReady.set(true);
  }
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
