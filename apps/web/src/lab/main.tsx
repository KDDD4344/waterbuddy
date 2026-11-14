/** Hero Experience Lab entry (/lab/). Separate from the app: no service worker, no app data. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/young-serif/400.css';
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '../styles/global.css';
import './lab.css';
import HeroLab from './HeroLab';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <HeroLab />
  </StrictMode>
);
