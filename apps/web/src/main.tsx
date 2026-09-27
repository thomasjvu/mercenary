import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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

setFavicon('/boss-raid-pfp.png');

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
