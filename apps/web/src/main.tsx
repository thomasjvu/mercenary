import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import faviconUrl from '@assets/boss-raid-pfp.png';
import { App } from './App';
import './styles/index.css';

function setFavicon(href: string) {
  const existing = document.querySelector<HTMLLinkElement>("link[rel='icon']");

  if (existing) {
    existing.href = href;
    existing.type = 'image/png';
    return;
  }

  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = href;
  document.head.appendChild(link);
}

setFavicon(faviconUrl);

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
