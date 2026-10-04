import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FileText, Lock, Mail, User as UserIcon, ArrowRight } from 'lucide-react';
import { navigate } from '../services/router';
import { messageFor } from '../services/api';

export const LoginPage: React.FC = () => {
  const { login, register, passwordMinLength } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const inputWrap = 'relative';
  const inputIcon = 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none';
  const inputCls =
    'w-full pl-9 pr-3 py-2.5 text-sm border border-neutral-300 rounded-lg focus:border-emerald-500 focus:outline-none text-neutral-800 bg-white placeholder:text-neutral-400';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (name.trim().length < 2) throw new Error('Please enter your name.');
        if (password.length < passwordMinLength) {
          throw new Error(`Password must be at least ${passwordMinLength} characters.`);
        }
        await register(name, email, password);
      }
      // Signed in — hand the user back to the editor, which is the landing page.
      navigate('/');
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const tabCls = (active: boolean) =>
    'flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ' +
    (active ? 'bg-white text-emerald-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-700');

  return (
    <div className="h-screen w-full overflow-y-auto bg-gradient-to-br from-neutral-900 via-neutral-800 to-emerald-900">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2.5 mb-6 text-white">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold">
              PDF <span className="text-emerald-400">Editor</span>
            </span>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
            <h1 className="text-xl font-bold text-neutral-800">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-sm text-neutral-500 mt-1 mb-5">
              {mode === 'login'
                ? 'Sign in to continue editing PDFs.'
                : 'Register to start editing PDFs for free.'}
            </p>

            <div className="flex bg-neutral-100 rounded-lg p-1 mb-5">
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className={tabCls(mode === 'login')}>
                Sign in
              </button>
              <button type="button" onClick={() => { setMode('register'); setError(''); }} className={tabCls(mode === 'register')}>
                Create account
              </button>
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-3">
              {mode === 'register' && (
                <div className={inputWrap}>
                  <UserIcon className={inputIcon} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className={inputCls}
                    autoComplete="name"
                  />
                </div>
              )}
              <div className={inputWrap}>
                <Mail className={inputIcon} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className={inputCls}
                  autoComplete="email"
                  required
                />
              </div>
              <div className={inputWrap}>
                <Lock className={inputIcon} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className={inputCls}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? passwordMinLength : undefined}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                {busy
                  ? mode === 'login'
                    ? 'Signing in…'
                    : 'Creating account…'
                  : mode === 'login'
                    ? 'Sign in'
                    : 'Create account'}
                {!busy && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            <p className="mt-4 text-center text-[11px] leading-relaxed text-neutral-400">
              You can keep editing as a guest — an account is only needed to
              subscribe to Pro.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-2 w-full text-center text-xs font-semibold text-neutral-500 hover:text-emerald-700 transition-colors"
            >
              Back to the editor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};