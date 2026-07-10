'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  (typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || window.location.hostname === 'localhost')
    ? 'http://34.27.148.238:4000'
    : '');

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [theme, setThemeState] = useState('dark');
  const [globalDate, setGlobalDate] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('veyn_bi_token');
    const u = JSON.parse(localStorage.getItem('veyn_bi_user') || 'null');
    const th = localStorage.getItem('veyn_bi_theme') || 'dark';
    if (t) setToken(t);
    if (u) setUser(u);
    setThemeState(th);
  }, []);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light');
    } else {
      document.documentElement.classList.remove('theme-light');
    }
    localStorage.setItem('veyn_bi_theme', theme);
  }, [theme]);

  const login = useCallback(async (email, password) => {
    const res = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('veyn_bi_token', data.token);
    localStorage.setItem('veyn_bi_user', JSON.stringify(data.user));
  }, []);

  const logout = useCallback(() => {
    localStorage.clear();
    setToken(null);
    setUser(null);
  }, []);

  const apiFetch = useCallback(
    async (path, options = {}) => {
      const res = await fetch(API_BASE + path, {
        ...options,
        headers: {
          Authorization: 'Bearer ' + token,
          ...(options.headers || {}),
        },
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      return res.json();
    },
    [token]
  );

  return (
    <AuthContext.Provider value={{ token, user, login, logout, apiFetch, theme, setTheme: setThemeState, apiBase: API_BASE, globalDate, setGlobalDate }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
