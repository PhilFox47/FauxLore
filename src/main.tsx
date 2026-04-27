import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MediaProvider } from './contexts/MediaContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { MediaLibrary } from './pages/MediaLibrary';
import { Statistics } from './pages/Statistics';
import { Recaps } from './pages/Recaps';
import { Lorebook } from './pages/Lorebook';
import { Lorekeeper } from './pages/Lorekeeper';
import { Roulette } from './pages/Roulette';
import { Armory } from './pages/Armory';
import { Universes } from './pages/Universes';
import { Graveyard } from './pages/Graveyard';
import { ReleaseRadar } from './pages/ReleaseRadar';
import { Taxonomy } from './pages/Taxonomy';
import { Login } from './pages/Login';
import './index.css';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-100">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <MediaProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="library/:mediaType" element={<MediaLibrary />} />
              <Route path="stats" element={<Statistics />} />
              <Route path="recaps" element={<Recaps />} />
              <Route path="lorebook" element={<Lorebook />} />
              <Route path="lorekeeper" element={<Lorekeeper />} />
              <Route path="roulette" element={<Roulette />} />
              <Route path="armory" element={<Armory />} />
              <Route path="universes" element={<Universes />} />
              <Route path="graveyard" element={<Graveyard />} />
              <Route path="radar" element={<ReleaseRadar />} />
              <Route path="taxonomy" element={<Taxonomy />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </MediaProvider>
    </AuthProvider>
  </StrictMode>
);
