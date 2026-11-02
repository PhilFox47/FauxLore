import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestLogStatus } from './logStatus';
import type { MediaItem } from '../types/schema';

const media = (overrides: Partial<MediaItem>): MediaItem => ({
  id: 'x', title: 'Example', mediaType: 'Book', status: 'Planning',
  genres: [], tags: [], tropes: [], createdAt: '', updatedAt: '',
  ...overrides,
});

test('Planning starts Active when some progress is logged; without progress status stays', () => {
  assert.equal(suggestLogStatus(media({mediaType:'Game'}), 1), 'Active');
  assert.equal(suggestLogStatus(media({mediaType:'Visual Novel'}), 1), 'Active');
  assert.equal(suggestLogStatus(media({mediaType:'Game'}), 0), 'Planning');
});

test('Games and visual novels never automatically become Completed', () => {
  assert.equal(suggestLogStatus(media({mediaType:'Game',status:'Active',playtimeHours:1000}),100), 'Active');
  assert.equal(suggestLogStatus(media({mediaType:'Visual Novel',status:'Active',playtimeHours:1000}),100), 'Active');
});

test('Film immediately Completed, books on known last page', () => {
  assert.equal(suggestLogStatus(media({mediaType:'Movie'}), 1), 'Completed');
  assert.equal(suggestLogStatus(media({status:'Active',pagesRead:120,totalPages:200}),79), 'Active');
  assert.equal(suggestLogStatus(media({status:'Active',pagesRead:120,totalPages:200}),80), 'Completed');
});

test('Ongoing shows Caught Up at available content, not finished forever', () => {
  assert.equal(suggestLogStatus(media({mediaType:'Series',status:'Active',episodesWatched:8,totalEpisodes:20,availableUnits:9,isOngoing:true}),1),'Caught Up');
  assert.equal(suggestLogStatus(media({mediaType:'Manga',status:'Active',chaptersRead:9,totalChapters:10,isOngoing:true}),1),'Caught Up');
  assert.equal(suggestLogStatus(media({mediaType:'Comic',status:'Active',issuesRead:4,totalIssues:5,isOngoing:true}),1),'Caught Up');
  assert.equal(suggestLogStatus(media({mediaType:'Series',status:'Active',episodesWatched:7,totalEpisodes:10}),3),'Completed');
  assert.equal(suggestLogStatus(media({mediaType:'Series',status:'Caught Up',episodesWatched:9,totalEpisodes:20,availableUnits:12,isOngoing:true}),1),'Active');
  assert.equal(suggestLogStatus(media({mediaType:'Series',status:'Caught Up',episodesWatched:9,totalEpisodes:20,availableUnits:12,isOngoing:true}),3),'Caught Up');
});

test('Audiobooks need explicit confirmed totalDurationHours, not averagePlaytime', () => {
  assert.equal(suggestLogStatus(media({mediaType:'Audiobook',status:'Active',playtimeHours:9,averagePlaytime:10}),1),'Active');
  assert.equal(suggestLogStatus(media({mediaType:'Audiobook',status:'Active',playtimeHours:9,totalDurationHours:10}),1),'Completed');
  assert.equal(suggestLogStatus(media({mediaType:'Audiobook',status:'Active',playtimeHours:9,totalDurationHours:10,isOngoing:true}),1),'Caught Up');
});

test('Historical entries never imply status and already completed works stay completed', () => {
  assert.equal(suggestLogStatus(media({mediaType:'Movie'}), 1, true),'Planning');
  assert.equal(suggestLogStatus(media({status:'Completed',mediaType:'Book',pagesRead:99,totalPages:100}),1),'Completed');
  assert.equal(suggestLogStatus(media({status:'Dropped',mediaType:'Game'}),5),'Dropped');
});
