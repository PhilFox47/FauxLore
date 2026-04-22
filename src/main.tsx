import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MediaProvider } from './contexts/MediaContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { MediaLibrary } from './pages/MediaLibrary';
import { Statistics } from './pages/Statistics';
import { Recaps } from './pages/Recaps';
import { Lorebook } from './pages/Lorebook';
import { Lorekeeper } from './pages/Lorekeeper';
import { Roulette } from './pages/Roulette';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MediaProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="library/:mediaType" element={<MediaLibrary />} />
            <Route path="stats" element={<Statistics />} />
            <Route path="recaps" element={<Recaps />} />
            <Route path="lorebook" element={<Lorebook />} />
            <Route path="lorekeeper" element={<Lorekeeper />} />
            <Route path="roulette" element={<Roulette />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MediaProvider>
  </StrictMode>
);
