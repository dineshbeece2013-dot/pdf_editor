import React, { createContext, useContext, useMemo, useState } from 'react';
import { AUTH_ENABLED } from '../config';
import {
  type AppUser,
  clearSession,
  createUser,
  findUserByEmail,
  getSessionUserId,
  listUsers,
  seedUsers,
  setSessionUserId,
} from '../services/localAuth';

// Idempotent — seeds the demo admin/user accounts on first load.
seedUsers();

interface AuthContextValue {
  user: AppUser | null;
  login: (email: string, password: string) => AppUser;
  register: (name: string, email: string, password: string) => AppUser;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(() => {
    // Login disabled for now: fall back to a default session so the editor
    // opens without a sign-in step (no admin dashboard exists anymore).
    if (!AUTH_ENABLED) {
      const all = listUsers();
      return all.find((u) => u.role === 'admin') ?? all[0] ?? null;
    }
    const id = getSessionUserId();
    if (!id) return null;
    return listUsers().find((u) => u.id === id) ?? null;
  });

  const login = (email: string, password: string): AppUser => {
    const found = findUserByEmail(email);
    if (!found || found.password !== password) {
      throw new Error('Invalid email or password.');
    }
    setSessionUserId(found.id);
    setUser(found);
    return found;
  };

  const register = (name: string, email: string, password: string): AppUser => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) throw new Error('Email is required.');
    if (findUserByEmail(normalized)) {
      throw new Error('An account with this email already exists.');
    }
    const created = createUser({ name: name.trim(), email: normalized, password });
    setSessionUserId(created.id);
    setUser(created);
    return created;
  };

  const logout = (): void => {
    // No-op while the login gate is off — there is nowhere to log out to.
    if (!AUTH_ENABLED) return;
    clearSession();
    setUser(null);
  };

  const value = useMemo(() => ({ user, login, register, logout }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};