import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ACCOUNTS_ENABLED } from './config';
import { EditorApp } from './EditorApp';
import { LoginPage } from './pages/LoginPage';
import { usePathname } from './hooks/usePathname';
import { LOGIN_PATH, navigate } from './services/router';

function AppViews() {
  const pathname = usePathname();
  const { user } = useAuth();

  // The editor is always the landing page and is never behind a login wall.
  // /login is an opt-in page reached from the header's "Login / Sign Up"
  // button, shown only while nobody is signed in.
  const onLoginRoute = ACCOUNTS_ENABLED && pathname === LOGIN_PATH;

  // Already signed in and sitting on /login (e.g. opened it in a new tab):
  // send them back to the editor and tidy the URL up.
  useEffect(() => {
    if (onLoginRoute && user) navigate('/', { replace: true });
  }, [onLoginRoute, user]);

  if (onLoginRoute && !user) return <LoginPage />;

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
