import test from 'node:test';
import assert from 'node:assert/strict';
import { importantPeopleNarrativeBrief, importantPeopleImageBrief, mentionedImportantPeople } from './importantPeople';
import { redactVisualSelfForDiagnostics } from './visualSelf';
import type { ImportantPerson } from './importantPeople';
import type { ProgressLog } from '../types/schema';

const person=(id:string,name:string,aliases:string[]=[],allowImages=true):ImportantPerson=>({
  id,name,aliases,allowImages,hasImage:true,
  relationship:'Friend from an online game',notes:'Known since 2023',
  appearance:'Long red hair with glasses',
});
const log=(id:string,note:string,thoughts:string):ProgressLog=>({
  id,mediaId:'game',timestamp:'2026-10-24T12:00:00Z',
  metricType:'playtimeHours',delta:2,note,thoughts,
});

test('exact name and nickname matches use word boundaries, not substrings or generic pronouns',()=>{
  const people=[person('leo','Leonie',['Leo']),person('anne','Anne')];
  assert.deepEqual(mentionedImportantPeople('Played with Leo in Eorzea',people).map(p=>p.id),['leo']);
  assert.deepEqual(mentionedImportantPeople('Played with LEONIE!',people).map(p=>p.id),['leo']);
  assert.deepEqual(mentionedImportantPeople('Leonardo met LEOs and an annex',people).map(p=>p.id),[]);
  assert.deepEqual(mentionedImportantPeople('Met Anne and Leo.',people).map(p=>p.id),['leo','anne']);
});

test('Recap context only includes people actually mentioned in Notes or Journals',()=>{
  const people=[person('leo','Leonie',['Leo']),person('alex','Alex')];
  const context=importantPeopleNarrativeBrief([log('a','Met with Leo','This made my week')],people);
  assert.match(context,/Leonie/);
  assert.match(context,/Friend from an online game/);
  assert.doesNotMatch(context,/Alex/);
  assert.match(context,/not a log of events|does not prove a meeting/i);
  assert.equal(importantPeopleNarrativeBrief([log('x','','Nothing about another person')],people),'');
});

test('Image guidance requires explicit name match and opt-in; diagnostics redact appearance and mapping',()=>{
  const leo=person('leo','Leonie',['Leo']);
  const blocked=person('alex','Alex',[],false);
  const none=importantPeopleImageBrief('A fictional character in the forest',[leo,blocked]);
  assert.deepEqual(none,{text:'',idsWithPhotos:[]});
  const yes=importantPeopleImageBrief('Leo and Alex share a moment',[leo,blocked]);
  assert.deepEqual(yes.idsWithPhotos,['leo']);
  assert.match(yes.text,/Long red hair/);
  assert.doesNotMatch(yes.text,/Alex/);
  const log=redactVisualSelfForDiagnostics(yes.text+'\n\nPRIVATE REFERENCE IMAGE ORDER (identity cues only; images are not evidence of an event):\nReference 1: "Leonie"\nEND PRIVATE REFERENCE IMAGE ORDER.');
  assert.doesNotMatch(log,/Leonie|Long red hair/);
  assert.match(log,/Private other-person appearance guidance redacted/);
  assert.match(log,/Private reference image mapping redacted/);
});
