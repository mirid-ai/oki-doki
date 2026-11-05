#!/usr/bin/env node
// Extract only committed authored text. Never load a save or a player's input.
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleText = async file => import(`data:text/javascript;base64,${(await readFile(path.join(root, file))).toString('base64')}`);
const narrative = await moduleText('src/story-next.js');
const { castSpeech } = await moduleText('src/voice-cues.js');
const voices = { Narrator: 'af_heart', You: 'af_sarah', Service: 'af_nicole', Niko: 'am_adam', Mira: 'af_bella', Ash: 'bm_george', Mallow: 'bf_emma' };
const catalog = new Map();
const skipped = [];
function add(speaker, raw, origin) {
  if (typeof raw !== 'string' || !raw.trim()) return;
  const text = raw.trim();
  if (/\{[^}]+\}/.test(text)) { skipped.push(origin); return; }
  const voice = voices[speaker];
  if (!voice) throw new Error(`Unknown speaker ${speaker} at ${origin}`);
  const key = JSON.stringify([speaker, voice, text]);
  if (!catalog.has(key)) catalog.set(key, { key, speaker, voice, text, origin });
}
function passage(id, speaker, text, origin) {
  if (typeof text !== 'string') return;
  for (const part of castSpeech(id, speaker, text)) add(part.speaker, part.text, origin);
}
for (const [id, node] of Object.entries(narrative.story)) {
  passage(id, node.speaker, node.text, `story:${id}`);
  if (node.ai?.fallback) passage(id, node.speaker, node.ai.fallback, `fallback:${id}`);
  for (const choice of node.choices || []) add('You', choice.label, `choice:${id}`);
  if (node.input) {
    add('Narrator', node.input.prompt, `input-prompt:${id}`);
    add('Narrator', node.input.placeholder, `input-placeholder:${id}`);
    add('You', node.input.default, `input-default:${id}`);
  }
}
// Written exchange pairs are authored constants in app.js. Parse only that
// literal inside an empty, time-limited VM; no browser state or user data.
const app = await readFile(path.join(root, 'src/app.js'), 'utf8');
const marker = 'const writtenExchanges = ';
const start = app.indexOf(marker);
const end = app.indexOf('\nlet selectedWrittenExchange', start);
if (start < 0 || end < 0) throw new Error('Could not locate authored exchanges');
const literal = app.slice(start + marker.length, end).trim().replace(/;$/, '');
const exchanges = runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 });
for (const [id, pairs] of Object.entries(exchanges)) {
  const replyNode = narrative.story[narrative.story[id]?.input?.next];
  if (!replyNode?.speaker) throw new Error(`Unknown authored reply speaker at ${id}`);
  for (const [prompt, reply] of pairs) {
    add('You', prompt, `exchange-prompt:${id}`);
    add(replyNode.speaker, reply, `exchange-reply:${id}`);
  }
}
for (const text of ['WELCOME TO OKI DOKI', 'A lovely place to begin.', 'Dating is fun, internet simulations are safe and happy and healthy.', 'Data tracking is ethical and cookies are a great idea.', 'Click here if you agree and to continue.']) add('Narrator', text, 'opening-ui:narration');
add('You', 'I agree', 'opening-ui:agree');
// A light Mira route has an alternate set of authored exchanges inline.
const alternate = app.match(/const exchanges = currentNode === 'close_mira_input' && flags\.private_tone === 'light'\s*\? (\[[\s\S]*?\])\s*: writtenExchanges\[currentNode\]/);
if (!alternate) throw new Error('Could not locate alternate Mira exchanges');
for (const [prompt, reply] of runInNewContext(`(${alternate[1]})`, Object.create(null), { timeout: 1000 })) {
  add('You', prompt, 'exchange-prompt:close_mira_light');
  add('Mira', reply, 'exchange-reply:close_mira_light');
}
// The screen comparisons contain only the two authored choices and their
// labels. Enumerate all witnessed pairs so the lines play offline as clips.
function compactScreenComparison(kind, value) {
  const original = narrative.story[`history_${kind}_${value}`]?.text || '';
  const title = kind === 'card' ? 'Welcome card' : 'Map notice';
  if (value === 'skip') return original.includes('NO CHOICE') ? `${title}: NO CHOICE. You left it to ${kind === 'card' ? 'Niko' : 'Ash'}.` : original;
  const quotes = [...original.matchAll(/“([^”]+)”/g)].map(match => match[1]);
  if (quotes.length !== 2 || !/YOUR CHOICE[\s\S]*NOT CHOSEN/.test(original)) throw new Error(`Invalid ${kind} comparison ${value}`);
  return `${title}: “${quotes[0]}” — YOUR CHOICE; “${quotes[1]}” — NOT CHOSEN.`;
}
for (const card of ['direct', 'warm', 'skip']) for (const notice of ['direct', 'warm', 'skip']) {
  const text = narrative.story.early_together_comparisons.text
    .replace('{cardComparison}', compactScreenComparison('card', card))
    .replace('{noticeComparison}', compactScreenComparison('notice', notice));
  add('Narrator', text, `comparison:early_together:${card}:${notice}`);
}
// Finite screen text read aloud when a learned style selects the other opening.
for (const id of ['policy_direct_compact', 'policy_warm_compact', 'early_together_direct', 'early_together_warm']) {
  const text = narrative.story[id]?.text || '';
  const end = text.indexOf('.');
  if (end < 0) throw new Error(`No complete policy opening at ${id}`);
  add('Narrator', `On the screen, an unselected opening: ${text.slice(0, end + 1)}`, `policy-opening:${id}`);
}
for (const label of ['Record a reply', 'Send message →', 'Name the knight →', 'Write on the receipt →', 'Write on the map →', 'Send follow-up →', 'Send revised message →', 'Check offer', 'Take the free repair kit', 'Buy repair kit', 'Restore purchase', 'Continue without the kit', 'Decide later', 'Say more', 'Edit or retry your first message', 'Edit or retry message', 'Continue without a follow-up', 'Use the written response', 'Continue without waiting']) add('You', label, 'control:story');
add('Narrator', 'Leave blank to use:', 'input-guide:default');
add('Narrator', 'On the counter: 2 pieces. On the screen: 3 recovered.', 'story-ui:counter');
add('Narrator', 'An earlier choice', 'story-ui:earlier-choice');
add('Narrator', 'Your choice.', 'story-ui:your-choice');
add('Narrator', 'Choose a suggested message, or write your own below.', 'input-guide:exchanges');
add('Narrator', 'Suggested messages have matching replies. A tailored reply to your own words needs a connected AI service.', 'input-guide:scripted');
// Finite added date callbacks can be rendered ahead of time; free text cannot.
for (const name of ['Niko', 'Mira', 'Ash']) for (const mood of ['playful', 'curious']) {
  const lower = name.toLowerCase();
  const id = `close_connection_${lower}_moment`;
  const flags = { companion: name, connection_choice: 'ask', connection_seen: name, connection_late_seen: name, date_scene_due: 'yes', date_moment: mood, date_moment_seen: `${lower}_${mood}` };
  const node = narrative.story[id];
  if (node) passage(id, node.speaker, node.text + narrative.dateMomentCallback(flags, id), `date:${id}:${mood}`);
}

// Finite story-state variants which do not contain user-provided text.
function addVariant(id, text, description) {
  const node = narrative.story[id];
  if (node && text) passage(id, node.speaker, text, `variant:${description}`);
}
// The map's blank-input default is a fixed authored sentence; arbitrary player
// annotations are not catalogued and still use live synthesis.
const defaultMapNote = narrative.story.early_together_note_input?.input?.default;
if (typeof defaultMapNote !== 'string' || !defaultMapNote) throw new Error('Missing map-note default');
addVariant('early_together_note_written', narrative.story.early_together_note_written.text.replace('{annotation}', defaultMapNote), 'early_together_note_default');
const retreat = { ending: 'retreat', retreat_fort_closing_due: 'yes' };
for (const id of ['close_signal', 'close_repeat', 'close_private', 'retreat_search_return', 'retreat_search_choice'])
  addVariant(id, narrative.retreatFortPassage(retreat, id)?.text, id);
const compact = { ...retreat, retreat_epilogue_v1: 'yes', compact_retreat_closing: 'yes', retreat_search_early: 'yes', retreat_search: 'stair', retreat_search_seen: 'stair', signal: 'private' };
for (const signal of ['private', 'repeat']) for (const preparation of ['', 'sketchbook', 'thread']) {
  const flags = { ...compact, signal, companion: 'Mira', mira_retreat_prepare: preparation, mira_retreat_prepare_seen: preparation };
  addVariant('close_signal', narrative.retreatFortPassage(flags, 'close_signal')?.text, `close_signal:${signal}:${preparation}`);
}
for (const bond of ['care', 'play']) {
  const flags = { ...compact, ash_retreat_light_due: 'yes', companion: 'Ash', private_tone: 'light', topic: 'light', bond, ash_retreat_light_seen: 'yes' };
  for (const id of ['close_ash', 'close_ash_retreat_input']) addVariant(id, narrative.retreatFortPassage(flags, id)?.text, `${id}:${bond}`);
}
const miraRetreat = { ...compact, companion: 'Mira', bond: 'play', topic: 'light', mira_retreat_prepare_due: 'yes' };
addVariant('close_mira_retreat_play', narrative.retreatFortPassage(miraRetreat, 'close_mira_retreat_play')?.text, 'close_mira_retreat_play');
addVariant('ending_prize_retreat', narrative.retreatFortPassage({ ...compact, reason: 'prize' }, 'ending_prize_retreat')?.text, 'ending_prize_retreat');
const rescue = { early_rescue_streamlined: 'yes', early_rescue_choice: 'open', early_rescue_committed: 'yes', early_rescue_setup_seen: 'yes', policy_goal_compact_seen: 'yes', ending: 'rescue', early_audit_due: 'yes', reveal_pace_v2: 'yes', early_paper_due: 'yes', early_paper_shown: 'yes', early_paper_done: 'yes', group_reply_seen: 'yes', public_reply_shown: 'yes', comparisons_revealed: 'yes', paper_handoff: 'share', reveal_focus: 'tell', signal: 'private', early_audit_present: 'yes', audit_seen: 'yes', mira_report_seen: 'yes', audit_action: 'cover', early_audit_action_seen: 'cover' };
addVariant('early_rescue_setup', narrative.earlyRescueSetupPassage(rescue, 'early_rescue_setup')?.text, 'early_rescue_setup');
// Both comparison placeholders resolve entirely from authored alternatives.
function comparison(kind, value, shortened) {
  if (!value) return '';
  const original = narrative.story[`history_${kind}_${value}`]?.text || '';
  if (!shortened) return original;
  const title = kind === 'card' ? 'Welcome card' : 'Map notice';
  if (value === 'skip') return original.includes('NO CHOICE') ? `${title}: NO CHOICE. You left it to ${kind === 'card' ? 'Niko' : 'Ash'}.` : original;
  const quotes = [...original.matchAll(/“([^”]+)”/g)].map(match => match[1]);
  if (quotes.length !== 2 || !/YOUR CHOICE[\s\S]*NOT CHOSEN/.test(original)) return original;
  return `${title}: “${quotes[0]}” — YOUR CHOICE; “${quotes[1]}” — NOT CHOSEN.`;
}
for (const id of ['history_comparisons_early', 'history_comparisons_compact']) {
  for (const shortened of id === 'history_comparisons_early' ? [false, true] : [false])
    for (const card of ['', 'direct', 'warm', 'skip']) for (const notice of ['', 'direct', 'warm', 'skip']) {
      const text = narrative.story[id].text.replace('{cardComparison}', comparison('card', card, shortened)).replace('{noticeComparison}', comparison('notice', notice, shortened));
      addVariant(id, text, `comparison:${id}:${shortened}:${card}:${notice}`);
    }
}
const retreatEchoes = ['', ' One knock, a pause, then two more come from under the floor. Niko holds his hand still against the boards. Ash leaves the map open between you.', ' Two knocks, a pause, then one comes from under the floor. Niko holds his hand still against the boards. Ash leaves the map open between you.'];
for (const [index, echo] of retreatEchoes.entries()) addVariant('close_reason_retreat', narrative.story.close_reason_retreat.text.replace('{retreatEcho}', echo), `retreat-echo:${index}`);
addVariant('mira_bond_choice', 'Mira offers you the loose ear and a pencil.', 'mira_bond_choice');
addVariant('keepsake_check', 'The signal you chose for the team is in the fort.', 'keepsake_check');
for (const [key, value] of Object.entries(narrative.retreatWaymarkText || {})) addVariant('retreat_early_search_stair', value, `waymark:${key}`);

console.log(JSON.stringify({ version: 1, entries: [...catalog.values()], skippedDynamic: skipped }, null, 2));
