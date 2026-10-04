// Minimal client-side routing for the app's two screens (the editor and
// /login). The project deliberately ships without a router dependency — the
// app shell is a single page, so all we need is History API navigation plus a
// way for components to observe it (see hooks/usePathname).

/** Path of the dedicated login / sign up page. */
export const LOGIN_PATH = '/login';

/** Current URL path, normalised to always start with a single "/". */
export function getPathname(): string {
  const path = window.location.pathname || '/';
  return path === '/' ? '/' : `/${path.replace(/^\/+/, '')}`;
}

export interface NavigateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
}

/**
 * Navigate to an in-app path without a full page reload. Back/forward stay
 * in sync because we dispatch `popstate`, the same event the History API
 * fires natively, so listeners cannot tell the two apart.
 */
export function navigate(to: string, options: NavigateOptions = {}): void {
  const target = to.startsWith('/') ? to : `/${to}`;
  if (getPathname() === target) return;
  if (options.replace) window.history.replaceState(null, '', target);
  else window.history.pushState(null, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
