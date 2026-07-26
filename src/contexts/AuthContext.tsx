import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  role: string;
  profilePic?: string;
  bio?: string;
}

interface Impersonation {
  byUserId: string;
  byUsername: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isLoading: boolean;
  /** Set while an admin is viewing another account. */
  impersonating: Impersonation | null;
  impersonate: (userId: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
  impersonating: null,
  impersonate: async () => {},
  stopImpersonating: async () => {},
});

// Where the admin's own session is parked while they view another account.
const ADMIN_TOKEN_KEY = 'fauxlore_admin_token';
const ADMIN_USER_KEY = 'fauxlore_admin_user';

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonating, setImpersonating] = useState<Impersonation | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('fauxlore_token');
    const storedUser = localStorage.getItem('fauxlore_user');

    if (storedToken && storedUser) {
      // Validate token with backend
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` }
      })
      .then(res => {
        if (res.ok) {
           return res.json();
        } else {
           localStorage.removeItem('fauxlore_token');
           localStorage.removeItem('fauxlore_user');
           return null;
        }
      })
      .then(data => {
        if (data) {
          setToken(storedToken);
          setUser(data.user);
          setImpersonating(data.impersonating || null);
          localStorage.setItem('fauxlore_user', JSON.stringify(data.user));
        }
      })
      .catch((e) => {
        console.error("Session verification failed", e);
        localStorage.removeItem('fauxlore_token');
        localStorage.removeItem('fauxlore_user');
      })
      .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('fauxlore_token', newToken);
    localStorage.setItem('fauxlore_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  /** Admin: open a session as another user, parking the admin session for later. */
  const impersonate = async (userId: string) => {
    const res = await fetch(`/api/users/${userId}/impersonate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || 'Failed to view as user');
    }
    const data = await res.json();
    // Keep the admin's own credentials so returning doesn't require a re-login.
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    if (user) localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));

    localStorage.setItem('fauxlore_token', data.token);
    localStorage.setItem('fauxlore_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setImpersonating(data.impersonating || null);
  };

  /** Return to the admin account, ending the impersonated session. */
  const stopImpersonating = async () => {
    const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
    const adminUser = localStorage.getItem(ADMIN_USER_KEY);

    // Drop the impersonated session server-side so it can't linger.
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    setImpersonating(null);

    if (adminToken && adminUser) {
      localStorage.setItem('fauxlore_token', adminToken);
      localStorage.setItem('fauxlore_user', adminUser);
      setToken(adminToken);
      setUser(JSON.parse(adminUser));
    } else {
      // No parked session (e.g. storage cleared): fall back to signing out.
      localStorage.removeItem('fauxlore_token');
      localStorage.removeItem('fauxlore_user');
      setToken(null);
      setUser(null);
    }
  };

  const logout = async () => {
    if (token) {
       await fetch('/api/auth/logout', { 
         method: 'POST',
         headers: { Authorization: `Bearer ${token}` }
       }).catch(() => {});
    }
    localStorage.removeItem('fauxlore_token');
    localStorage.removeItem('fauxlore_user');
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    setToken(null);
    setUser(null);
    setImpersonating(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading, impersonating, impersonate, stopImpersonating }}>
      {children}
    </AuthContext.Provider>
  );
};
