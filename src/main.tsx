import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MediaProvider } from './contexts/MediaContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { Layout } from './components/Layout';
import './index.css';

// Route-level code splitting: each page (and its heavy deps — recharts, the
// large flavorTexts table, etc.) loads on demand instead of in the initial bundle.
const named = <T extends Record<string, any>>(p: Promise<T>, key: keyof T) => p.then((m) => ({ default: m[key] }));

const Dashboard = lazy(() => named(import('./pages/Dashboard'), 'Dashboard'));
const MediaLibrary = lazy(() => named(import('./pages/MediaLibrary'), 'MediaLibrary'));
const Statistics = lazy(() => named(import('./pages/Statistics'), 'Statistics'));
const Atlas = lazy(() => named(import('./pages/Atlas'), 'Atlas'));
const Recaps = lazy(() => named(import('./pages/Recaps'), 'Recaps'));
const TimeTravel = lazy(() => named(import('./pages/TimeTravel'), 'TimeTravel'));
const Lorebook = lazy(() => named(import('./pages/Lorebook'), 'Lorebook'));
const Lorekeeper = lazy(() => named(import('./pages/Lorekeeper'), 'Lorekeeper'));
const Roulette = lazy(() => named(import('./pages/Roulette'), 'Roulette'));
const Armory = lazy(() => named(import('./pages/Armory'), 'Armory'));
const Achievements = lazy(() => named(import('./pages/Achievements'), 'Achievements'));
const Universes = lazy(() => named(import('./pages/Universes'), 'Universes'));
const Graveyard = lazy(() => named(import('./pages/Graveyard'), 'Graveyard'));
const ReleaseRadar = lazy(() => named(import('./pages/ReleaseRadar'), 'ReleaseRadar'));
const Taxonomy = lazy(() => named(import('./pages/Taxonomy'), 'Taxonomy'));
const Login = lazy(() => named(import('./pages/Login'), 'Login'));

const PageLoader = () => (
  <div className="min-h-[60vh] w-full flex items-center justify-center text-zinc-500">
    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

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
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                  <Route index element={<Dashboard />} />
                  <Route path="library/:mediaType" element={<MediaLibrary />} />
                  <Route path="stats" element={<Statistics />} />
                  <Route path="atlas" element={<Atlas />} />
                  <Route path="recaps" element={<Recaps />} />
                  <Route path="time-travel" element={<TimeTravel />} />
                  <Route path="lorebook" element={<Lorebook />} />
                  <Route path="lorekeeper" element={<Lorekeeper />} />
                  <Route path="roulette" element={<Roulette />} />
                  <Route path="armory" element={<Armory />} />
                  <Route path="achievements" element={<Achievements />} />
                  <Route path="universes" element={<Universes />} />
                  <Route path="graveyard" element={<Graveyard />} />
                  <Route path="radar" element={<ReleaseRadar />} />
                  <Route path="taxonomy" element={<Taxonomy />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </MediaProvider>
    </AuthProvider>
  </StrictMode>
);
