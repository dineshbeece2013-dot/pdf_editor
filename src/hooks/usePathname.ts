import { useEffect, useState } from 'react';
import { getPathname } from '../services/router';

/**
 * Subscribe to the current URL path. Re-renders on browser back/forward and
 * on programmatic `navigate()` calls — both arrive as a `popstate` event.
 */
export function usePathname(): string {
  const [pathname, setPathname] = useState(getPathname);

  useEffect(() => {
    const sync = () => setPathname(getPathname());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return pathname;
}

export default usePathname;
