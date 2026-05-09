import { useState, useMemo } from 'react';
import { MediaItem, Status, STATUSES } from '../types/schema';

export type SortOption = 'updatedAt' | 'createdAt' | 'titleAsc' | 'titleDesc' | 'rating';

export function useMediaFilterSort(mediaElements: MediaItem[], defaultStatus: Status | 'All' | Status[] = 'All') {
  const initialFilters: Status[] = defaultStatus === 'All' 
    ? [...STATUSES] 
    : (Array.isArray(defaultStatus) ? defaultStatus : [defaultStatus]);
    
  const [statusFilters, setStatusFilters] = useState<Status[]>(initialFilters);
  const [sortBy, setSortBy] = useState<SortOption>('updatedAt');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAndSortedMedia = useMemo(() => {
    let result = [...mediaElements];

    // 1. Status Filter
    if (statusFilters.length > 0) {
      result = result.filter(m => statusFilters.includes(m.status));
    }

    // 2. Search Filter

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => m.title.toLowerCase().includes(q));
    }

    // 3. Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'updatedAt':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'createdAt':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'titleAsc':
          return a.title.localeCompare(b.title);
        case 'titleDesc':
          return b.title.localeCompare(a.title);
        case 'rating':
          const aRating = a.userRating ?? a.reviewScore ?? 0;
          const bRating = b.userRating ?? b.reviewScore ?? 0;
          return bRating - aRating;
        default:
          return 0;
      }
    });

    return result;
  }, [mediaElements, statusFilters, sortBy, searchQuery]);

  return {
    statusFilters,
    setStatusFilters,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
    filteredAndSortedMedia,
  };
}
