import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceWrappedFinale, evaluateWrappedFinale, finaleModes } from './wrappedFinale';
import { normalizeWrappedStory } from '../services/wrappedAi';
import { validateStory } from '../../server/routes/wrapped';
import { wrappedVisualDirectorBrief } from '../services/wrappedVisualDirector';
import { buildWrappedClosingTableauPrompt } from './wrappedSceneArt';
import type { WrappedEvidence } from './wrappedEvidence';
import type { MediaItem } from '../types/schema';

const evidence: WrappedEvidence = {
  timeframe:'month',timeId:'2026-09',bounds:{start:'2026-09-01',end:'2026-09-30'},
  facts:[
    {id:'journal-endwalker',kind:'journal',mediaId:'ffxiv',title:'User journal: Endwalker',
      quote:'Finished Endwalker with the entire Free Company on Discord. A core memory.',
      evidence:'On Sep 27: Finished Endwalker with the entire Free Company on Discord. A core memory.'},
    {id:'session-resonance-ffxiv',kind:'insight',title:'Session impact',mediaId:'ffxiv',
      evidence:'User-rated impact 5/5, Moving and Social'},
    {id:'overview',kind:'rhythm',title:'Period totals',evidence:'200 Master Pages, 16 logged titles'},
    {id:'taste-1',kind:'taste',title:'Different from critics',evidence:'A large real critic disagreement',
      mediaId:'game'},
  ],
  media:[],editorialSalience:'',editorialCalibration:'',
};
const media:MediaItem[]=[{id:'ffxiv',title:'Final Fantasy XIV',mediaType:'Game',status:'Active',
  genres:[],tags:[],tropes:[],createdAt:'2026-01-01',updatedAt:'2026-11-01'}];
const design = {layout:'editorial',palette:'rose',visual:'auto',align:'left',mediaIds:[]};
const interior = {kind:'insight',editorialJob:'verdict',title:'A virtual ending with very real company',
  thesis:'A fictional finale became a real-life community milestone through the Free Company gathering.',
  body:'A final story chapter became a lasting real-life memory because the entire FC joined together.',
  evidenceIds:['journal-endwalker','session-resonance-ffxiv'],design};
const ending = (mode: string, title='The dungeon submits its complaint') => ({
  kind:'closing',editorialJob:'payoff',finaleMode:mode,
  finalePayoff:'The AI objects to humanity calling a video-game finale fictional when the players brought very real friendships to witness it.',
  title,body:'I was prepared to mock an ordinary game milestone. Instead the whole Free Company turned up to make fiction into a genuine shared memory. Most inconvenient. My verdict: reality has been successfully invaded by Eorzea.',
  evidenceIds:['journal-endwalker'],design,
});
const draft = (close:any=ending('ruthless-roast'),middle:any[]= [interior]) => ({
  title:'A very inconvenient ending',dek:'Even fictional worlds can contain real friendships.',
  scenes:[
    {kind:'opening',title:'The computer was still on',body:'A suspicious evening appears in the log.',
      evidenceIds:[],design},
    ...middle,close,
  ],
});

test('finale accepts distinct tonal choices without imposing sentimental closure',()=>{
  for(const mode of finaleModes){
    const check=evaluateWrappedFinale(draft(ending(mode)).scenes,evidence);
    assert.equal(check.acceptable,true,mode+': '+check.reason);
  }
  assert.equal(evaluateWrappedFinale(draft(ending('bad-mode')).scenes,evidence).acceptable,false);
  const wrapped=normalizeWrappedStory(enforceWrappedFinale(draft(),evidence),evidence,media);
  const final=wrapped.scenes.at(-1)!;
  assert.equal(final.finaleMode,'ruthless-roast');
  assert.match(final.finalePayoff||'',/fictional/);
  const saved=validateStory(wrapped,'month');
  assert.equal(saved.scenes.at(-1)?.finaleMode,'ruthless-roast');
  assert.match(saved.scenes.at(-1)?.finalePayoff||'',/AI objects/);
  const brief=wrappedVisualDirectorBrief(wrapped);
  assert.match(brief,/"finaleMode":"ruthless-roast"/);
  assert.match(brief,/FINALE IS NOT ALWAYS TENDER/);
  const image=buildWrappedClosingTableauPrompt(wrapped,final,null);
  assert.match(image,/CHOSEN FINALE MODE: ruthless-roast/);
  assert.match(image,/visual accusation|comedic payoff/i);
  assert.doesNotMatch(image,/ONE clear emotional resolution|completion and afterglow/);
});

test('editorial originality is the AI editors judgment, not banned stock phrases',()=>{
  for(const title of ['Leave the light on','Until Next Time','The seam remains']){
    assert.equal(evaluateWrappedFinale(draft(ending('earned-sincerity',title)).scenes,evidence).acceptable,true);
  }
  assert.equal(evaluateWrappedFinale(draft({
    ...ending('sharp-reversal'),
    body:'The story is not over. The light stays on for another chapter.',
  }).scenes,evidence).acceptable,true);
});

test('closing cannot fabricate a factual anchor or pay off a deleted subplot',()=>{
  assert.equal(evaluateWrappedFinale(draft({...ending('dungeon-verdict'),evidenceIds:['fabricated']}).scenes,evidence).acceptable,false);
  assert.equal(evaluateWrappedFinale(draft({...ending('dungeon-verdict'),evidenceIds:['taste-1']}).scenes,evidence).acceptable,false);
  assert.throws(()=>enforceWrappedFinale(draft({...ending('dungeon-verdict'),finalePayoff:'Meh'}),evidence),/Weak Wrapped finale/);
  // AI critic, not lexical token overlap, decides whether an ending repeats a thesis.
  assert.equal(evaluateWrappedFinale(draft({
    ...ending('dungeon-verdict'),finalePayoff:interior.thesis,
  }).scenes,evidence).acceptable,true);
});

test('legacy stored closings still load, restyle and retain existing text unchanged',()=>{
  const legacy=draft({...ending('dungeon-verdict'),finaleMode:undefined,finalePayoff:undefined,evidenceIds:[]});
  const wrapped=normalizeWrappedStory(legacy,evidence,media);
  assert.equal(wrapped.scenes.at(-1)?.finaleMode,undefined);
  assert.equal(validateStory(wrapped,'month').scenes.length,3);
});
