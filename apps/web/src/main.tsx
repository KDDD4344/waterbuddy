import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { offlineReady } from './lib/offline';
import './styles/global.css';

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
