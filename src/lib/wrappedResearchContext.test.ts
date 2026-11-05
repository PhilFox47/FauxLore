import test from 'node:test';
import assert from 'node:assert/strict';
import type { MediaItem, ProgressLog } from '../types/schema';
import { buildWrappedResearchContext, buildWrappedJourneyHistory } from './wrappedResearchContext';

const media = (id: string, universes: string[] = []): MediaItem => ({
  id, title: id, mediaType: 'Game', status: 'Active',
  genres: [], tags: [], tropes: [], franchises: universes,
  createdAt: '2024-01-01', updatedAt: '2026-11-05',
});
const log = (id: string, mediaId: string, date: string, thoughts = ''): ProgressLog => ({
  id, mediaId, timestamp: date, metricType: 'playtimeHours', delta: 2,
  thoughts, note: 'Issue 42', sessionEnjoyment: 4, location: 'Home',
});

test('October research receives every current and four-month log, but never November', () => {
  const allLogs = [
    log('first','ffxiv','2024-01-12T12:00:00Z','My first impression'),
    log('too-old','book','2026-03-14T12:00:00Z','Earlier this year'),
    log('recent','book','2026-09-14T12:00:00Z','September reflection'),
    log('current','ffxiv','2026-10-24T12:00:00Z','October mattered'),
    log('future','ffxiv','2026-11-04T12:00:00Z','Spoiler from November'),
    {...log('historic','book','2026-10-10T12:00:00Z','Imported'),isHistoric:true},
  ];
  const archive = buildWrappedResearchContext({
    timeframe:'month', timeId:'2026-10',
    periodStart:new Date('2026-10-01T00:00:00Z'),
    periodEnd:new Date('2026-10-31T23:59:59Z'),
    periodLogs:allLogs, allLogs,
    media:[media('ffxiv',['FFXIV']),media('book'),media('unplayed',['FFXIV'])],
    recaps:[
      {timeframe:'month',timeId:'2026-09',title:'September',data:{structured:{chapters:[{body:'Older published opinion'}]}}},
      {timeframe:'month',timeId:'2026-11',title:'November spoiler'},
      {timeframe:'year',timeId:'2026',title:'Overlapping full-year'},
      {timeframe:'week',timeId:'2026-W41',title:'Overlapping October week'},
    ],
  });
  assert.match(archive.currentLogs,/October mattered/);
  assert.doesNotMatch(archive.currentLogs,/Imported|Spoiler from November/);
  assert.match(archive.recentLogs,/September reflection/);
  assert.doesNotMatch(archive.recentLogs,/Earlier this year|Spoiler from November/);
  assert.deepEqual(archive.activeMediaIds,['ffxiv']);
  assert.match(archive.mediaDirectory,/ffxiv/);
  assert.doesNotMatch(archive.mediaDirectory,/unplayed/);
  assert.match(archive.previousRecaps,/Older published opinion/);
  assert.doesNotMatch(archive.previousRecaps,/November spoiler|Overlapping full-year|Overlapping October week/);
  const journey = JSON.parse(buildWrappedJourneyHistory(archive,['ffxiv','unplayed']));
  assert.equal(journey.length,1);
  assert.equal(journey[0].firstLogged,'2024-01-12T12:00:00Z');
  assert.equal(journey[0].completeLoggedJourney.length,2);
  assert.match(JSON.stringify(journey),/My first impression/);
  assert.doesNotMatch(JSON.stringify(journey),/Spoiler from November/);
});

test('related universe works provide their dated reflections without leaking unplayed entries',()=>{
  const past = log('historical','prequel','2020-02-03T12:00:00Z','I already loved this world');
  const october = log('present','sequel','2026-10-19T12:00:00Z','The return surprised me');
  const archive=buildWrappedResearchContext({
    timeframe:'month',timeId:'2026-10',
    periodStart:new Date('2026-10-01T00:00:00Z'),
    periodEnd:new Date('2026-10-31T23:59:59Z'),
    periodLogs:[october],allLogs:[past,october],
    media:[media('prequel',['World']),media('sequel',['World']),media('unplayed',['World'])],
    recaps:[],
  });
  const data=JSON.parse(buildWrappedJourneyHistory(archive,['sequel']));
  assert.equal(data[0].otherPreviouslyExperiencedUniverseMedia.length,1);
  assert.equal(data[0].otherPreviouslyExperiencedUniverseMedia[0].title,'prequel');
  assert.equal(data[0].otherPreviouslyExperiencedUniverseMedia[0].datedJournalThoughts[0].thoughts,'I already loved this world');
});

test('five previous recaps are included verbatim and only before the requested calendar period',()=>{
  const recaps=Array.from({length:7},(_,i)=>({
    timeframe:'month' as const,timeId:'2026-'+String(i+1).padStart(2,'0'),
    title:'Issue '+(i+1), summary:'Full original prose '+(i+1),
  }));
  const archive=buildWrappedResearchContext({
    timeframe:'month',timeId:'2026-08',
    periodStart:new Date('2026-08-01T00:00:00Z'),
    periodEnd:new Date('2026-08-31T23:59:59Z'),
    periodLogs:[log('now','a','2026-08-11T12:00:00Z')],
    allLogs:[log('now','a','2026-08-11T12:00:00Z')],
    media:[media('a')],recaps,
  });
  const stories=JSON.parse(archive.previousRecaps);
  assert.equal(stories.length,5);
  assert.equal(stories[0].title,'Issue 7');
  assert.equal(stories[4].title,'Issue 3');
  assert.equal(stories[0].story,'Full original prose 7');
});
