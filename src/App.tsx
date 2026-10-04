import { AuthProvider, useAuth } from './context/AuthContext';
import { AUTH_ENABLED } from './config';
import { EditorApp } from './EditorApp';
import { LoginPage } from './pages/LoginPage';

function AppViews() {
  const { user } = useAuth();

  // Login gate — when enabled, users are gated behind login page.
  if (AUTH_ENABLED && !user) return <LoginPage />;
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
