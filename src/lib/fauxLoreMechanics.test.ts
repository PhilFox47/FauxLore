import test from 'node:test';
import assert from 'node:assert/strict';
import { getPersonaDescription } from './personas';
import { FAUXLORE_MECHANICS_CONTEXT, FAUXLORE_BOSS_ATTRIBUTION, FAUXLORE_SESSION_CONTEXT, FAUXLORE_ITEM_ATTRIBUTION } from './fauxLoreMechanics';

test('every configured narrative persona receives the same game-mechanics contract', () => {
  for (const id of ['witty','dungeon-system','paul','mystic','archivist','noir','cyberpunk']) {
    const system = getPersonaDescription(id);
    assert.ok(system.includes(FAUXLORE_MECHANICS_CONTEXT), id);
    assert.match(system, /automatic.*DEFEATED|automatically marked DEFEATED/i);
    assert.match(system, /without finishing its medium/i);
    assert.match(system, /NOT an intentional fight/i);
    assert.match(system, /NOT personal journal opinions/i);
    assert.match(system, /LOOT AND ARMORY/i);
    assert.match(system, /ESTIMATED from pages/i);
    assert.match(system, /Atlas groups/i);
  }
});

test('Dungeon persona is the independent authority, not a show announcer', () => {
  const voice = getPersonaDescription('dungeon-system').split('FAUXLORE CANONICAL MECHANICS')[0];
  assert.match(voice, /You are the authority itself/i);
  assert.match(voice, /Never invoke organizers/i);
  assert.match(voice, /Your factual interpretation may NOT/i);
  assert.match(voice, /genuinely impresses you/i);
});

test('short form prompts preserve their own accurate semantics', () => {
  assert.match(FAUXLORE_SESSION_CONTEXT, /one.*question/i);
  assert.match(FAUXLORE_SESSION_CONTEXT, /not feelings/i);
  assert.match(FAUXLORE_BOSS_ATTRIBUTION, /NOT a character intentionally attacked/i);
  assert.match(FAUXLORE_BOSS_ATTRIBUTION, /DOES NOT require finishing the medium/i);
  assert.match(FAUXLORE_ITEM_ATTRIBUTION, /not a real object/i);
  assert.match(FAUXLORE_MECHANICS_CONTEXT, /Quests do not|do not presume the user chose/i);
});
