import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProgressLog } from '../types/schema';
import { groupLogsIntoSessions } from './sessions';
import {
  isJournalWritten, lorebookMonths, lorebookMonth, lorebookReviewProgress, lorebookSessionRatings,
  lorebookDraftChanges, lorebookDraftFromLog, isLorebookDraftDirty,
  matchesLorebookReflectionFilter,
} from './lorebookEditing';
import { LorebookLogEditor } from '../components/LorebookLogEditor';

const make=(id:string,overrides:Partial<ProgressLog>={}):ProgressLog=>({
  id,mediaId:'ffxiv',metricType:'playtimeHours',delta:7.5,
  timestamp:'2026-10-25T15:45:30.123Z',
  note:'Played with Leo',thoughts:'',sessionEnjoyment:null,
  sessionImpact:null,moodlets:[],location:'PC Room',...overrides,
});

test('month jumping uses real calendar months and excludes unknown import placeholders',()=>{
  const logs=[make('a'),make('b',{timestamp:'2026-09-28T12:00:00Z'}),
    make('c',{timestamp:'1970-01-01T00:00:00Z'})];
  assert.deepEqual(lorebookMonths(logs),['2026-10','2026-09']);
  assert.equal(lorebookMonth(logs[0].timestamp),'2026-10');
});

test('month review counts distinguish substantive Journal Thoughts from optional impact and Moodlets',()=>{
  const logs=[
    make('a',{thoughts:'A deeply moving experience.',sessionEnjoyment:4,sessionImpact:5,moodlets:['moving','social']}),
    make('b',{thoughts:'',note:'Chapters 4 to 6',moodlets:['distracted']}),
    make('c',{metricType:'statusChange',delta:0,note:'Status changed from Active to Completed'}),
  ];
  assert.deepEqual(lorebookReviewProgress(logs),{
    total:2,journals:1,enjoyment:1,impact:1,moodlets:2,
  });
  assert.equal(matchesLorebookReflectionFilter(logs[0],'needs-journal'),false);
  assert.equal(matchesLorebookReflectionFilter(logs[1],'needs-journal'),true);
  assert.equal(matchesLorebookReflectionFilter(logs[2],'needs-journal'),false);
  assert.equal(matchesLorebookReflectionFilter(logs[0],'has-journal'),true);
  assert.equal(matchesLorebookReflectionFilter(logs[2],'all'),true);
  assert.equal(isJournalWritten(logs[0]),true);
});

test('reflection-only save never modifies tracked progress, time, note, place or historical state',()=>{
  const original=make('october',{isHistoric:true});
  const draft=lorebookDraftFromLog(original);
  assert.equal(isLorebookDraftDirty(original,draft),false);
  const revised={...draft,thoughts:'A surprising and powerful time with the FC.',
    impact:5,moodlets:['social','moving'] as typeof draft.moodlets,enjoyment:4};
  assert.equal(isLorebookDraftDirty(original,revised),true);
  assert.deepEqual(lorebookDraftChanges(original,revised),{
    thoughts:'A surprising and powerful time with the FC.',
    sessionEnjoyment:4,sessionImpact:5,moodlets:['social','moving'],
  });
});

test('clear ratings and Journal Thoughts explicitly, but leave Notes as Notes',()=>{
  const original=make('october',{thoughts:'Original journal.',sessionEnjoyment:5,
    sessionImpact:4,moodlets:['moving']});
  const draft={...lorebookDraftFromLog(original),thoughts:'',enjoyment:null,impact:null,moodlets:[]};
  assert.deepEqual(lorebookDraftChanges(original,draft),{
    thoughts:'',sessionEnjoyment:null,sessionImpact:null,moodlets:[],
  });
});

test('optional metadata editor validates numeric progress and local date/time before applying',()=>{
  const original=make('metadata');
  const draft=lorebookDraftFromLog(original);
  assert.ok(!('timestamp' in lorebookDraftChanges(original,{...draft,thoughts:'new insight'})));
  assert.throws(()=>lorebookDraftChanges(original,{...draft,delta:''}),/Progress/);
  assert.throws(()=>lorebookDraftChanges(original,{...draft,delta:'NaN'}),/Progress/);
  assert.throws(()=>lorebookDraftChanges(original,{...draft,date:'2026-02-30'}),/valid date and time/);
  const patch=lorebookDraftChanges(original,{...draft,delta:'8',notes:'Issue 19',location:'Train'});
  assert.deepEqual(patch,{delta:8,note:'Issue 19',location:'Train'});
  assert.throws(()=>lorebookDraftChanges(original,{...draft,thoughts:'a'.repeat(6001)}),/6,000/);
});

test('merged session preserves independent edit targets, no accidental bulk update to adjacent log',()=>{
  const a=make('oct25-1');
  const b=make('oct25-2',{timestamp:'2026-10-25T16:12:30.123Z',thoughts:'An existing reflection'});
  const sessions=groupLogsIntoSessions([a,b]);
  assert.equal(sessions.length,1);
  assert.equal(sessions[0].logs.length,2);
  const newFirst={...lorebookDraftFromLog(a),thoughts:'First log only'};
  const change=lorebookDraftChanges(a,newFirst);
  assert.deepEqual(change,{thoughts:'First log only'});
  assert.equal(b.thoughts,'An existing reflection');
});

test('inline editor visibly distinguishes Journals, Notes, session signals and optional technical details',()=>{
  const log=make('oct25');
  const markup=renderToStaticMarkup(createElement(LorebookLogEditor,{
    log,draft:lorebookDraftFromLog(log),
    onChange:()=>{},onSave:()=>{},onCancel:()=>{},
    saving:false,dirty:false,error:null,locations:['Train','PC Room'],
  }));
  assert.match(markup,/Journal Thoughts/);
  assert.match(markup,/personal reflection/);
  assert.match(markup,/Notes &amp; log details/);
  assert.match(markup,/organizational/);
  assert.match(markup,/Session impact/);
  assert.match(markup,/Quick Moodlets/);
  assert.match(markup,/Saving|Save log/);
  assert.match(markup,/disabled/);
  assert.match(markup,/PC Room/);
});

test('Lorebook cards display Enjoyment and Impact independently and never turn missing ratings into zero',()=>{
  assert.deepEqual(lorebookSessionRatings([make('unrated')]),{enjoyment:null,impact:null});
  assert.deepEqual(lorebookSessionRatings([make('a',{sessionEnjoyment:4,sessionImpact:2})]),{
    enjoyment:{value:4,ratedLogs:1},
    impact:{value:2,ratedLogs:1},
  });
  const grouped=[
    make('first',{sessionEnjoyment:2,sessionImpact:null}),
    make('second',{sessionEnjoyment:5,sessionImpact:4}),
    make('third',{sessionEnjoyment:null,sessionImpact:1}),
  ];
  assert.deepEqual(lorebookSessionRatings(grouped),{
    enjoyment:{value:5,ratedLogs:2},
    impact:{value:4,ratedLogs:2},
  });
  assert.deepEqual(lorebookReviewProgress(grouped),{
    total:3,journals:0,enjoyment:2,impact:2,moodlets:0,
  });
});
