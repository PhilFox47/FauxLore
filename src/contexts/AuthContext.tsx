import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  role: string;
  profilePic?: string;
  bio?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
           throw new Error('Invalid session');
        }
      })
      .then(data => {
        setToken(storedToken);
        setUser(data.user);
        localStorage.setItem('fauxlore_user', JSON.stringify(data.user));
      })
      .catch((e) => {
        console.error(e);
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

  const logout = async () => {
    if (token) {
       await fetch('/api/auth/logout', { 
         method: 'POST',
         headers: { Authorization: `Bearer ${token}` }
       }).catch(() => {});
    }
    localStorage.removeItem('fauxlore_token');
    localStorage.removeItem('fauxlore_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
