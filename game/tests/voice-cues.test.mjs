import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = async (file) => import(`data:text/javascript;base64,${(await readFile(new URL(file, import.meta.url))).toString('base64')}`);
const { story, characters, retreatWaymarkText, retreatFortPassage, compactRetreatPassage, earlyRescueSetupPassage } = await load('../src/story-next.js');
const { castSpeech, authoredVoiceCues } = await load('../src/voice-cues.js');

test('combined card discoveries are read in full by the narrator', () => {
  for (const route of ['niko', 'mira', 'ash']) {
    const id = `discovery_${route}_compact`;
    assert.deepEqual(castSpeech(id, story[id].speaker, story[id].text), [
      { speaker: 'Narrator', text: story[id].text }
    ]);
  }
});

test('task-focused question prompts use the narrator while retaining the companion portrait', () => {
  for (const name of ['Niko', 'Mira', 'Ash']) {
    const id = `${name.toLowerCase()}_light_question`;
    const node = story[id];
    assert.equal(node.speaker, 'Narrator');
    assert.equal(node.portraitSpeaker, name);
    assert.deepEqual(castSpeech(id, node.speaker, node.text), [{ speaker: 'Narrator', text: node.text }]);
    assert.deepEqual(node.choices.map(choice => choice.set.light_detail), ['first', 'second']);
  }
});

test('Niko identifies the upstairs plush in both prize explanations', () => {
  for (const id of ['reason_result_prize_reply', 'reason_focus_prize']) {
    const parts = castSpeech(id, story[id].speaker, story[id].text);
    assert.ok(parts.some(part => part.speaker === 'Niko' && part.text === '“Mallow’s plush is still on the shelf upstairs,”'));
    assert.equal(parts.map(part => part.text).join(''), story[id].text);
  }
  const retreat = retreatFortPassage({ ending: 'retreat', retreat_fort_closing_due: 'yes' }, 'close_signal');
  assert.match(retreat.text, /Mallow’s plush, still on the arcade shelf/);
});

test('the early rescue keeps Niko’s call in his own voice', () => {
  const id = 'early_rescue_setup';
  const parts = castSpeech(id, story[id].speaker, story[id].text);
  assert.deepEqual(parts.map(part => part.speaker), ['Narrator', 'Niko', 'Narrator']);
  assert.equal(parts[1].text, '“Mira, we’re coming,”');
  assert.equal(parts.map(part => part.text).join(''), story[id].text);
});

test('the streamlined rescue reads Mira’s tap and Niko’s call in their intended voices', () => {
  const flags = { early_rescue_streamlined: 'yes', early_rescue_offer_due: 'yes', early_rescue_choice: 'open', early_rescue_committed: 'yes', early_rescue_setup_seen: 'yes', policy_goal_compact_seen: 'yes', ending: 'rescue', early_audit_due: 'yes', reveal_pace_v2: 'yes', early_paper_due: 'yes', early_paper_shown: 'yes', early_paper_done: 'yes', group_reply_seen: 'yes', public_reply_shown: 'yes', comparisons_revealed: 'yes', paper_handoff: 'keep', reveal_focus: 'tell', signal: 'private', early_audit_present: 'yes', audit_seen: 'yes', mira_report_seen: 'yes', audit_action: 'cover', early_audit_action_seen: 'cover' };
  const text = earlyRescueSetupPassage(flags, 'early_rescue_setup').text;
  const parts = castSpeech('early_rescue_setup', story.early_rescue_setup.speaker, text);
  assert.deepEqual(parts.map(part => part.speaker), ['Narrator', 'Niko', 'Narrator']);
  assert.match(parts[0].text, /Mira taps once, close to the catch/);
  assert.equal(parts.map(part => part.text).join(''), text);
});

test('the private closing distinguishes the plush from Mira’s paper moth', () => {
  assert.match(story.close_connection_mira_now.text, /paper moth/);
  assert.match(story.close_private.text, /^The plush moth’s mouth stays shut\./);
  assert.deepEqual(castSpeech('close_private', story.close_private.speaker, story.close_private.text), [
    { speaker: 'Narrator', text: story.close_private.text }
  ]);
});

test('the shorter Mallow rescue and lens choice retain Mallow’s voice', () => {
  for (const id of ['end_mallow_compact_voice', 'end_mallow_compact_search', 'mallow_camera_compact']) {
    const node = story[id];
    assert.equal(node.speaker, 'Mallow');
    assert.deepEqual(castSpeech(id, node.speaker, node.text), [{ speaker: 'Mallow', text: node.text }]);
  }
  assert.deepEqual(story.mallow_camera_compact.choices, story.mallow_camera_choice.choices);
});

test('the combined audit keeps Ash and Mira in their own voices', () => {
  for (const focus of ['tell', 'listen']) {
    const id = `audit_focus_${focus}_compact`;
    const parts = castSpeech(id, story[id].speaker, story[id].text);
    assert.equal(parts.map(part => part.text).join(''), story[id].text);
    assert.deepEqual(parts.filter(part => part.text.startsWith('“')).map(part => part.speaker), ['Ash', 'Mira', 'Mira']);
  }
});

test('shortened retreat passages are spoken exactly as rendered in the narrator voice', () => {
  for (const signal of ['private', 'repeat']) for (const preparation of ['sketchbook', 'thread']) {
    const flags = { retreat_epilogue_v1: 'yes', ending: 'retreat', retreat_fort_closing_due: 'yes', compact_retreat_closing: 'yes', retreat_search_early: 'yes', retreat_search: 'stair', retreat_search_seen: 'stair', signal, companion: 'Mira', bond: 'play', topic: 'light', mira_retreat_prepare_due: 'yes', mira_retreat_prepare: preparation, mira_retreat_prepare_seen: preparation, reason: 'prize' };
    for (const id of ['close_mira_retreat_play', 'close_signal', 'ending_prize_retreat']) {
      const passage = compactRetreatPassage(flags, id);
      const parts = castSpeech(id, story[id].speaker, passage.text);
      assert.equal(parts.map(part => part.text).join(''), passage.text);
      assert.ok(parts.every(part => part.speaker === 'Narrator'));
    }
  }
});

test('Ash’s shortened retreat keeps both map callbacks and the choice in Ash’s voice', () => {
  for (const bond of ['care', 'play']) {
    const flags = { retreat_epilogue_v1: 'yes', ending: 'retreat', retreat_fort_closing_due: 'yes',
      compact_retreat_closing: 'yes', retreat_search_early: 'yes', retreat_search: 'stair',
      retreat_search_seen: 'stair', signal: 'private', companion: 'Ash', bond, topic: 'light',
      private_tone: 'light', ash_retreat_light_due: 'yes' };
    const first = compactRetreatPassage(flags, 'close_ash').text;
    assert.deepEqual(castSpeech('close_ash', 'Ash', first), [{ speaker: 'Ash', text: first }]);
    const second = story.close_ash_retreat_light_compact;
    assert.deepEqual(castSpeech('close_ash_retreat_light_compact', second.speaker, second.text),
      [{ speaker: 'Ash', text: second.text }]);
    assert.deepEqual(second.choices.map(choice => choice.label), story.close_ash_retreat_talk_choice.choices.map(choice => choice.label));
    const input = compactRetreatPassage({ ...flags, ash_retreat_light_seen: 'yes' }, 'close_ash_retreat_input');
    assert.equal(input.text, `${story.close_ash_retreat_talk_choice.text} ${story.close_ash_retreat_input.text}`);
    assert.deepEqual(castSpeech('close_ash_retreat_input', 'Narrator', input.text), [{ speaker: 'Narrator', text: input.text }]);
  }
});

test('fort-based retreat reflections are read exactly as shown in the narrator voice', () => {
  const flags = { ending: 'retreat', retreat_fort_closing_due: 'yes' };
  for (const id of ['close_signal', 'close_repeat', 'close_private', 'retreat_search_return', 'retreat_search_choice']) {
    const passage = retreatFortPassage(flags, id);
    const parts = castSpeech(id, story[id].speaker, passage.text);
    assert.equal(parts.map(part => part.text).join(''), passage.text);
    assert.ok(parts.every(part => part.speaker === 'Narrator'));
  }
});

// Reviewed inventory: quoted words spoken during the scene, including the
// player's fixed in-world echo and Mira's single-quoted line. The remaining
// quoted passages are text on a screen or paper, imagined/recalled words, or
// player-supplied interpolation; their passage speaker reads them naturally.
const spoken = `early_rescue_now_setup early_together_citation early_together_cover early_together_unplug early_together_false_ending niko_date_moment mira_date_moment ash_date_moment fourth_wall_touch_niko_combined fourth_wall_touch_mira_combined fourth_wall_touch_ash_combined fourth_wall_count_niko_combined fourth_wall_count_mira_combined fourth_wall_count_ash_combined close_mallow_ack_speak mallow_team_wave niko_note niko_work_fix mira_work_proof disclosure_public_distortion mira_ticket_glimpse
signal_trace_niko_light signal_trace_mira_light signal_trace_ash_light signal_trace_niko_personal signal_trace_mira_personal signal_trace_ash_personal
signal_private_niko signal_private_mira evidence_confirm evidence_machine_receipt_compact evidence_machine_tickets_compact evidence_machine_voice_compact correction_again
fourth_wall_intro_compact fourth_wall_intro_confirm fourth_correction_public_compact fourth_correction_private_compact fourth_mira_compact moment_return_keep_compact moment_return_tear_compact early_door_brace door_brace
reason_result_team_reply reason_result_prize_reply reason_result_company_reply reason_focus_team reason_focus_prize reason_focus_company history_steps_picture
early_rescue_setup history_brief_direct history_brief_warm history_brief_skip history_early_paper_share history_early_paper_keep history_early_paper_quote history_early_paper_mallow_quote history_citation_early early_audit_choice early_audit_cover early_audit_annotation_written early_audit_unplug history_direct history_warm history_skip history_second_check history_second_direct history_second_warm
history_second_skip history_mallow_public_reply_compact history_mallow_reply_choice history_paper_mallow_quote history_paper_quote
late_focus_tell_receipt late_focus_listen_receipt
history_paper_keep history_paper_keep_compact history_paper_keep_report policy_goal_compact audit_receipt audit_focus_tell_compact audit_focus_listen_compact audit_unplug audit_result_cover_compact audit_result_annotate_compact audit_result_unplug_compact audit_result_leave_compact plan_paper plan_niko_topic_past
plan_niko_topic_future plan_ash_topic_past plan_ash_topic_future rescue_coordination_count rescue_coordination_reach mallow_catch_tool_mira rescue_mira_fix rescue_reunion_ticket_compact rescue_reunion_watch_compact end_retreat retreat_probe_intro retreat_plan_tap_compact retreat_plan_call_compact
retreat_early_search_stair retreat_early_search_sound record_close_explain kit_use retreat_search_stair
retreat_search_sound close_mallow_fort_place close_connection_niko_now close_connection_niko_later close_connection_mira_now close_connection_mira_later close_connection_ash_now close_connection_ash_later
souvenir_used_niko_care souvenir_used_niko_play souvenir_used_mira_care souvenir_used_mira_play souvenir_used_ash_care souvenir_used_ash_play`.split(/\s+/);
const described = `early_together_note_written hint_false_line history_compare_direct history_compare_warm history_card_direct history_card_warm
history_notice_direct history_notice_warm history_public_quote history_mallow_public_reply history_early_paper
audit_annotation_written mira_private signal_repeat`.split(/\s+/);

test('every reviewed spoken quotation retains its authored cue', () => {
  assert.deepEqual(Object.keys(authoredVoiceCues).sort(), [...spoken].sort());
  for (const id of [...spoken, ...described]) assert.ok(story[id], `missing reviewed node ${id}`);
  const reviewed = new Set([...spoken, ...described]);
  for (const [id, node] of Object.entries(story)) {
    if (/[“‘]/.test(node.text)) assert.ok(reviewed.has(id), `review voice casting for ${id}`);
  }
  assert.deepEqual(castSpeech('hint_false_line', 'Narrator', story.hint_false_line.text), [
    { speaker: 'Narrator', text: story.hint_false_line.text }
  ], 'the fabricated line is printed, not spoken by the player');
  for (const id of ['rescue_coordination_count', 'rescue_coordination_reach']) {
    const parts = castSpeech(id, 'Narrator', story[id].text);
    assert.equal(parts.map(part => part.text).join(''), story[id].text);
    assert.ok(parts.some(part => part.speaker === 'Mira'));
    assert.ok(parts.some(part => part.speaker === 'Narrator'));
  }
  assert.equal(castSpeech('door_brace', 'Narrator', story.door_brace.text).find(part => part.text === '‘That isn’t mine.’')?.speaker, 'Mira');
  assert.deepEqual(castSpeech('disclosure_public_distortion', 'Narrator', story.disclosure_public_distortion.text).filter(part => part.speaker === 'You').map(part => part.text), ['“third”', '“three.”']);
});

test('fort reunion callbacks remain narration and preserve the fourth-wall beat in speech', () => {
  for (const action of [
    'You lay Mira’s third ticket piece apart from Niko’s two, just as she asked. She smooths its curled corner. ',
    'Mira sets down the ticket piece she carried. She touches your arm, then looks toward the door you watched until everyone was clear. '
  ]) {
    const text = action + story.close_reason.text;
    const parts = castSpeech('close_reason', 'Narrator', text);
    assert.equal(parts.map(part => part.text).join(''), text);
    assert.ok(parts.every(part => part.speaker === 'Narrator'));
  }
});

test('the unanswered question echo stays in the narrator voice', () => {
  const text = story.close_reason.text + ' A soft sound comes from somewhere beyond the fort. It follows the rhythm of your question, without any words.';
  const parts = castSpeech('close_reason', 'Narrator', text);
  assert.equal(parts.map(part => part.text).join(''), text);
  assert.ok(parts.every(part => part.speaker === 'Narrator'));
});

test('authored voice cues match current story passages in order and retain every character', () => {
  for (const [id, cue] of Object.entries(authoredVoiceCues)) {
    const node = story[id];
    assert.ok(node, `unknown story node ${id}`);
    const expected = Array.isArray(cue) ? cue : cue.spans;
    const parts = castSpeech(id, node.speaker, node.text);
    assert.equal(parts.map(part => part.text).join(''), node.text, `${id} preserves the original text`);
    let index = 0;
    for (const [speaker, quote] of expected) {
      assert.ok(characters[speaker], `unknown speaker ${speaker}`);
      const match = parts.findIndex((part, i) => i >= index && part.speaker === speaker && part.text === quote);
      assert.ok(match >= 0, `missing or stale cue ${id}: ${quote}`);
      index = match + 1;
    }
  }
});

test('mixed passages cast dialogue explicitly while unchanged narration uses its configured speaker', () => {
  const wave = castSpeech('mallow_team_wave', 'Narrator', story.mallow_team_wave.text);
  assert.deepEqual(wave.filter(part => part.text.startsWith('“')).map(part => part.speaker), ['Mallow', 'Mira']);
  assert.equal(wave.map(part => part.text).join(''), story.mallow_team_wave.text);
  const note = castSpeech('niko_note', 'Narrator', story.niko_note.text);
  assert.equal(note[0].speaker, 'Narrator');
  assert.deepEqual(note.filter(part => part.speaker === 'Niko').map(part => part.text), [
    '“My brother wrote that,”', '“I keep reading it aloud when the machines get stubborn.”'
  ]);
  for (const action of ['tap', 'call']) {
    const id = `retreat_plan_${action}_compact`;
    const parts = castSpeech(id, 'Narrator', story[id].text);
    assert.deepEqual(parts.filter(part => part.text.startsWith('“')).map(part => part.speaker), ['Niko', 'Ash']);
    assert.equal(parts.map(part => part.text).join(''), story[id].text);
  }
  const mixed = castSpeech('fourth_mira_compact', 'Mira', story.fourth_mira_compact.text);
  assert.deepEqual(mixed.filter(part => part.text.startsWith('“')).map(part => part.speaker), ['Mira', 'Ash', 'Ash', 'Mira']);
  assert.ok(mixed.some(part => part.speaker === 'Narrator' && part.text.includes('Ash says')));
  for (const name of ['Niko', 'Mira', 'Ash']) for (const tone of ['light', 'personal']) {
    const id = `signal_trace_${name.toLowerCase()}_${tone}`;
    const parts = castSpeech(id, 'Narrator', story[id].text);
    assert.equal(parts[0].speaker, 'Narrator', `${id}: the printed words are narration`);
    assert.ok(parts.some(part => part.speaker === name && part.text.startsWith('“')), `${id}: the companion speaks their reaction`);
    assert.ok(parts.every(part => ['Narrator', name].includes(part.speaker)));
    assert.equal(parts.map(part => part.text).join(''), story[id].text);
  }
  for (const name of ['Niko', 'Mira', 'Ash']) {
    const id = `signal_repeat_${name.toLowerCase()}`;
    assert.deepEqual(castSpeech(id, story[id].speaker, story[id].text), [{ speaker: name, text: story[id].text }]);
  }
  for (const name of ['Niko', 'Mira']) {
    const id = `signal_private_${name.toLowerCase()}`;
    const parts = castSpeech(id, story[id].speaker, story[id].text);
    assert.deepEqual(parts.filter(part => part.text.startsWith('“')).map(part => part.speaker), ['Ash', name]);
    assert.equal(parts.map(part => part.text).join(''), story[id].text);
  }
  assert.deepEqual(castSpeech('signal_private_ash', 'Ash', story.signal_private_ash.text), [{ speaker: 'Ash', text: story.signal_private_ash.text }]);
  for (const [id, count] of [['rescue_reunion_ticket_compact', 2], ['rescue_reunion_watch_compact', 3]]) {
    const parts = castSpeech(id, 'Narrator', story[id].text);
    assert.equal(parts.map(part => part.text).join(''), story[id].text);
    assert.equal(parts.filter(part => part.speaker === 'Mira').length, count);
    assert.ok(parts.some(part => part.speaker === 'Narrator' && /Mira says/.test(part.text)));
  }
});

test('changed or ambiguous text never guesses a character voice; printed player text remains narration', () => {
  const text = story.niko_note.text;
  assert.deepEqual(castSpeech('niko_note', 'Narrator', text.replace('My brother wrote that', 'Someone wrote that')), [{ speaker: 'Narrator', text: text.replace('My brother wrote that', 'Someone wrote that') }]);
  const duplicated = `“My brother wrote that,” ${text}`;
  assert.deepEqual(castSpeech('niko_note', 'Narrator', duplicated), [{ speaker: 'Narrator', text: duplicated }]);
  const printed = story.history_public_quote.text.replace('{answer}', 'a private invented quotation');
  assert.deepEqual(castSpeech('history_public_quote', 'Narrator', printed), [{ speaker: 'Narrator', text: printed }]);
  const annotation = story.audit_annotation_written.text.replace('{annotation}', '<literal note> ⭐');
  assert.deepEqual(castSpeech('audit_annotation_written', 'Narrator', annotation), [{ speaker: 'Narrator', text: annotation }]);
  const template = story.history_mallow_public_reply_compact.text;
  const ordinary = template.replace('{publicReply}', 'We can look together.');
  const ordinaryParts = castSpeech('history_mallow_public_reply_compact', 'Narrator', ordinary);
  assert.equal(ordinaryParts.map(part => part.text).join(''), ordinary);
  assert.ok(ordinaryParts.some(part => part.speaker === 'Ash' && part.text.includes('It kept our wording')));
  // A user/provider string that duplicates an authored cue must never be
  // attributed to Ash merely because it appears earlier in the paragraph.
  const collision = template.replace('{publicReply}', '“It kept our wording too,”');
  assert.deepEqual(castSpeech('history_mallow_public_reply_compact', 'Narrator', collision), [{ speaker: 'Narrator', text: collision }]);
  const choiceText = story.history_mallow_reply_choice.text.replace('{publicReply}', 'We can look together.');
  const choiceParts = castSpeech('history_mallow_reply_choice', 'Narrator', choiceText);
  assert.equal(choiceParts.map(part => part.text).join(''), choiceText);
  assert.ok(choiceParts.some(part => part.speaker === 'Ash' && part.text.includes('It kept our wording')));
  const choiceCollision = story.history_mallow_reply_choice.text.replace('{publicReply}', '“It kept our wording too,”');
  assert.deepEqual(castSpeech('history_mallow_reply_choice', 'Narrator', choiceCollision), [{ speaker: 'Narrator', text: choiceCollision }]);
  const note = story.audit_result_annotate_compact.text.replace('{annotation}', ' “The door stays shut.”');
  const noteParts = castSpeech('audit_result_annotate_compact', 'Narrator', note);
  assert.equal(noteParts.map(part => part.text).join(''), note);
  assert.ok(noteParts.some(part => part.speaker === 'Niko' && part.text.includes('arrange our conversation')));
  assert.ok(noteParts.some(part => part.speaker === 'Narrator' && part.text.includes('The door stays shut.')));
});

test('custom-message written continuations stay in the responding character voice', () => {
  for (const id of ['mid_niko_chat', 'mid_mira_chat', 'mid_ash_chat', 'close_ash_retreat_chat']) {
    const node = story[id];
    assert.deepEqual(castSpeech(id, node.speaker, node.ai.fallback), [
      { speaker: node.ai.character, text: node.ai.fallback }
    ], id);
  }
});

test('both waymark-dependent stair passages retain Niko’s spoken voice', () => {
  for (const [name, text] of Object.entries(retreatWaymarkText)) {
    const parts = castSpeech('retreat_early_search_stair', 'Narrator', text);
    assert.equal(parts.map(part => part.text).join(''), text);
    assert.deepEqual(parts.filter(part => part.speaker === 'Niko').map(part => part.text),
      ['“We can bring something to brace it,”', '“Mira, we’re still here!”'], name);
  }
});

test('date invitations switch from narrator to the companion and back without losing text', () => {
  for (const name of ['Niko', 'Mira', 'Ash']) {
    const lower = name.toLowerCase();
    const prompt = story[`${lower}_date_moment`];
    const parts = castSpeech(`${lower}_date_moment`, prompt.speaker, prompt.text);
    assert.equal(parts.map(part => part.text).join(''), prompt.text);
    assert.deepEqual(parts.map(part => part.speaker), ['Narrator', name, 'Narrator']);
    for (const choice of ['playful', 'curious']) {
      const id = `${lower}_date_${choice}`;
      assert.deepEqual(castSpeech(id, name, story[id].text), [{ speaker: name, text: story[id].text }]);
    }
  }
});
