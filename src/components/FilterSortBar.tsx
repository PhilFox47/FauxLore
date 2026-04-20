import React from 'react';
import { Status } from '../types/schema';
import { Filter, ArrowUpDown } from 'lucide-react';

interface FilterSortBarProps {
  statusFilter: Status | 'All';
  setStatusFilter: (status: Status | 'All') => void;
  sortBy: string;
  setSortBy: (sort: string) => void;
}

export function FilterSortBar({ statusFilter, setStatusFilter, sortBy, setSortBy }: FilterSortBarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      <div className="relative group flex-1">
        <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-hover:text-zinc-400 transition-colors pointer-events-none" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | 'All')}
          className="w-full bg-zinc-900 border border-white/5 rounded-xl pl-9 pr-8 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 appearance-none hover:border-white/10 transition-colors cursor-pointer"
        >
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Planning">Planning</option>
          <option value="On Hold">On Hold</option>
          <option value="Completed">Completed</option>
          <option value="Dropped">Dropped</option>
        </select>
      </div>

      <div className="relative group flex-1">
        <ArrowUpDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-hover:text-zinc-400 transition-colors pointer-events-none" />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="w-full bg-zinc-900 border border-white/5 rounded-xl pl-9 pr-8 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 appearance-none hover:border-white/10 transition-colors cursor-pointer"
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
