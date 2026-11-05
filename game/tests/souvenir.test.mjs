import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/souvenir.js', import.meta.url));
const { souvenirForPassage } = await import(`data:text/javascript;base64,${source.toString('base64')}`);

test('all six described moments have local, accessible artwork and a matching later choice', async () => {
  for (const name of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) {
    const route = name.toLowerCase(), flags = { companion: name, midpoint_route: route, bond };
    const card = souvenirForPassage(`moment_${route}_${bond}`, flags);
    assert.equal(card.path, `./assets/souvenir-${route}-${bond}.svg`);
    assert.ok(card.alt.length > 30);
    assert.equal(souvenirForPassage(`moment_${route}_${bond}_reply`, flags), card);
    assert.equal(souvenirForPassage('moment_caption', flags), card);
    assert.equal(souvenirForPassage('moment_choice', flags), card);
    const svg = await readFile(new URL(`../${card.path}`, import.meta.url), 'utf8');
    assert.match(svg, /^<svg\b/);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\bhref=/i);
  }
});
test('unrelated, later, missing and mismatched routes do not guess a card', () => {
  const flags = { companion: 'Mira', midpoint_route: 'mira', bond: 'play' };
  for (const node of ['opening', 'moment_mira_knight_name', 'moment_keep', 'moment_tear', 'shared_discovery']) {
    assert.equal(souvenirForPassage(node, flags), null);
  }
  assert.equal(souvenirForPassage('moment_choice', {}), null);
  assert.equal(souvenirForPassage('moment_caption', { ...flags, companion: 'Niko' }), null);
  assert.equal(souvenirForPassage('moment_choice', { ...flags, bond: 'other' }), null);
});
test('only the witnessed named-card passage closes the eye on the back', async () => {
  const flags = { companion: 'Mira', midpoint_route: 'mira', bond: 'play' };
  assert.equal(souvenirForPassage('moment_caption', flags).path, './assets/souvenir-mira-play.svg');
  const seen = { ...flags, named_card_seen: 'yes' };
  const closed = souvenirForPassage('moment_caption', seen);
  assert.equal(closed.path, './assets/souvenir-mira-play-closed.svg');
  assert.match(closed.alt, /back.*closed/i);
  assert.equal(souvenirForPassage('moment_choice', seen), closed);
  assert.equal(souvenirForPassage('moment_mira_play_reply', seen).path, './assets/souvenir-mira-play.svg');
  assert.equal(souvenirForPassage('moment_caption', { ...seen, companion: 'Ash' }), null);
  assert.equal(souvenirForPassage('moment_choice', { ...seen, midpoint_route: 'ash', companion: 'Ash' }).path, './assets/souvenir-ash-play.svg');
  const open = await readFile(new URL('../assets/souvenir-mira-play.svg', import.meta.url), 'utf8');
  const art = await readFile(new URL('../assets/souvenir-mira-play-closed.svg', import.meta.url), 'utf8');
  assert.match(art, /^<svg\b/);
  assert.ok(open.includes('<circle cx="96" cy="90" r="4"') && art.includes('<circle cx="96" cy="90" r="4"'), 'the visor eye remains open');
  assert.ok(open.includes('<circle cx="45" cy="58" r="8"') && !art.includes('<circle cx="45" cy="58" r="8"'), 'only the back eye loses its pupil');
});
