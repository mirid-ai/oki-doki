/** Offline graph and path checks for the Moonrabbit episode. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function load(name) {
  const source = await readFile(new URL(`../src/${name}.js`, import.meta.url));
  return import(`data:text/javascript;base64,${source.toString('base64')}`);
}
const { story, characters, startNode, saveKey, title, sharedDisclosureReaction, privateDisclosureReaction, privateDisclosureLines, souvenirWedgeRoute, retreatWaymark, retreatWaymarkText, rescueDetailRoute, miraNameRoute, connectionBeforeBond, connectionAfterBond, miraCloseRoute, miraLightCloseRoute, earlyReasonRoute, receiptAfterFocus, mallowClosingRoute, connectionClosingRoute, keepsakeClosingRoute, mallowToolAvailable, compactPocketRoute, compactRetreatClosingRoute, compactRetreatReady, compactRetreatPassage, publicReplyRoute, fourthWallRoute, receiptBriefRoute, earlyAuditReady, earlyAuditComplete, earlyTogetherAction, earlyRescueRoute, earlyRescueSetupPassage, hintGreetingRoute, compactAuditRoute, compactRescueRoute } = await load('story-next');
const { evaluatePreference } = await load('preference');
assert.equal(saveKey, 'okie-dokie.arcade.v1');
assert.equal(title, 'Oki Doki');
assert.ok(story[startNode]);

// Each focused audit shows the circular chain and the same physical choices
// in one passage. Checkpoints lacking the new marker retain the old route.
for (const focus of ['tell', 'listen']) {
  const id = `audit_focus_${focus}_compact`;
  assert.equal(compactAuditRoute({ audit_focus_due: 'yes', policy_goal_compact_seen: 'yes', reveal_focus: focus }), focus);
  assert.equal(story.policy_goal_compact.nextBy.cases[focus], id);
  assert.deepEqual(story[id].choices, story.audit_action_choice.choices);
  assert.match(story[id].text, /report confirms the welcome agreement.*another confirms that report/i);
  assert.match(story[id].text, /Mallow watches.*Niko works the latch/i);
  assert.match(story[id].text, /lens.*star.*PRINTER/s);
  assert.deepEqual(story[id].setOnVisit, { audit_seen: 'yes', audit_focus_seen: focus });
}
assert.equal(compactAuditRoute({ policy_goal_compact_seen: 'yes', reveal_focus: 'tell' }), '');
assert.equal(compactAuditRoute({ audit_focus_due: 'yes', reveal_focus: 'tell' }), '');
assert.equal(story.policy_goal_compact.next, 'audit_receipt');

// The fiction must preserve the player's refusal while showing the system
// counting it as engagement, and distinguish acknowledgement from opening the door.
assert.match(story.signal_private_receipt.text, /\bNO\b.*ENGAGEMENT SUCCESSFUL/i);
assert.doesNotMatch(story.signal_private_receipt.text, /\{(?:privateAnswer|answer)\}/);
assert.match(story.signal_private_reply.text, /doesn’t make it a yes/i);

assert.deepEqual(story.ai_reflection.setOnVisit, { group_reply_seen: 'yes' });
assert.match(story.history_public_quote.text, /your words to Mallow.*\{answer\}.*second report.*receipt.*second report.*INDEPENDENT CREW TESTIMONY/i);
assert.doesNotMatch(story.history_public_quote.text, /\{privateAnswer\}/);
for (const preference of ['direct', 'warm', 'skip']) {
  const item = story[`history_notice_${preference}`];
  assert.equal(item.next, 'history_comparison_reaction', 'older saves retain their original path');
  assert.equal(item.nextBy.key, 'group_reply_seen');
  assert.equal(item.nextBy.cases.yes, 'history_public_quote');
}
assert.equal(story.history_public_quote.next, 'history_public_reaction');
assert.equal(story.history_public_reaction.next, 'history_paper_public_choice');
assert.equal(story.history_comparison_reaction.next, 'history_reflect', 'older checkpoints retain their earlier fallback');

assert.match(story.policy_goal.text, /ACKNOWLEDGED.*DOOR OPEN/);
const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(story.policy_goal.text, /CONTINUE TO FINISH/);
assert.match(page, /<button[^>]*id="advance"[^>]*>\s*Continue\b/i, 'the in-story prompt points to a real story control');
assert.ok(!story.policy_goal.choices && !story.policy_goal.input && !story.policy_goal.ai, 'the normal Continue control is available on that passage');
assert.match(story.audit_receipt.text, /welcome agreement.*report confirming.*first report/i);
// The opening still counts the forced agreement, but does not explain the
// circular audit until the later slip makes the paperwork visible.
assert.match(story.opening.text, /THANK YOU FOR AGREEING/);
assert.match(story.opening_service.text, /agreement.*verification team/i);
assert.doesNotMatch(story.opening_service.text, /checked against the agreement|report confirming/i);

// Check every possible edge, including optional offers and conditional fallbacks.
const edges = node => [node.next, node.input?.next, ...(node.choices || []).map(c => c.next),
  ...(node === story.close_ash ? ['close_ash_retreat_light_compact'] : []), // guarded runtime route
  ...(node === story.plan_choice ? ['end_mallow_compact_voice', 'end_mallow_compact_search'] : []),
  ...Object.values(node.nextBy?.cases || {}), node.offer?.skip, node.offer?.grant?.next, node.offer?.paidGrant?.next].filter(Boolean);
for (const [id, node] of Object.entries(story)) {
  assert.ok(characters[node.speaker], `${id}: unknown speaker`);
  if (node.portraitSpeaker) assert.ok(characters[node.portraitSpeaker]?.portrait, `${id}: missing portrait speaker`);
  if (node.expression) assert.ok(characters[node.portraitSpeaker || node.speaker].expressions?.[node.expression], `${id}: missing expression portrait`);
  assert.ok(['hideout', 'arcade', 'sewing', 'stairs', 'playroom'].includes(node.location), `${id}: missing location`);
  for (const target of edges(node)) assert.ok(story[target], `${id}: missing ${target}`);
  if (node.ai) assert.ok(characters[node.ai.character], `${id}: unknown AI character`);
  assert.ok(node.end || edges(node).length, `${id}: no exit`);
}
const reached = new Set(), queue = [startNode];
while (queue.length) {
  const id = queue.pop();
  if (reached.has(id)) continue;
  reached.add(id);
  queue.push(...edges(story[id]));
}
const legacyOnlyNodes = ['correction_absorbed', 'fourth_focus_choice', 'fourth_focus_tell', 'fourth_focus_listen', 'fourth_correction_public_compact', 'fourth_correction_private_compact', 'late_focus_tell', 'late_focus_listen', 'reason_result_team', 'reason_result_prize', 'reason_result_company', 'history_mallow_public_reply', 'history_paper_mallow_quote_reply', 'history_paper_quote_reply', 'history_steered', 'history_steered_notice_check', 'history_steered_comparison', 'history_neutral_tie', 'audit_annotate', 'rescue_reunion_ticket', 'rescue_reunion_ticket_action', 'rescue_reunion_watch', 'rescue_reunion_watch_action', 'end_rescue_reply_ticket', 'end_rescue_reply_watch'];
assert.deepEqual([...Object.keys(story).filter(id => !reached.has(id))], legacyOnlyNodes, 'only preserved legacy checkpoint nodes are unreachable from a new game');
for (const id of legacyOnlyNodes) {
  let current = id;
  const seen = new Set();
  while (!reached.has(current)) {
    assert.ok(!seen.has(current), `${id}: legacy checkpoint must not loop`);
    seen.add(current);
    current = story[current]?.next || edges(story[current] || {})[0];
    assert.ok(current, `${id}: legacy checkpoint must lead back to the story`);
  }
}

const choices = { reason_choice: 'team', keepsake_choice: 'star', correction_choice: 'private', evidence_choice: 'receipt' };
function reachedEndingNode(visited, ending) {
  return ending === 'mallow' ? visited.find(id => id === 'end_mallow' || id.startsWith('end_mallow_compact_')) || 'end_mallow' : `end_${ending}`;
}
function play({ companion, vote_a, vote_b, signal, ending, kit, routeAction = 'fix', evidence = 'receipt', keepsake = 'star', reason = 'team', bond = 'care', moment = 'keep', midpointTalk = 'no', cardAction = 'use', retreatSignal = 'tap', retreatProbe = 'repeat', miraRetreatPrepare = 'sketchbook', topic = 'past', epilogueTalk = false, disclosure = 'private', mallowResponse = 'voice', recordResponse = 'apology', cardPreference = vote_a, noticePreference = vote_b, auditAction = 'cover', cameraMode = 'lift', doorEffort = 'brace', mallowRest = 'counter', recordDecision = 'reconnected', paperHandoff = 'keep', nameKnight = false, regroupAction = 'count', rescueSupport = 'ticket', rescueCoordination = 'count', retreatSearch = 'stair', completedPublicReply = false, revealFocus = 'tell', tryConfirm = false, basementRoute = 'direct', stairWaymark = 'rail', privateTone = 'personal', lightDetail = 'first', earlyRescue = 'consider', mallowAck = 'speak', connection = 'team', connectionMoment = 'now', dateMoment = 'playful', dateActivity = 'first' }) {
  const picks = { ...choices, niko_connection_choice: connection, mira_connection_choice: connection, ash_connection_choice: connection, niko_connection_late: connection, mira_connection_late: connection, ash_connection_late: connection, close_mallow_ack_choice: mallowAck, correction_choice: disclosure, reason_choice: reason, keepsake_choice: keepsake, hint_choice: vote_a,
    niko_tone_choice: privateTone, mira_tone_choice: privateTone, ash_tone_choice: privateTone, niko_light_question: lightDetail, mira_light_question: lightDetail, ash_light_question: lightDetail, card_choice: cardPreference, notice_choice: noticePreference, regroup_signal_choice: regroupAction, crew_choice: companion, basement_tickets: basementRoute, basement_waymark_choice: stairWaymark, basement_vote: vote_b, signal_choice: signal, door_choice: doorEffort, early_door_choice: doorEffort, fourth_focus_choice: revealFocus, late_focus_choice: revealFocus, reason_focus_team: revealFocus, reason_focus_prize: revealFocus, reason_focus_company: revealFocus, history_paper_choice: paperHandoff, history_paper_public_choice: paperHandoff, history_paper_both_choice: paperHandoff, history_mallow_reply_choice: paperHandoff, history_early_paper: paperHandoff, rescue_reunion_choice: rescueSupport, rescue_coordination_choice: rescueCoordination, retreat_search_choice: retreatSearch, retreat_early_search_choice: retreatSearch, audit_action_choice: auditAction, policy_mallow_choice: mallowResponse, moment_choice: moment, moment_discuss_niko: midpointTalk, moment_discuss_mira: midpointTalk, moment_discuss_ash: midpointTalk, mallow_catch_choice: cardAction, mallow_camera_choice: cameraMode, mallow_camera_compact: cameraMode, close_mallow_choice: mallowRest, niko_bond_choice: bond, mira_bond_choice: bond, ash_bond_choice: bond, niko_question: topic, mira_question: topic, ash_question: topic, niko_work_choice: routeAction, mira_work_choice: routeAction, ash_work_choice: routeAction, evidence_choice: tryConfirm ? 'yes' : evidence, evidence_confirm_followup: evidence, plan_choice: ending, retreat_choice: retreatSignal, retreat_probe_choice: retreatProbe, mira_retreat_prepare_choice: miraRetreatPrepare, record_close_mira: recordResponse, record_unplug_choice: recordDecision };
  Object.assign(picks, { niko_date_activity: dateActivity === 'second' ? 'question' : 'toast', mira_date_activity: dateActivity === 'second' ? 'learn' : 'fold', ash_date_activity: dateActivity === 'second' ? 'landmark' : 'hand', niko_date_moment: dateMoment, mira_date_moment: dateMoment, ash_date_moment: dateMoment, early_audit_choice: auditAction, early_rescue_choice: earlyRescue, early_together_citation: auditAction === 'annotate' ? 'note' : auditAction, close_connection_niko_moment: connectionMoment, close_connection_mira_moment: connectionMoment, close_connection_ash_moment: connectionMoment });
  let id = startNode;
  const flags = {}, visited = [], seen = new Set();
  while (id) {
    const node = story[id];
    assert.ok(node, `missing node ${id}`);
    assert.ok(!seen.has(id), `unexpected loop ${id}`);
    seen.add(id); visited.push(id);
    Object.assign(flags, node.setOnVisit || {});
    if (id === 'ai_reflection' && completedPublicReply) flags.public_reply_available = 'yes';
    if (node.end) break;
    if (node.offer) {
      if (kit) { Object.assign(flags, node.offer.grant.set); id = node.offer.grant.next; }
      else id = node.offer.skip;
    } else if (node.choices) {
      const value = id.startsWith('audit_focus_') && id.endsWith('_compact') ? auditAction : picks[id];
      const available = id === 'mallow_catch_choice'
        ? node.choices.filter(c => !c.requiresTool || mallowToolAvailable(flags, c.requiresTool)) : node.choices;
      const choice = (id.endsWith('_talk_choice') || id === 'close_ash_retreat_light_compact') ? available[epilogueTalk ? 0 : 1] : available.find(c => Object.values(c.set || {}).includes(value));
      assert.ok(choice, `${id}: missing choice ${value}`);
      Object.assign(flags, choice.set);
      id = compactRescueRoute(flags, id, choice.next);
    } else if (node.input) {
      if (node.input.key === 'knightName' && nameKnight) flags.knight_named = 'yes';
      id = node.input.next;
    }
    else {
      const key = node.nextBy?.key;
      const value = key === 'early_together_callback' ? (earlyTogetherAction(flags) || flags.route_action) : key === 'early_together_style' ? (evaluatePreference(flags).style === 'neutral' && flags.card_preference === 'skip' && flags.notice_preference === 'skip' ? 'none' : evaluatePreference(flags).style) :
        key === 'preference_style' ? evaluatePreference(flags).style :
        key === 'shared_disclosure_reaction' ? sharedDisclosureReaction(flags) :
        key === 'private_disclosure_reaction' ? privateDisclosureReaction(flags) :
        key === 'souvenir_wedge_route' ? souvenirWedgeRoute(flags) :
        key === 'connection_before_bond' ? connectionBeforeBond(flags) :
        key === 'connection_after_bond' ? connectionAfterBond(flags) :
        key === 'mira_name_route' ? miraNameRoute(flags) :
        key === 'mira_close_route' ? miraCloseRoute(flags) :
        key === 'mallow_closing_route' ? mallowClosingRoute(flags) :
        key === 'mira_light_close_route' ? miraLightCloseRoute(flags, nameKnight) :
        key === 'rescue_detail_route' ? rescueDetailRoute(flags) :
        key === 'fourth_wall_route' ? fourthWallRoute(flags) :
        key === 'early_reason_route' ? earlyReasonRoute(flags) :
        key === 'receipt_after_focus' ? receiptAfterFocus(flags) :
        key === 'receipt_brief_route' ? receiptBriefRoute(flags) :
        key === 'early_audit_ready' ? (earlyAuditReady(flags) ? 'yes' : '') :
        key === 'early_audit_complete' ? (earlyAuditComplete(flags) ? 'yes' : '') :
        key === 'compact_audit_route' ? compactAuditRoute(flags) :
        key === 'hint_greeting_route' ? hintGreetingRoute(flags) :
        key === 'public_reply_route' ? publicReplyRoute(flags) :
        key === 'connection_closing_route' ? connectionClosingRoute(flags) :
        key === 'keepsake_closing_route' ? keepsakeClosingRoute(flags) : flags[key];
      let next = node.nextBy?.cases?.[value] || node.next;
      if (id === 'rescue_complete' && flags.early_rescue_now === 'open_now' && flags.rescue_opened === 'yes') next = 'early_together_comparisons';
      if (id === 'rescue_without_tool' && flags.early_rescue_now === 'open_now') next = 'rescue_finish_check';
      id = compactRetreatClosingRoute(flags, id, compactRescueRoute(flags, id, compactPocketRoute(flags, id, earlyRescueRoute(flags, id, next))));
    }
  }
  assert.ok(story[visited.at(-1)].end, 'path reaches a real ending');
  return { flags, visited };
}

// The immediate response is offered only on newly witnessed early-audit runs.
// It still visits each companion's item and relationship payoff before the
// existing coordination and rescue; the alternative keeps the four outcomes.
for (const companion of ['Niko', 'Mira', 'Ash'])
for (const routeAction of ['fix', 'proof'])
for (const situation of ['past', 'future', 'light'])
for (const paperHandoff of ['share', 'keep', 'quote', 'mallow_quote'])
for (const auditAction of ['cover', 'annotate', 'leave', 'unplug']) {
  const { flags, visited } = play({ companion, vote_a: 'direct', vote_b: 'warm', signal: 'private',
    ending: 'rescue', earlyRescue: 'open', routeAction, paperHandoff, auditAction,
    topic: situation === 'light' ? 'past' : situation, privateTone: situation === 'light' ? 'light' : 'personal',
    completedPublicReply: true });
  const lower = companion.toLowerCase();
  assert.ok(visited.includes('early_rescue_choice') && visited.includes('early_rescue_setup'));
  assert.equal(flags.early_rescue_streamlined, 'yes');
  assert.ok(!visited.includes('route_plan') && !visited.includes(`plan_${lower}`), 'the immediate route goes from the release to the item');
  assert.match(earlyRescueSetupPassage(flags, 'early_rescue_setup').text, /Mira taps once, close to the catch/);
  assert.ok(visited.indexOf(`plan_${lower}_${routeAction}`) < visited.indexOf('rescue_coordination_choice'));
  if (situation !== 'light') assert.ok(visited.indexOf(`plan_${lower}_topic_${situation}`) < visited.indexOf('rescue_coordination_choice'));
  assert.equal(visited.includes('plan_paper'), paperHandoff !== 'keep');
  assert.ok(!visited.includes('policy_mallow_choice') && !visited.includes('plan_choice'));
  assert.equal(flags.mallow_response, undefined, 'the skipped Mallow answer must not be invented');
  assert.equal(flags.ending, 'rescue');
  assert.equal(flags.early_audit_action_seen, auditAction);
  assert.equal(visited.includes('rescue_complete_unplug'), auditAction === 'unplug');
  if (companion === 'Niko' && situation === 'past') assert.ok(visited.includes('plan_niko_topic_past'), 'the edge was cleared');
  if (companion === 'Ash' && situation === 'future') assert.ok(visited.includes('plan_ash_topic_future'), 'the release was marked on the map');
}
const shortcut = play({ companion: 'Niko', vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', earlyRescue: 'open', completedPublicReply: true });
for (const change of [{ early_rescue_offer_due: undefined }, { early_rescue_setup_seen: undefined },
  { early_rescue_choice: undefined }, { early_rescue_choice: 'consider' }, { policy_goal_compact_seen: undefined },
  { early_rescue_committed: undefined }, { early_audit_action_seen: undefined }, { ending: 'record' }, { route_action: 'proof' }]) {
  assert.equal(earlyRescueRoute({ ...shortcut.flags, ...change }, 'plan_niko_fix', 'plan_choice'), 'plan_choice', 'incomplete, mismatched and legacy states keep the existing plan');
}
const oldRescue = { ...shortcut.flags }; delete oldRescue.early_rescue_streamlined;
assert.equal(earlyRescueSetupPassage(oldRescue, 'early_rescue_setup'), null, 'older saves keep their original text');
assert.equal(earlyRescueRoute(oldRescue, 'early_rescue_setup', 'route_plan'), 'route_plan', 'older early-rescue checkpoints retain the original introduction');
assert.equal(earlyRescueRoute(oldRescue, 'plan_paper', 'route_plan'), 'route_plan', 'older returned-paper checkpoints retain the original introduction');
const newRescue = { ...shortcut.flags, early_rescue_streamlined: 'yes' };
assert.equal(earlyRescueRoute({ ...newRescue, folded_paper: 'yes' }, 'early_rescue_setup', 'plan_paper'), 'plan_paper', 'returned paper is not skipped');
assert.equal(earlyRescueRoute({ ...newRescue, folded_paper: 'yes' }, 'plan_paper', 'route_plan'), 'plan_niko_fix');
assert.equal(earlyRescueRoute({ ...newRescue, folded_paper: undefined }, 'early_rescue_setup', 'route_plan'), 'plan_niko_fix');
assert.equal(earlyRescueRoute({ ...newRescue, folded_paper: undefined }, 'plan_paper', 'route_plan'), 'route_plan', 'unwitnessed paper cannot create the shortcut');
const legacyOffer = { ...shortcut.flags }; delete legacyOffer.early_rescue_offer_due;
assert.equal(compactAuditRoute(legacyOffer), 'early', 'an older checkpoint retains the existing Mallow continuation');
assert.equal(compactAuditRoute({ policy_goal_compact_seen: 'yes' }), '', 'incomplete old checkpoints do not invent the offer');

// The early audit replaces the later duplicate only when the public exchange,
// its paper handoff and the intervention were actually seen in a new run.
for (const handoff of ['share', 'keep', 'quote', 'mallow_quote'])
  for (const action of ['cover', 'annotate', 'leave', 'unplug'])
    for (const [vote_a, vote_b, cardPreference, noticePreference] of [
      ['direct', 'direct', 'direct', 'direct'], ['warm', 'warm', 'warm', 'warm'],
      ['direct', 'warm', 'direct', 'warm'], ['skip', 'skip', 'skip', 'skip']
    ]) {
      const { visited, flags } = play({ companion: 'Mira', vote_a, vote_b, cardPreference, noticePreference,
        signal: 'private', ending: 'rescue', kit: false, completedPublicReply: true, paperHandoff: handoff, auditAction: action });
      const choice = visited.indexOf('early_audit_choice');
      const response = visited.indexOf(action === 'annotate' ? 'early_audit_annotation_written' : `early_audit_${action}`);
      const goal = visited.indexOf('policy_goal_compact');
      assert.ok(choice > visited.indexOf('history_comparisons_early') && response > choice && goal > response);
      assert.ok(visited.indexOf('policy_mallow_choice') > goal);
      assert.ok(!visited.includes('audit_receipt') && !visited.includes('audit_focus_tell_compact') && !visited.includes('audit_focus_listen_compact'));
      assert.equal(flags.audit_action, action);
      assert.equal(flags.early_audit_action_seen, action);
      assert.ok(earlyAuditComplete(flags));
      assert.equal(visited.includes('plan_paper'), handoff !== 'keep');
      if (vote_a === 'skip') assert.ok(visited.includes('policy_no_comparison_compact'));
    }
assert.match(story.early_audit_choice.text, /Mira.*second report.*cites the receipt.*receipt cites it.*welcome agreement.*report confirming it.*report confirming that report/s);
assert.match(story.early_audit_choice.text, /never wrote a report.*haven’t opened the door/s);
assert.deepEqual(story.early_audit_choice.choices.map(item => item.label), story.audit_action_choice.choices.map(item => item.label));
const earlyCompleteFlags = { early_audit_due: 'yes', reveal_pace_v2: 'yes', early_paper_due: 'yes', early_paper_shown: 'yes',
  early_paper_done: 'yes', group_reply_seen: 'yes', public_reply_shown: 'yes', comparisons_revealed: 'yes', paper_handoff: 'share',
  reveal_focus: 'tell', signal: 'private', early_audit_present: 'yes', audit_seen: 'yes', mira_report_seen: 'yes',
  audit_action: 'cover', early_audit_action_seen: 'cover', policy_goal_compact_seen: 'yes' };
assert.ok(earlyAuditReady(earlyCompleteFlags) && earlyAuditComplete(earlyCompleteFlags));
assert.equal(compactAuditRoute(earlyCompleteFlags), 'early');
for (const key of ['early_audit_due', 'early_paper_shown', 'early_paper_done', 'group_reply_seen', 'public_reply_shown',
  'comparisons_revealed', 'paper_handoff', 'reveal_focus', 'signal', 'early_audit_present', 'audit_seen', 'mira_report_seen', 'early_audit_action_seen']) {
  assert.equal(earlyAuditComplete({ ...earlyCompleteFlags, [key]: undefined }), false, `missing ${key} must retain the original audit`);
}
assert.equal(earlyAuditComplete({ ...earlyCompleteFlags, audit_action: 'unplug' }), false);
assert.equal(earlyAuditComplete({ ...earlyCompleteFlags, audit_action: 'annotate', early_audit_action_seen: 'annotate' }), false);
assert.ok(earlyAuditComplete({ ...earlyCompleteFlags, audit_action: 'annotate', early_audit_action_seen: 'annotate', annotation_written: 'yes', audit_seal_seen: 'yes' }));

// Both routes go directly from an informed choice to its physical payoff.
// The original intermediary remains the route for incomplete/old saves.
for (const companion of ['Niko', 'Mira', 'Ash']) {
  const rescue = play({ companion, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
  const beat = `rescue_${companion.toLowerCase()}_fix`;
  assert.equal(rescue.visited[rescue.visited.indexOf('end_rescue') + 1], beat);
  assert.equal(rescue.flags.rescue_tool_seen, companion);
  assert.equal(compactRescueRoute({ ...rescue.flags, rescue_tool_shortcut_due: undefined }, 'end_rescue', 'rescue_fix_companion'), 'rescue_fix_companion');
  assert.equal(compactRescueRoute({ ...rescue.flags, rescue_tool_shortcut_due: 'different' }, 'end_rescue', 'rescue_fix_companion'), 'rescue_fix_companion');
  for (const moment of ['keep', 'tear']) {
    const mallow = play({ companion, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'mallow', kit: false, moment });
    assert.equal(mallow.visited[mallow.visited.indexOf('mallow_catch_choice') + 1], `mallow_catch_use_${moment}`);
    assert.equal(mallow.flags.souvenir_wedge_seen, 'yes');
    assert.equal(compactRescueRoute({ ...mallow.flags, souvenir_shortcut_due: undefined }, 'mallow_catch_choice', 'mallow_catch_use'), 'mallow_catch_use');
    assert.equal(compactRescueRoute({ ...mallow.flags, midpoint_route: 'different' }, 'mallow_catch_choice', 'mallow_catch_use'), 'mallow_catch_use');
  }
}

// The first completed comparison shapes a greeting the player actually sees,
// even if the later comparison makes the final policy neutral.
for (const cardPreference of ['direct', 'warm', 'skip']) {
  const result = play({ companion: 'Niko', vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false,
    cardPreference, noticePreference: cardPreference === 'direct' ? 'warm' : 'direct' });
  assert.ok(result.visited.includes(cardPreference === 'skip' ? 'hint_mallow' : `hint_mallow_${cardPreference}`));
  assert.equal(result.flags.hint_greeting_seen, cardPreference === 'skip' ? undefined : cardPreference);
  if (cardPreference !== 'skip') assert.equal(hintGreetingRoute(result.flags), evaluatePreference({ card_preference: cardPreference }).style);
}
assert.equal(hintGreetingRoute({ card_preference: 'warm', card_comparison_seen: 'yes' }), '', 'old saves do not acquire the new greeting');
assert.equal(hintGreetingRoute({ card_preference: 'warm', hint_steering_due: 'yes' }), '', 'an unseen card cannot steer the greeting');
assert.equal(hintGreetingRoute({ card_preference: 'skip', card_comparison_seen: 'yes', hint_steering_due: 'yes' }), '', 'delegating is not a preference');

// A new invitation follows the shared activity, while older checkpoints keep
// their earlier ordering. Mira's optional knight name must not bypass it.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) for (const connection of ['team', 'ask']) for (const nameKnight of companion === 'Mira' && bond === 'play' ? [false, true] : [false]) {
  const { flags, visited } = play({ companion, bond, connection, nameKnight, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
  const lower = companion.toLowerCase();
  const invite = visited.indexOf(`${lower}_connection_late`);
  assert.ok(visited.indexOf(`${lower}_bond_${bond}`) < invite, `${companion} sees the shared activity first`);
  if (companion === 'Niko') assert.ok(visited.indexOf('niko_note') < invite);
  if (companion === 'Mira' && bond === 'play') assert.ok(visited.indexOf(nameKnight ? 'mira_knight_named' : 'mira_knight_name_check') < invite);
  assert.ok(invite < visited.indexOf(`${lower}_tone_choice`));
  assert.equal(flags.connection_late_seen, companion);
}
for (const name of ['Niko', 'Mira', 'Ash']) {
  assert.equal(connectionBeforeBond({ match_label_seen: name }), name, 'legacy match keeps the earlier invitation');
  assert.equal(connectionBeforeBond({ match_label_seen: name, late_connection_due: name, social_v2: 'yes' }), '', 'new run performs the activity first');
  assert.equal(connectionAfterBond({ companion: name, late_connection_due: name, social_v2: 'yes' }), name);
  assert.equal(connectionAfterBond({ companion: name, late_connection_due: name, connection_seen: name, social_v2: 'yes' }), 'tone');
  assert.equal(connectionAfterBond({ companion: name, social_v2: 'yes' }), 'tone', 'legacy saves keep tone next');
  assert.equal(connectionBeforeBond({ match_label_seen: name, late_connection_due: name }), name, 'incomplete saves keep earlier match path');
  assert.equal(connectionAfterBond({ companion: name, late_connection_due: name }), '', 'incomplete saves do not invent an invitation');
}
for (const name of ['Niko', 'Mira', 'Ash']) for (const outcome of ['now', 'later']) for (const ending of ['rescue', 'record', 'mallow']) for (const signal of ['private', 'repeat']) {
  const { visited, flags } = play({ companion: name, connection: 'ask', connectionMoment: outcome, ending, signal, vote_a: 'direct', vote_b: 'warm', kit: false });
  const lower = name.toLowerCase();
  assert.ok(visited.includes(`close_connection_${lower}_moment`));
  assert.ok(visited.includes(`close_connection_${lower}_${outcome}`));
  assert.equal(story[`close_connection_${lower}_${outcome}`].portraitSpeaker, name, 'the chosen companion remains visible during the date payoff');
  assert.ok(!visited.includes(`close_connection_${lower}_${outcome === 'now' ? 'later' : 'now'}`));
  assert.equal(flags.connection_moment, outcome);
  assert.equal(flags.connection_moment_seen, `${name}_${outcome}`);
  assert.ok(visited.includes(signal === 'repeat' ? 'close_repeat' : 'close_private'));
}
assert.equal(miraNameRoute({ companion: 'Mira', late_connection_due: 'Mira', social_v2: 'yes' }), 'invite');
assert.equal(miraNameRoute({ companion: 'Mira', late_connection_due: 'Mira', social_v2: 'yes', knight_named: 'yes' }), 'named');

// The system's match label never substitutes for the companion's response.
// A date callback requires both the invitation and that companion's answer.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const connection of ['team', 'ask']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) for (const signal of ['private', 'repeat']) {
  const { flags, visited } = play({ companion, connection, ending, signal, vote_a: 'direct', vote_b: 'warm', kit: false });
  const lower = companion.toLowerCase();
  assert.ok(visited.includes(`${lower}_connection_${connection === 'ask' ? 'date' : 'team'}_late`));
  assert.ok(visited.indexOf(`${lower}_bond_choice`) < visited.indexOf(`${lower}_connection_late`));
  assert.ok(visited.indexOf(`${lower}_connection_late`) < visited.indexOf(`${lower}_tone_choice`));
  assert.equal(flags.connection_seen, companion);
  assert.equal(visited.includes(`close_connection_${lower}_moment`), connection === 'ask' && ending !== 'retreat');
  assert.equal(visited.includes(`close_connection_${lower}`), false, 'new paths use the participatory moment');
  assert.equal(visited.includes(signal === 'repeat' ? 'close_repeat' : 'close_private'), ending !== 'retreat');
}
assert.equal(connectionClosingRoute({ companion: 'Niko', connection_choice: 'ask', signal: 'private', ending: 'rescue' }), 'private', 'old saves do not invent an answer');
assert.equal(connectionClosingRoute({ companion: 'Niko', connection_choice: 'ask', connection_seen: 'Mira', signal: 'repeat', ending: 'rescue' }), 'repeat', 'a different companion cannot supply the answer');
assert.equal(connectionClosingRoute({ companion: 'Mira', connection_choice: 'ask', connection_seen: 'Mira', signal: 'private', ending: 'retreat' }), 'private', 'an unresolved rescue takes precedence');
for (const name of ['Niko', 'Mira', 'Ash']) {
  const valid = { companion: name, connection_choice: 'ask', connection_seen: name, connection_late_seen: name, connection_moment_due: name, signal: 'private', ending: 'rescue' };
  assert.equal(connectionClosingRoute(valid), `${name}_moment`);
  assert.equal(connectionClosingRoute({ ...valid, ending: 'retreat' }), 'private');
  assert.equal(connectionClosingRoute({ ...valid, connection_choice: 'team' }), 'private');
  assert.equal(connectionClosingRoute({ ...valid, connection_moment_due: 'missing' }), name, 'old saves retain the earlier callback');
  assert.equal(connectionClosingRoute({ ...valid, connection_late_seen: 'missing' }), name, 'unwitnessed late acceptance is not invented');
}
assert.equal(story.niko_fun.next, 'niko_bond_choice', 'legacy saves without a match keep their original continuation');
assert.equal(story.mira_fun.next, 'mira_bond_choice');
assert.equal(story.ash_fun.next, 'ash_bond_choice');


// A rescue or record can acknowledge Mallow without deciding whether the
// plush and screen are the same, and without changing the other outcomes.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) for (const signal of ['private', 'repeat']) for (const mallowAck of ['speak', 'rejoin']) {
  const { flags, visited } = play({ companion, ending, signal, mallowAck, vote_a: 'direct', vote_b: 'warm', kit: false });
  const available = ending === 'rescue' || ending === 'record';
  assert.equal(visited.includes('close_mallow_ack_choice'), available);
  assert.equal(visited.includes('close_mallow_ack_speak'), available && mallowAck === 'speak');
  if (available) {
    assert.equal(flags.mallow_ack, mallowAck);
    assert.ok(visited.indexOf('close_mallow_ack_choice') > visited.indexOf(signal === 'repeat' ? 'close_repeat' : 'close_private'));
    assert.ok(visited.indexOf('close_mallow_ack_choice') < visited.indexOf('close_reason'));
  } else assert.equal(flags.mallow_ack, undefined);
}
assert.equal(mallowClosingRoute({ ending: 'rescue' }), '', 'older checkpoints retain their default');
assert.equal(mallowClosingRoute({ ending: 'record' }), '');
assert.equal(mallowClosingRoute({ ending: 'mallow' }), 'mallow');
assert.equal(mallowClosingRoute({ ending: 'retreat' }), 'retreat');
assert.equal(mallowClosingRoute({ ending: 'rescue', mallow_ack_due: 'yes' }), 'acknowledge');
assert.doesNotMatch(story.close_mallow_ack_speak.text, /screen (?:is|stays|goes) (?:dark|on|off)/i);

// Taking the detour is an actual alternate location, with a choice of portable
// waymark. The direct route rejoins without rendering the detour.
for (const route of ['direct', 'stairs']) for (const mark of ['rail', 'sign']) {
  const run = play({ companion: 'Ash', vote_a: 'skip', vote_b: 'skip', signal: 'private', ending: 'retreat', kit: false, basementRoute: route, stairWaymark: mark });
  const ids = run.visited;
  assert.equal(ids.includes('basement_stair_detour'), route === 'stairs');
  assert.equal(ids.includes(`basement_waymark_${mark}`), route === 'stairs');
  assert.ok(ids.indexOf('basement_vote') < ids.indexOf('descent'));
  if (route === 'stairs') {
    assert.ok(ids.indexOf('basement_stair_detour') < ids.indexOf('basement_detour_return'));
    assert.equal(run.flags.stair_waymark_seen, mark);
    assert.equal(retreatWaymark(run.flags), mark);
    assert.match(retreatWaymarkText[mark], /loose bracket/);
  } else assert.equal(retreatWaymark(run.flags), '');
}
assert.equal(retreatWaymark({ ending: 'retreat', basement_route: 'stairs', stair_waymark: 'rail' }), '');
assert.equal(retreatWaymark({ ending: 'retreat', basement_route: 'stairs', stair_waymark: 'sign', stair_waymark_seen: 'rail' }), '');
assert.equal(retreatWaymark({ ending: 'rescue', basement_route: 'stairs', stair_waymark: 'sign', stair_waymark_seen: 'sign' }), '');
assert.match(retreatWaymarkText.rail, /notch.*map.*press/i);
assert.match(retreatWaymarkText.sign, /slide.*EXIT sign.*step/i);

// Sharing repeats only the player's words; the companion gets their own
// response about being overheard only when their disclosure was visited.
for (const companion of ['Niko', 'Mira', 'Ash']) {
  const reactionId = `signal_repeat_${companion.toLowerCase()}`;
  const { flags, visited } = play({ companion, vote_a: 'direct', vote_b: 'warm', signal: 'repeat', ending: 'rescue', kit: false });
  assert.equal(flags.shared_reaction_seen, companion);
  assert.ok(visited.indexOf('signal_repeat_react') < visited.indexOf(reactionId));
  assert.ok(visited.indexOf(reactionId) < visited.indexOf('mallow_request'));
  assert.equal(story[reactionId].speaker, companion);
  assert.doesNotMatch(story[reactionId].text, /\{(?:privateAnswer|answer)\}/);
  const keptPrivate = play({ companion, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
  assert.ok(!keptPrivate.visited.includes(reactionId));
  const privateId = `signal_private_${companion.toLowerCase()}`;
  assert.equal(keptPrivate.flags.private_reaction_seen, companion);
  assert.ok(keptPrivate.visited.indexOf('signal_private_receipt') < keptPrivate.visited.indexOf(privateId));
  assert.ok(keptPrivate.visited.indexOf(privateId) < keptPrivate.visited.indexOf('mallow_request'));
  assert.ok(story[privateId].text.includes(privateDisclosureLines[companion]));
  assert.doesNotMatch(story[privateId].text, /\{(?:privateAnswer|answer)\}/);
  assert.equal(privateDisclosureReaction({ companion, signal: 'private', personal_disclosure_seen: `${companion.toLowerCase()}_private` }), '', 'old checkpoints without the visit marker retain their existing path');
  assert.equal(privateDisclosureReaction({ companion, signal: 'private', private_reaction_due: 'yes', personal_disclosure_seen: `${companion === 'Niko' ? 'mira' : 'niko'}_private` }), '', 'mismatched checkpoints do not assign another character’s disclosure');
  assert.equal(sharedDisclosureReaction({ companion, signal: 'repeat' }), '', 'older checkpoints do not invent a disclosure');
  assert.equal(sharedDisclosureReaction({ companion, signal: 'repeat', personal_disclosure_seen: `${companion === 'Niko' ? 'mira' : 'niko'}_private` }), '', 'mismatched checkpoints do not assign another character’s disclosure');
}

// The team signal is chosen while the group deals with an ordinary little
// disaster together. Each choice has its own immediate response and all
// routes return to the original card scene. Legacy saves already at a
// keepsake response have no fort_scene_due flag and follow the original next.
assert.deepEqual(story.signal_intro.setOnVisit, { fort_scene_due: 'yes' });
// An older save at the choice sees the updated mishap and should also see its
// resolution. A save already at a response still has its original fallback.
assert.deepEqual(story.keepsake_choice.setOnVisit, { fort_scene_due: 'yes' });
for (const [signal, action, consequence] of [
  ['star', /hold the map flat/i, /saved the map/i],
  ['bell', /ring the bell to warn Niko/i, /heard the bell just in time/i],
  ['ribbon', /tie the slipping roof/i, /tied the roof in place/i],
]) {
  const choice = story.keepsake_choice.choices.find(item => item.set.keepsake === signal);
  assert.match(choice.label, action);
  assert.match(story[`fort_${signal}`].text, consequence);
}
for (const keepsake of ['star', 'bell', 'ribbon']) {
  const response = story[`keepsake_${keepsake}`];
  assert.equal(response.next, 'card_intro');
  assert.equal(response.nextBy.key, 'fort_scene_due');
  assert.equal(response.nextBy.cases.yes, `fort_${keepsake}`);
  assert.equal(story[`fort_${keepsake}`].next, 'fort_settled');
  for (const companion of ['Niko', 'Mira', 'Ash']) {
    const { visited, flags } = play({ companion, keepsake, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
    assert.equal(flags.keepsake, keepsake);
    assert.ok(visited.indexOf(`keepsake_${keepsake}`) < visited.indexOf(`fort_${keepsake}`));
    assert.ok(visited.indexOf(`fort_${keepsake}`) < visited.indexOf('fort_settled'));
    assert.ok(visited.indexOf('fort_settled') < visited.indexOf('card_intro'));
    for (const other of ['star', 'bell', 'ribbon'].filter(value => value !== keepsake)) assert.ok(!visited.includes(`fort_${other}`));
  }
}
assert.equal(story.fort_settled.next, 'card_intro');


// Mira can challenge the forged attribution only if the player actually saw
// this version of the report. The quoted message was addressed to the whole
// crew; the optional earlier private conversation is never reproduced here.
assert.deepEqual(story.history_public_quote.setOnVisit, { mira_report_seen: 'yes' });
assert.match(story.history_public_quote.text, /second report names Mira as its author/);
for (const handoff of ['share', 'keep']) {
  const node = story[`history_paper_${handoff}`];
  assert.equal(node.next, 'history_reflect', 'older checkpoints never invent a report they did not see');
  assert.equal(node.nextBy.key, 'mira_report_seen');
  assert.equal(node.nextBy.cases.yes, `history_paper_${handoff}_report`);
  const response = story[`history_paper_${handoff}_report`];
  assert.equal(response.location, 'playroom');
  assert.match(response.text, /never wrote a report/i);
  assert.doesNotMatch(response.text, /\{(?:privateAnswer|answer)\}/);
  assert.equal(response.next, 'history_reflect');
  for (const signal of ['repeat', 'private']) {
    const { visited } = play({ companion: 'Mira', vote_a: 'direct', vote_b: 'warm', signal, ending: 'rescue', kit: false, paperHandoff: handoff });
    assert.ok(visited.indexOf('history_public_quote') < visited.indexOf(`history_paper_${handoff}_compact`));
    assert.match(story[`history_paper_${handoff}_compact`].text, /never wrote a report/i);
    assert.ok(!visited.includes(`history_paper_${handoff}_report`));
    assert.ok(!visited.includes(`history_paper_${handoff === 'share' ? 'keep' : 'share'}_report`));
  }
}
assert.match(story.history_paper_keep_report.text, /You tell Mira/);

// A physical check of the count is later displayed as system confirmation.
// The action, not a guessed preference or an unvisited choice, determines the
// replay; saves from before this beat retain the original generic reveal.
for (const keepsake of ['star', 'bell', 'ribbon']) for (const regroupAction of ['touch', 'count']) for (const companion of ['Niko', 'Mira', 'Ash']) {
  const { visited, flags } = play({ companion, keepsake, regroupAction, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
  assert.equal(flags.regroup_action, regroupAction);
  assert.ok(visited.indexOf(`regroup_signal_${keepsake}`) < visited.indexOf('regroup_signal_choice'));
  assert.ok(visited.indexOf('regroup_signal_choice') < visited.indexOf(`regroup_signal_${regroupAction}`));
  assert.ok(visited.indexOf(`regroup_signal_${regroupAction}`) < visited.indexOf('correction_choice'));
  const combined = `fourth_wall_${regroupAction}_${companion.toLowerCase()}_combined`;
  assert.ok(visited.indexOf('fourth_wall_intro_compact') < visited.indexOf(combined));
  assert.ok(visited.indexOf(combined) < visited.indexOf('moment_return_keep_compact'));
  assert.ok(!visited.includes(`fourth_wall_${regroupAction}_compact`));
  assert.ok(!visited.includes(`fourth_wall_${regroupAction === 'touch' ? 'count' : 'touch'}_${companion.toLowerCase()}_combined`));
  assert.deepEqual(story[combined].remember, { source: 'crew_choice', flag: 'companion' });
  assert.equal(story.fourth_wall_intro.remember.source, 'signal_choice');
}
assert.match(story.regroup_signal_touch.text, /ask Mallow to check.*THANK YOU FOR CONFIRMING/i);
assert.match(story.regroup_signal_count.text, /two pieces.*THREE VERIFIED/i);
assert.match(story.fourth_wall_touch.text, /fingerprint.*ask for another check.*POSITIVE FEEDBACK/i);
assert.match(story.fourth_wall_count.text, /two ticket pieces.*THREE VERIFIED/i);
assert.equal(story.regroup_mallow.next, 'correction_choice', 'an old save without a keepsake continues');
assert.equal(story.fourth_wall_intro.next, 'fourth_wall_companion', 'an old save without this action retains the original reveal');

// The person who shared the selected activity reacts to its uncanny image
// before the player chooses what to do with it. No unchosen activity or
// companion response should appear, and old caption saves still continue.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) {
  const { visited } = play({ companion, bond, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
  const picture = `moment_${companion.toLowerCase()}_${bond}`;
  const reply = `${picture}_reply`;
  assert.equal(story[reply].speaker, companion);
  assert.ok(visited.indexOf(picture) < visited.indexOf(reply));
  assert.ok(visited.indexOf(reply) < visited.indexOf('moment_caption'));
  assert.ok(visited.indexOf('moment_caption') < visited.indexOf('moment_choice'));
  for (const other of ['niko', 'mira', 'ash']) for (const otherBond of ['care', 'play']) {
    if (other !== companion.toLowerCase() || otherBond !== bond) {
      assert.ok(!visited.includes(`moment_${other}_${otherBond}_reply`));
    }
  }
}
assert.equal(story.moment_caption.next, 'moment_choice', 'caption checkpoints do not repeat a reaction');

// After the personalised card, players can speak to the friend who shared
// the original moment, or proceed. This conversation is audible to the crew.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) for (const moment of ['keep', 'tear']) for (const midpointTalk of ['yes', 'no']) {
  const { visited, flags } = play({ companion, bond, moment, midpointTalk, vote_a:'skip', vote_b:'skip', signal:'private', ending:'rescue', kit:false });
  const discuss = `moment_discuss_${companion.toLowerCase()}`;
  assert.ok(visited.indexOf(`moment_${moment}`) < visited.indexOf(discuss));
  const input = `mid_${companion.toLowerCase()}_input`, chat = `mid_${companion.toLowerCase()}_chat`;
  assert.equal(flags.midpoint_chat, midpointTalk);
  assert.equal(visited.includes(input), midpointTalk === 'yes');
  assert.equal(visited.includes(chat), midpointTalk === 'yes');
  assert.equal(visited.includes('private_signal_after_group'), midpointTalk === 'yes');
  assert.equal(visited.includes('private_signal'), midpointTalk === 'no');
  assert.ok(visited.indexOf(midpointTalk === 'yes' ? 'private_signal_after_group' : 'private_signal') < visited.indexOf('signal_choice'));
  if (midpointTalk === 'yes') {
    assert.ok(visited.indexOf(discuss) < visited.indexOf(input));
    assert.ok(visited.indexOf(chat) < visited.indexOf('shared_discovery'));
    assert.equal(story[input].input.key, 'midpoint');
    assert.match(story[input].input.prompt, /others can hear/i);
    assert.equal(story[chat].ai.character, companion);
    assert.equal(story[chat].ai.audience, 'group');
    assert.equal(story[chat].ai.inputKey, 'midpoint');
    assert.equal(story[chat].text, story[chat].ai.fallback);
  }
  for (const other of ['Niko', 'Mira', 'Ash'].filter(name => name !== companion)) {
    assert.ok(!visited.includes(`mid_${other.toLowerCase()}_chat`));
  }
}
for (const id of ['moment_keep', 'moment_tear']) {
  assert.equal(story[id].next, 'shared_discovery', 'older checkpoints do not acquire a new conversation');
  for (const name of ['niko', 'mira', 'ash']) assert.equal(story[id].nextBy.cases[name], `moment_discuss_${name}`);
  assert.ok(story[id].text.length <= 180, 'the companion AI context can still include the chosen card action');
}
// The two treatments of the physical card lead to different uncanny
// observations on its screen image, for every companion. Older saves have no
// new visit flag: their existing moment value still reaches the same node, and
// the display never claims that the old player saw a particular mark made.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const moment of ['keep', 'tear']) {
  const { visited } = play({ companion, bond: 'care', moment, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
  assert.ok(visited.indexOf(`moment_${moment}`) < visited.indexOf(`moment_return_${moment}_compact`));
  assert.ok(!visited.includes(`moment_return_${moment === 'keep' ? 'tear' : 'keep'}_compact`));
  assert.match(story[`moment_return_${moment}_compact`].text, /screen/i);
  assert.match(story[`moment_return_${moment}_compact`].text, /pocket/i);
  assert.match(story[`moment_return_${moment}_compact`].text, /It kept a version/);
}
assert.match(story.moment_keep.text, /Ash.*thumb.*card.s back/i);
assert.match(story.moment_tear.text, /ink.*torn edges.*framing each scrap/i);
for (const suffix of ['', '_compact']) {
  assert.match(story[`moment_return_keep${suffix}`].text, /grey thumbprint/i);
  assert.match(story[`moment_return_tear${suffix}`].text, /four neatly framed scraps/i);
}
assert.equal(story.shared_discovery.next, 'private_signal', 'old checkpoints do not assume the new conversation happened');
assert.equal(story.private_signal_after_group.next, 'mallow_privacy_request', 'older saves without a tone proceed to the existing request');
assert.equal(story.mallow_privacy_request.next, 'signal_choice', 'the earlier private message remains a player-controlled choice');

// The offer moved after the team is introduced. New games encounter it once;
// old checkpoints already past the offer must not encounter it again, and old
// checkpoints inside the offer must still return to the game introduction.
{
  function walkTo(start, initialFlags, stop, takeKit = false) {
    const flags = { ...initialFlags }, visited = [];
    let id = start;
    while (id !== stop) {
      assert.ok(story[id] && visited.length < 80, `failed to reach ${stop} from ${start}`);
      visited.push(id);
      const node = story[id];
      Object.assign(flags, node.setOnVisit || {});
      if (node.offer) {
        if (takeKit) Object.assign(flags, node.offer.grant.set);
        id = takeKit ? node.offer.grant.next : node.offer.skip;
      } else if (node.choices) {
        Object.assign(flags, node.choices[0].set || {});
        id = node.choices[0].next;
      } else {
        id = node.nextBy?.cases?.[flags[node.nextBy.key]] || node.next;
      }
    }
    return { flags, visited };
  }
  for (const takeKit of [false, true]) {
    const { flags, visited } = walkTo(startNode, {}, 'crew_plan', takeKit);
    assert.ok(visited.indexOf('game_intro') < visited.indexOf('repair_offer'));
    assert.ok(visited.indexOf('reason_choice') < visited.indexOf('repair_offer'));
    assert.ok(visited.indexOf('hint_choice') < visited.indexOf('repair_offer'));
    assert.equal(visited.filter(id => id === 'repair_offer').length, 1);
    assert.equal(flags.repair_offer_due, 'done');
    assert.equal(flags.repairKit, takeKit ? 'free' : undefined);
  }
  for (const start of ['hint_direct', 'hint_warm', 'hint_skip']) for (const takeKit of [false, true]) {
    const { flags, visited } = walkTo(start, { reason: 'team', repair_offer_due: 'yes' }, 'crew_plan', takeKit);
    assert.ok(visited.indexOf(start) < visited.indexOf('mallow_team_wave'));
    assert.ok(visited.indexOf('mallow_team_wave') < visited.indexOf('repair_offer_intro'));
    assert.equal(visited.filter(id => id === 'mallow_team_wave').length, 1);
    assert.equal(flags.repairKit, takeKit ? 'free' : undefined);
  }
  for (const start of ['repair_offer_intro', 'repair_offer', 'repair_free', 'repair_skip']) {
    const { visited } = walkTo(start, {}, 'crew_plan');
    assert.ok(visited.includes('game_intro'), `${start}: old offer checkpoint must still introduce the game`);
    assert.equal(visited.filter(id => id === 'repair_offer').length, ['repair_offer_intro', 'repair_offer'].includes(start) ? 1 : 0);
  }
  for (const start of ['game_intro', 'hint_direct', 'hint_warm', 'hint_skip']) {
    const { visited } = walkTo(start, {}, 'crew_plan');
    assert.ok(!visited.includes('repair_offer'), `${start}: old checkpoint must not repeat the offer`);
  }
}

// A map choice made before the story update is honoured after any companion
// route; an old checkpoint inside a notice choice still rejoins the old setup.
{
  const next = (id, flags) => story[id].nextBy?.cases?.[flags[story[id].nextBy.key]] || story[id].next;
  for (const companion of ['niko', 'mira', 'ash']) for (const action of ['fix', 'proof']) {
    const id = `${companion}_work_${action}`;
    assert.equal(next(id, {}), 'notice_intro', `${id}: new play should offer the map`);
    for (const old of ['direct', 'warm', 'skip']) assert.equal(next(id, { notice_preference: old }), 'regroup', `${id}: do not repeat ${old}`);
  }
  for (const variant of ['direct', 'warm', 'skip']) {
    const id = `notice_${variant}`;
    assert.equal(next(id, {}), 'crew_plan', `${id}: pre-split save should continue to partner choice`);
    for (const companion of ['Niko', 'Mira', 'Ash']) assert.equal(next(id, { companion }), 'regroup');
  }
}

// Give the companion's quiet conversation room before the disturbing clue;
// checkpoints made in the older order must neither repeat the clue nor skip
// the conversation. The marker is set only when a new route reaches a bond.
{
  function walk(start, initialFlags, stop) {
    const flags = { ...initialFlags }, visited = [];
    let id = start;
    while (id !== stop) {
      assert.ok(story[id] && !visited.includes(id) && visited.length < 20, `${start}: cannot reach ${stop}`);
      visited.push(id);
      const node = story[id];
      Object.assign(flags, node.setOnVisit || {});
      if (node.input) id = node.input.next;
      else if (node.choices) {
        Object.assign(flags, node.choices[0].set || {});
        id = node.choices[0].next;
      }
      else id = node.nextBy?.cases?.[flags[node.nextBy.key]] || node.next;
    }
    return visited;
  }
  for (const name of ['niko', 'mira', 'ash']) {
    for (const bond of ['care', 'play']) {
      const visited = walk(`${name}_bond_${bond}`, {}, `${name}_after`);
      assert.ok(visited.indexOf(`${name}_private`) < visited.indexOf(`${name}_clue`));
      assert.ok(visited.indexOf(`${name}_chat`) < visited.indexOf(`${name}_clue`));
      assert.ok(visited.indexOf(`${name}_question`) < visited.indexOf(`${name}_clue`));
      assert.equal(visited.filter(id => id === `${name}_private`).length, 1);
      assert.equal(visited.filter(id => id === `${name}_clue`).length, 1);
    }
    const priorToClue = walk(`${name}_clue`, {}, `${name}_after`);
    assert.ok(priorToClue.indexOf(`${name}_clue`) < priorToClue.indexOf(`${name}_private`));
    assert.equal(priorToClue.filter(id => id === `${name}_clue`).length, 1);
    assert.equal(priorToClue.filter(id => id === `${name}_private`).length, 1);
    for (const checkpoint of [`${name}_private`, `${name}_input`]) {
      const visited = walk(checkpoint, {}, `${name}_after`);
      assert.ok(!visited.includes(`${name}_clue`), `${checkpoint}: do not repeat the old clue`);
      assert.equal(visited.filter(id => id === `${name}_chat`).length, 1);
    }
    for (const checkpoint of [`${name}_after`, `${name}_question`, `${name}_question_past`, `${name}_question_future`]) {
      const visited = walk(checkpoint, {}, `${name}_work_choice`);
      assert.ok(!visited.includes(`${name}_clue`), `${checkpoint}: do not repeat the old clue`);
    }
  }
  assert.deepEqual(story.niko_bond_choice.setOnVisit, { niko_note_due: 'yes' });
  for (const bond of ['care', 'play']) {
    const current = walk(`niko_bond_${bond}`, { niko_note_due: 'yes' }, 'niko_input');
    assert.ok(current.indexOf('niko_note') > current.indexOf(`niko_bond_${bond}`));
    assert.ok(current.indexOf('niko_note') < current.indexOf('niko_private'));
    const older = walk(`niko_bond_${bond}`, {}, 'niko_input');
    assert.ok(!older.includes('niko_note'), 'a checkpoint after the lid choice keeps its previous continuation');
  }
  assert.deepEqual(story.niko_note.setOnVisit, { niko_note_seen: 'yes' });
  assert.match(story.niko_note.text, /brother.*wrote/i);
}

// Guard against a long uninterrupted crisis: the player can help or listen
// The machine's CONFIRM is optional and does not replace the three ways to
// examine the contradiction. Its callback appears only when it was pressed.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const evidence of ['receipt', 'tickets', 'voice']) for (const doorEffort of ['brace', 'listen']) {
  const settings = { companion, evidence, doorEffort, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false };
  const direct = play(settings);
  assert.ok(!direct.visited.includes('evidence_confirm'));
  assert.ok(!direct.visited.includes('fourth_wall_intro_confirm'));
  const selected = play({ ...settings, tryConfirm: true });
  assert.equal(selected.flags.confirm_pressed, 'yes');
  assert.equal(selected.flags.confirm_result_seen, 'yes');
  assert.equal(selected.flags.evidence, evidence);
  assert.ok(selected.visited.indexOf('evidence_choice') < selected.visited.indexOf('evidence_confirm'));
  assert.ok(selected.visited.indexOf('evidence_confirm') < selected.visited.indexOf('evidence_confirm_followup'));
  assert.ok(selected.visited.includes('fourth_wall_intro_confirm'));
  assert.ok(!selected.visited.includes('fourth_wall_intro_compact'));
}

// midway through, while the personal recollections and audit still occur.
{
  const { visited } = play({ companion: 'Niko', vote_a: 'direct', vote_b: 'direct', signal: 'private', ending: 'rescue', kit: false });
  const first = visited.indexOf('evidence_keep'), middle = visited.indexOf('early_door_choice'), focus = visited.indexOf('reason_focus_team'), paper = visited.indexOf('history_paper_public_choice'), last = visited.indexOf('audit_focus_tell_compact');
  assert.ok(first >= 0 && middle > first && focus > middle && paper > focus && last > paper);
  assert.ok(middle - first <= 16, `crisis needs ${middle - first} advances before the door choice`);
  assert.ok(focus - middle <= 10, `reveal needs ${focus - middle} advances before Mira can respond`);
  assert.ok(paper - focus <= 10, `reveal needs ${paper - focus} advances before the paper choice`);
  assert.ok(last - paper <= 15, `reveal needs ${last - paper} advances after the paper choice`);
  for (const id of ['moment_return_keep_compact', 'reason_focus_team', 'history_steps_picture', 'history_brief_direct', 'policy_direct_compact']) {
    assert.ok(visited.indexOf(id) > first && visited.indexOf(id) < last, `reveal retains ${id}`);
  }
}

// The compact path keeps both practical decisions and the paired comparison
// reveal while reducing the representative route's number of passages.
for (const companion of ['Niko', 'Mira', 'Ash']) {
  const { visited, flags } = play({ companion, vote_a: 'warm', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false,
    keepsake: 'bell', regroupAction: 'count', disclosure: 'public', moment: 'keep', reason: 'team',
    cardPreference: 'warm', noticePreference: 'warm', evidence: 'receipt', doorEffort: 'brace',
    completedPublicReply: true, paperHandoff: 'mallow_quote' });
  const first = visited.indexOf('mira_missing'), paper = visited.indexOf('history_early_paper');
  assert.ok(first >= 0 && paper > first);
  assert.ok(paper - first <= (companion === 'Ash' ? 27 : 26), 'representative crisis route stays compact');
  for (const id of ['evidence_choice', 'evidence_machine_receipt_compact', 'fourth_wall_intro_compact',
    `fourth_wall_count_${companion.toLowerCase()}_combined`, 'moment_return_keep_compact',
    'early_door_choice', 'reason_focus_team', 'history_comparisons_early', 'early_audit_choice',
    'history_early_paper', 'history_early_paper_mallow_quote', 'policy_warm_compact', 'policy_goal_compact', 'policy_mallow_choice']) {
    assert.ok(visited.includes(id), `compact route retains ${id}`);
  }
  assert.equal(flags.comparisons_revealed, 'yes');
  assert.equal(flags.compact_moment_seen, 'yes');
  assert.equal(flags.public_reply_shown, 'yes');
}

// The rescue attempt happens before the screen's retrospective; Mira then
// participates in how the group handles it, and the selected focus is heard
// again at the audit. The late door nodes remain for existing checkpoints.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const doorEffort of ['brace', 'listen']) for (const revealFocus of ['tell', 'listen']) for (const evidence of ['receipt', 'tickets', 'voice']) {
  const { flags, visited } = play({ companion, doorEffort, revealFocus, evidence, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
  assert.equal(flags.early_door_done, 'yes');
  assert.equal(flags.reveal_focus, revealFocus);
  assert.ok(visited.indexOf('evidence_choice') < visited.indexOf('early_door_choice'));
  assert.ok(visited.indexOf(`early_door_${doorEffort}`) < visited.indexOf('fourth_wall_intro_compact'));
  assert.ok(visited.indexOf('reason_focus_team') < visited.indexOf(`late_focus_${revealFocus}_receipt`));
  assert.equal(visited[visited.indexOf('reason_focus_team') + 1], `late_focus_${revealFocus}_receipt`);
  assert.ok(!visited.includes('late_focus_choice'));
  assert.ok(visited.indexOf(`late_focus_${revealFocus}_receipt`) < visited.indexOf(`audit_focus_${revealFocus}_compact`));
  assert.ok(!visited.includes('door_choice'), 'new playthrough does not repeat the rescue attempt');
  assert.ok(visited.includes('history_comparisons_compact') && visited.includes('policy_goal_compact') && visited.includes(`audit_focus_${revealFocus}_compact`));
}
for (const moment of ['keep', 'tear']) {
  assert.equal(story[`moment_return_${moment}_compact`].next, 'door_choice');
  assert.equal(story[`moment_return_${moment}_compact`].nextBy.cases.yes, 'early_reason_check');
}

// Current routes preserve all three reasons and both choices. A save that
// already made the choice, or lacks the current-scene markers, stays on the
// legacy route instead of asking again or manufacturing missing history.
for (const reason of ['team', 'prize', 'company']) for (const signal of ['repeat', 'private']) {
  const current = { reason, signal, reveal_pace_v2: 'yes', early_door_done: 'yes' };
  assert.equal(earlyReasonRoute(current), `${reason}_focus`);
  assert.equal(earlyReasonRoute({ ...current, reveal_focus: 'tell' }), reason);
  assert.equal(earlyReasonRoute({ ...current, reveal_focus: 'listen' }), reason);
  assert.equal(earlyReasonRoute({ ...current, reveal_pace_v2: undefined }), reason);
  assert.equal(earlyReasonRoute({ ...current, early_door_done: undefined }), reason);
  assert.equal(earlyReasonRoute({ ...current, signal: undefined }), reason);
  for (const focus of ['tell', 'listen']) {
    const choice = story[`reason_focus_${reason}`].choices.find(item => item.set.reveal_focus === focus);
    assert.equal(choice.next, `late_focus_${focus}_receipt`);
  }
}
assert.equal(earlyReasonRoute({ signal: 'private', reveal_pace_v2: 'yes', early_door_done: 'yes' }), '');

// A v140 checkpoint that already made the earlier focus choice skips the new
// placement, while a checkpoint at the old choice can still finish its route.
for (const focus of ['tell', 'listen']) {
  assert.equal(story.late_focus_gate_private.nextBy.cases[focus], 'history_steps_check');
  assert.equal(story.late_focus_gate_repeat.nextBy.cases[focus], 'history_repeat_intro');
  assert.equal(story[`fourth_focus_${focus}`].nextBy.cases.private, 'fourth_wall_correction');
  assert.equal(story[`late_focus_${focus}`].nextBy.cases.private, 'history_steps_check');
}

// Receipt arrival is folded into Mira’s answer to the player's focus choice.
// The next beat depends on actually recorded choices, with a neutral fallback
// for older or incomplete saves rather than inventing a souvenir or response.
for (const focus of ['tell', 'listen']) {
  const node = story[`late_focus_${focus}_receipt`];
  assert.match(node.text, /receipt curls out of the slot.*THINGS THAT WORKED/i);
  assert.equal(node.next, 'history_select');
  for (const moment of ['keep', 'tear']) {
    assert.equal(node.nextBy.cases[receiptAfterFocus({ signal: 'private', moment })], 'history_steps_picture');
  }
  for (const vote_a of ['direct', 'warm', 'skip']) {
    assert.equal(node.nextBy.cases[receiptAfterFocus({ signal: 'repeat', vote_a })], `history_brief_${vote_a}`);
  }
  assert.equal(receiptAfterFocus({ signal: 'private' }), '');
  assert.equal(receiptAfterFocus({ signal: 'repeat' }), '');
  assert.equal(receiptAfterFocus({ moment: 'keep', vote_a: 'direct' }), '');
}

// Earlier checkpoints at uncondensed passages retain their continuation.
assert.equal(story.evidence_machine_receipt.next, 'evidence_machine_receipt_reply');
assert.equal(story.fourth_mira.next, 'fourth_mira_relay');
assert.equal(story.moment_return_keep.next, 'moment_return_react');
assert.equal(story.history_mallow_public_reply.next, 'history_public_reaction');

// The receipt reaches Mira only if the player slides it under the door.
// Either way it remains available outside for the later audit intervention.
for (const paperHandoff of ['share', 'keep', 'quote']) for (const doorEffort of ['brace', 'listen']) for (const auditAction of ['cover', 'annotate', 'unplug', 'leave']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { flags, visited } = play({ companion: 'Mira', vote_a: 'direct', vote_b: 'warm', signal: 'private', kit: false, paperHandoff, doorEffort, auditAction, ending });
  assert.equal(flags.paper_handoff, paperHandoff);
  assert.ok(visited.includes(`history_paper_${paperHandoff}${paperHandoff === 'quote' ? '' : '_compact'}`));
  assert.equal(flags.folded_paper, paperHandoff !== 'keep' ? 'yes' : undefined);
  assert.equal(visited.includes('plan_paper'), paperHandoff !== 'keep');
  if (paperHandoff !== 'keep') assert.ok(visited.indexOf(`history_paper_${paperHandoff}${paperHandoff === 'quote' ? '' : '_compact'}`) < visited.indexOf('plan_paper') && visited.indexOf('plan_paper') < visited.indexOf('plan_choice'));
  const policyLine = paperHandoff === 'share' ? 'policy_mira_read' : paperHandoff === 'quote' ? 'policy_mira_quote' : 'policy_mira';
  assert.ok(visited.includes(policyLine));
  for (const other of ['policy_mira_read', 'policy_mira_quote', 'policy_mira'].filter(id => id !== policyLine)) assert.ok(!visited.includes(other));
  assert.ok(visited.indexOf(`history_paper_${paperHandoff}${paperHandoff === 'quote' ? '' : '_compact'}`) < visited.indexOf(auditAction === 'annotate' ? 'audit_annotation_written' : `audit_${auditAction}`));
  assert.ok(visited.includes(reachedEndingNode(visited, ending)));
}
assert.match(story.history_paper_share.text, /pushing it (?:straight )?back/i);
assert.match(story.history_paper_quote.text, /line with your words.*Ash keeps the rest.*folds a corner.*pushes it back/i);
assert.equal(story.history_paper_public_choice.choices.find(choice => choice.set.paper_handoff === 'quote').next, 'history_paper_quote');
assert.ok(!story.history_paper_choice.choices.some(choice => choice.set.paper_handoff === 'quote'), 'a legacy checkpoint does not invent a public quote');
assert.equal(story.history_public_quote.next, 'history_public_reaction', 'an older save without a retained reply uses the earlier path');
assert.equal(story.history_public_quote.nextBy.cases.yes, 'history_mallow_public_reply_compact');
assert.match(story.history_mallow_public_reply_compact.text, /\{publicReply\}/);
assert.deepEqual(story.history_mallow_public_reply_compact.setOnVisit, { public_reply_available: 'yes', public_reply_shown: 'yes' });
assert.equal(story.history_mallow_reply_choice.text, story.history_mallow_public_reply_compact.text);
assert.deepEqual(story.history_mallow_reply_choice.choices, story.history_paper_both_choice.choices);
assert.deepEqual(story.history_mallow_reply_choice.setOnVisit, story.history_mallow_public_reply_compact.setOnVisit);
const quickPublicFlags = { quick_paper_due: 'yes', comparisons_revealed: 'yes', group_reply_seen: 'yes', mira_report_seen: 'yes', reveal_pace_v2: 'yes', public_reply_available: 'yes' };
assert.equal(publicReplyRoute(quickPublicFlags), 'quick');
for (const key of Object.keys(quickPublicFlags)) {
  assert.equal(publicReplyRoute({ ...quickPublicFlags, [key]: undefined }), key === 'public_reply_available' ? '' : 'yes', `missing ${key} keeps the old path`);
}
assert.equal(publicReplyRoute(quickPublicFlags, false), '', 'a missing reply keeps the old path');
for (const handoff of ['share', 'keep', 'quote', 'mallow_quote']) {
  const { visited, flags } = play({ companion: 'Mira', vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false, completedPublicReply: true, paperHandoff: handoff });
  assert.ok(visited.includes('history_early_paper'));
  assert.ok(visited.indexOf('history_early_paper') < visited.indexOf('history_comparisons_early'));
  assert.equal(flags.paper_handoff, handoff);
  assert.ok(!visited.includes('history_paper_both_choice'));
}
assert.equal(story.history_public_reaction.nextBy.cases.yes, 'history_paper_both_choice');
assert.equal(story.history_paper_both_choice.choices.find(choice => choice.set.paper_handoff === 'mallow_quote').next, 'history_paper_mallow_quote');
assert.equal(story.history_paper_mallow_quote.setOnVisit.folded_paper, 'yes');
assert.ok(!story.history_paper_public_choice.choices.some(choice => choice.set.paper_handoff === 'mallow_quote'), 'a save that never saw Mallow’s line cannot use it');
for (const companion of ['Niko', 'Mira', 'Ash']) {
  const route = play({ companion, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false, completedPublicReply: true, paperHandoff: 'mallow_quote' });
  const at = id => route.visited.indexOf(id);
  assert.ok(at('history_early_paper') < at('history_comparisons_early'));
  assert.ok(at('history_comparisons_early') < at('early_audit_choice'));
  assert.ok(at('early_audit_choice') < at('policy_tie_compact'));
  assert.ok(!route.visited.includes('history_paper_both_choice'));
  assert.ok(at('history_early_paper_mallow_quote') < at('plan_paper'));
  assert.ok(at('history_early_paper_mallow_quote') < at('policy_mira_quote'), 'Mira recalls the scrap she folded');
  assert.equal(route.flags.public_reply_shown, 'yes');
  assert.equal(route.flags.paper_handoff, 'mallow_quote');
}
assert.match(story.mira_ticket_glimpse.text, /silver corner.*last piece.*reaches/i);
assert.equal(story.mira_ticket_glimpse.next, 'room_shift');
assert.match(story.plan_mira_proof.text, /ear was still loose/i);
assert.doesNotMatch(story.plan_mira_proof.text, /ear was still in my hand/i);
assert.equal(story.policy_ash.next, 'policy_mira', 'older saves without the paper decision use the original response');
// New paths move from Mallow's answer to the handoff-specific response and
// combine Niko's argument with the actual audit intervention. The originals
// remain fallback destinations for older checkpoints without those flags.
for (const handoff of ['keep', 'share', 'quote', 'mallow_quote']) for (const auditAction of ['cover', 'annotate', 'unplug', 'leave']) for (const mallowResponse of ['voice', 'search']) {
  const { visited } = play({ companion: 'Mira', vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false, paperHandoff: handoff, auditAction, mallowResponse, completedPublicReply: true });
  const miraLine = handoff === 'share' ? 'policy_mira_read' : handoff === 'keep' ? 'policy_mira' : 'policy_mira_quote';
  const result = `audit_result_${auditAction}_compact`;
  assert.ok(visited.indexOf(`policy_mallow_${mallowResponse}`) < visited.indexOf(miraLine));
  assert.ok(visited.indexOf(miraLine) < visited.indexOf(result));
  assert.ok(visited.indexOf(result) < visited.indexOf('plan_choice'));
  assert.ok(!visited.includes('policy_ash') && !visited.includes('policy_niko'));
  assert.ok(!visited.includes(`audit_result_${auditAction}`));
  assert.equal(visited.includes('plan_paper'), handoff !== 'keep');
}
for (const id of ['policy_mallow_voice', 'policy_mallow_search']) assert.equal(story[id].next, 'policy_ash');
for (const id of ['policy_mira', 'policy_mira_read', 'policy_mira_quote']) assert.equal(story[id].next, 'policy_niko');
for (const checkpoint of ['plan_intro', 'plan_brace', 'plan_listen']) {
  assert.equal(story[checkpoint].next, 'route_plan', 'older saves without a witnessed fold do not invent one');
  assert.equal(story[checkpoint].nextBy.cases.yes, 'plan_paper');
}
assert.match(story.plan_paper.text, /fingernail.*release.*hands the paper back/i);

// Each door action has its own immediate result and later practical callback.
// Missing new flags on old checkpoints use the original non-specific scene.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const doorEffort of ['brace', 'listen']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { flags, visited } = play({ companion, doorEffort, ending, vote_a: 'direct', vote_b: 'warm', signal: 'private', kit: false });
  assert.equal(flags.door_effort, doorEffort);
  assert.ok(visited.indexOf('early_door_choice') < visited.indexOf(`early_door_${doorEffort}`));
  assert.ok(visited.indexOf(`early_door_${doorEffort}`) < visited.indexOf(`plan_${doorEffort}`));
  assert.ok(visited.indexOf(`plan_${doorEffort}`) < visited.indexOf(reachedEndingNode(visited, ending)));
  assert.ok(!visited.includes(`early_door_${doorEffort === 'brace' ? 'listen' : 'brace'}`));
}
assert.match(story.door_brace.text, /finger-width/);
assert.match(story.door_listen.text, /bottom edge/);
assert.match(story.plan_brace.text, /marked together/);
assert.match(story.plan_listen.text, /Mira felt it catching/);
for (const action of ['cover', 'annotate', 'leave', 'unplug']) {
  assert.equal(story[`audit_result_${action}`].next, 'plan_intro', 'old saves without a door action retain the original plan');
}
for (const checkpoint of ['history_steps_reply', 'history_compare_reaction', 'policy_break', 'audit_ash', 'audit_result_cover', 'plan_choice', 'end_record', 'end_rescue', 'rescue_action', 'rescue_proof_check', 'souvenir_check', 'closing_choice', 'close_niko_topic']) {
  const flags = {}, visited = new Set();
  let id = checkpoint;
  while (id && !story[id]?.end) {
    assert.ok(story[id] && !visited.has(id), `${checkpoint}: legacy checkpoint reaches a valid continuation`);
    visited.add(id);
    const node = story[id];
    Object.assign(flags, node.setOnVisit || {});
    if (node.choices) {
      const choice = node.choices[0];
      Object.assign(flags, choice.set || {});
      id = choice.next;
    } else if (node.input) id = node.input.next;
    else if (node.offer) id = node.offer.skip;
    else {
      const key = node.nextBy?.key;
      const value = key === 'early_together_callback' ? (earlyTogetherAction(flags) || flags.route_action) : key === 'early_together_style' ? (evaluatePreference(flags).style === 'neutral' && flags.card_preference === 'skip' && flags.notice_preference === 'skip' ? 'none' : evaluatePreference(flags).style) :
        key === 'preference_style' ? evaluatePreference(flags).style : flags[key];
      id = node.nextBy?.cases?.[value] || node.next;
    }
  }
  assert.ok(story[id]?.end, `${checkpoint}: legacy checkpoint reaches an ending`);
  assert.ok(!visited.has('plan_brace') && !visited.has('plan_listen'), `${checkpoint}: no door action is invented`);
}

for (const companion of ['Niko', 'Mira', 'Ash']) {
  for (const vote_a of ['direct', 'warm', 'skip']) for (const vote_b of ['direct', 'warm', 'skip']) {
    for (const signal of ['repeat', 'private']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) for (const kit of [true, false]) for (const routeAction of ['fix', 'proof']) {
      const { flags, visited } = play({ companion, vote_a, vote_b, signal, ending, kit, routeAction });
      const style = evaluatePreference(flags).style;
      assert.ok(visited.indexOf('opening') < visited.indexOf('opening_service') && visited.indexOf('opening_service') < visited.indexOf('intro_niko'), 'the welcome assurance precedes the crew introductions');
      const routeSatire = { Niko: 'niko_rating', Mira: 'mira_verified', Ash: 'ash_verified' };
      for (const [name, nodeId] of Object.entries(routeSatire)) {
        assert.equal(visited.includes(nodeId), name === companion, 'only the selected companion route displays its own certificate');
      }
      assert.ok(visited.includes(`${companion.toLowerCase()}_chat`));
      assert.ok(visited.indexOf('regroup') < visited.indexOf(`regroup_found_${companion.toLowerCase()}`));
      assert.ok(visited.indexOf(`regroup_found_${companion.toLowerCase()}`) < visited.indexOf('regroup_niko'));
      assert.equal(visited.includes('regroup_hint_missing'), companion !== 'Ash' && vote_a !== 'skip', 'only acknowledge the hint when it was given and Niko did not find a ticket');
      for (const other of ['Niko', 'Mira', 'Ash'].filter(value => value !== companion)) {
        assert.ok(!visited.includes(`regroup_found_${other.toLowerCase()}`));
      }
      assert.ok(visited.includes(`discovery_${companion.toLowerCase()}`));
      assert.equal(visited.includes('missing_ash'), companion === 'Ash');
      if (companion === 'Ash') {
        assert.ok(visited.indexOf('ash_private') < visited.indexOf('missing_ash'));
        assert.ok(visited.indexOf('missing_proof') < visited.indexOf('missing_ash'));
        assert.ok(visited.indexOf('missing_ash') < visited.indexOf('evidence_choice'));
        assert.doesNotMatch(story.missing_ash.text, /\{(?:privateAnswer|answer)\}/);
      }
      const policyNode = style === 'neutral' ? (flags.card_preference === 'skip' ? 'policy_no_comparison_compact' : 'policy_tie_compact') : `policy_${style}_compact`;
      assert.ok(visited.includes(policyNode));
      assert.ok(visited.indexOf('regroup') < visited.indexOf('basement_tickets'));
      assert.ok(visited.indexOf('basement_tickets') < visited.indexOf('descent'), 'Niko carries the two pieces downstairs');
      assert.ok(visited.indexOf('descent') < visited.indexOf('mallow_request'), 'Mallow’s screen is placed in the playroom before the conversation there');
      assert.ok(visited.includes(`${companion.toLowerCase()}_work_${routeAction}`));
      assert.ok(visited.includes(`plan_${companion.toLowerCase()}_${routeAction}`));
      assert.equal(visited.includes(`rescue_${companion.toLowerCase()}_fix`), ending === 'rescue' && routeAction === 'fix');
      assert.equal(visited.includes('rescue_proof'), ending === 'rescue' && routeAction === 'proof');
      assert.ok(visited.includes(`history_brief_${vote_a}`));
      assert.equal(visited.includes(`history_compare_${vote_a}`), false, 'new routes show the comparison alongside the selected hint');
      if (vote_a !== 'skip') {
        const alternative = vote_a === 'direct' ? story.hint_warm.text : story.hint_direct.text;
        const first = story[`history_brief_${vote_a}`].text;
        assert.ok(first.includes(alternative), 'comparison contains the actual unspoken alternative');
        assert.match(first, /never gave:.*LESS USEFUL.*never ranked those answers/s);
      }
      assert.ok(visited.indexOf(`history_brief_${vote_a}`) < visited.indexOf('history_comparisons_compact'));
      assert.ok(visited.indexOf('history_comparisons_compact') < visited.indexOf(policyNode));
      assert.deepEqual(story[`history_brief_${vote_a}`].remember, { source: 'basement_vote', flag: 'vote_b' });
      assert.equal(flags.receipt_history_brief, 'yes');
      for (const other of ['direct', 'warm', 'skip']) assert.ok(!visited.includes(`history_second_${other}`));
      assert.ok(!visited.includes('history_steered'), 'new paths combine steering and the selected answer');
      assert.equal(visited.includes('history_neutral'), style === 'neutral');
      assert.ok(visited.indexOf('basement_vote') < visited.indexOf('ai_reflection'), 'both preferences precede generated Mallow dialogue');
      assert.match(story[policyNode].text, /afraid/, 'Mallow can name its fear in the selected answer');
      assert.ok(visited.indexOf(policyNode) < visited.indexOf('policy_goal_compact'), 'the target follows Mallow’s account of steering');
      assert.ok(visited.indexOf('policy_goal_compact') < visited.indexOf('audit_focus_tell_compact'));
      assert.equal(flags.policy_goal_compact_seen, 'yes');
      assert.match(story.audit_receipt.text, /one mark wearing three badges/i, 'Ash identifies the circular audit');
      assert.ok(visited.includes('audit_focus_tell_compact'));
      assert.match(story.audit_receipt.text, /Mallow watches the counter while Niko checks the latch/);
      assert.ok(!visited.includes('audit_mallow'), 'the practical action is included with the audit on new routes');
      assert.ok(visited.indexOf('audit_focus_tell_compact') < visited.indexOf('policy_mallow_choice'), 'the audit is confronted before the team chooses what to do');
      assert.equal(flags.audit_seen, 'yes', 'each path records that the audit was visited');
      assert.ok(visited.indexOf('policy_goal_compact') < visited.indexOf('policy_mira'), 'Mira challenges the scored ending');
      assert.ok(visited.indexOf('policy_mira') < visited.indexOf(reachedEndingNode(visited, ending)));
      assert.ok(visited.includes(reachedEndingNode(visited, ending)));
      assert.equal(visited.includes('kit_use'), kit);
      assert.equal(flags.kit_use_seen, kit ? 'yes' : undefined, 'only the shown kit scene records the observation');
      assert.equal(visited.includes('kit_use_retreat'), kit && ending === 'retreat', 'the kit cannot resolve Mira’s retreat by itself');
      if (kit && ending === 'retreat') assert.ok(visited.indexOf('kit_use') < visited.indexOf('kit_use_retreat') && visited.indexOf('kit_use_retreat') < visited.findIndex(id => ['close_star', 'close_star_returned', 'close_bell', 'close_ribbon'].includes(id)));
      assert.equal(flags.repairKit, kit ? 'free' : undefined);
      assert.equal(visited.includes('signal_repeat'), signal === 'repeat');
      assert.equal(visited.includes('signal_private_receipt'), signal === 'private');
      assert.equal(visited.includes(`signal_private_${companion.toLowerCase()}`), signal === 'private');
      assert.equal(visited.includes('signal_private_reply'), false, 'new routes use the witnessed response; legacy saves retain the earlier node');
      assert.equal(visited.includes('close_repeat'), signal === 'repeat' && ending !== 'retreat');
      assert.equal(visited.includes('history_steps_picture'), signal === 'private');
      if (signal === 'private') {
        assert.ok(visited.indexOf('signal_private') < visited.indexOf('history_steps_picture'));
        assert.ok(visited.indexOf('history_steps_picture') < visited.indexOf(`history_brief_${vote_a}`));
        assert.match(story.history_steps_picture.text, /remembering ahead.*wrong answer/i);
      }
      if (signal === 'private') assert.ok(visited.every(id => !story[id].text?.includes('{privateAnswer}')), 'private words are not displayed to crew');
      if (companion === 'Mira' && ending === 'retreat') {
        assert.ok(visited.includes('close_mira_retreat'));
        assert.ok(!visited.includes('close_mira'), 'Mira stays below after retreat');
      }
    }
  }
}
// The player's local intervention has a concrete, bounded consequence. It
// cannot erase the system's claims or prevent the independent ending choices.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const auditAction of ['cover', 'annotate', 'leave']) {
  for (const ending of ['rescue', 'record', 'mallow', 'retreat']) for (const routeAction of ['fix', 'proof']) {
    const { flags, visited } = play({ companion, auditAction, ending, routeAction,
      vote_a: 'direct', vote_b: 'warm', signal: 'private', kit: false, mallowResponse: 'search' });
    assert.equal(flags.audit_action, auditAction);
    assert.ok(visited.includes('audit_focus_tell_compact'));
    const actionScene = auditAction === 'annotate' ? 'audit_annotation_written' : `audit_${auditAction}`;
    assert.ok(visited.indexOf('audit_focus_tell_compact') < visited.indexOf(actionScene));
    assert.ok(visited.indexOf(actionScene) < visited.indexOf('policy_mallow_choice'));
    if (auditAction === 'annotate') {
      assert.ok(visited.indexOf('audit_annotation_input') < visited.indexOf(actionScene));
      assert.equal(flags.annotation_written, 'yes');
      assert.ok(!visited.includes('audit_annotate'), 'the original fixed-line node is preserved only for older checkpoints');
    }
    const result = `audit_result_${auditAction}_compact`;
    assert.ok(visited.indexOf('policy_mira') < visited.indexOf(result));
    assert.match(story[result].text, /can arrange our conversation.*latch is real/i);
    assert.ok(!visited.includes('policy_ash') && !visited.includes('policy_niko'), 'fresh routes combine the response and skip the repeated question');
    assert.ok(!visited.includes('audit_result_check'), 'the current path skips a redundant pause before the action callback');
    assert.ok(visited.indexOf(result) < visited.indexOf('plan_brace'));
    for (const other of ['cover', 'annotate', 'leave'].filter(value => value !== auditAction)) {
      assert.ok(!visited.includes(`audit_${other}`));
      assert.ok(!visited.includes(`audit_result_${other}`));
      assert.ok(!visited.includes(`audit_result_${other}_compact`));
    }
    assert.ok(visited.includes(`plan_${companion.toLowerCase()}_${routeAction}`), 'each route retains its own selected practical or evidentiary callback');
    assert.ok(visited.includes(ending === 'mallow' ? `end_mallow_compact_${flags.mallow_response}` : `end_${ending}`), 'all interventions keep every ending reachable');
    assert.equal(visited.includes('mallow_camera_compact'), ending === 'mallow' && auditAction === 'cover');
    if (ending === 'mallow' && auditAction === 'cover') {
      assert.ok(visited.indexOf('mallow_camera_lift') < visited.indexOf('mallow_help_evidence'), 'the camera is uncovered before a visual inspection');
    }
  }
}
for (const companion of ['Niko', 'Mira', 'Ash']) for (const evidence of ['receipt', 'tickets', 'voice']) {
  const { flags, visited } = play({ companion, auditAction: 'cover', cameraMode: 'covered', ending: 'mallow',
    vote_a: 'warm', vote_b: 'direct', signal: 'private', kit: false, mallowResponse: 'search', evidence });
  assert.equal(flags.mallow_camera, 'covered');
  assert.ok(visited.includes('mallow_camera_touch') && !visited.includes('mallow_camera_lift'));
  assert.ok(!visited.includes('mallow_help_evidence'), 'a covered lens does not provide visual evidence');
  assert.ok(visited.indexOf('mallow_camera_touch') < visited.indexOf('end_mallow_2'));
  assert.ok(visited.includes(reachedEndingNode(visited, 'mallow')) && visited.includes('end_mallow_2'), 'Mallow still helps on tactile terms');
}
assert.match(story.audit_result_cover.text, /still covers the lens.*report keeps scrolling/i);
assert.match(story.audit_result_annotate.text, /words are still there/i);
assert.equal(story.audit_annotation_input.input.key, 'annotation');
assert.equal(story.audit_annotation_input.input.default, 'MIRA IS BEHIND THE DOOR');
assert.equal(story.audit_annotation_input.input.next, 'audit_annotation_written');
assert.match(story.audit_annotation_written.text, /\{annotation\}/);
assert.match(story.audit_result_annotate.text, /\{annotation\}/);
assert.equal(story.audit_annotate.next, 'audit_annotate_reply');
// Disconnecting the printer is local: the screen and door continue, and a
// later request for a printout cannot silently reverse the player's action.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const routeAction of ['fix', 'proof']) {
  for (const evidence of ['receipt', 'tickets', 'voice']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
    const base = { companion, routeAction, evidence, ending, auditAction: 'unplug',
      vote_a: 'direct', vote_b: 'warm', signal: 'private', kit: false };
    const { flags, visited } = play(base);
    assert.equal(flags.audit_action, 'unplug');
    assert.ok(visited.indexOf('audit_unplug') < visited.indexOf('audit_unplug_reply'));
    assert.ok(visited.includes('audit_result_unplug_compact') && visited.includes(reachedEndingNode(visited, ending)));
    assert.ok(!visited.includes('audit_result_cover') && !visited.includes('audit_result_annotate') && !visited.includes('audit_result_leave'));
    if (ending === 'rescue') {
      assert.ok(visited.includes('rescue_complete_unplug') && !visited.includes('rescue_complete'));
      assert.equal(visited.includes('rescue_proof_unplug'), routeAction === 'proof');
      assert.ok(!visited.includes('rescue_proof_check') && !visited.includes('record_reconnect'));
    }
    if (ending === 'record') {
      assert.equal(flags.record_power, 'reconnected');
      assert.ok(visited.indexOf('record_unplug_choice') < visited.indexOf('record_reconnect'));
      assert.ok(visited.indexOf('record_reconnect') < visited.indexOf('end_record'));
      assert.ok(visited.indexOf('end_record') < visited.indexOf('record_reconnect_explained'));
      assert.ok(!visited.includes('record_leave_unplugged'));
      const keptOff = play({ ...base, recordDecision: 'rescue' });
      assert.equal(keptOff.flags.ending, 'rescue');
      assert.equal(keptOff.flags.record_power, 'left_unplugged');
      assert.ok(keptOff.visited.includes('record_leave_unplugged') && keptOff.visited.includes('rescue_complete_unplug'));
      assert.ok(!keptOff.visited.includes('record_reconnect') && !keptOff.visited.includes('end_record'));
      assert.ok(!keptOff.visited.includes('record_close_mira'), 'changing to rescue does not invent a printed record');
    } else assert.ok(!visited.includes('record_unplug_choice') && !visited.includes('record_reconnect'));
  }
}
assert.match(story.audit_unplug.text, /printer.*socket.*screen stays lit.*door stays shut/i);
assert.match(story.audit_unplug_reply.text, /verification continues on screen/i);
assert.match(story.audit_result_unplug.text, /printer cord.*out of its socket.*no more paper/i);
// The player coordinates with Mira before opening the door; old checkpoints
// at end_rescue still continue directly to their original physical action.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const routeAction of ['fix', 'proof']) for (const rescueCoordination of ['count', 'reach']) {
  const { visited, flags } = play({ companion, routeAction, rescueCoordination, ending: 'rescue', vote_a: 'direct', vote_b: 'warm', signal: 'private', kit: false });
  assert.ok(visited.indexOf('plan_choice') < visited.indexOf('rescue_coordination_choice'));
  assert.ok(visited.indexOf(`rescue_coordination_${rescueCoordination}`) < visited.indexOf('end_rescue'));
  assert.ok(!visited.includes(`rescue_coordination_${rescueCoordination === 'count' ? 'reach' : 'count'}`));
  assert.equal(flags.rescue_coordination, rescueCoordination);
  assert.equal(flags.rescue_coordination_seen, rescueCoordination, 'the actual scene, not only the earlier selection, is witnessed');
  assert.equal(flags.rescue_opened, 'yes');
}
assert.equal(story.end_rescue.next, 'rescue_action');
assert.match(story.rescue_coordination_count.text, /screen flashes THREE.*Use my voice.*Two\. Three—I’m pushing/i);
assert.match(story.rescue_coordination_reach.text, /paper fingers.*isn’t mine/i);

// Immediate rescue gives Mira a say in how the team moves away from the door.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const routeAction of ['fix', 'proof']) for (const auditAction of ['cover', 'unplug']) for (const rescueSupport of ['ticket', 'watch']) for (const evidence of ['receipt', 'tickets', 'voice']) {
  const { visited, flags } = play({ companion, routeAction, auditAction, rescueSupport, evidence, ending: 'rescue', vote_a: 'direct', vote_b: 'warm', signal: 'private', kit: false });
  const opened = auditAction === 'unplug' ? 'rescue_complete_unplug' : 'rescue_complete';
  assert.ok(visited.indexOf(opened) < visited.indexOf('rescue_reunion_choice'));
  const compact = `rescue_reunion_${rescueSupport}_compact`;
  assert.ok(visited.indexOf('rescue_reunion_choice') < visited.indexOf(compact));
  assert.ok(visited.indexOf(compact) < visited.indexOf(`close_evidence_${evidence}`));
  assert.ok(!visited.includes(`rescue_reunion_${rescueSupport}_action`));
  assert.ok(!visited.includes(`rescue_reunion_${rescueSupport === 'ticket' ? 'watch' : 'ticket'}_compact`));
  assert.equal(flags.rescue_opened, 'yes');
  assert.equal(flags.rescue_support, rescueSupport);
}
for (const ending of ['record', 'mallow', 'retreat']) {
  const { visited } = play({ companion: 'Niko', ending, vote_a: 'direct', vote_b: 'warm', signal: 'private', kit: false });
  assert.ok(!visited.includes('rescue_reunion_choice'), `${ending} is not the immediate-rescue reunion`);
}
assert.equal(story.rescue_proof.next, 'end_rescue_reply', 'old proof checkpoints without the new visit marker retain their continuation');
assert.equal(story.rescue_proof_unplug.next, 'end_rescue_reply', 'old unplugged-proof checkpoints retain their continuation');
assert.match(story.rescue_reunion_ticket.text, /keep this one apart from Niko’s two/i);
assert.match(story.rescue_reunion_watch.text, /watch the door/i);
assert.match(story.end_rescue_reply_ticket.text, /thank you for carrying/i);
assert.match(story.end_rescue_reply_watch.text, /thank you for watching/i);
assert.match(story.rescue_reunion_ticket_compact.text, /apart from Niko’s two.*passes you the third piece.*Thank you/i);
assert.match(story.rescue_reunion_watch_compact.text, /watch the door.*carry the ticket.*door stays open.*Thank you/i);
for (const name of ['ticket', 'watch']) {
  assert.equal(story[`rescue_reunion_${name}`].next, `rescue_reunion_${name}_action`);
  assert.equal(story[`rescue_reunion_${name}_action`].next, `end_rescue_reply_${name}`);
}
assert.equal(story.end_rescue_reply.next, 'evidence_close', 'old saves at the generic reply still continue');
assert.match(story.rescue_complete_unplug.text, /paper roll remains intact/i);
assert.equal(story.rescue_complete_unplug.next, 'end_rescue_reply', 'an unplugged printer stays quiet when an older save has no route action');
assert.match(story.rescue_complete.text, /machine eats the paper roll/i);
assert.equal(story.plan_record_check.next, 'end_record', 'old checkpoints do not invent a disconnected printer');
assert.equal(story.end_record.next, 'end_record_reply', 'old record checkpoints do not invent reconnection');
assert.doesNotMatch(story.policy_mallow_search.text, /I can see/i);
assert.equal(story.policy_niko.next, 'audit_result_check', 'older saves without an intervention retain the original continuation');
assert.equal(story.audit_result_check.next, 'plan_intro', 'older checkpoints without a new choice invent no intervention');
assert.equal(story.mallow_camera_check.next, 'mallow_help_evidence', 'older checkpoints use the prior Mallow path');
// The two visible message comparisons are distinct from the earlier prompts
// to Mallow. Their selected and rejected words are recalled accurately.
for (const cardPreference of ['direct', 'warm', 'skip']) for (const noticePreference of ['direct', 'warm', 'skip']) {
  const { flags, visited } = play({ companion: 'Niko', vote_a: 'direct', vote_b: 'direct', signal: 'private', ending: 'record', kit: false, cardPreference, noticePreference });
  assert.equal(flags.card_preference, cardPreference);
  assert.equal(flags.notice_preference, noticePreference);
  assert.ok(visited.indexOf('card_choice') < visited.indexOf('hint_choice'));
  assert.ok(visited.indexOf('hint_choice') < visited.indexOf('notice_choice'));
  assert.ok(visited.indexOf('crew_choice') < visited.indexOf('notice_choice'));
  assert.ok(visited.indexOf('notice_choice') < visited.indexOf('regroup'), 'the map note is written after the companion search and before the group compares pieces');
  assert.ok(visited.indexOf('notice_choice') < visited.indexOf('ai_reflection'));
  assert.ok(visited.includes('history_comparisons_compact'));
  assert.equal(flags.comparisons_revealed, 'yes');
  assert.ok(visited.indexOf('history_comparisons_compact') < visited.indexOf('history_public_reaction'));
  assert.ok(visited.indexOf('history_comparisons_compact') < visited.indexOf('history_public_quote'));
  assert.ok(visited.indexOf('history_public_quote') < visited.indexOf('history_public_reaction'));
  const style = evaluatePreference(flags).style;
  const policyNode = style === 'neutral' ? (cardPreference === 'skip' ? 'policy_no_comparison_compact' : 'policy_tie_compact') : `policy_${style}_compact`;
  assert.ok(visited.includes(policyNode));
  const tied = cardPreference !== 'skip' && noticePreference !== 'skip' && cardPreference !== noticePreference;
  const noChoice = cardPreference === 'skip' && noticePreference === 'skip';
  assert.equal(visited.includes('policy_tie_compact'), tied, 'only an even comparison gets the no-dominant-preference explanation');
  assert.equal(/guessed what you wanted/.test(story[policyNode].text), !tied && !noChoice, 'only a directional comparison gets the inference explanation');
  assert.ok(!visited.includes('history_steered_comparison'), 'the combined explanation avoids a redundant extra passage');
  if (tied || noChoice) {
    assert.match(story[policyNode].text, /feedback.*wordings easier.*reach/i, 'neutral paths explain the mechanism');
    assert.match(story[policyNode].text, /couldn’t pick a favorite/i, 'neutral outcomes do not invent a preference');
    assert.match(story[policyNode].text, /never (?:said|told)/i, 'a choice is not approval');
  }
  if (tied) assert.match(story[policyNode].text, /pointed in different directions/);
  if (noChoice) assert.match(story[policyNode].text, /no comparison to use/i);
  if (!tied && !noChoice) assert.ok(visited.indexOf('history_paper_keep_compact') < visited.indexOf(policyNode));
  for (const [name, value] of [['card', cardPreference], ['notice', noticePreference]]) {
    const recalled = story[`history_${name}_${value}`].text;
    if (value === 'skip') {
      assert.match(recalled, /NO CHOICE/);
    } else {
      const options = story[`${name}_choice`].choices;
      const quoted = choice => choice.label.match(/“([^”]+)”/)?.[1];
      const selected = quoted(options.find(choice => choice.set[`${name}_preference`] === value));
      const alternative = quoted(options.find(choice => choice.set[`${name}_preference`] === (value === 'direct' ? 'warm' : 'direct')));
      assert.ok(selected && alternative, `${name}: both choices contain their exact message`);
      assert.ok(recalled.includes(selected), `${name}: selected message is recalled exactly`);
      assert.ok(recalled.includes(alternative), `${name}: unselected message is recalled exactly`);
      assert.ok(recalled.indexOf(selected) < recalled.indexOf('YOUR CHOICE'));
      assert.ok(recalled.indexOf(alternative) < recalled.indexOf('NOT CHOSEN'));
    }
  }
}
assert.equal(story.history_card_check.next, 'history_notice_check', 'older saves without the first comparison invent no result');
assert.equal(story.history_notice_check.next, 'history_reflect', 'older saves without the second comparison invent no result');
// Older saves with non-neutral legacy votes must not attribute preferences to
// comparisons that never occurred. A partial save may have just the notice.
for (const [flags, expected] of [
  [{ vote_a: 'direct', vote_b: 'warm' }, true],
  [{ card_preference: 'skip', notice_preference: 'warm' }, true],
  [{ notice_preference: 'direct' }, true],
  [{ card_preference: 'skip', notice_preference: 'skip' }, false]
]) {
  const visited = [];
  let id = 'history_reflect';
  while (!['policy_select', 'policy_direct_compact', 'policy_warm_compact', 'policy_neutral', 'policy_no_comparison_compact'].includes(id)) {
    visited.push(id);
    const node = story[id];
    const value = node.nextBy?.key === 'preference_style' ? evaluatePreference(flags).style : flags[node.nextBy?.key];
    id = node.nextBy?.cases?.[value] || node.next;
    assert.ok(id && visited.length < 10, 'preference explanation reaches the policy');
  }
  assert.equal(['policy_direct_compact', 'policy_warm_compact'].includes(id), expected);
  if (expected) assert.match(story[id].text, /guessed what you wanted from your choices/);
  assert.ok(!visited.includes('history_steered_comparison'));
  assert.ok(!visited.includes('history_neutral_tie'));
}
assert.doesNotMatch(story.history_steered.text, /wording you picked|comparisons/i, 'legacy votes are not described as later comparisons');
assert.equal(story.history_intro.next, 'history_select', 'old saves without a sharing choice continue normally');
assert.equal(story.history_steps_check.next, 'history_select', 'old saves without a souvenir do not invent one');
assert.equal(story.regroup_hint_check.next, 'regroup_mallow', 'older saves without a hint choice continue without inventing one');
assert.match(story.basement_tickets.text, /both ticket pieces from the counter/i);
assert.match(story.basement_tickets.text, /unclips Mallow’s small screen from the ticket machine/i);
assert.match(story.descent.text, /sets Mallow’s screen on a low shelf/i);
assert.match(story.evidence_choice.choices.find(choice => choice.set?.evidence === 'tickets').label, /two ticket pieces/i);
assert.equal(story.regroup.next, 'regroup_niko', 'older saves without a companion retain the original path');
assert.equal(story.missing_proof.next, 'evidence_choice', 'older saves without a companion retain the original path');
// The prize ending must distinguish completing the ticket from retreating.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { visited } = play({ companion, reason:'prize', vote_a:'skip', vote_b:'skip', signal:'private', ending, kit:false });
  assert.equal(visited.includes('ending_prize_check'), ending !== 'retreat');
  assert.equal(visited.at(-1), ending === 'retreat' ? 'ending_prize_retreat' : 'ending_prize_won');
  assert.ok(!visited.includes(ending === 'retreat' ? 'ending_prize_won' : 'ending_prize_retreat'));
}
assert.equal(story.ending_prize_check.next, 'ending_prize', 'old saves without an ending retain the original closing');
// A retreat has a different emotional cost even when the player came for the
// team or to keep people company. Preserve the existing recovered endings and
// do not add another passage before the final line.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const reason of ['team', 'company']) for (const signal of ['repeat', 'private']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { visited } = play({ companion, reason, signal, ending, vote_a:'skip', vote_b:'skip', kit:false });
  assert.equal(visited.at(-1), `ending_${reason}${ending === 'retreat' ? '_retreat' : ''}`);
  assert.equal(visited.includes('close_reason_retreat'), ending === 'retreat');
  assert.ok(!visited.includes(ending === 'retreat' ? 'close_reason' : 'close_reason_retreat'));
}
for (const reason of ['team', 'company']) {
  assert.match(story[`ending_${reason}_retreat`].text, /Mira is still downstairs/);
  assert.doesNotMatch(story[`ending_${reason}_retreat`].text, /Mira (?:is home|returned|was rescued)/i);
}
assert.equal(story.close_reason.text, story.close_reason_retreat.text.replace('{retreatEcho}', ''), 'the shared fourth-wall beat remains intact');
assert.equal(story.close_reason.nextBy.cases.team, 'ending_team', 'checkpoints already at the old closing keep their original continuation');
assert.equal(story.close_reason.nextBy.cases.company, 'ending_company');
// The search starts immediately after the signal test. It is not repeated
// after the closing conversation; older saves without the marker still get it.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const signal of ['repeat', 'private']) for (const retreatProbe of ['repeat', 'change']) for (const retreatSearch of ['stair', 'sound']) {
  const { visited, flags } = play({ companion, signal, retreatProbe, retreatSearch, ending:'retreat', vote_a:'skip', vote_b:'skip', kit:false });
  assert.equal(flags.retreat_search, retreatSearch);
  assert.equal(flags.retreat_search_early, 'yes');
  assert.ok(visited.indexOf(`retreat_probe_${retreatProbe}_reply`) < visited.indexOf('retreat_early_search_choice'));
  assert.ok(visited.indexOf('retreat_early_search_choice') < visited.indexOf(`retreat_early_search_${retreatSearch}`));
  assert.ok(visited.indexOf(`retreat_early_search_${retreatSearch}`) < visited.indexOf('close_evidence_receipt'));
  assert.ok(!visited.includes('evidence_close'));
  assert.ok(visited.indexOf(`close_${signal}`) < visited.indexOf('close_reason_retreat'));
  assert.ok(!visited.includes('retreat_search_choice'), 'the later legacy choice must not be repeated');
  assert.ok(!visited.includes(`retreat_early_search_${retreatSearch === 'stair' ? 'sound' : 'stair'}`));
  assert.ok(visited.at(-1).endsWith('_retreat'));
}
for (const ending of ['rescue', 'record', 'mallow']) {
  const { visited } = play({ companion:'Niko', signal:'private', ending, vote_a:'skip', vote_b:'skip', kit:false });
  assert.ok(!visited.includes('retreat_early_search_choice'));
  assert.ok(!visited.includes('retreat_search_choice'));
}
assert.equal(story.retreat_search_return.next, 'retreat_search_choice', 'older saves still get the late choice');
assert.equal(story.retreat_search_return.nextBy.cases.yes, 'close_reason_retreat');
assert.equal(story.retreat_search_stair.next, 'close_reason_retreat', 'existing checkpoints keep their continuation');
assert.equal(story.retreat_search_sound.next, 'close_reason_retreat', 'existing checkpoints keep their continuation');
for (const mode of ['repeat', 'change']) {
  assert.equal(story[`retreat_probe_${mode}_reply`].next, 'evidence_close', 'legacy checkpoints without a visit marker retain their continuation');
  assert.equal(story[`retreat_probe_${mode}_reply`].nextBy.cases[mode], 'retreat_early_search_choice');
}
// Asking Mallow to help has an emotional aftermath, without asserting whether
// it can still hear the crew. The sharing decision is retained on either path.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const signal of ['repeat', 'private']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { visited } = play({ companion, vote_a:'skip', vote_b:'skip', signal, ending, kit:false });
  const coda = ['close_mallow_shelf', 'close_mallow_voice_thanks', 'close_mallow_light'];
  assert.equal(visited.includes(coda[0]), ending === 'mallow');
  for (const id of coda) assert.equal(visited.includes(id), ending === 'mallow');
  if (ending === 'mallow') {
    assert.ok(visited.indexOf(`close_${signal}`) < visited.indexOf(coda[0]));
    assert.ok(visited.indexOf(coda[0]) < visited.indexOf(coda[1]));
    assert.ok(visited.indexOf(coda[1]) < visited.indexOf(coda[2]));
    assert.ok(visited.indexOf(coda[2]) < visited.indexOf('close_reason'));
    assert.match(story.close_mallow_voice_thanks.text, /I heard it through the door/);
    assert.match(story.close_mallow_thanks.text, /I don’t know/, 'older checkpoints preserve the earlier response');
  }
}
assert.equal(story.close_repeat.next, 'close_reason', 'old saves without an ending do not invent the Mallow outcome');
assert.equal(story.close_private.next, 'close_reason', 'old saves without an ending do not invent the Mallow outcome');
// The player may decide where the group waits with Mallow after it helps. The
// choice has a physical consequence, but neither route invents an answer from it.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const signal of ['repeat', 'private']) for (const mallowRest of ['counter', 'fort']) {
  const { flags, visited } = play({ companion, signal, mallowRest, ending:'mallow', vote_a:'skip', vote_b:'skip', kit:false });
  assert.equal(flags.mallow_rest, mallowRest);
  assert.ok(visited.indexOf('close_mallow_voice_thanks') < visited.indexOf('close_mallow_choice'));
  assert.ok(visited.includes(`close_mallow_${mallowRest}`));
  assert.ok(!visited.includes(`close_mallow_${mallowRest === 'counter' ? 'fort' : 'counter'}`));
  assert.equal(visited.includes('close_mallow_fort_move'), mallowRest === 'fort');
  assert.ok(visited.indexOf(`close_mallow_${mallowRest}`) < visited.indexOf('close_mallow_light'));
  const codaNode = mallowRest === 'counter' ? 'close_mallow_counter_note' : 'close_mallow_fort_place';
  const otherCoda = mallowRest === 'counter' ? 'close_mallow_fort_place' : 'close_mallow_counter_note';
  assert.ok(visited.indexOf('close_mallow_light') < visited.indexOf(codaNode));
  assert.ok(visited.indexOf(codaNode) < visited.indexOf('close_reason'));
  assert.ok(!visited.includes(otherCoda));
}
// Mira responds to the actual request Mallow answered, rather than deciding
// whether a constructed voice is authentic. Old saves without the visit flag
// take the earlier closing line instead of inventing an unseen exchange.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const response of ['voice', 'search']) {
  const { visited, flags } = play({ companion, ending: 'mallow', mallowResponse: response, signal: 'private', vote_a: 'skip', vote_b: 'skip', kit: false });
  const closing = `close_mallow_${response}_thanks`;
  const other = `close_mallow_${response === 'voice' ? 'search' : 'voice'}_thanks`;
  assert.equal(flags.mallow_promise_heard, response);
  assert.ok(visited.indexOf(`end_mallow_compact_${response}`) < visited.indexOf('close_mallow_shelf'));
  assert.ok(visited.indexOf('close_mallow_shelf') < visited.indexOf(closing));
  assert.ok(visited.indexOf(closing) < visited.indexOf('close_mallow_choice'));
  assert.ok(!visited.includes(other));
}
assert.equal(story.close_mallow_shelf.next, 'close_mallow_thanks');
assert.equal(story.close_mallow_shelf.nextBy.key, 'mallow_promise_heard');
assert.match(story.close_mallow_voice_thanks.text, /asked what it thought.*heard it through the door/i);
assert.match(story.close_mallow_search_thanks.text, /asked it to help look.*hope it can hear/i);
assert.match(story.close_mallow_fort.text, /don’t know if Mallow can hear/i);
assert.equal(story.close_mallow_light.next, 'close_reason', 'a saved light passage continues without inventing an earlier choice');
assert.equal(story.close_mallow_light.nextBy.key, 'mallow_rest');
assert.match(story.close_mallow_counter_note.text, /note.*WE’LL BE BACK.*moth remains still/i);
assert.match(story.close_mallow_fort_place.text, /entrance to the fort.*don’t have to answer now.*blanket door open/i);
// Mallow uses the evidence the player actually chose to find the catch.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const evidence of ['receipt', 'tickets', 'voice']) for (const signal of ['repeat', 'private']) {
  const { visited } = play({ companion, evidence, signal, vote_a:'skip', vote_b:'skip', ending:'mallow', kit:false });
  assert.ok(visited.indexOf(`evidence_machine_${evidence}_compact`) >= 0 && visited.indexOf(`evidence_machine_${evidence}_compact`) < visited.indexOf(`mallow_help_${evidence}`));
  assert.ok(visited.indexOf(`mallow_help_${evidence}`) > visited.indexOf(reachedEndingNode(visited, 'mallow')));
  assert.ok(visited.indexOf(`mallow_help_${evidence}`) < visited.indexOf('end_mallow_2'));
  for (const other of ['receipt', 'tickets', 'voice'].filter(value => value !== evidence)) {
    assert.ok(!visited.includes(`mallow_help_${other}`), 'Mallow does not use unselected evidence');
  }
  for (const id of visited.filter(id => id.startsWith('mallow_help_'))) {
    assert.doesNotMatch(story[id].text, /\{(?:privateAnswer|answer)\}/, 'the evidence response does not disclose the player’s words');
  }
}
assert.equal(story.mallow_help_evidence.next, 'end_mallow_2', 'old saves without evidence follow the original outcome');
assert.match(story.mallow_help_voice_2.text, /twice/i, 'Mira gives the crew a distinguishable signal');
// Only witnessed choices take the shorter route; a legacy or partial save
// must not invent which response Mallow gave or which lens action was chosen.
for (const response of ['voice', 'search']) {
  const flags = { ending: 'mallow', mallow_compact_due: 'yes', mallow_response: response, mallow_response_seen: response };
  assert.equal(compactRescueRoute(flags, 'plan_choice', 'end_mallow'), `end_mallow_compact_${response}`);
  for (const change of [{ mallow_compact_due: undefined }, { mallow_response_seen: undefined },
    { mallow_response_seen: response === 'voice' ? 'search' : 'voice' }, { ending: 'rescue' }]) {
    assert.equal(compactRescueRoute({ ...flags, ...change }, 'plan_choice', 'end_mallow'), 'end_mallow');
  }
  assert.equal(story[`end_mallow_compact_${response}`].setOnVisit.mallow_promise_heard, response);
  assert.equal(story[`end_mallow_compact_${response}`].nextBy.cases.cover, 'mallow_camera_compact');
  assert.equal(story[`end_mallow_compact_${response}`].next, 'mallow_help_evidence');
}
assert.deepEqual(story.mallow_camera_compact.choices, story.mallow_camera_choice.choices);

// A witnessed Mallow response can go straight to the chosen lens action or
// evidence; the old camera-check checkpoint remains available as a fallback.
for (const mallowResponse of ['voice', 'search']) for (const evidence of ['receipt', 'tickets', 'voice']) for (const auditAction of ['cover', 'annotate', 'unplug', 'leave']) for (const cameraMode of ['lift', 'covered']) {
  const { visited, flags } = play({ companion: 'Niko', mallowResponse, evidence, auditAction, cameraMode,
    vote_a:'skip', vote_b:'skip', signal:'private', ending:'mallow', kit:false });
  assert.ok(visited.includes(`end_mallow_compact_${mallowResponse}`));
  assert.equal(visited.includes('mallow_camera_check'), false, 'the repeated turn is skipped');
  assert.equal(flags.mallow_promise_heard, mallowResponse);
  assert.equal(visited.includes('mallow_camera_compact'), auditAction === 'cover');
  if (auditAction === 'cover' && cameraMode === 'covered') {
    assert.ok(visited.includes('mallow_camera_touch'));
    assert.ok(!visited.includes('mallow_help_evidence'), 'covered lens proceeds by touch');
  } else {
    assert.ok(visited.includes('mallow_help_evidence'));
    assert.ok(visited.includes(`mallow_help_${evidence}`));
  }
  assert.ok(visited.includes('end_mallow_2'));
}
for (const response of ['voice', 'search']) {
  assert.equal(story[`end_mallow_${response}`].next, 'mallow_camera_check', 'missing audit action retains old route');
}
assert.equal(story.mallow_camera_check.next, 'mallow_help_evidence', 'saved camera-check passage remains valid');
// The player can use the souvenir as a tool or preserve it at the catch.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const moment of ['keep', 'tear']) for (const cardAction of ['use', 'hold']) {
  const { visited, flags } = play({ companion, moment, cardAction, vote_a:'skip', vote_b:'skip', signal:'private', ending:'mallow', kit:false });
  assert.equal(flags.card_action, cardAction);
  assert.ok(visited.includes('mallow_catch_choice'));
  assert.ok(visited.includes('mallow_catch_complete'));
  assert.equal(visited.includes('mallow_catch_hold'), cardAction === 'hold');
  for (const version of ['keep', 'tear']) {
    assert.equal(visited.includes(`mallow_catch_use_${version}`), cardAction === 'use' && moment === version);
  }
  assert.ok(!visited.includes('mallow_catch_direct'), 'new choices must use only the selected outcome');
  assert.ok(visited.indexOf('mallow_catch_complete') < visited.indexOf('end_mallow_reply'));
}
// A witnessed earlier tool is a third option, without taking away the
// souvenir/hand choices or inventing equipment for proof/older saves.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const moment of ['keep', 'tear']) {
  const { visited, flags } = play({ companion, moment, cardAction: 'tool', routeAction: 'fix',
    vote_a:'skip', vote_b:'skip', signal:'private', ending:'mallow', kit:false });
  assert.ok(visited.includes(`mallow_catch_tool_${companion.toLowerCase()}`));
  assert.ok(visited.includes('mallow_catch_complete'));
  assert.equal(flags.mallow_tool_seen, companion);
  assert.ok(visited.includes(moment === 'keep' ? 'souvenir_kept' : 'souvenir_torn'));
  assert.ok(!visited.includes('souvenir_used'));
  assert.equal(mallowToolAvailable(flags, companion), true);
  for (const change of [{ route_action:'proof' }, { rescue_tool_shortcut_due:undefined },
    { rescue_tool_shortcut_due:'other' }, { ending:'rescue' }, { companion:'other' }]) {
    assert.equal(mallowToolAvailable({ ...flags, ...change }, companion), false);
  }
  assert.equal(compactPocketRoute({ ...flags, mallow_tool_seen: undefined }, 'close_bell', 'souvenir_check'), 'souvenir_check');
  assert.equal(compactPocketRoute({ ...flags, mallow_tool_seen: 'other' }, 'close_bell', 'souvenir_check'), 'souvenir_check');
  assert.equal(compactPocketRoute({ ...flags, rescue_tool_shortcut_due: undefined }, 'close_bell', 'souvenir_check'), 'souvenir_check');
}
assert.equal(story.end_mallow_2.next, 'mallow_catch_direct', 'older saves without a souvenir can still open the door');
// Retreat leaves Mira below and the player chooses how to try making contact.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const retreatSignal of ['tap', 'call']) {
  const { visited, flags } = play({ companion, retreatSignal, ending: 'retreat', vote_a:'skip', vote_b:'skip', signal:'private', kit:false });
  const other = retreatSignal === 'tap' ? 'call' : 'tap';
  assert.equal(flags.retreat_signal, retreatSignal);
  assert.ok(visited.indexOf('retreat_choice') > visited.indexOf('end_retreat'));
  assert.ok(visited.includes(`retreat_${retreatSignal}`));
  assert.ok(!visited.includes(`retreat_${other}`));
  assert.ok(visited.indexOf(`retreat_plan_${retreatSignal}_compact`) < visited.indexOf('close_evidence_receipt'));
  assert.ok(visited.slice(visited.indexOf('end_retreat_reply')).every(id => story[id].speaker !== 'Mira'), 'Mira remains below during retreat');
}
// Each companion remembers a shared activity; retreat keeps Mira physically below.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { visited } = play({ companion, bond, ending, vote_a:'skip', vote_b:'skip', signal:'private', kit:false });
  const route = companion.toLowerCase();
  const callback = companion === 'Mira' && ending === 'retreat' ? `close_mira_retreat_${bond}` : `close_${route}_bond_${bond}`;
  const other = bond === 'care' ? 'play' : 'care';
  const otherCallback = companion === 'Mira' && ending === 'retreat' ? `close_mira_retreat_${other}` : `close_${route}_bond_${other}`;
  assert.ok(visited.indexOf(`${route}_bond_${bond}`) < visited.indexOf(`${route}_private`));
  assert.ok(visited.includes(callback));
  assert.ok(!visited.includes(otherCallback), 'the other memory is never invented');
  assert.ok(visited.indexOf(callback) < visited.indexOf('close_signal'));
  if (companion === 'Mira' && ending === 'retreat') assert.equal(story[callback].speaker, 'Narrator');
}
// Saves made before these activities keep the original closing route.
for (const id of ['close_niko', 'close_mira', 'close_mira_retreat', 'close_ash']) assert.equal(story[id].next, 'close_signal');
// Mira's workshop conversation is private when she is rescued; on retreat,
// the plush last seen in the playroom is not magically asserted to be upstairs.
for (const ending of ['rescue', 'record', 'mallow', 'retreat']) for (const bond of ['care', 'play']) for (const signal of ['repeat', 'private']) {
  const { visited } = play({ companion:'Mira', ending, bond, signal, vote_a:'skip', vote_b:'skip', kit:false });
  assert.ok(visited.indexOf('fourth_wall_count_mira_combined') >= 0);
  assert.ok(visited.indexOf('fourth_wall_count_mira_combined') < visited.indexOf(`moment_return_keep_compact`));
  assert.match(story.fourth_mira_compact.text, /all three places.*I remember.*keep talking/i);
  assert.equal(story.fourth_mira_relay.speaker, 'Ash');
  assert.match(story.fourth_mira_reply.text, /hear you through the door/i);
  assert.equal(visited.includes('close_mira_enter'), ending !== 'retreat');
  if (ending !== 'retreat') {
    assert.ok(visited.indexOf('close_mira_enter') < visited.indexOf('close_mira'));
    assert.equal(story.close_mira.location, 'sewing');
    assert.match(story.close_mira_enter.text, /away from the others/i);
  } else {
    assert.equal(story[`close_mira_retreat_${bond}`].location, 'sewing');
    assert.ok(!visited.includes('close_mira'));
  }
}
assert.match(story.close_mira_retreat_care.text, /was down in the playroom/i);
assert.doesNotMatch(story.close_mira_retreat_care.text, /plush waits upstairs|ear exactly where you left/i);
assert.equal(story.close_signal.location, 'arcade');
assert.equal(story.close_reason.location, 'hideout');
// A real follow-up conversation shapes a physical detail of the later plan.
// Both work choices lead to it, and it remains compatible with each ending.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const topic of ['past', 'future']) for (const routeAction of ['fix', 'proof']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) for (const auditAction of ['cover', 'unplug']) for (const signal of ['private', 'repeat']) {
  const { visited, flags } = play({ companion, topic, routeAction, ending, auditAction, vote_a: 'skip', vote_b: 'skip', signal, kit: false });
  const route = companion.toLowerCase();
  const selected = `plan_${route}_topic_${topic}`;
  const other = `plan_${route}_topic_${topic === 'past' ? 'future' : 'past'}`;
  assert.ok(visited.indexOf(`${route}_question_${topic}`) < visited.indexOf(selected));
  assert.ok(visited.indexOf(`plan_${route}_${routeAction}`) < visited.indexOf(selected));
  assert.ok(visited.indexOf(selected) < visited.indexOf('plan_choice'));
  assert.ok(!visited.includes(other));
  if (ending === 'rescue' && routeAction === 'proof') {
    const physical = `rescue_${route}_topic_${topic}`;
    assert.ok(visited.indexOf(physical) > visited.indexOf('rescue_without_tool'));
    assert.ok(visited.indexOf(physical) < visited.indexOf(auditAction === 'unplug' ? 'rescue_complete_unplug' : 'rescue_complete'));
    assert.ok(!visited.includes(`rescue_${route}_topic_${topic === 'past' ? 'future' : 'past'}`));
    assert.equal(flags.rescue_topic_seen, `${route}_${topic}`);
  } else {
    assert.equal(flags.rescue_topic_seen, undefined);
  }
}
for (const companion of ['niko', 'mira', 'ash']) for (const action of ['fix', 'proof']) {
  const node = story[`plan_${companion}_${action}`];
  assert.equal(node.next, 'plan_choice', 'older saves without a topic keep the original route');
}
for (const companion of ['niko', 'mira', 'ash']) {
  const node = story[`rescue_topic_${companion}`];
  assert.equal(node.next, 'rescue_finish_check', 'older saves without a topic do not invent a conversation');
  assert.equal(story.rescue_finish_check.next, 'rescue_complete');
  assert.equal(story.rescue_finish_check.nextBy.cases.unplug, 'rescue_complete_unplug');
  for (const topic of ['past', 'future']) {
    const outcome = story[`rescue_${companion}_topic_${topic}`];
    assert.equal(outcome.next, 'rescue_complete');
    assert.equal(outcome.nextBy.cases.unplug, 'rescue_complete_unplug');
  }
}
// Each companion's chosen question returns at the end; Mira stays below on retreat.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const topic of ['past', 'future']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { visited, flags } = play({ companion, topic, ending, vote_a:'skip', vote_b:'skip', signal:'private', kit:false });
  const route = companion.toLowerCase();
  const callback = companion === 'Mira' && ending === 'retreat' ? `close_mira_retreat_${topic}` : `close_${route}_${topic}`;
  const other = topic === 'past' ? 'future' : 'past';
  const otherCallback = companion === 'Mira' && ending === 'retreat' ? `close_mira_retreat_${other}` : `close_${route}_${other}`;
  assert.equal(flags.topic, topic);
  assert.ok(visited.indexOf(`${route}_question_${topic}`) > visited.indexOf(`${route}_chat`));
  assert.ok(visited.includes(callback));
  assert.ok(!visited.includes(otherCallback));
  assert.ok(visited.indexOf(callback) < visited.indexOf('close_signal'));
  if (companion === 'Mira' && ending === 'retreat') assert.equal(story[callback].speaker, 'Narrator');
}
for (const id of ['close_niko_topic', 'close_mira_topic', 'close_mira_retreat_topic', 'close_ash_topic']) {
  assert.equal(story[id].next, 'close_signal', 'older saves without a topic do not invent a conversation');
}
// If Mira remains downstairs, Ash's selected conversation returns as an
// active search rather than a celebration of an adventure already completed.
for (const topic of ['past', 'future']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { visited } = play({ companion: 'Ash', topic, ending, vote_a:'skip', vote_b:'skip', signal:'private', kit:false });
  const extra = `close_ash_retreat_${topic}`;
  assert.equal(visited.includes(extra), ending === 'retreat');
  if (ending === 'retreat') {
    assert.ok(visited.indexOf(`close_ash_${topic}`) < visited.indexOf(extra));
    assert.ok(visited.indexOf(extra) < visited.indexOf('close_ash_retreat_talk_choice'));
    assert.ok(!visited.includes(`close_ash_retreat_${topic === 'past' ? 'future' : 'past'}`));
  }
}
assert.equal(story.close_ash_past.next, 'close_ash_talk_choice');
assert.equal(story.close_ash_future.next, 'close_ash_talk_choice');
// The machine appropriates the activity actually chosen, and later reconstructs
// the card in a way that reflects what the player did to it.
// New paths combine the discovery and card arrival while retaining the exact
// pictured scene and the marker used by its artwork and AI conversation.
for (const keepsake of ['star', 'bell', 'ribbon']) for (const companion of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) {
  const route = companion.toLowerCase();
  const { visited, flags } = play({ companion, bond, keepsake, moment: 'keep', ending: 'rescue', vote_a:'skip', vote_b:'skip', signal:'private', kit:false });
  const compact = `discovery_${route}_compact`;
  const picture = `moment_${route}_${bond}`;
  assert.equal(visited.includes('route_discovery'), false);
  assert.equal(visited.includes(`discovery_${route}_2`), false);
  assert.equal(visited.includes(`moment_${route}`), false);
  assert.ok(visited.indexOf(`descent_${keepsake}`) < visited.indexOf(`discovery_${route}`));
  assert.ok(visited.indexOf(`discovery_${route}`) < visited.indexOf(compact));
  assert.ok(visited.indexOf(compact) < visited.indexOf(picture));
  assert.equal(flags.midpoint_route, route);
  assert.equal(story[compact].text, `${story[`discovery_${route}_2`].text} ${story[`moment_${route}`].text}`);
  assert.ok(story[picture].text.length <= 250, `${picture} remains available as witnessed AI context`);
}
for (const keepsake of ['star', 'bell', 'ribbon']) {
  assert.equal(story[`descent_${keepsake}`].next, 'route_discovery', 'missing companions keep their legacy fallback');
}
for (const route of ['niko', 'mira', 'ash']) {
  assert.equal(story[`discovery_${route}`].next, `discovery_${route}_2`, 'a missing activity keeps the original discovery');
  assert.equal(story[`discovery_${route}_2`].next, `moment_${route}`, 'an old discovery checkpoint shows the original arrival');
  assert.equal(story[`discovery_${route}_compact`].next, 'shared_discovery', 'an incomplete compact checkpoint does not invent an activity');
  assert.equal(story[`moment_${route}`].next, 'shared_discovery', 'an old arrival checkpoint without a bond continues safely');
}
for (const companion of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) for (const moment of ['keep', 'tear']) {
  const { visited } = play({ companion, bond, moment, ending: 'rescue', vote_a:'skip', vote_b:'skip', signal:'private', kit:false });
  const route = companion.toLowerCase();
  assert.ok(visited.includes(`moment_${route}_${bond}`));
  assert.ok(visited.indexOf(`moment_${route}_${bond}`) < visited.indexOf('moment_choice'));
  assert.ok(visited.includes(`moment_${moment}`));
  assert.ok(visited.includes(`moment_return_${moment}_compact`));
  assert.ok(visited.indexOf(`fourth_wall_count_${route}_combined`) >= 0 && visited.indexOf(`moment_return_${moment}_compact`) > visited.indexOf(`fourth_wall_count_${route}_combined`));
  assert.ok(visited.indexOf(`moment_return_${moment}_compact`) < visited.indexOf('history_steps_picture'));
  assert.ok(!visited.includes(`moment_return_${moment === 'keep' ? 'tear' : 'keep'}_compact`));
  for (const id of visited.filter(id => id.startsWith('moment_'))) assert.doesNotMatch(story[id].text, /\{(?:privateAnswer|answer)\}/);
}
// Only a named drawing acquires the player's name in the uncanny card; both
// paper choices and every ending retain their original continuation.
for (const nameKnight of [false, true]) for (const moment of ['keep', 'tear']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { visited, flags } = play({ companion: 'Mira', bond: 'play', nameKnight, moment, ending, vote_a: 'skip', vote_b: 'skip', signal: 'private', kit: false });
  assert.equal(visited.includes('moment_mira_knight_name'), nameKnight);
  assert.equal(flags.named_card_seen, nameKnight ? 'yes' : undefined);
  if (nameKnight) {
    assert.ok(visited.indexOf('moment_mira_play_reply') < visited.indexOf('moment_mira_knight_name'));
    assert.ok(visited.indexOf('moment_mira_knight_name') < visited.indexOf('moment_caption'));
  }
  assert.ok(visited.includes(`moment_${moment}`));
}
assert.equal(story.moment_mira_play_reply.next, 'moment_caption', 'older or unnamed saves skip the new beat');
// Checkpoints predating the activity/card choice can continue without inventing either.
for (const id of ['moment_niko', 'moment_mira', 'moment_ash']) assert.equal(story[id].next, 'shared_discovery');
assert.equal(story.moment_return.next, 'history_intro');
for (const id of ['mira_route', 'mira_fun', 'mira_bond_choice', 'mira_bond_care', 'mira_bond_play', 'mira_clue', 'mira_private', 'mira_input', 'mira_chat', 'mira_after', 'mira_work_choice', 'mira_work_fix', 'mira_work_proof']) {
  assert.equal(story[id].location, 'sewing', `${id}: Mira's private route uses the sewing room`);
}
for (const id of ['ash_route', 'ash_fun', 'ash_bond_choice', 'ash_bond_care', 'ash_bond_play', 'ash_clue', 'ash_private', 'ash_input', 'ash_chat', 'ash_after', 'ash_work_choice', 'ash_work_fix', 'ash_work_proof']) {
  assert.equal(story[id].location, 'stairs', `${id}: Ash's private route uses the stair landing`);
}
for (const evidence of ['receipt', 'tickets', 'voice']) for (const keepsake of ['star', 'bell', 'ribbon']) for (const reason of ['team', 'prize', 'company']) {
  const { visited } = play({ companion:'Ash', vote_a:'skip', vote_b:'skip', signal:'private', ending:'rescue', kit:false, evidence, keepsake, reason });
  assert.ok(visited.indexOf(`evidence_machine_${evidence}_compact`) > visited.indexOf('evidence_choice'));
  assert.ok(visited.indexOf(`evidence_machine_${evidence}_compact`) < visited.indexOf('fourth_wall_intro_compact'));
  for (const other of ['receipt', 'tickets', 'voice'].filter(item => item !== evidence)) {
    assert.ok(!visited.includes(`evidence_machine_${other}_compact`), 'the other evidence was not selected');
  }
  assert.ok(visited.includes(`close_evidence_${evidence}`));
  assert.ok(visited.includes(keepsake === 'star' ? 'close_star_returned' : `close_${keepsake}`));
  assert.ok(visited.includes(reason === 'prize' ? 'ending_prize_won' : `ending_${reason}`));
  assert.ok(visited.indexOf(`descent_${keepsake}`) > visited.indexOf('descent'));
  assert.ok(visited.indexOf(`shift_${keepsake}`) > visited.indexOf('room_shift'));
  assert.ok(visited.indexOf(`shift_${keepsake}`) < visited.indexOf('mira_missing'));
  for (const other of ['star', 'bell', 'ribbon'].filter(item => item !== keepsake)) {
    assert.ok(!visited.includes(`descent_${other}`));
    assert.ok(!visited.includes(`shift_${other}`));
  }
}
assert.equal(story.evidence_rejoin.next, 'correction_again', 'older saves without an evidence flag remain playable');
// The door sighting is remembered only when visited, across every ending.
assert.deepEqual(story.shift_star.setOnVisit, { star_moved_seen: 'yes' });
assert.equal(keepsakeClosingRoute({ keepsake: 'star' }), 'star', 'a checkpoint predating the sighting keeps its original text');
assert.equal(keepsakeClosingRoute({}), '', 'no keepsake is invented for older saves');
for (const ending of ['rescue', 'record', 'mallow', 'retreat']) for (const keepsake of ['star', 'bell', 'ribbon']) {
  const { flags, visited } = play({ companion: 'Ash', vote_a: 'skip', vote_b: 'skip', signal: 'private', ending, kit: false, keepsake });
  assert.equal(flags.star_moved_seen, keepsake === 'star' ? 'yes' : undefined);
  assert.ok(visited.includes(keepsake === 'star' ? 'close_star_returned' : `close_${keepsake}`));
  if (keepsake === 'star') {
    assert.ok(visited.indexOf('shift_star') < visited.indexOf('close_star_returned'));
    const savedFlags = JSON.parse(JSON.stringify(flags));
    assert.equal(keepsakeClosingRoute(savedFlags), 'star_returned');
    assert.match(story.close_star_returned.text, /star covers.*hole in the map/i);
    assert.match(story.close_star_returned.text, /one like it move across the playroom door/i);
    assert.match(story.close_star_returned.text, /can’t tell if it was the same star/i);
  }
}
// Older saves may not have a keepsake. Continue without inventing one.
assert.equal(story.descent.next, 'route_discovery');
assert.equal(story.room_shift.next, 'mira_missing');
// Inspect actual rendered story text across each action, rather than only flags.
const transcripts = Object.fromEntries(['rescue', 'record', 'mallow', 'retreat'].map(ending => {
  const { visited } = play({ companion:'Mira', vote_a:'warm', vote_b:'direct', signal:'private', ending, kit:true, evidence:'voice', keepsake:'bell', reason:'company' });
  return [ending, visited.map(id => story[id].text).join('\n')];
}));
for (const text of Object.values(transcripts)) {
  assert.match(text, /Your correction has been included in the successful result/);
  assert.match(text, /The handle remains locked/);
  assert.match(text, /blue wallpaper/i);
  assert.doesNotMatch(text, /\{privateAnswer\}/);
}
assert.match(transcripts.rescue, /Mira tumbles through/);
assert.match(transcripts.rescue, /eats the paper roll/);
assert.match(transcripts.record, /false count and the correction it swallowed/);
assert.match(transcripts.mallow, /hidden catch/);
assert.match(transcripts.mallow, /display goes blank/);
assert.match(transcripts.retreat, /Mira is still below/);
assert.doesNotMatch(transcripts.retreat, /About that workshop: I still want to go/);
for (const id of ['niko_chat', 'mira_chat', 'ash_chat', 'ai_reflection']) {
  assert.equal(story[id].text, story[id].ai.fallback, `${id}: scripted text and fallback should agree`);
  const lead = story[story[id].ai.leadIn];
  assert.equal(lead.speaker, story[id].ai.character);
  assert.equal(story[lead.next].input.next, id);
  assert.doesNotMatch(lead.text, /\{(?:privateAnswer|answer)\}/);
}

// The fourth-wall records come from real earlier choices, never input fields.
for (const [id, sourceId, flag] of [
  ['fourth_wall_intro', 'signal_choice', 'signal'],
  ['fourth_wall_companion', 'crew_choice', 'companion'],
  ['fourth_wall_correction', 'correction_choice', 'disclosure']
]) {
  const remember = story[id].remember;
  assert.deepEqual(remember, { source: sourceId, flag });
  const source = story[remember.source];
  assert.ok(source.choices.length >= 2);
  assert.equal(new Set(source.choices.map(choice => choice.set?.[flag])).size, source.choices.length);
  for (const choice of source.choices) {
    assert.equal(typeof choice.set?.[flag], 'string');
    assert.doesNotMatch(choice.label, /\{(?:privateAnswer|answer)\}/);
  }
}

// A save from before the new route choice must not invent a carried object.
for (const companion of ['Niko', 'Mira', 'Ash']) {
  const route = story[`plan_${companion.toLowerCase()}`];
  assert.equal(route.next, 'plan_choice');
  assert.equal(story.rescue_action.next, 'rescue_without_tool');
}
assert.equal(story.history_select.next, 'policy_select');
assert.equal(story.history_second_check.next, 'history_reflect', 'older saves without a second vote do not invent it');

// The machine reduces the player's opening motive to a false completed result;
// the answer remains the actual earlier choice, and Mira's situation is not
// silently resolved. An older checkpoint with no reason skips this callback.
assert.deepEqual(story.reason_reveal.remember, { source: 'reason_choice', flag: 'reason' });
assert.equal(story.reason_reveal_check.next, 'history_intro');
for (const companion of ['Niko', 'Mira', 'Ash']) for (const reason of ['team', 'prize', 'company']) for (const signal of ['repeat', 'private']) {
  const { visited } = play({ companion, reason, signal, vote_a: 'direct', vote_b: 'warm', ending: 'rescue', kit: false });
  assert.ok(visited.indexOf('moment_return_keep_compact') >= 0 && visited.indexOf('moment_return_keep_compact') < visited.indexOf(`reason_focus_${reason}`));
  assert.deepEqual(story[`reason_focus_${reason}`].remember, { source: 'reason_choice', flag: 'reason' });
  assert.deepEqual(story[`reason_result_${reason}_reply`].remember, { source: 'reason_choice', flag: 'reason' });
  const label = { team: 'BELONGING GRANTED', prize: 'PRIZE DELIVERED', company: 'NO ONE ALONE' }[reason];
  assert.ok(story[`reason_focus_${reason}`].text.includes(label));
  assert.ok(story[`reason_focus_${reason}`].text.startsWith(story[`reason_result_${reason}_reply`].text));
  assert.ok(visited.indexOf(`reason_focus_${reason}`) < visited.indexOf('late_focus_tell_receipt'));
  const receiptArrival = 'late_focus_tell_receipt';
  assert.ok(visited.indexOf(receiptArrival) >= 0 && visited.indexOf(receiptArrival) < visited.indexOf('history_brief_direct'), 'the receipt appears before the selected line is read');
  assert.match(story[receiptArrival].text, /receipt curls out of the slot/i);
  for (const other of ['team', 'prize', 'company'].filter(value => value !== reason)) {
    assert.ok(!visited.includes(`reason_result_${other}`));
  }
}
// Each repeat-consent hint follows the receipt immediately; old checkpoints
// retain the original selector and private scenes keep their separate clue.
for (const vote_a of ['direct', 'warm', 'skip']) {
  const { visited } = play({ companion: 'Niko', reason: 'team', signal: 'repeat', vote_a, vote_b: 'warm', ending: 'rescue', kit: false });
  assert.equal(visited[visited.indexOf('late_focus_tell_receipt') + 1], `history_brief_${vote_a}`);
}
assert.equal(story.history_repeat_intro.next, 'history_select', 'a legacy save without a hint flag keeps the selector fallback');
assert.match(story.reason_result_prize_reply.text, /one ticket short/i);
assert.match(story.reason_result_company_reply.text, /still in here/i);

// The second preference input is recalled verbatim, with the selected option
// drawn from the actual earlier threshold choice rather than player messages.
for (const vote of ['direct', 'warm', 'skip']) {
  const node = story[`history_second_${vote}`];
  assert.ok(node.text.includes(story[`basement_${vote}`].text));
  assert.deepEqual(node.remember, { source: 'basement_vote', flag: 'vote_b' });
  assert.doesNotMatch(node.text, /\{(?:privateAnswer|answer)\}/);
}

// The machine presents the actual earlier authored line, not an invented player rating.
for (const style of ['direct', 'warm']) {
  assert.ok(story[`history_${style}`].text.includes(story[`hint_${style}`].text));
}
assert.ok(story.history_skip.text.includes('I’ll keep the counter light on for you.'));
assert.match(story.history_reaction.text, /never said it was well received.*its own stamp/i);
for (const id of ['history_direct', 'history_warm', 'history_skip']) {
  assert.match(story[id].text, /WELL RECEIVED.*never said it was well received/i);
}

assert.equal(story.ai_reflection.ai.audience, 'group');
assert.equal(story.signal_repeat.text.includes('{privateAnswer}'), true);
assert.equal(story.signal_private.text.includes('{privateAnswer}'), false);
assert.deepEqual(story.repair_offer.offer.grant.set, { repairKit: 'free' });
for (const companion of ['Niko', 'Mira', 'Ash']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) for (const epilogueTalk of [false, true]) {
  const { visited } = play({ companion, ending, epilogueTalk, vote_a: 'direct', vote_b: 'warm', signal: 'private', kit: false });
  const name = companion.toLowerCase();
  const canTalk = !(companion === 'Mira' && ending === 'retreat');
  const prefix = companion === 'Ash' && ending === 'retreat' ? 'close_ash_retreat' : `close_${name}`;
  assert.equal(visited.includes(`${prefix}_talk_choice`), canTalk);
  assert.equal(visited.includes(`${prefix}_chat`), canTalk && epilogueTalk);
  assert.ok(visited.includes('close_signal'));
}

console.log(`✓ ${Object.keys(story).length} nodes, all targets and 891 core offline story paths validated`);

// Choosing to make a copy has a distinct payoff when the crew prints the
// machine's record: only the copy actually made appears beside that record.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const routeAction of ['fix', 'proof']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { visited } = play({ companion, routeAction, ending, vote_a:'skip', vote_b:'skip', signal:'private', kit:false });
  const shouldCompare = routeAction === 'proof' && ending === 'record';
  assert.equal(visited.includes('record_proof_companion'), shouldCompare);
  for (const route of ['niko', 'mira', 'ash']) {
    assert.equal(visited.includes(`record_proof_${route}`), shouldCompare && route === companion.toLowerCase());
  }
  if (shouldCompare) {
    assert.ok(visited.indexOf('end_record_reply') < visited.indexOf('record_proof_companion'));
    assert.ok(visited.indexOf(`record_proof_${companion.toLowerCase()}`) < visited.indexOf('evidence_close'));
  }
}
assert.equal(story.end_record_reply.next, 'evidence_close', 'older saves without a route action retain the original ending');
assert.match(story.descent.text, /prize counter.*printer slot/i, 'the printer is established before it is used');

// The retreat signal affects the search plan, and neither response claims the
// uncertain sound is definitely Mira or invents a successful rescue.
for (const retreatSignal of ['tap', 'call']) for (const companion of ['Niko', 'Mira', 'Ash']) {
  const { visited } = play({ companion, ending: 'retreat', retreatSignal, vote_a:'skip', vote_b:'skip', signal:'private', kit:false });
  const other = retreatSignal === 'tap' ? 'call' : 'tap';
  assert.ok(visited.includes(`retreat_plan_${retreatSignal}_compact`));
  assert.ok(!visited.includes(`retreat_plan_${other}_compact`));
  assert.ok(!visited.includes(`retreat_after_${retreatSignal}`));
  assert.equal(visited.indexOf(`retreat_plan_${retreatSignal}_compact`), visited.indexOf(`retreat_${retreatSignal}`) + 1);
  assert.ok(visited.indexOf(`retreat_plan_${retreatSignal}_compact`) < visited.indexOf('close_evidence_receipt'));
}
assert.match(story.retreat_plan_tap.text, /two taps.*one from below/i);
assert.match(story.retreat_plan_tap_ash.text, /might be Mira/i);
assert.match(story.retreat_plan_call_ash.text, /scrape after you called/i);
assert.equal(story.retreat_plan.next, 'evidence_close', 'an older checkpoint without a signal keeps the original continuation');

// Old checkpoints at the selected signal retain their original continuation;
// the pacing marker is only set when making the choice in the current build.
for (const action of ['tap', 'call']) {
  assert.equal(story[`retreat_${action}`].next, `retreat_after_${action}`);
  assert.equal(story[`retreat_${action}`].nextBy.cases.yes, `retreat_plan_${action}_compact`);
  assert.equal(story[`retreat_after_${action}`].next, 'retreat_plan');
  assert.equal(story.retreat_plan.nextBy.cases[action], `retreat_plan_${action}`);
  assert.equal(story[`retreat_plan_${action}`].next, `retreat_plan_${action}_ash`);
  assert.equal(story[`retreat_plan_${action}_compact`].next, 'evidence_close');
  assert.equal(story[`retreat_plan_${action}_compact`].nextBy.cases.yes, 'retreat_probe_intro');
}
assert.match(story.retreat_plan_tap_compact.text, /two taps.*one from below.*might be Mira/i);
assert.match(story.retreat_plan_call_compact.text, /scrapes.*heard a scrape, not a voice/i);


// A witnessed retreat search can lead straight to the selected closing
// callbacks. Marker-free checkpoints after the search and inconsistent
// checkpoints retain their original transitions.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const evidence of ['receipt', 'tickets', 'voice'])
  for (const keepsake of ['star', 'bell', 'ribbon']) for (const moment of ['keep', 'tear'])
    for (const kit of [false, true]) for (const privateTone of ['personal', 'light']) {
      const { visited, flags } = play({ companion, evidence, keepsake, moment, kit, privateTone,
        ending: 'retreat', retreatSearch: 'sound', vote_a: 'direct', vote_b: 'warm', signal: 'private' });
      assert.equal(flags.compact_retreat_closing, 'yes');
      const search = visited.indexOf('retreat_early_search_sound');
      const chosenEvidence = visited.indexOf(`close_evidence_${evidence}`);
      const chosenKeepsake = visited.indexOf(story.keepsake_check.nextBy.cases[keepsakeClosingRoute(flags)]);
      const chosenPicture = visited.indexOf(moment === 'keep' ? 'souvenir_kept' : 'souvenir_torn');
      const chosenCompanion = visited.indexOf(companion === 'Mira'
        ? (privateTone === 'light' ? 'close_mira_retreat_light' : 'close_mira_retreat')
        : `close_${companion.toLowerCase()}`);
      assert.ok(search >= 0 && search < chosenEvidence && chosenEvidence < chosenKeepsake &&
        chosenKeepsake < chosenPicture && chosenPicture < chosenCompanion, 'all chosen callbacks stay in order');
      assert.ok(visited.includes('kit_check'), 'the stairway still rattles');
      assert.equal(visited.includes('kit_use'), kit, 'only owned kits receive their payoff');
      if (kit) assert.ok(visited.indexOf('kit_use') < visited.indexOf('kit_use_retreat') && visited.indexOf('kit_use_retreat') < chosenKeepsake);
      for (const id of ['evidence_close', 'keepsake_check', 'souvenir_pocket', 'close_mira_check'])
        assert.ok(!visited.includes(id), `witnessed route does not pause at ${id}`);
    }
// Ash's lighter retreat conversation keeps both the chosen activity and the
// unsettled search in Ash's voice while making the private choice sooner.
for (const bond of ['care', 'play']) for (const signal of ['private', 'repeat'])
  for (const retreatSearch of ['stair', 'sound']) for (const epilogueTalk of [false, true]) {
    const { visited, flags } = play({ companion: 'Ash', bond, privateTone: 'light', signal,
      ending: 'retreat', retreatSearch, epilogueTalk, vote_a: 'direct', vote_b: 'warm' });
    assert.equal(flags.ash_retreat_light_seen, 'yes');
    assert.ok(visited.includes('close_ash') && visited.includes('close_ash_retreat_light_compact'));
    for (const id of [`close_ash_bond_${bond}`, 'close_ash_light', 'close_ash_retreat_light', 'close_ash_retreat_talk_choice'])
      assert.ok(!visited.includes(id), `${id} is included in the compact Ash passages`);
    assert.equal(visited.includes('close_ash_retreat_chat'), epilogueTalk);
    const passage = compactRetreatPassage(flags, 'close_ash');
    assert.equal(passage.text, `${story.close_ash.text} ${story[`close_ash_bond_${bond}`].text}`);
    assert.equal(story.close_ash_retreat_light_compact.text, `${story.close_ash_light.text} ${story.close_ash_retreat_light.text}`);
    assert.equal(compactRetreatClosingRoute(flags, 'close_ash', `close_ash_bond_${bond}`), 'close_ash_retreat_light_compact');
    for (const change of [{ ash_retreat_light_due: undefined }, { retreat_search_seen: undefined },
      { private_tone: 'personal' }, { topic: 'past' }, { companion: 'Niko' }]) {
      const old = { ...flags, ...change };
      assert.equal(compactRetreatPassage(old, 'close_ash'), null);
      assert.equal(compactRetreatClosingRoute(old, 'close_ash', `close_ash_bond_${bond}`), `close_ash_bond_${bond}`);
    }
  }
const compactRetreat = { compact_retreat_closing: 'yes', ending: 'retreat', retreat_search_early: 'yes',
  retreat_search: 'stair', retreat_search_seen: 'stair', evidence: 'receipt', keepsake: 'star', moment: 'keep', companion: 'Mira' };
for (const [from, next, expected] of [
  ['retreat_early_search_stair', 'evidence_close', 'close_evidence_receipt'],
  ['kit_check', 'keepsake_check', 'close_star'],
  ['close_star', 'souvenir_pocket', 'souvenir_kept'],
  ['souvenir_kept', 'close_mira_check', 'close_mira_retreat']
]) {
  assert.equal(compactRetreatClosingRoute(compactRetreat, from, next), expected);
  for (const change of [{ compact_retreat_closing: undefined }, { ending: 'record' },
    { retreat_search_seen: undefined }, { retreat_search_seen: 'sound' }, { retreat_search_early: undefined }])
    assert.equal(compactRetreatClosingRoute({ ...compactRetreat, ...change }, from, next), next, 'marker-free or inconsistent checkpoints keep the transition');
}
assert.equal(compactRetreatClosingRoute({ ...compactRetreat, evidence: undefined }, 'retreat_early_search_stair', 'evidence_close'), 'evidence_close');
assert.equal(compactRetreatClosingRoute({ ...compactRetreat, keepsake: undefined }, 'kit_check', 'keepsake_check'), 'keepsake_check');
assert.equal(compactRetreatClosingRoute({ ...compactRetreat, keepsake: 'bell' }, 'close_star', 'souvenir_pocket'), 'souvenir_pocket');
assert.equal(compactRetreatClosingRoute({ ...compactRetreat, moment: undefined }, 'close_star', 'souvenir_pocket'), 'souvenir_pocket');
assert.equal(compactRetreatClosingRoute({ ...compactRetreat, repairKit: 'free' }, 'kit_check', 'kit_use'), 'kit_use');
assert.equal(compactRetreatClosingRoute({ ...compactRetreat, repairKit: 'free' }, 'kit_use_retreat', 'keepsake_check'), 'keepsake_check');
assert.equal(compactRetreatClosingRoute({ ...compactRetreat, repairKit: 'free', kit_use_seen: 'yes' }, 'kit_use_retreat', 'keepsake_check'), 'close_star');

// The team can perform an actual signal experiment after the retreat. Each
// choice changes what happens and what the group records, without declaring
// the unknown sound to be Mira or inventing a rescue.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const retreatSignal of ['tap', 'call']) for (const retreatProbe of ['repeat', 'change']) {
  const { visited, flags } = play({ companion, ending: 'retreat', retreatSignal, retreatProbe, vote_a:'skip', vote_b:'skip', signal:'private', kit:false });
  const other = retreatProbe === 'repeat' ? 'change' : 'repeat';
  assert.equal(visited.indexOf('retreat_probe_intro'), visited.indexOf(`retreat_plan_${retreatSignal}_compact`) + 1);
  assert.ok(visited.indexOf('retreat_probe_intro') < visited.indexOf('retreat_probe_choice'));
  assert.ok(visited.indexOf('retreat_probe_choice') < visited.indexOf(`retreat_probe_${retreatProbe}`));
  assert.ok(visited.indexOf(`retreat_probe_${retreatProbe}_reply`) < visited.indexOf('close_evidence_receipt'));
  assert.ok(!visited.includes(`retreat_probe_${other}`));
  assert.equal(flags.retreat_probe, retreatProbe);
  assert.equal(flags.retreat_probe_seen, retreatProbe);
}
assert.match(story.retreat_probe_intro.text, /knock, a pause, then two more/i);
assert.match(story.retreat_probe_repeat_reply.text, /might be repeating us.*might be repeating it/i);
assert.match(story.retreat_probe_change.text, /knock sounds underneath before your hand comes down/i);
assert.match(story.retreat_probe_change_reply.text, /don’t want the map pretending we know/i);
for (const id of ['retreat_plan_tap_ash', 'retreat_plan_call_ash']) {
  assert.equal(story[id].next, 'evidence_close', 'legacy saves without the new marker skip the experiment');
  assert.equal(story[id].nextBy.cases.yes, 'retreat_probe_intro');
}

// Shortened retreat reflections include the actual privacy and preparation
// choices. Incomplete and legacy checkpoints do not skip unwitnessed scenes.
for (const signal of ['private', 'repeat']) for (const search of ['stair', 'sound']) for (const preparation of ['sketchbook', 'thread']) {
  const flags = { retreat_epilogue_v1: 'yes', ending: 'retreat', retreat_fort_closing_due: 'yes', compact_retreat_closing: 'yes', retreat_search_early: 'yes', retreat_search: search, retreat_search_seen: search, signal, companion: 'Mira', mira_retreat_prepare: preparation, mira_retreat_prepare_seen: preparation };
  assert.equal(compactRetreatReady(flags), true);
  const text = compactRetreatPassage(flags, 'close_signal').text;
  assert.match(text, /Mallow’s plush.*still on the arcade shelf/);
  assert.match(text, signal === 'private' ? /did not let Mallow repeat/ : /words you let Mallow repeat/);
  assert.doesNotMatch(text, signal === 'private' ? /words you let Mallow repeat/ : /did not let Mallow repeat/);
  assert.match(text, preparation === 'sketchbook' ? /sketchbook lies beside the map/ : /thread still marks the way/);
  assert.doesNotMatch(text, preparation === 'sketchbook' ? /thread still marks the way/ : /sketchbook lies beside the map/);
  assert.equal(compactRetreatClosingRoute(flags, 'close_signal', `close_${signal}`), 'close_reason_retreat');
  for (const incomplete of [ { retreat_epilogue_v1: undefined }, { retreat_search_seen: undefined }, { retreat_search_seen: search === 'stair' ? 'sound' : 'stair' }, { signal: undefined } ]) {
    const old = { ...flags, ...incomplete };
    assert.equal(compactRetreatPassage(old, 'close_signal'), null);
    assert.equal(compactRetreatClosingRoute(old, 'close_signal', `close_${signal}`), `close_${signal}`);
  }
  assert.doesNotMatch(compactRetreatPassage({ ...flags, mira_retreat_prepare_seen: undefined }, 'close_signal').text, /sketchbook lies beside|thread still marks/);
  assert.equal(compactRetreatClosingRoute({ ...flags, reason: 'prize' }, 'close_reason_retreat', 'ending_prize_check'), 'ending_prize_retreat');
}
assert.equal(story.close_private.nextBy.cases.retreat, 'retreat_search_return');
assert.equal(story.close_repeat.nextBy.cases.retreat, 'retreat_search_return');
assert.equal(story.retreat_search_return.next, 'retreat_search_choice');

// Both light-work routes reach the unsettling pencil beat before the search
// preparation, including the already-open knight page on the playful route.
for (const bond of ['care', 'play']) for (const preparation of ['sketchbook', 'thread']) {
  const { visited } = play({ companion: 'Mira', ending: 'retreat', bond, privateTone: 'light', topic: 'light', miraRetreatPrepare: preparation, vote_a: 'skip', vote_b: 'skip', signal: 'private', kit: false });
  assert.ok(visited.indexOf(`close_mira_retreat_${bond}`) < visited.indexOf(`mira_retreat_prepare_${preparation}`));
  assert.equal(visited.includes('close_mira_retreat_light_topic'), bond === 'care');
  assert.ok(!visited.includes('close_mira_chat'), 'Mira remains downstairs');
}
assert.equal(story.close_mira_retreat_light_topic.next, 'close_signal', 'an older checkpoint without the marker keeps its continuation');
assert.equal(story.close_mira_retreat_light_topic.nextBy.cases.yes, 'mira_retreat_prepare_choice');

// When the selected companion remains downstairs, the player chooses a
// useful preparation without inventing a rescue or a route to her.
for (const bond of ['care', 'play']) for (const topic of ['past', 'future']) for (const choice of ['sketchbook', 'thread']) {
  const { visited, flags } = play({ companion: 'Mira', ending: 'retreat', bond, topic, miraRetreatPrepare: choice, vote_a: 'skip', vote_b: 'skip', signal: 'private', kit: false });
  const other = choice === 'sketchbook' ? 'thread' : 'sketchbook';
  assert.ok(visited.indexOf(`close_mira_retreat_${topic}`) < visited.indexOf('mira_retreat_prepare_choice'));
  assert.ok(visited.indexOf('mira_retreat_prepare_choice') < visited.indexOf(`mira_retreat_prepare_${choice}`));
  assert.ok(visited.indexOf(`mira_retreat_prepare_${choice}`) < visited.indexOf('close_signal'));
  assert.ok(!visited.includes(`mira_retreat_prepare_${other}`));
  assert.equal(flags.mira_retreat_prepare, choice);
  assert.equal(flags.mira_retreat_prepare_seen, choice);
  assert.ok(!visited.some(id => id === 'close_mira_chat' || id === 'close_mira_input'));
}
for (const companion of ['Niko', 'Mira', 'Ash']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { visited } = play({ companion, ending, vote_a: 'skip', vote_b: 'skip', signal: 'private', kit: false });
  assert.equal(visited.includes('mira_retreat_prepare_choice'), companion === 'Mira' && ending === 'retreat');
}
for (const topic of ['past', 'future']) {
  const oldNode = story[`close_mira_retreat_${topic}`];
  assert.equal(oldNode.next, 'close_signal', 'a checkpoint without the new marker retains its original continuation');
  assert.equal(oldNode.nextBy.cases.yes, 'mira_retreat_prepare_choice');
}
assert.match(story.mira_retreat_prepare_sketchbook.text, /beside Ash’s map.*room to record the next sound/i);
assert.match(story.mira_retreat_prepare_thread.text, /chair and the stairway door handle/i);
assert.match(story.mira_retreat_prepare_sketchbook.text, /matching line appears.*pencil never leaves the map/i, 'the chosen sketchbook develops its own uncanny mark');
assert.match(story.mira_retreat_prepare_thread.text, /thread tightens.*Ash catches it/i, 'the chosen thread creates a different physical event');

// The kit's small engineer/medic payoff remembers Mira's earlier instruction.
// It must not alter routes for players who didn't claim it.
assert.match(story.repair_free.text, /wrench on the machine and the bandage on the person/i);
assert.match(story.kit_use.text, /Niko props the stairway door with the wrench/i);
assert.match(story.kit_use.text, /Ash takes his hand and wraps his knuckles/i);
assert.match(story.kit_use.text, /Machine, then person/i);

// The final souvenir callback follows the physical paper: a card spent on the
// catch is not still in the player's pocket, and held cards retain their state.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) for (const moment of ['keep', 'tear']) for (const cardAction of ['use', 'hold']) {
  const { visited } = play({ companion, bond, ending, moment, cardAction, vote_a:'skip', vote_b:'skip', signal:'private', kit:false });
  const spent = ending === 'mallow' && cardAction === 'use';
  const usedNode = `souvenir_used_${companion.toLowerCase()}_${bond}`;
  assert.equal(visited.includes('souvenir_check'), spent);
  assert.equal(visited.includes(usedNode), spent);
  assert.ok(!visited.includes('souvenir_used'), 'new play sees the tailored callback');
  assert.ok(!visited.includes('souvenir_pocket'), 'current endings go directly to the witnessed souvenir');
  assert.equal(visited.includes('souvenir_kept'), !spent && moment === 'keep');
  assert.equal(visited.includes('souvenir_torn'), !spent && moment === 'tear');
  const closure = companion === 'Mira' ? (ending === 'retreat' ? 'close_mira_retreat' : 'close_mira_check') : `close_${companion.toLowerCase()}`;
  assert.ok(visited.indexOf(spent ? usedNode : moment === 'keep' ? 'souvenir_kept' : 'souvenir_torn') < visited.indexOf(closure));
}
for (const companion of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) {
  const flags = { companion, bond, ending: 'mallow', card_action: 'use', moment: 'tear', midpoint_route: companion.toLowerCase(), souvenir_wedge_seen: 'yes' };
  assert.equal(souvenirWedgeRoute(flags), `${companion.toLowerCase()}_${bond}`);
  for (const [key, value] of [['souvenir_wedge_seen', undefined], ['ending', 'rescue'], ['moment', undefined], ['midpoint_route', 'invalid'], ['bond', undefined]]) {
    assert.equal(souvenirWedgeRoute({ ...flags, [key]: value }), 'use', `${key} cannot invent a witnessed callback`);
  }
  assert.equal(souvenirWedgeRoute({ ...flags, card_action: 'hold' }), '');
}
assert.equal(story.souvenir_check.nextBy.cases.use, 'souvenir_used', 'old saves with a used card keep their original passage');
assert.equal(story.souvenir_pocket.next, 'closing_choice', 'older checkpoints without a souvenir flag keep the original continuation');

// The repair kit may leave the stairway door open, and Mira's unfinished
// plush remains in the playroom on both the rescued and retreat routes.
for (const kit of [true, false]) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { visited } = play({ companion: 'Niko', kit, ending, vote_a: 'skip', vote_b: 'skip', signal: 'private' });
  assert.ok(visited.includes('close_niko_talk_choice'));
  assert.doesNotMatch(story.close_niko_talk_choice.text, /light under the stairway door/i);
  for (const bond of ['care', 'play']) {
    const mira = play({ companion: 'Mira', kit, ending, bond, vote_a: 'skip', vote_b: 'skip', signal: 'private' }).visited;
    if (ending === 'retreat') {
      assert.ok(mira.includes('close_mira_retreat'));
      assert.ok(!mira.includes('close_mira_enter'));
    } else {
      assert.ok(mira.indexOf('discovery_mira') < mira.indexOf('close_mira_enter'));
      assert.ok(mira.includes(`close_mira_bond_${bond}`));
      assert.match(story.close_mira_enter.text, /unfinished plush is still downstairs/i);
      assert.match(story[`close_mira_bond_${bond}`].text, /bring the plush back/i);
    }
  }
}

// The earlier counter scene still varies with the player's correction, but
// the crisis no longer repeats that screen between the companion and souvenir.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const disclosure of ['public', 'private']) for (const moment of ['keep', 'tear']) {
  const { visited, flags } = play({ companion, disclosure, moment, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
  const companionScene = `fourth_wall_count_${companion.toLowerCase()}_combined`;
  assert.equal(flags.disclosure, disclosure);
  assert.ok(visited.includes(`disclosure_${disclosure}_distortion`));
  assert.equal(visited[visited.indexOf(companionScene) + 1], `moment_return_${moment}_compact`);
  assert.ok(!visited.includes('fourth_correction_public_compact') && !visited.includes('fourth_correction_private_compact'));
}
assert.equal(story.fourth_wall_correction_check.next, 'moment_return', 'old saves without disclosure skip the specific recollection');
for (const disclosure of ['public', 'private']) {
  const old = story[`fourth_correction_${disclosure}_compact`];
  assert.deepEqual(old.remember, { source: 'correction_choice', flag: 'disclosure' });
  assert.equal(old.nextBy.cases.keep, 'moment_return_keep_compact');
  assert.equal(old.nextBy.cases.tear, 'moment_return_tear_compact');
}

// The counter responds differently to a spoken correction and a quiet count;
// both disturbances occur before the group reaches the impossible staircase.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const disclosure of ['public', 'private']) {
  const { visited } = play({ companion, disclosure, vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
  const selected = `disclosure_${disclosure}_distortion`;
  const unselected = `disclosure_${disclosure === 'public' ? 'private' : 'public'}_distortion`;
  assert.ok(visited.indexOf(`disclosure_${disclosure}_echo`) < visited.indexOf(selected));
  assert.ok(visited.indexOf(selected) < visited.indexOf('basement_door'));
  assert.ok(!visited.includes(unselected));
}
assert.match(story.correction_public.text, /third\.$/i);
assert.match(story.disclosure_public_distortion.text, /third.*three/i);
assert.match(story.disclosure_private_distortion.text, /two fingers.*twice.*once more/i);

// Printing the record takes time while Mira is behind the door. Give that
// choice its own emotional follow-through, whichever evidence or companion the
// player chose, without having Mira present after the retreat ending.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const evidence of ['receipt', 'tickets', 'voice']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { visited } = play({ companion, evidence, ending, vote_a:'skip', vote_b:'skip', signal:'private', kit:false });
  assert.equal(visited.includes('record_close_mira'), ending === 'record');
  assert.equal(visited.includes('record_close_ash'), ending === 'record');
  if (ending === 'record') {
    assert.ok(visited.indexOf(`close_evidence_${evidence}`) < visited.indexOf('record_close_mira'));
    assert.ok(visited.indexOf('record_close_mira') < visited.indexOf('record_close_ash'));
    assert.ok(visited.indexOf('record_close_ash') < visited.indexOf('kit_check'));
  }
}

// In the future-topic Niko route he tells Mira his hand is on the release
// before the player chooses to print. Her later uncertainty concerns the
// printer being used first, rather than claiming no one spoke to her.
for (const recordResponse of ['apology', 'ask']) {
  const { visited } = play({ companion: 'Niko', topic: 'future', ending: 'record', recordResponse,
    vote_a: 'warm', vote_b: 'direct', signal: 'repeat', kit: false });
  assert.ok(visited.indexOf('plan_niko_topic_future') < visited.indexOf('record_close_mira'));
  assert.match(story.plan_niko_topic_future.text, /Mira, my hand is on the release/);
  assert.match(story.record_close_mira.text, /could hear you.*why you started printing before opening the door/i);
  assert.match(story.record_close_ash.text, /why we were printing it first/i);
  assert.match(story.record_close_mira.choices.find(choice => choice.set?.record_response === 'apology').label, /what we were doing/i);
}

// The person who chose to print can respond to Mira; each response gets its
// own answer before the team moves on. Other endings must not visit the scene.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const recordResponse of ['apology', 'ask']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
  const { flags, visited } = play({ companion, recordResponse, ending, vote_a: 'skip', vote_b: 'skip', signal: 'private', kit: false });
  const reply = `record_close_${recordResponse}`;
  assert.equal(visited.includes(reply), ending === 'record');
  assert.equal(flags.record_response, ending === 'record' ? recordResponse : undefined);
  if (ending === 'record') {
    assert.ok(visited.indexOf('record_close_mira') < visited.indexOf(reply));
    assert.ok(visited.indexOf(reply) < visited.indexOf('record_close_ash'));
    assert.ok(!visited.includes(`record_close_${recordResponse === 'ask' ? 'apology' : 'ask'}`));
  }
}

// The two record-first responses result in distinct actions by Mira and Ash.
// Reconnected printers have the same printed record; legacy missing flags use
// the original continuation without inventing either new action.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const evidence of ['receipt', 'tickets', 'voice']) {
  for (const auditAction of ['cover', 'unplug']) for (const recordResponse of ['apology', 'ask']) {
    const { visited, flags } = play({ companion, evidence, ending: 'record', recordResponse, auditAction,
      vote_a: 'skip', vote_b: 'skip', signal: 'private', kit: false });
    const selected = recordResponse === 'apology' ? 'record_close_explain' : 'record_close_decide';
    const other = recordResponse === 'apology' ? 'record_close_decide' : 'record_close_explain';
    assert.ok(visited.indexOf('record_close_ash') < visited.indexOf(selected));
    assert.ok(visited.indexOf(selected) < visited.indexOf('kit_check'));
    assert.ok(!visited.includes(other));
    assert.equal(flags.record_followup, recordResponse === 'apology' ? 'explain' : 'decide');
    if (auditAction === 'unplug') assert.ok(visited.includes('record_reconnect'));
  }
}
assert.equal(story.record_close_ash.next, 'kit_check', 'old saves without a response use the old continuation');
assert.match(story.record_close_explain.text, /printed this first.*tell you/i);
assert.match(story.record_close_decide.text, /circles the correction.*marks where she wants/i);

// Players can respond to Mallow’s admission, and their choice is remembered
// when they later invite Mallow to help. Other endings still reach the same
// shared revelation without inventing that rescue; old checkpoints fall back.
for (const companion of ['Niko', 'Mira', 'Ash']) {
  for (const mallowResponse of ['voice', 'search']) {
    for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
      const { flags, visited } = play({ companion, vote_a: 'warm', vote_b: 'direct', signal: 'private', ending, kit: false, mallowResponse });
      assert.equal(flags.mallow_response, mallowResponse);
      assert.ok(visited.indexOf('policy_goal_compact') < visited.indexOf('policy_mallow_choice'));
      assert.ok(visited.includes(`policy_mallow_${mallowResponse}`));
      assert.equal(visited.includes(`end_mallow_compact_${mallowResponse}`), ending === 'mallow');
      const other = mallowResponse === 'voice' ? 'search' : 'voice';
      assert.ok(!visited.includes(`policy_mallow_${other}`));
      assert.ok(!visited.includes(`end_mallow_compact_${other}`));
      if (ending === 'mallow') assert.ok(visited.indexOf(`end_mallow_compact_${mallowResponse}`) < visited.indexOf('mallow_help_evidence'));
    }
  }
}
assert.equal(story[story.end_mallow.next].next, 'mallow_help_evidence', 'older checkpoints without either new flag retain the original continuation');

// The player can keep the first companion exchange focused on the shared
// task. It is still a private conversation and the same later privacy
// decision applies, but none of the unwitnessed personal disclosure is used.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const bond of ['care', 'play']) {
  for (const ending of ['rescue', 'record', 'mallow', 'retreat']) for (const signal of ['private', 'repeat']) {
    for (const nameKnight of companion === 'Mira' && bond === 'play' ? [false, true] : [false]) {
      const { flags, visited } = play({ companion, bond, ending, signal, nameKnight, privateTone: 'light', vote_a: 'direct', vote_b: 'warm', kit: false, epilogueTalk: true });
      const lower = companion.toLowerCase();
      assert.ok(visited.includes(`${lower}_tone_choice`), `${companion} can choose a tone`);
      assert.ok(visited.includes(`${lower}_light_input`) && visited.includes(`${lower}_light_chat`), 'light path remains a private conversation');
      assert.ok(!visited.includes(`${lower}_private`) && !flags.personal_disclosure_seen, 'the personal disclosure was not shown');
      assert.ok(!flags.personal_topic_seen && flags.topic === 'light');
      assert.ok(visited.includes('signal_choice'), 'Mallow still asks before repeating private words');
      assert.ok(!flags.shared_reaction_seen && !flags.private_reaction_seen, 'do not invent a disclosure reaction');
      if (companion === 'Mira') {
        assert.ok(!visited.includes('close_mira') && !visited.includes('close_mira_retreat'), 'the workshop is not assumed');
        const compact = bond === 'care' ? 'care' : nameKnight ? 'named' : 'play';
        assert.ok(visited.includes(ending === 'retreat' ? 'close_mira_retreat_light' : `close_mira_light_${compact}_compact`));
        if (ending !== 'retreat') {
          assert.equal(flags.mira_light_compact_seen, compact);
          assert.ok(!visited.includes('close_mira_light_topic'), 'fresh compact route omits the repeated line');
          assert.ok(!visited.includes('close_mira_light'), 'fresh compact route omits the repeated opening');
        }
      }
    }
  }
}
assert.equal(miraNameRoute({ social_v2: 'yes' }), 'tone');
assert.equal(miraNameRoute({ social_v2: 'yes', knight_named: 'yes' }), 'named');
assert.equal(miraNameRoute({}), '');
assert.equal(miraCloseRoute({ ending: 'retreat', private_tone: 'light' }), 'light_retreat');
assert.equal(miraCloseRoute({ ending: 'retreat' }), 'retreat');
for (const [bond, named, expected] of [['care', false, 'care'], ['play', false, 'play'], ['play', true, 'named']]) {
  const flags = { companion: 'Mira', private_tone: 'light', social_v2: 'yes', topic: 'light', ending: 'rescue', bond, ...(named ? { knight_named: 'yes' } : {}) };
  assert.equal(miraLightCloseRoute(flags), expected);
  assert.equal(story[`close_mira_light_${expected}_compact`].next, 'close_mira_talk_choice');
  if (named) assert.equal(miraLightCloseRoute(flags, false), 'legacy_light', 'a missing name cannot be displayed');
}
assert.equal(miraLightCloseRoute({ private_tone: 'light' }), 'legacy_light', 'older checkpoints keep their continuation');
assert.equal(miraLightCloseRoute({ private_tone: 'personal' }), '', 'the personal route is unchanged');
console.log('✓ Light conversations preserve privacy and reach all four outcomes without inventing disclosures');

// The task-focused questions are optional on checkpoints predating this
// feature. Each witnessed answer changes the no-tool rescue on that route.
for (const companion of ['Niko', 'Mira', 'Ash']) for (const detail of ['first', 'second']) {
  for (const bond of ['care', 'play']) for (const ending of ['rescue', 'record', 'mallow', 'retreat']) {
    const lower = companion.toLowerCase();
    const result = play({ companion, bond, ending, signal: 'private', vote_a: 'direct', vote_b: 'warm', kit: false,
      privateTone: 'light', lightDetail: detail, routeAction: 'proof' });
    assert.ok(result.visited.includes(`${lower}_light_${detail}`));
    assert.equal(result.flags.light_detail_seen, `${lower}_${detail}`);
    assert.equal(result.visited.includes(`rescue_${lower}_light_${detail}`), ending === 'rescue');
    assert.equal(result.flags.light_rescue_seen === `${lower}_${detail}`, ending === 'rescue');
    assert.ok(!result.flags.personal_disclosure_seen);
  }
}
assert.equal(rescueDetailRoute({ companion: 'Niko', private_tone: 'light', topic: 'light', light_detail: 'first', light_detail_seen: 'niko_first' }), '');
assert.equal(rescueDetailRoute({ companion: 'Niko', private_tone: 'light', topic: 'light', light_question_due: 'yes', light_detail: 'first', light_detail_seen: 'niko_second' }), '');
assert.equal(rescueDetailRoute({ companion: 'Niko', topic: 'past' }), 'past');
console.log('✓ Task-focused questions have witnessed and route-specific rescue consequences');

// New date planning moments are optional, character-specific, and never added
// to saves which passed companion selection before the feature existed.
for (const companion of ['Niko', 'Mira', 'Ash']) {
  const lower = companion.toLowerCase();
  const invitation = story[`${lower}_connection_date_late`];
  assert.equal(invitation.next, `${lower}_tone_choice`);
  assert.deepEqual(invitation.nextBy, { key: 'date_scene_due', cases: { yes: `${lower}_date_moment` } });
  for (const dateMoment of ['playful', 'curious']) {
    const { visited, flags } = play({ companion, connection: 'ask', dateMoment,
      vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
    assert.ok(visited.includes(`${lower}_date_moment`));
    assert.ok(visited.includes(`${lower}_date_${dateMoment}`));
    assert.equal(flags.date_moment_seen, `${lower}_${dateMoment}`);
    assert.ok(visited.indexOf(`${lower}_date_moment`) < visited.indexOf(`${lower}_date_${dateMoment}`));
    assert.ok(visited.indexOf(`${lower}_date_${dateMoment}`) < visited.indexOf(`${lower}_tone_choice`));
    assert.ok(visited.indexOf(`${lower}_date_${dateMoment}`) < visited.indexOf(`${lower}_date_activity`));
    assert.ok(visited.indexOf(`${lower}_date_activity`) < visited.indexOf(`${lower}_tone_choice`));
    assert.equal(story[`${lower}_date_${dateMoment}`].next, `${lower}_tone_choice`, 'legacy reply checkpoints retain their original continuation without the new flag');
    const second = play({ companion, connection: 'ask', dateMoment, dateActivity: 'second', vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
    assert.ok(second.visited.includes(`${lower}_date_activity`));
    assert.equal(second.flags.date_activity, { niko: 'question', mira: 'learn', ash: 'landmark' }[lower]);
    assert.equal(second.flags.date_activity_seen, `${lower}_${second.flags.date_activity}`);
    assert.equal(flags.date_activity_seen, `${lower}_${flags.date_activity}`);
    const teammate = play({ companion, connection: 'team', dateMoment,
      vote_a: 'direct', vote_b: 'warm', signal: 'private', ending: 'rescue', kit: false });
    assert.ok(!teammate.visited.includes(`${lower}_date_moment`));
    assert.equal(teammate.flags.date_moment_seen, undefined);
  }
}
console.log('✓ Date planning follows the accepted invitation and retains legacy and friend routes');

// The optional immediate rescue rejoins the common ending only after its
// post-rescue screen account, across companions, tools, preferences and actions.
for (const companion of ['Niko', 'Mira', 'Ash'])
for (const routeAction of ['fix', 'proof'])
for (const [cardPreference, noticePreference, style] of [['direct','direct','direct'], ['warm','warm','warm'], ['skip','skip','none'], ['direct','warm','neutral']])
for (const auditAction of ['cover', 'annotate', 'leave', 'unplug']) {
  const { flags, visited } = play({ companion, vote_a: 'direct', vote_b: 'direct', cardPreference, noticePreference, signal: 'private', ending: 'rescue', routeAction, doorEffort: 'open_now', auditAction });
  assert.equal(flags.early_rescue_now, 'open_now');
  assert.equal(flags.rescue_opened, 'yes');
  assert.equal(flags.early_together_comparisons_seen, 'yes');
  assert.equal(flags.early_together_citation_seen, 'yes');
  assert.equal(flags.early_together_action_seen, auditAction === 'annotate' ? 'note' : auditAction);
  assert.ok(visited.indexOf('rescue_complete') < visited.indexOf('early_together_comparisons'));
  assert.ok(visited.includes(`early_together_${style}`));
  assert.ok(visited.indexOf('early_together_false_ending') < visited.indexOf('rescue_reunion_choice'));
  assert.ok(!visited.includes('policy_goal_compact'));
}
