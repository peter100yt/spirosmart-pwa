// Roteamento simples por hash (#/rota).
import { useState, useEffect } from '../vendor/preact-htm.module.js';

export function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const parts = h.split('/').filter(Boolean).map(decodeURIComponent);
  return { path: '/' + parts.join('/'), parts };
}

export function navigate(path) {
  if (location.hash !== '#' + path) location.hash = path;
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash());
  useEffect(() => {
    let prev = parseHash();
    const on = () => {
      const r = parseHash();
      if (r.parts.slice(0, 2).join('/') !== prev.parts.slice(0, 2).join('/')) window.scrollTo(0, 0);
      prev = r;
      setRoute(r);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
