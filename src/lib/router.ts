import { useEffect, useState } from 'react';

function read(): string[] {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function navigate(path: string): void {
  window.location.hash = `#/${path}`;
}

/** Minimal hash router: returns the path segments, e.g. ['play', 'w1d1', 'learn']. */
export function useRoute(): string[] {
  const [route, setRoute] = useState<string[]>(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
