import React, { useState, useRef, useEffect } from 'react';
import { Status, STATUSES } from '../types/schema';
import { Filter, ArrowUpDown, Check } from 'lucide-react';

interface FilterSortBarProps {
  statusFilters: Status[];
  setStatusFilters: (statuses: Status[]) => void;
  sortBy: string;
  setSortBy: (sort: string) => void;
}

export function FilterSortBar({ statusFilters, setStatusFilters, sortBy, setSortBy }: FilterSortBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleStatus = (status: Status) => {
    if (statusFilters.includes(status)) {
      setStatusFilters(statusFilters.filter(s => s !== status));
    } else {
      setStatusFilters([...statusFilters, status]);
    }
  };

  const toggleAll = () => {
    if (statusFilters.length === STATUSES.length) {
      setStatusFilters([]);
    } else {
      setStatusFilters([...STATUSES]);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      <div className="relative group flex-1" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-zinc-900 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-300 focus:outline-none focus:border-orange-500 hover:border-white/10 transition-colors cursor-pointer text-left flex items-center justify-between"
        >
          <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-hover:text-zinc-400 transition-colors" />
          <span className="truncate">
            {statusFilters.length === STATUSES.length ? 'All Statuses' : 
             statusFilters.length === 0 ? 'No Statuses' : 
             statusFilters.join(', ')}
          </span>
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-2 w-full bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-1">
              <button
                onClick={toggleAll}
                className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 rounded-lg transition-colors flex items-center space-x-2"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center ${statusFilters.length === STATUSES.length ? 'bg-orange-500 border-orange-500' : 'border-zinc-700 bg-zinc-800'}`}>
                  {statusFilters.length === STATUSES.length && <Check className="w-3 h-3 text-white" />}
                </div>
                <span>All Statuses</span>
              </button>
              
              <div className="h-px bg-white/10 my-1 mx-2" />

              {STATUSES.map(status => (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${statusFilters.includes(status) ? 'bg-orange-500 border-orange-500' : 'border-zinc-700 bg-zinc-800'}`}>
                    {statusFilters.includes(status) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span>{status}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative group flex-1">
        <ArrowUpDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-hover:text-zinc-400 transition-colors pointer-events-none" />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="w-full bg-zinc-900 border border-white/5 rounded-xl pl-9 pr-8 py-2 text-sm text-zinc-300 focus:outline-none focus:border-orange-500 appearance-none hover:border-white/10 transition-colors cursor-pointer"
        >
          <option value="updatedAt">Last Activity</option>
          <option value="createdAt">Date Added</option>
          <option value="titleAsc">Title (A-Z)</option>
          <option value="titleDesc">Title (Z-A)</option>
          <option value="rating">Highest Rated</option>
        </select>
      </div>
    </div>
  );
}
