import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FileText, Lock, Mail, User as UserIcon, ArrowRight } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const inputWrap = 'relative';
  const inputIcon = 'absolute left-3 top-1/2 -tranneutral-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none';
  const inputCls =
    'w-full pl-9 pr-3 py-2.5 text-sm border border-neutral-300 rounded-lg focus:border-emerald-500 focus:outline-none text-neutral-800 bg-white placeholder:text-neutral-400';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') {
        login(email, password);
      } else {
        if (name.trim().length < 2) throw new Error('Please enter your name.');
        if (password.length < 6) throw new Error('Password must be at least 6 characters.');
        register(name, email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const fillDemo = (e: string, p: string) => {
    setMode('login');
    setEmail(e);
    setPassword(p);
    setError('');
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
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                {mode === 'login' ? 'Sign in' : 'Create account'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
            <div className="mt-5 pt-4 border-t border-neutral-100">
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-2">
                Demo accounts
              </p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => fillDemo('admin@pdfpro.com', 'admin123')}
                  className="flex items-center justify-between px-3 py-2 bg-neutral-50 hover:bg-emerald-50 border border-neutral-200 rounded-lg text-xs text-neutral-600 transition-colors"
                >
                  <span>
                    <b>Admin</b> — admin@pdfpro.com / admin123
                  </span>
                  <span className="text-emerald-600 font-semibold">Use</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemo('user@pdfpro.com', 'user123')}
                  className="flex items-center justify-between px-3 py-2 bg-neutral-50 hover:bg-emerald-50 border border-neutral-200 rounded-lg text-xs text-neutral-600 transition-colors"
                >
                  <span>
                    <b>User</b> — user@pdfpro.com / user123
                  </span>
                  <span className="text-emerald-600 font-semibold">Use</span>
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 mt-3 leading-relaxed">
                Demo auth is stored locally in your browser — connect a real API for production use.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};