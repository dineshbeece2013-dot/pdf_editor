import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ACCOUNTS_ENABLED } from './config';
import { EditorApp } from './EditorApp';
import { LoginPage } from './pages/LoginPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { RefundPolicyPage } from './pages/RefundPolicyPage';
import { ContactPage } from './pages/ContactPage';
import { usePathname } from './hooks/usePathname';
import { LOGIN_PATH, STATIC_PATHS, navigate } from './services/router';

function AppViews() {
  const pathname = usePathname();
  const { user } = useAuth();

  // The editor is always the landing page and is never behind a login wall.
  // /login is an opt-in page reached from the header's "Login / Sign Up"
  // button, shown only while nobody is signed in.
  const onLoginRoute = ACCOUNTS_ENABLED && pathname === LOGIN_PATH;

  // Policy and contact pages are readable whether or not anyone is signed in.
  const staticView = STATIC_PATHS.find((p) => p === pathname);

  // Already signed in and sitting on /login (e.g. opened it in a new tab):
  // send them back to the editor and tidy the URL up.
  useEffect(() => {
    if (onLoginRoute && user) navigate('/', { replace: true });
  }, [onLoginRoute, user]);

  if (onLoginRoute && !user) return <LoginPage />;

  if (staticView === '/privacy') return <PrivacyPage />;
  if (staticView === '/terms') return <TermsPage />;
  if (staticView === '/refund-policy') return <RefundPolicyPage />;
  if (staticView === '/contact') return <ContactPage />;

  // Every other route — including unknown ones — is the editor.
  return <EditorApp />;
}

function App() {
  return (
    <AuthProvider>
      <AppViews />
    </AuthProvider>
  );
}

export default App;
