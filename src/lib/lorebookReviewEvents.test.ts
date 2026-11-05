import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLorebookReviewEvents, type LorebookOpinionSnapshot } from './lorebookReviewEvents';
import { lorebookMonths } from './lorebookEditing';

function snapshot(id:number,mediaId:string,recordedAt:string,
  userRating:number|null,userReview:string|null): LorebookOpinionSnapshot {
  return {id,mediaId,recordedAt,userRating,userReview};
}

test('full-work reviews become dated timeline events without inventing progress sessions',()=>{
  const rows=[
    snapshot(2,'moon','2026-10-15T17:23:00Z',5,'The finale was worth the wait.\nIncredible.'),
    snapshot(1,'moon','2026-10-01T12:00:00Z',null,null),
    snapshot(3,'other','2026-10-18T12:00:00Z',4,'A solid standalone book.'),
  ];
  const events=buildLorebookReviewEvents(rows);
  assert.equal(events.length,2);
  assert.deepEqual(events.map(e=>[e.mediaId,e.kind,e.change]),[
    ['moon','review','recorded'],['other','review','recorded']]);
  assert.equal(events[0].ts,'2026-10-15T17:23:00Z');
  assert.match(events[0].review!,/Incredible/);
  assert.deepEqual(lorebookMonths([],events),['2026-10']);
});

test('updates, rating-only adjustments and removals retain original opinion chronology',()=>{
  const rows=[
    snapshot(1,'moon','2026-10-04T12:00:00Z',3,'Started slow'),
    snapshot(2,'moon','2026-10-05T12:00:00Z',4,'Started slow'),
    snapshot(3,'moon','2026-10-06T12:00:00Z',4,'A lovely ending'),
    snapshot(4,'moon','2026-10-07T12:00:00Z',null,'A lovely ending'),
    snapshot(5,'moon','2026-10-08T12:00:00Z',null,''),
    snapshot(6,'moon','2026-10-09T12:00:00Z',null,null),
  ];
  const events=buildLorebookReviewEvents(rows);
  assert.deepEqual(events.map(e=>[e.kind,e.change]),[
    ['review','recorded'],['rating','updated'],['review','updated'],
    ['rating','removed'],['review','removed']]);
  assert.equal(events[1].previousRating,3);
  assert.equal(events[1].rating,4);
  assert.equal(events[2].review,'A lovely ending');
  assert.equal(events[4].previousReview,'A lovely ending');
  assert.equal(events[4].review,null);
  assert.equal(events.length,5,'duplicate state must not create an event');
});

test('status-only changes and changes from another media do not duplicate reviews',()=>{
  const events=buildLorebookReviewEvents([
    snapshot(1,'game','2026-09-01T10:00:00Z',5,'Excellent'),
    snapshot(2,'book','2026-09-02T10:00:00Z',4,'Good book'),
    snapshot(3,'game','2026-09-03T10:00:00Z',5,'Excellent'),
    snapshot(4,'book','2026-09-04T10:00:00Z',4,'Good book'),
    snapshot(5,'book','invalid-date',5,'Ignore invalid timestamps'),
  ]);
  assert.equal(events.length,2);
  assert.deepEqual(events.map(e=>e.mediaId),['game','book']);
});

test('an imported historic review is placed on its first observed snapshot date, not on the media start date',()=>{
  const recordedAt='2026-11-05T12:00:00Z';
  const events=buildLorebookReviewEvents([snapshot(10,'legacy',recordedAt,5,'Old personal review')]);
  assert.equal(events[0].ts,recordedAt);
  assert.equal(events[0].change,'recorded');
  assert.deepEqual(lorebookMonths([],events),['2026-11']);
});
