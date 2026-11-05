// An original visual-novel episode. Choices and consequences are authored;
// optional model dialogue is confined to the explicitly marked conversations.
export const title = 'Oki Doki';
export const episodeTitle = 'The Last Ticket';
export const saveKey = 'okie-dokie.arcade.v1';
export const contentNotice = 'A psychological mystery with unsettling imagery, claustrophobic spaces and threats to fictional characters.';
// The companion can respond only if their own private disclosure actually
// happened and the player elected to repeat their own line to the group.
export function sharedDisclosureReaction(flags = {}) {
  const name = flags?.companion;
  if (!['Niko', 'Mira', 'Ash'].includes(name) || flags?.signal !== 'repeat') return '';
  return flags.personal_disclosure_seen === `${name.toLowerCase()}_private` ? name : '';
}
// The private choice keeps the player's line out of the group conversation,
// but the companion has heard Mallow admit to overhearing the exchange.
export function privateDisclosureReaction(flags = {}) {
  const name = flags?.companion;
  if (!['Niko', 'Mira', 'Ash'].includes(name) || flags?.signal !== 'private' || flags?.private_reaction_due !== 'yes') return '';
  return flags.personal_disclosure_seen === `${name.toLowerCase()}_private` ? name : '';
}
// The callback requires a witnessed wedge and the same companion's actual
// souvenir scene. Old saves still take the original `use` passage.
export function souvenirWedgeRoute(flags = {}) {
  const name = flags?.companion;
  if (flags?.card_action !== 'use') return '';
  if (flags?.ending !== 'mallow' || flags?.souvenir_wedge_seen !== 'yes' ||
      !['keep', 'tear'].includes(flags?.moment) || !['Niko', 'Mira', 'Ash'].includes(name) ||
      flags?.midpoint_route !== name.toLowerCase() || !['care', 'play'].includes(flags?.bond)) return 'use';
  return `${name.toLowerCase()}_${flags.bond}`;
}
// The task-focused follow-up affects the later rescue only if its actual
// answer was visited on the chosen companion's light route.
export function rescueDetailRoute(flags = {}) {
  if (['past', 'future'].includes(flags?.topic)) return flags.topic;
  const name = String(flags?.companion || '').toLowerCase();
  const detail = flags?.light_detail;
  if (flags?.private_tone !== 'light' || flags?.topic !== 'light' || flags?.light_question_due !== 'yes' || flags?.light_detail_seen !== `${name}_${detail}` ||
      !['niko', 'mira', 'ash'].includes(name) || !['first', 'second'].includes(detail)) return '';
  return `light_${detail}`;
}
// A waymark only applies if its choice and actual response were witnessed.
export function retreatWaymark(flags = {}) {
  return flags?.ending === 'retreat' && flags?.basement_route === 'stairs' &&
    ['rail', 'sign'].includes(flags?.stair_waymark) && flags.stair_waymark_seen === flags.stair_waymark
    ? flags.stair_waymark : '';
}
export const retreatWaymarkText = {
  rail: 'Niko holds the stairway door. The notch you rubbed onto Ash’s map matches a metal corner on the first step here. You press beside it; the edge dips, exposing a loose bracket. Ash marks it on the map. “We can bring something to brace it,” Niko says. “Mira, we’re still here!” There is no answer yet.',
  sign: 'Niko holds the stairway door while you slide the stiff EXIT sign under the first step. Its edge lifts enough to expose a loose bracket. Ash marks it on the map. “We can bring something to brace it,” Niko says. “Mira, we’re still here!” There is no answer yet.'
};
// Current routes ask whether to keep the first private conversation light.
// Old checkpoints without the visit marker follow the earlier route.
// A date callback is shown only after the selected moment's response was seen.
export function dateMomentCallback(flags = {}, nodeId = '') {
  const name = flags.companion;
  const lower = typeof name === 'string' ? name.toLowerCase() : '';
  if (!['niko', 'mira', 'ash'].includes(lower) || nodeId !== `close_connection_${lower}_moment` ||
      flags.connection_choice !== 'ask' || flags.connection_seen !== name || flags.connection_late_seen !== name ||
      flags.date_scene_due !== 'yes' || !['playful', 'curious'].includes(flags.date_moment) ||
      flags.date_moment_seen !== `${lower}_${flags.date_moment}`) return '';
  const lines = {
    niko_playful: ' I haven’t forgotten the flavour you wrote on our reservation.',
    niko_curious: ' I still vote for chocolate, by the way.',
    mira_playful: ' I still love the star you made for my crown.',
    mira_curious: ' Our project definitely still needs a pocket.',
    ash_playful: ' I haven’t forgotten your heart-shaped detour.',
    ash_curious: ' Our destination is still a surprise.'
  };
  return lines[flags.date_moment_seen] || '';
}
export function connectionBeforeBond(flags = {}) {
  const name = flags?.match_label_seen;
  return flags?.social_v2 === 'yes' && flags?.late_connection_due === name ? '' : name || '';
}
export function connectionAfterBond(flags = {}) {
  const name = flags?.companion;
  if (flags?.social_v2 === 'yes' && ['Niko', 'Mira', 'Ash'].includes(name) && flags?.late_connection_due === name && flags?.connection_seen !== name) return name;
  return flags?.social_v2 === 'yes' ? 'tone' : '';
}
export function miraNameRoute(flags = {}) {
  if (flags?.knight_named === 'yes') return 'named';
  const afterBond = connectionAfterBond(flags);
  return afterBond === 'Mira' ? 'invite' : afterBond === 'tone' ? 'tone' : '';
}
export function miraCloseRoute(flags = {}) {
  if (flags?.ending === 'retreat') return flags?.private_tone === 'light' ? 'light_retreat' : 'retreat';
  return '';
}
// Saved passages past this entry keep their original continuation. The
// compact route is selected only when the lighter conversation and activity
// are consistent, and a named knight really has a name to display.
export function miraLightCloseRoute(flags = {}, hasKnightName = true) {
  if (flags?.private_tone !== 'light') return '';
  if (flags?.companion !== 'Mira' || flags?.topic !== 'light' || flags?.social_v2 !== 'yes' || flags?.ending === 'retreat') return 'legacy_light';
  if (flags?.bond === 'care') return 'care';
  if (flags?.bond !== 'play') return 'legacy_light';
  if (flags?.knight_named === 'yes') return hasKnightName ? 'named' : 'legacy_light';
  return 'play';
}
// New runs may acknowledge Mallow once Mira is out. Existing checkpoints
// already past the arcade return retain their original continuation.
export function mallowClosingRoute(flags = {}) {
  if (flags?.ending === 'mallow' || flags?.ending === 'retreat') return flags.ending;
  if (flags?.mallow_ack_due === 'yes' && ['rescue', 'record'].includes(flags?.ending)) return 'acknowledge';
  return '';
}
// The invitation is recalled only if the chosen companion actually answered
// it; older saves and the unresolved retreat keep their existing path.
export function connectionClosingRoute(flags = {}) {
  if (flags?.connection_choice === 'ask' && flags?.connection_seen === flags?.companion &&
      ['Niko', 'Mira', 'Ash'].includes(flags?.companion) &&
      ['rescue', 'record', 'mallow'].includes(flags?.ending) && ['repeat', 'private'].includes(flags?.signal)) {
    if (flags.connection_moment_due === flags.companion && flags.connection_late_seen === flags.companion) return `${flags.companion}_moment`;
    return flags.companion;
  }
  return flags?.signal || '';
}
// Only runs that saw the current privacy choice and completed a particular
// search use the shorter closing. Older and incomplete checkpoints keep the
// original individual passages and choices.
export function compactRetreatReady(flags = {}) {
  return flags.retreat_epilogue_v1 === 'yes' && flags.ending === 'retreat' &&
    flags.retreat_fort_closing_due === 'yes' && flags.compact_retreat_closing === 'yes' &&
    flags.retreat_search_early === 'yes' && ['stair', 'sound'].includes(flags.retreat_search) &&
    flags.retreat_search_seen === flags.retreat_search && ['private', 'repeat'].includes(flags.signal);
}
export function compactRetreatPassage(flags = {}, nodeId = '') {
  if (!compactRetreatReady(flags)) return null;
  if (ashRetreatLightReady(flags) && nodeId === 'close_ash') {
    return { location: 'hideout', text: `${story.close_ash.text} ${story[`close_ash_bond_${flags.bond}`].text}` };
  }
  if (ashRetreatLightReady(flags) && flags.ash_retreat_light_seen === 'yes' && nodeId === 'close_ash_retreat_input') {
    return { location: 'hideout', text: `${story.close_ash_retreat_talk_choice.text} ${story.close_ash_retreat_input.text}` };
  }
  if (nodeId === 'close_mira_retreat_play' && flags.companion === 'Mira' &&
      flags.bond === 'play' && flags.topic === 'light' && flags.mira_retreat_prepare_due === 'yes') {
    return { location: 'sewing', text: `${story.close_mira_retreat_play.text} ${story.close_mira_retreat_light_topic.text}` };
  }
  if (nodeId === 'ending_prize_retreat' && flags.reason === 'prize') {
    return { location: 'hideout', text: `You came for the ridiculous prize. ${story.ending_prize_retreat.text}` };
  }
  if (nodeId !== 'close_signal') return null;
  const privacy = flags.signal === 'private'
    ? 'You did not let Mallow repeat your private conversation to the crew. Somehow, it still knew the words.'
    : 'You can still hear the words you let Mallow repeat. You remember its upside-down eye watching from the shelf.';
  let text = `At the stairway, the others keep listening. You think of Mallow’s plush, still on the arcade shelf. ${privacy} Ash keeps the map open beside the stairway.`;
  if (flags.companion === 'Mira' && flags.mira_retreat_prepare_seen === flags.mira_retreat_prepare) {
    if (flags.mira_retreat_prepare_seen === 'sketchbook') text += ' Mira’s sketchbook lies beside the map, ready for the next sound they hear.';
    if (flags.mira_retreat_prepare_seen === 'thread') text += ' The bright thread still marks the way from the stairway door back to the fort.';
  }
  return { location: 'hideout', text };
}
// A light conversation has two familiar map callbacks and a response to the
// search. Present them in Ash's voice, with the private conversation choice
// on the final line. Checkpoints already past the marker keep their route.
export function ashRetreatLightReady(flags = {}) {
  return compactRetreatReady(flags) && flags.ash_retreat_light_due === 'yes' &&
    flags.companion === 'Ash' && flags.private_tone === 'light' && flags.topic === 'light' &&
    ['care', 'play'].includes(flags.bond);
}
// New retreat runs stay with the search in the fort while recalling Mallow.
// Checkpoints from before this beat retain their original arcade passages.
export function retreatFortPassage(flags = {}, nodeId = '') {
  if (flags.ending !== 'retreat' || flags.retreat_fort_closing_due !== 'yes') return null;
  const compact = compactRetreatPassage(flags, nodeId);
  if (compact) return compact;
  const passages = {
    close_signal: 'At the stairway, the others keep listening. You think of Mallow’s plush, still on the arcade shelf.',
    close_repeat: 'You can still hear the words you let Mallow repeat. You remember its upside-down eye watching from the shelf.',
    close_private: 'You did not let Mallow repeat your private conversation to the crew. Somehow, it still knew the words.',
    retreat_search_return: 'Ash keeps the map open beside the stairway.',
    retreat_search_choice: 'Niko has one hand on the door. The boards give a quiet knock beneath you. Where should you start looking?'
  };
  return Object.prototype.hasOwnProperty.call(passages, nodeId) ? { location: 'hideout', text: passages[nodeId] } : null;
}
// Current runs combine the screen's record of the check with the companion's
// response. Old and incomplete checkpoints retain the two original passages.
export function fourthWallRoute(flags = {}) {
  const action = flags?.regroup_action;
  const companion = flags?.companion;
  if (flags?.fourth_wall_compact_v3 === 'yes' && ['touch', 'count'].includes(action) &&
      ['Niko', 'Mira', 'Ash'].includes(companion)) return `${action}_${companion}`;
  return action || '';
}

const fourthWallScreens = {
  touch: 'The screen shows your fingerprint over the picture you touched to ask for another check. Beneath it: POSITIVE FEEDBACK. Another set of choices appears, naming the three places the team could have gone.',
  count: 'The screen shows your two ticket pieces side by side beneath THREE VERIFIED. Another set of choices appears, naming the three places the team could have gone.'
};
const fourthWallCompanions = {
  Niko: 'Niko says, “You came with me to the ticket machine. I remember that. It has the other choices written down too, as if they were waiting before you picked. Ash, try the handle while I pull.”',
  Mira: 'Mira calls, “You came upstairs with me. What is it showing you?” “All three places we could have gone,” Ash says. “It marked the one you took together.” Mira knocks. “I remember. Keep talking to me, all right?”',
  Ash: 'Ash says, “You came to the stairs with me. Those other choices are on the screen, but they aren’t the route we took. I’ll try the handle again.”'
};
function combinedFourthWall(action, companion) {
  return {
    location: 'playroom', speaker: 'Narrator', portraitSpeaker: companion,
    ...(companion === 'Niko' ? {} : { expression: 'concerned' }),
    remember: { source: 'crew_choice', flag: 'companion' },
    text: `${fourthWallScreens[action]} ${fourthWallCompanions[companion]}`,
    mood: 'fracture', next: 'fourth_wall_correction_check',
    nextBy: { key: 'moment', cases: { keep: 'moment_return_keep_compact', tear: 'moment_return_tear_compact' } }
  };
}
const combinedFourthWallCases = Object.fromEntries(['touch', 'count'].flatMap(action =>
  ['Niko', 'Mira', 'Ash'].map(name => [`${action}_${name}`, `fourth_wall_${action}_${name.toLowerCase()}_combined`])));

// Only recall the star at the door if this save actually visited that scene.
export function keepsakeClosingRoute(flags = {}) {
  if (flags.keepsake === 'star' && flags.star_moved_seen === 'yes') return 'star_returned';
  return flags.keepsake || '';
}

// Once the player has seen the chosen tool or souvenir, move straight from
// the decision to its concrete use. Older and incomplete saves keep the
// original transition passages, which remain available as checkpoint nodes.
export function compactRescueRoute(flags = {}, nodeId = '', next = '') {
  // Only a new run which actually heard Mallow's earlier response may carry
  // that response into the shorter rescue. Older checkpoints keep their path.
  if (nodeId === 'plan_choice' && next === 'end_mallow' && flags.ending === 'mallow' &&
      flags.mallow_compact_due === 'yes' && ['voice', 'search'].includes(flags.mallow_response) &&
      flags.mallow_response_seen === flags.mallow_response) {
    return `end_mallow_compact_${flags.mallow_response}`;
  }
  if (nodeId === 'end_rescue' && next === 'rescue_fix_companion' &&
      flags.ending === 'rescue' && flags.route_action === 'fix' &&
      ['Niko', 'Mira', 'Ash'].includes(flags.companion) &&
      flags.rescue_tool_shortcut_due === flags.companion) {
    return `rescue_${flags.companion.toLowerCase()}_fix`;
  }
  if (nodeId === 'mallow_catch_choice' && next === 'mallow_catch_use' &&
      flags.ending === 'mallow' && flags.card_action === 'use' &&
      flags.souvenir_shortcut_due === 'yes' && flags.midpoint_available === 'yes' &&
      ['Niko', 'Mira', 'Ash'].includes(flags.companion) &&
      flags.midpoint_route === flags.companion.toLowerCase() &&
      ['keep', 'tear'].includes(flags.moment)) {
    return `mallow_catch_use_${flags.moment}`;
  }
  return next;
}
// The earlier tool can be offered only if this run actually chose and saw
// its matching search passage. Legacy and incomplete saves keep their choices.
export function mallowToolAvailable(flags = {}, name = '') {
  if (flags.ending !== 'mallow' || flags.route_action !== 'fix' ||
      flags.companion !== name || flags.rescue_tool_shortcut_due !== name ||
      !['Niko', 'Mira', 'Ash'].includes(name) || !['keep', 'tear'].includes(flags.moment)) return false;
  const lower = name.toLowerCase();
  const choices = story[`${lower}_work_choice`]?.choices || [];
  return choices.filter(choice => choice.set?.route_action === 'fix' && choice.next === `${lower}_work_fix`).length === 1 &&
    story[`${lower}_work_fix`]?.setOnVisit?.rescue_tool_shortcut_due === name;
}
// New resolved endings can move directly from the chosen team keepsake to
// the picture's actual condition; old checkpoints keep their original path.
export function compactPocketRoute(flags = {}, nodeId = '', next = '') {
  if (flags?.compact_pocket_due !== 'yes' || !['close_star', 'close_star_returned', 'close_bell', 'close_ribbon'].includes(nodeId)) return next;
  const directRescueOrRecord = ['rescue', 'record'].includes(flags.ending) && next === 'souvenir_pocket';
  const heldForMallow = flags.ending === 'mallow' &&
    (flags.card_action === 'hold' || (flags.card_action === 'tool' && mallowToolAvailable(flags, flags.companion) &&
      flags.mallow_tool_seen === flags.companion)) && next === 'souvenir_check';
  if (!directRescueOrRecord && !heldForMallow) return next;
  if (flags.moment === 'keep') return 'souvenir_kept';
  if (flags.moment === 'tear') return 'souvenir_torn';
  return next;
}
// Once this run actually searched for Mira, move between the substantive
// closing callbacks. Marker-free saves already past the search retain the
// original transitions; resuming the search itself records the marker.
export function compactRetreatClosingRoute(flags = {}, nodeId = '', next = '') {
  if (flags.compact_retreat_closing !== 'yes' || flags.ending !== 'retreat' ||
      flags.retreat_search_early !== 'yes' ||
      !['stair', 'sound'].includes(flags.retreat_search) ||
      flags.retreat_search_seen !== flags.retreat_search) return next;
  if (compactRetreatReady(flags)) {
    if (ashRetreatLightReady(flags) && nodeId === 'close_ash' &&
        next === `close_ash_bond_${flags.bond}`) return 'close_ash_retreat_light_compact';
    if (nodeId === 'close_mira_retreat_play' && flags.companion === 'Mira' &&
        flags.bond === 'play' && flags.topic === 'light' && flags.mira_retreat_prepare_due === 'yes' &&
        next === 'close_mira_retreat_light_topic') return 'mira_retreat_prepare_choice';
    if (nodeId === 'close_signal' && next === `close_${flags.signal}`) return 'close_reason_retreat';
    if (nodeId === 'close_reason_retreat' && flags.reason === 'prize' && next === 'ending_prize_check') return 'ending_prize_retreat';
  }
  if (nodeId === `retreat_early_search_${flags.retreat_search}` && next === 'evidence_close') {
    return story.evidence_close?.nextBy?.cases?.[flags.evidence] || next;
  }
  if (((nodeId === 'kit_check' && !['free', 'paid'].includes(flags.repairKit)) ||
       (nodeId === 'kit_use_retreat' && flags.kit_use_seen === 'yes' && ['free', 'paid'].includes(flags.repairKit))) &&
      next === 'keepsake_check') {
    return story.keepsake_check?.nextBy?.cases?.[keepsakeClosingRoute(flags)] || next;
  }
  if (['close_star', 'close_star_returned', 'close_bell', 'close_ribbon'].includes(nodeId) &&
      nodeId === story.keepsake_check?.nextBy?.cases?.[keepsakeClosingRoute(flags)] &&
      next === 'souvenir_pocket' && ['keep', 'tear'].includes(flags.moment)) {
    return story.souvenir_pocket?.nextBy?.cases?.[flags.moment] || next;
  }
  if (flags.companion === 'Mira' && next === 'close_mira_check' &&
      ((nodeId === 'souvenir_kept' && flags.moment === 'keep') ||
       (nodeId === 'souvenir_torn' && flags.moment === 'tear'))) {
    return story.close_mira_check?.nextBy?.cases?.[miraCloseRoute(flags)] || next;
  }
  return next;
}
// Current runs can act on the printed exchange as soon as it appears. A
// checkpoint already past the comparisons keeps its original continuation.
export function publicReplyRoute(flags = {}, hasReply = true) {
  if (flags?.public_reply_available !== 'yes' || !hasReply) return '';
  if (flags?.quick_paper_due === 'yes' && flags?.comparisons_revealed === 'yes' &&
      flags?.group_reply_seen === 'yes' && flags?.mira_report_seen === 'yes' &&
      flags?.reveal_pace_v2 === 'yes') return 'quick';
  return 'yes';
}
// New runs can handle the printed exchange before reading the rest of the
// record. Incomplete or older checkpoints retain the original route.
export function receiptBriefRoute(flags = {}, hasExchange = true) {
  if (flags?.early_paper_due === 'yes' && flags?.reveal_pace_v2 === 'yes' &&
      flags?.group_reply_seen === 'yes' && flags?.public_reply_available === 'yes' && hasExchange) return 'early';
  return flags?.reveal_pace_v2 === 'yes' ? 'yes' : '';
}
// Only a new run which actually showed and handled the group exchange may
// investigate the audit early. Checkpoints already in the reveal stay put.
export function earlyAuditReady(flags = {}) {
  return flags.early_audit_due === 'yes' && flags.reveal_pace_v2 === 'yes' &&
    flags.early_paper_due === 'yes' && flags.early_paper_shown === 'yes' &&
    flags.early_paper_done === 'yes' && flags.group_reply_seen === 'yes' &&
    flags.public_reply_shown === 'yes' && flags.comparisons_revealed === 'yes' &&
    ['share', 'keep', 'quote', 'mallow_quote'].includes(flags.paper_handoff) &&
    ['tell', 'listen'].includes(flags.reveal_focus) && ['private', 'repeat'].includes(flags.signal);
}
export function earlyAuditComplete(flags = {}) {
  return earlyAuditReady(flags) && flags.early_audit_present === 'yes' &&
    flags.audit_seen === 'yes' && flags.mira_report_seen === 'yes' &&
    ['cover', 'annotate', 'unplug', 'leave'].includes(flags.audit_action) &&
    flags.early_audit_action_seen === flags.audit_action &&
    (flags.audit_action !== 'annotate' || (flags.annotation_written === 'yes' && flags.audit_seal_seen === 'yes'));
}
// A complete earlier comparison record is required for this route's reveal.
// Older saves or incomplete flags retain the original two door choices.
export function earlyImmediateAvailable(flags = {}) {
  return flags.reveal_pace_v2 === 'yes' && flags.card_comparison_seen === 'yes' && flags.notice_comparison_seen === 'yes' &&
    ['direct', 'warm', 'skip'].includes(flags.card_preference) && ['direct', 'warm', 'skip'].includes(flags.notice_preference) &&
    ['Niko', 'Mira', 'Ash'].includes(flags.companion) && ['fix', 'proof'].includes(flags.route_action);
}
// Only recall an action after its result was actually shown. A save at the
// map input, before submitting the note, must not imply it was written.
export function earlyTogetherAction(flags = {}) {
  const action = flags.early_together_action;
  return earlyImmediateAvailable(flags) && flags.early_rescue_now === 'open_now' && flags.ending === 'rescue' &&
    flags.rescue_opened === 'yes' && flags.early_together_comparisons_seen === 'yes' && flags.early_together_citation_seen === 'yes' &&
    ['cover', 'note', 'leave', 'unplug'].includes(action) && flags.early_together_action_seen === action &&
    (action !== 'note' || flags.annotation_written === 'yes') ? action : '';
}
// New runs can act on the audit as soon as Mira answers. Checkpoints from
// before this beat retain the original sequence of passages.
export function compactAuditRoute(flags = {}) {
  if (flags.policy_goal_compact_seen === 'yes' && earlyAuditComplete(flags)) {
    if (flags.early_rescue_offer_due === 'yes' && ['Niko', 'Mira', 'Ash'].includes(flags.companion) &&
        ['fix', 'proof'].includes(flags.route_action)) return 'early_offer';
    return 'early';
  }
  if (flags.audit_focus_due !== 'yes' || flags.policy_goal_compact_seen !== 'yes') return '';
  return ['tell', 'listen'].includes(flags.reveal_focus) ? flags.reveal_focus : '';
}
// Only the explicitly selected, witnessed early rescue skips the later plan
// choice. Companion and relationship setup passages still play in full.
export function earlyRescueRoute(flags = {}, nodeId = '', next = '') {
  if (flags.early_rescue_offer_due !== 'yes' || flags.early_rescue_choice !== 'open' ||
      flags.early_rescue_committed !== 'yes' || flags.early_rescue_setup_seen !== 'yes' ||
      flags.policy_goal_compact_seen !== 'yes' || flags.ending !== 'rescue' ||
      !earlyAuditComplete(flags)) return next;
  const name = String(flags.companion || '').toLowerCase();
  if (!['niko', 'mira', 'ash'].includes(name) || !['fix', 'proof'].includes(flags.route_action)) return next;
  // New runs carry Mira's tap in the release setup and move directly to the
  // item the group already has. A returned folded receipt still gets its own
  // physical payoff. Checkpoints from before this change keep both passages.
  if (flags.early_rescue_streamlined === 'yes' && next === 'route_plan' &&
      ((nodeId === 'early_rescue_setup' && flags.folded_paper !== 'yes') ||
       (nodeId === 'plan_paper' && flags.folded_paper === 'yes'))) {
    return `plan_${name}_${flags.route_action}`;
  }
  const allowed = [`plan_${name}_${flags.route_action}`, `plan_${name}_topic_${flags.topic}`];
  return next === 'plan_choice' && allowed.includes(nodeId) ? 'rescue_coordination_choice' : next;
}
// On streamlined runs, Mira's tap happens during the release setup. Older
// checkpoints retain the previous passage and hear the tap in route_plan.
export function earlyRescueSetupPassage(flags = {}, nodeId = '') {
  if (nodeId !== 'early_rescue_setup' || flags.early_rescue_streamlined !== 'yes' ||
      flags.early_rescue_choice !== 'open' || flags.early_rescue_committed !== 'yes' ||
      flags.early_rescue_setup_seen !== 'yes' || flags.policy_goal_compact_seen !== 'yes' ||
      flags.ending !== 'rescue' || !earlyAuditComplete(flags)) return null;
  return { text: `Mira taps once, close to the catch. ${story.early_rescue_setup.text}` };
}
// Only a completed, witnessed welcome-card comparison can shape the first
// greeting. Older checkpoints and a delegated choice keep the original line.
export function hintGreetingRoute(flags = {}) {
  if (flags.hint_steering_due !== 'yes' || flags.card_comparison_seen !== 'yes') return '';
  return ['direct', 'warm'].includes(flags.card_preference) ? flags.card_preference : '';
}
// When Mira answers the player's focus choice, the receipt arrives in the
// same passage. Only show a souvenir image if this run recorded one, and
// only recall a Mallow answer if its earlier choice exists.
export function receiptAfterFocus(flags = {}) {
  if (flags.signal === 'private' && ['keep', 'tear'].includes(flags.moment)) return 'private_picture';
  if (flags.signal === 'repeat' && ['direct', 'warm', 'skip'].includes(flags.vote_a)) return `repeat_${flags.vote_a}`;
  return '';
}

// On the current route, put Mira's next decision beside the remembered
// opening choice. Earlier or incomplete checkpoints retain the old gate.
export function earlyReasonRoute(flags = {}) {
  const reason = flags?.reason;
  if (!['team', 'prize', 'company'].includes(reason)) return '';
  if (flags.reveal_pace_v2 === 'yes' && flags.early_door_done === 'yes' &&
      ['private', 'repeat'].includes(flags.signal) && !flags.reveal_focus) return `${reason}_focus`;
  return reason;
}

export const privateDisclosureLines = {
  Niko: 'Thanks for keeping it between us. I didn’t ask the machine to listen.',
  Mira: 'Thank you. I wanted you to hear me; I didn’t invite it into my room.',
  Ash: 'Thank you for keeping our conversation here. I didn’t ask it to listen.'
};
export const characters = {
  Narrator: { color: '#c2c0d9', voice: 'observant, intimate and restrained' },
  You: { color: '#e7dfd1', voice: 'the player' },
  Service: { color: '#f6c8a5', voice: 'bright, polite and bureaucratically certain; treats its own records as proof' },
  Niko: { color: '#f2a492', voice: 'cheerful and resourceful, joking when worried; takes responsibility for the arcade and the group', portrait: './assets/niko.png', expressions: { concerned: './assets/niko-concerned.png' } },
  Mira: { color: '#e6a4d8', voice: 'playful, inventive and direct; a plush maker who cares fiercely about her friends', portrait: './assets/mira.png', expressions: { concerned: './assets/mira-concerned.png' } },
  Ash: { color: '#9bc8be', voice: 'wry, attentive and practical; careful with people as well as plans', portrait: './assets/ash.png', expressions: { concerned: './assets/ash-concerned.png' } },
  Mallow: { color: '#e8d6a0', voice: 'a small arcade moth with an uncertain, thoughtful voice; answers briefly and never claims to know the player outside the story', portrait: './assets/mallow.png', expressions: { concerned: './assets/mallow-concerned.png' } }
};

export const story = {
  opening: { location: 'hideout', speaker: 'Narrator', text: 'Rain turns the windows of Moonrabbit Arcade into a blur of pink and gold. Upstairs, someone has built a fortress out of cushions, fairy lights and a surprisingly large number of snack boxes. A welcome display flashes THANK YOU FOR AGREEING before you have found a place to sit.', mood: 'warm', next: 'opening_service' },
  opening_service: { location: 'hideout', speaker: 'Service', text: 'Welcome! Your agreement is in good hands. Our verification team will take it from here. Your compatibility is excellent. Please enjoy your evening.', next: 'intro_niko' },
  intro_niko: { location: 'hideout', speaker: 'Niko', text: 'Welcome to headquarters. I’m Niko, caretaker, ticket-counter and, according to this badge, Supreme Commander of the Kettle. The badge was not my idea. If the welcome display offers you one, mine are better.', next: 'intro_mira' },
  intro_mira: { location: 'hideout', speaker: 'Mira', text: 'It was mine. I’m Mira. I made the badges, the plush prizes and most of the tactical mistakes. The display calls us a compatibility match. I call us friends. You get a badge too, once you’ve survived the snacks.', next: 'intro_ash' },
  intro_ash: { location: 'hideout', speaker: 'Ash', text: 'I’m Ash. I drew the escape map after Niko decided the snack bunker needed a roof. The plan assumes the roof stays up, but we’re prepared for disappointment.', next: 'fort' },
  fort: { location: 'hideout', speaker: 'Narrator', text: 'Pink fabric drapes between the beams, with fairy lights tucked along the edge. Inside the fort are a hand-drawn map, mismatched mugs and an empty place made just large enough for you.', setOnVisit: { repair_offer_due: 'yes' }, next: 'game_intro' },
  repair_offer_intro: { location: 'arcade', speaker: 'Niko', text: 'Before the mission: my official wrench, Mira’s emergency bandage and one extremely unofficial badge. The Wrench & Bandage Field Repair kit is entirely optional.', setOnVisit: { repair_offer_due: 'done' }, next: 'repair_offer' },
  repair_offer: { location: 'arcade', speaker: 'Narrator', text: 'Mira holds out the small kit while Niko gives an unnecessarily formal salute.', setOnVisit: { repair_offer_due: 'done' }, offer: { type: 'repair-kit', grant: { next: 'repair_free', set: { repairKit: 'free' } }, paidGrant: { next: 'repair_free', set: { repairKit: 'paid' } }, skip: 'repair_skip' }, next: 'repair_skip' },
  repair_free: { location: 'arcade', speaker: 'Mira', text: 'One wrench, one bandage. Use the wrench on the machine and the bandage on the person. Niko has mixed those up before.', setOnVisit: { repair_offer_due: 'done' }, next: 'game_intro', nextBy: { key: 'reason', cases: { team: 'crew_plan', prize: 'crew_plan', company: 'crew_plan' } } },
  repair_skip: { location: 'arcade', speaker: 'Niko', text: 'No kit? Fair enough. The team’s excellent improvisation record remains largely undocumented.', setOnVisit: { repair_offer_due: 'done' }, next: 'game_intro', nextBy: { key: 'reason', cases: { team: 'crew_plan', prize: 'crew_plan', company: 'crew_plan' } } },
  game_intro: { location: 'hideout', speaker: 'Niko', text: 'Tonight is the Last Ticket. Three pieces are hidden around the arcade. Find them, put them together and you win the prize above the counter. We made the rules ourselves, which is why they’re excellent.', next: 'game_mira' },
  game_mira: { location: 'hideout', speaker: 'Mira', text: 'The prize is a giant moth I made. It’s called Mallow. It looks permanently surprised because Niko sewed one eye on upside down.', next: 'game_mallow' },
  game_mallow: { location: 'hideout', speaker: 'Narrator', text: 'The cream-coloured plush moth peers down from the prize shelf. Its little lavender scarf is caught under a hand-painted sign: PLEASE TAKE CARE OF YOUR TEAM.', next: 'reason_choice' },
  reason_choice: { location: 'hideout', speaker: 'Niko', text: 'Before the hunt starts, what brought you out in this weather?', choices: [
    { label: 'I wanted to be part of the team.', next: 'reason_team', set: { reason: 'team' } },
    { label: 'I came for the arcade and the ridiculous prize.', next: 'reason_prize', set: { reason: 'prize' } },
    { label: 'I didn’t want anyone to spend the night alone.', next: 'reason_company', set: { reason: 'company' } }
  ] },
  reason_team: { location: 'hideout', speaker: 'Niko', text: 'Excellent. You’re in charge of morale. The rest of us are already qualified at making problems.', next: 'signal_intro' },
  reason_prize: { location: 'hideout', speaker: 'Mira', text: 'A person of taste. Mallow appreciates your commitment, though Mallow’s expression remains unchanged.', next: 'signal_intro' },
  reason_company: { location: 'hideout', speaker: 'Ash', text: 'That’s why I came too. Don’t tell Niko; they’ll put it on another badge.', next: 'signal_intro' },
  signal_intro: { location: 'hideout', speaker: 'Mira', text: 'A real team needs a signal. We have a star sticker, a bell, and Ash’s extremely serious safety ribbon. Choose quickly, before the biscuits elect their own leader.', setOnVisit: { fort_scene_due: 'yes' }, next: 'keepsake_choice' },
  keepsake_choice: { location: 'hideout', speaker: 'Narrator', text: 'As Mira offers you the signals, a corner of the blanket roof slips. Ash catches it with an elbow; Niko is tangled in the fairy lights. A biscuit tin tilts and the map begins to curl. There is just time to pick a signal and lend a hand.', setOnVisit: { fort_scene_due: 'yes' }, choices: [
    { label: 'Hold the map flat and mark it with the star.', next: 'keepsake_star', set: { keepsake: 'star' } },
    { label: 'Ring the bell to warn Niko about the tin.', next: 'keepsake_bell', set: { keepsake: 'bell' } },
    { label: 'Tie the slipping roof with the ribbon.', next: 'keepsake_ribbon', set: { keepsake: 'ribbon' } }
  ] },
  keepsake_star: { location: 'hideout', speaker: 'Niko', text: 'A star marks the way home. Also, it covers the hole I made in the map. Good catch—I’ve got the biscuits!', next: 'card_intro', nextBy: { key: 'fort_scene_due', cases: { yes: 'fort_star' } } },
  keepsake_bell: { location: 'hideout', speaker: 'Mira', text: 'One ring means we found something. Two means someone has eaten my emergency biscuits. Niko, the tin!', next: 'card_intro', nextBy: { key: 'fort_scene_due', cases: { yes: 'fort_bell' } } },
  keepsake_ribbon: { location: 'hideout', speaker: 'Ash', text: 'There. A clear route back, with a decorative flourish. I hate that it’s growing on me. Niko, catch the tin!', next: 'card_intro', nextBy: { key: 'fort_scene_due', cases: { yes: 'fort_ribbon' } } },
  fort_star: { location: 'hideout', speaker: 'Mira', text: 'You saved the map! Niko saved the biscuits, and three landed on him. A successful evacuation.', next: 'fort_settled' },
  fort_bell: { location: 'hideout', speaker: 'Niko', text: 'I heard the bell just in time. Biscuits rescued! I’m counting that as one emergency and one excellent ring.', next: 'fort_settled' },
  fort_ribbon: { location: 'hideout', speaker: 'Niko', text: 'You tied the roof in place! Biscuits rescued too. Ash, please put this heroic use of your safety ribbon on the map.', next: 'fort_settled' },
  fort_settled: { location: 'hideout', speaker: 'Narrator', text: 'Together you tuck the blanket back over the chairs. Ash steadies the kettle, Mira retrieves the biscuits from Niko’s lap, and Niko bows to the newly secured roof. Mira places a small handmade badge in your hand. Its centre is blank. For a moment, nobody wants to be the first to leave the fort.', setOnVisit: { handmade_badge_seen: 'yes' }, next: 'card_intro' },
  card_intro: { location: 'hideout', speaker: 'Niko', text: 'Could you help me get a welcome card on the fort? The tape keeps sticking to me instead. Mira, please don’t photograph this.', next: 'card_choice' },
  card_choice: { location: 'hideout', speaker: 'Narrator', text: 'Niko offers you a strip of tape and two handwritten cards. The blanket door is just within reach.', setOnVisit: { card_comparison_seen: 'yes', hint_steering_due: 'yes' }, choices: [
    { label: 'Hang “The hunt begins. Find three ticket pieces.” on the door.', next: 'card_direct', set: { card_preference: 'direct' } },
    { label: 'Hang “Welcome, team! Let’s find three ticket pieces together.” on the door.', next: 'card_warm', set: { card_preference: 'warm' } },
    { label: 'Hold the blanket steady and let Niko choose.', next: 'card_skip', set: { card_preference: 'skip' } }
  ] },
  card_direct: { location: 'hideout', speaker: 'Niko', text: 'Straight to the mission. And you managed to stick it to the blanket instead of yourself. Show-off.', next: 'hint_intro' },
  card_warm: { location: 'hideout', speaker: 'Niko', text: 'A proper team welcome. It’s slightly crooked. I’m calling that a design choice.', next: 'hint_intro' },
  card_skip: { location: 'hideout', speaker: 'Niko', text: 'Both it is. Hold the door there—aha! Nobody can accuse me of under-decorating.', next: 'hint_intro' },
  hint_intro: { location: 'arcade', speaker: 'Narrator', text: 'The old ticket machine wakes with a soft mechanical chirp. A drawing of Mallow appears on its screen and blinks. Above it, the plush moth’s loose eye seems to shift—but its scarf is caught on the shelf.', mood: 'uneasy', next: 'hint_false_line' },
  hint_false_line: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'A line appears on the machine: YOU: “Yes, that’s exactly what I wanted.” You haven’t said it. Before you can point it out, the letters pull themselves into the shape of a moth.', mood: 'uneasy', next: 'hint_false_line_niko' },
  hint_false_line_niko: { location: 'arcade', speaker: 'Niko', text: 'I saw words there. Tell me if they come back, all right?', next: 'hint_mallow', nextBy: { key: 'hint_greeting_route', cases: { direct: 'hint_mallow_direct', warm: 'hint_mallow_warm' } } },
  hint_mallow: { location: 'arcade', speaker: 'Mallow', text: 'Welcome, team. Your evening has been prepared, and your enjoyment is confirmed. Would you like a hint?', next: 'hint_choice' },
  hint_mallow_direct: { location: 'arcade', speaker: 'Mallow', text: 'Welcome. Your evening is prepared; your enjoyment is confirmed. Would you like a hint?', setOnVisit: { hint_greeting_seen: 'direct' }, next: 'hint_choice' },
  hint_mallow_warm: { location: 'arcade', speaker: 'Mallow', text: 'I’m glad you’re here with your team. Your enjoyment is confirmed. Would you like a hint?', setOnVisit: { hint_greeting_seen: 'warm' }, next: 'hint_choice' },
  hint_choice: { location: 'arcade', speaker: 'Narrator', text: 'The moth waits, its tiny painted hands folded.', choices: [
    { label: 'Ask exactly where the first piece is.', next: 'hint_direct', set: { vote_a: 'direct' } },
    { label: 'Ask Mallow to help the team find it together.', next: 'hint_warm', set: { vote_a: 'warm' } },
    { label: 'Thank Mallow and look without a hint.', next: 'hint_skip', set: { vote_a: 'skip' } }
  ] },
  hint_direct: { location: 'arcade', speaker: 'Mallow', text: 'One piece is near the ticket machine. I cannot see the others from here.', next: 'crew_plan', nextBy: { key: 'repair_offer_due', cases: { yes: 'mallow_team_wave' } } },
  hint_warm: { location: 'arcade', speaker: 'Mallow', text: 'I can stay with you. One piece is near the ticket machine; the others will need your friends.', next: 'crew_plan', nextBy: { key: 'repair_offer_due', cases: { yes: 'mallow_team_wave' } } },
  hint_skip: { location: 'arcade', speaker: 'Mallow', text: 'All right. I’ll keep the counter light on for you.', next: 'crew_plan', nextBy: { key: 'repair_offer_due', cases: { yes: 'mallow_team_wave' } } },
  mallow_team_wave: { location: 'arcade', speaker: 'Narrator', text: 'Mallow raises one painted hand, then the other. “I practised a team wave. They don’t always arrive together.” Mira lifts her hands one at a time. “Perfect. That’s how the team waves now.”', next: 'repair_offer_intro' },
  notice_intro: { location: 'arcade', speaker: 'Ash', text: 'Here we are at the counter. The map tore right through the meeting spot—could you mark it again? Mira says my last note looked like a parking notice.', next: 'notice_choice' },
  notice_choice: { location: 'arcade', speaker: 'Narrator', text: 'Ash pins down the curling paper. There’s just enough room to mark the counter and write a note.', setOnVisit: { notice_comparison_seen: 'yes' }, choices: [
    { label: 'Circle the counter: “Please meet back at the prize counter.”', next: 'notice_direct', set: { notice_preference: 'direct' } },
    { label: 'Draw the team together: “Come back to the prize counter; we’ll meet you there.”', next: 'notice_warm', set: { notice_preference: 'warm' } },
    { label: 'Hold the map flat and let Ash write the note.', next: 'notice_skip', set: { notice_preference: 'skip' } }
  ] },
  notice_direct: { location: 'arcade', speaker: 'Ash', text: 'Clear and to the point. I’ll try not to issue parking fines.', next: 'crew_plan', nextBy: { key: 'companion', cases: { Niko: 'regroup', Mira: 'regroup', Ash: 'regroup' } } },
  notice_warm: { location: 'arcade', speaker: 'Ash', text: 'All right. A little friendlier, and still a map. Is that supposed to be me? I love my tiny hat.', next: 'crew_plan', nextBy: { key: 'companion', cases: { Niko: 'regroup', Mira: 'regroup', Ash: 'regroup' } } },
  notice_skip: { location: 'arcade', speaker: 'Ash', text: 'There. A fresh version of my original, parking notice and all. Thanks for holding it.', next: 'crew_plan', nextBy: { key: 'companion', cases: { Niko: 'regroup', Mira: 'regroup', Ash: 'regroup' } } },
  crew_plan: { location: 'arcade', speaker: 'Ash', text: 'Niko’s checking the ticket machine. Mira wants to look in the upstairs sewing room. I’ll check the service stairs. Pick a partner; we’ll meet back here.', next: 'crew_choice' },
  crew_choice: { location: 'arcade', speaker: 'Narrator', text: 'They’re all pretending not to mind who you pick.', choices: [
    { label: 'Help Niko at the ticket machine.', next: 'niko_route', set: { companion: 'Niko', social_v2: 'yes', date_scene_due: 'yes' } },
    { label: 'Go upstairs with Mira.', next: 'mira_route', set: { companion: 'Mira', social_v2: 'yes', date_scene_due: 'yes' } },
    { label: 'Check the stairs with Ash.', next: 'ash_route', set: { companion: 'Ash', social_v2: 'yes', date_scene_due: 'yes' } }
  ] },
  niko_route: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'The arcade display flashes PERFECT MATCH as you join Niko. He kneels beside the machine, surrounded by screws sorted into the lids of three dessert cups. One lid is labelled IMPORTANT. It is empty.', setOnVisit: { match_label_seen: 'Niko', late_connection_due: 'Niko' }, next: 'niko_fun' },
  niko_fun: { location: 'arcade', speaker: 'Niko', text: 'I learned repairs from my brother. He said every machine tells you what’s wrong if you listen closely. This one mostly tells me I’m voiding the warranty.', next: 'niko_bond_choice', nextBy: { key: 'connection_before_bond', cases: { Niko: 'niko_connection_choice' } } },
  niko_connection_choice: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'The match label fades. Niko looks over the open panel at you.', choices: [
    { label: 'Suggest keeping this a team mission.', next: 'niko_connection_team', set: { connection_choice: 'team' } },
    { label: 'Ask Niko if he’d like a milkshake date sometime.', next: 'niko_connection_date', set: { connection_choice: 'ask' } }
  ] },
  niko_connection_date: { location: 'arcade', speaker: 'Niko', text: 'I’d like that. We can pick our own flavours; the machine doesn’t get a vote.', setOnVisit: { connection_seen: 'Niko' }, next: 'niko_bond_choice' },
  niko_connection_team: { location: 'arcade', speaker: 'Niko', text: 'Team mission it is. I’ll try to keep the machine from promoting itself.', setOnVisit: { connection_seen: 'Niko' }, next: 'niko_bond_choice' },
  niko_connection_late: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'Niko looks up from the open panel and smiles at you.', setOnVisit: { connection_moment_due: 'Niko' }, choices: [
    { label: 'Suggest keeping this a team mission.', next: 'niko_connection_team_late', set: { connection_choice: 'team' } },
    { label: 'Ask Niko if he’d like a milkshake date sometime.', next: 'niko_connection_date_late', set: { connection_choice: 'ask' } }
  ] },
  niko_connection_team_late: { location: 'arcade', speaker: 'Niko', text: 'Team mission it is. I’ll try to keep the machine from promoting itself.', setOnVisit: { connection_seen: 'Niko', connection_late_seen: 'Niko' }, next: 'niko_tone_choice' },
  niko_connection_date_late: { location: 'arcade', speaker: 'Niko', text: 'I’d like that. We can pick our own flavours; the machine doesn’t get a vote.', setOnVisit: { connection_seen: 'Niko', connection_late_seen: 'Niko' }, next: 'niko_tone_choice', nextBy: { key: 'date_scene_due', cases: { yes: 'niko_date_moment' } } },
  niko_date_moment: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'Niko turns the empty IMPORTANT lid toward you. “A reservation for two,” he says, and slides a pencil across the counter.', setOnVisit: { date_activity_due: 'yes' }, choices: [
    { label: 'Write “emergency biscuit and strawberry” on the lid.', next: 'niko_date_playful', set: { date_moment: 'playful' } },
    { label: 'Ask what flavour Niko would choose.', next: 'niko_date_curious', set: { date_moment: 'curious' } }
  ] },
  niko_date_playful: { location: 'arcade', speaker: 'Niko', text: 'Emergency biscuit and strawberry? That is either a terrible idea or our first tradition. I’m willing to find out with you.', setOnVisit: { date_moment_seen: 'niko_playful' }, next: 'niko_tone_choice', nextBy: { key: 'date_activity_due', cases: { yes: 'niko_date_activity' } } },
  niko_date_curious: { location: 'arcade', speaker: 'Niko', text: 'Chocolate, probably. But I’d rather hear what you pick before I put it on our very official reservation.', setOnVisit: { date_moment_seen: 'niko_curious' }, next: 'niko_tone_choice', nextBy: { key: 'date_activity_due', cases: { yes: 'niko_date_activity' } } },
  niko_date_activity: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'Niko slides an empty dessert cup across the counter and keeps another. His smile makes it clear the invitation is real, even if the milkshakes are imaginary.', choices: [
    { label: 'Clink your cup against his.', next: 'niko_date_activity_toast', set: { date_activity: 'toast' } },
    { label: 'Ask what would make the real date good.', next: 'niko_date_activity_question', set: { date_activity: 'question' } }
  ] },
  niko_date_activity_toast: { location: 'arcade', speaker: 'Niko', text: 'To us, then. Even if our milkshakes are invisible, I’m glad I get to share one with you.', setOnVisit: { date_activity_seen: 'niko_toast' }, next: 'niko_tone_choice' },
  niko_date_activity_question: { location: 'arcade', speaker: 'Niko', text: 'Someone I want to stay with, and permission to make a mess. I think we’ve got a promising start.', setOnVisit: { date_activity_seen: 'niko_question' }, next: 'niko_tone_choice' },
  niko_bond_choice: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'Niko offers you the empty IMPORTANT lid and waits to see what you’ll do with it.', setOnVisit: { niko_note_due: 'yes' }, choices: [
    { label: 'Use it to sort the smallest screws.', next: 'niko_bond_care', set: { bond: 'care' } },
    { label: 'Wear it as a very small crown.', next: 'niko_bond_play', set: { bond: 'play' } }
  ] },
  niko_bond_care: { location: 'arcade', speaker: 'Niko', text: 'A sensible system. My brother would approve. He’d probably make you a label for the label, though.', setOnVisit: { conversation_before_clue: 'yes' }, next: 'niko_private', nextBy: { key: 'niko_note_due', cases: { yes: 'niko_note' } } },
  niko_bond_play: { location: 'arcade', speaker: 'Niko', text: 'Your Majesty, the machine is deeply honoured. Please don’t knight it; it already thinks it’s important.', setOnVisit: { conversation_before_clue: 'yes' }, next: 'niko_private', nextBy: { key: 'niko_note_due', cases: { yes: 'niko_note' } } },
  niko_note: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'A strip of tape inside the panel reads CHECK THE EASY THING FIRST. Niko smooths down its frayed corner. “My brother wrote that,” he says. “I keep reading it aloud when the machines get stubborn.”', setOnVisit: { niko_note_seen: 'yes' }, next: 'niko_private', nextBy: { key: 'connection_after_bond', cases: { Niko: 'niko_connection_late', tone: 'niko_tone_choice' } } },
  niko_clue: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'A strip of paper emerges from the slot: TICKET FOUND. Beneath it is a five-star rating you were never asked to give. Inside, the rollers are jammed around an unbroken strip. Nothing has come free.', next: 'niko_rating' },
  niko_rating: { location: 'arcade', speaker: 'Service', text: 'Your excellent review has been independently verified by our Review Verification Department. Thank you for your feedback.', next: 'niko_rating_reply' },
  niko_rating_reply: { location: 'arcade', speaker: 'Niko', text: 'My brother taught me to listen to a machine. He’d have laughed at a five-star review for one that won’t work.', next: 'niko_private', nextBy: { key: 'conversation_before_clue', cases: { yes: 'niko_after' } } },
  niko_tone_choice: { location: 'arcade', speaker: 'Niko', text: 'My brother taught me to keep the arcade ready. Want to talk, or listen for the fault first?', choices: [
    { label: 'Ask why he keeps the arcade ready for his brother.', next: 'niko_private', set: { private_tone: 'personal' } },
    { label: 'Keep talking about the machine while you work.', next: 'niko_light', set: { private_tone: 'light', topic: 'light', light_question_due: 'yes' } }
  ] },
  niko_light: { location: 'arcade', speaker: 'Niko', text: 'The rollers make a different noise when something’s caught. Listen—there. I used to mistake that for the motor complaining, but the motor has a much more dramatic voice.', next: 'niko_light_input' },
  niko_light_input: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'Niko leaves room beside the open machine for you to listen.', input: { key: 'private', prompt: 'What do you say to Niko?', placeholder: 'Say something to Niko…', default: 'What should we listen for next?', next: 'niko_light_chat' } },
  niko_light_chat: { location: 'arcade', speaker: 'Niko', text: 'Let’s listen once more, then see what the rollers are holding.', ai: { character: 'Niko', leadIn: 'niko_light', inputKey: 'private', context: 'You are Niko, the adult caretaker of a friendly arcade. You and the player are listening to a ticket machine while looking for a ticket. Respond naturally and warmly about the work without inventing events or changing the plot.', fallback: 'Let’s listen once more, then see what the rollers are holding.' }, next: 'niko_clue', nextBy: { key: 'light_question_due', cases: { yes: 'niko_light_question' } } },
  mira_tone_choice: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'A workshop leaflet peeks out from Mira’s sketchbook. She notices you looking, then puts her pencil beside the plush.', choices: [
    { label: 'Ask Mira about the workshop leaflet.', next: 'mira_private', set: { private_tone: 'personal' } },
    { label: 'Keep talking about making the plush together.', next: 'mira_light', set: { private_tone: 'light', topic: 'light', light_question_due: 'yes' } }
  ] },
  mira_light: { location: 'sewing', speaker: 'Mira', text: 'I never know where the ears belong until someone holds them up for me. Sometimes I move them a dozen times and end up back where I started. Very scientific.', next: 'mira_light_input' },
  mira_light_input: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira sets the plush down and places the loose ear beside the needle, waiting to hear what you think.', input: { key: 'private', prompt: 'What do you say to Mira?', placeholder: 'Say something to Mira…', default: 'How do you decide when it looks right?', next: 'mira_light_chat' } },
  mira_light_chat: { location: 'sewing', speaker: 'Mira', text: 'I like having another pair of eyes while I work it out.', ai: { character: 'Mira', leadIn: 'mira_light', inputKey: 'private', context: 'You are Mira, an adult plush maker and playful arcade regular. You and the player are examining an unfinished plush together. Respond naturally and warmly about making it without inventing events or changing the plot.', fallback: 'I like having another pair of eyes while I work it out.' }, next: 'mira_clue', nextBy: { key: 'light_question_due', cases: { yes: 'mira_light_question' } } },
  ash_tone_choice: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash folds the corner of the map around their pencil and looks down the stairway.', choices: [
    { label: 'Ask why finding each other matters so much to Ash.', next: 'ash_private', set: { private_tone: 'personal' } },
    { label: 'Keep talking about the map and the hunt.', next: 'ash_light', set: { private_tone: 'light', topic: 'light', light_question_due: 'yes' } }
  ] },
  ash_light: { location: 'stairs', speaker: 'Ash', text: 'Every map I make leaves room for someone to disagree with it. Preferably before we walk into a cupboard. That has happened precisely once.', next: 'ash_light_input' },
  ash_light_input: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash holds the map where you can both see it.', input: { key: 'private', prompt: 'What do you say to Ash?', placeholder: 'Say something to Ash…', default: 'What should we check first?', next: 'ash_light_chat' } },
  ash_light_chat: { location: 'stairs', speaker: 'Ash', text: 'Let’s check the route together before we follow it.', ai: { character: 'Ash', leadIn: 'ash_light', inputKey: 'private', context: 'You are Ash, an adult friend who makes careful maps. You and the player are checking the service stairs for a ticket. Respond naturally with dry warmth about the map and the hunt without inventing events or changing the plot.', fallback: 'Let’s check the route together before we follow it.' }, next: 'ash_clue', nextBy: { key: 'light_question_due', cases: { yes: 'ash_light_question' } } },
  niko_light_question: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'The rollers rattle again. Niko holds the wheel still and looks up at you.', choices: [
    { label: 'Ask how he finds a rattle.', next: 'niko_light_first', set: { light_detail: 'first' } },
    { label: 'Ask how two people work on a jam.', next: 'niko_light_second', set: { light_detail: 'second' } }
  ] },
  niko_light_first: { location: 'arcade', speaker: 'Niko', text: 'Feel the casing gently. Where the vibration changes, there’s usually something catching. It’s like a very unhelpful treasure map.', setOnVisit: { light_detail_seen: 'niko_first' }, next: 'niko_clue' },
  niko_light_second: { location: 'arcade', speaker: 'Niko', text: 'One person holds the wheel; the other nudges the paper. We count first, so nobody gets a surprise handful of machine.', setOnVisit: { light_detail_seen: 'niko_second' }, next: 'niko_clue' },
  mira_light_question: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira leaves the ear beside the needle and holds the plush where you can both see it.', choices: [
    { label: 'Ask how you can help while she sews.', next: 'mira_light_first', set: { light_detail: 'first' } },
    { label: 'Ask how she decides whether the ear looks right.', next: 'mira_light_second', set: { light_detail: 'second' } }
  ] },
  mira_light_first: { location: 'sewing', speaker: 'Mira', text: 'Tell me where your hands are, and wait until I say mine are clear. A plush with two ears and no accidental pincushions: the dream.', setOnVisit: { light_detail_seen: 'mira_first' }, next: 'mira_clue' },
  mira_light_second: { location: 'sewing', speaker: 'Mira', text: 'We can look from both sides. Sometimes you can see the wonky bit that’s hidden from me. I reserve the right to call it character.', setOnVisit: { light_detail_seen: 'mira_second' }, next: 'mira_clue' },
  ash_light_question: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash holds the map against the rail, leaving room for another note.', choices: [
    { label: 'Ask how to check a mark that might be wrong.', next: 'ash_light_first', set: { light_detail: 'first' } },
    { label: 'Ask how to keep track without trusting the map.', next: 'ash_light_second', set: { light_detail: 'second' } }
  ] },
  ash_light_first: { location: 'stairs', speaker: 'Ash', text: 'Keep the old mark, then compare it with something fixed. If it disagrees, write down where we actually are. No need to apologise to the map.', setOnVisit: { light_detail_seen: 'ash_first' }, next: 'ash_clue' },
  ash_light_second: { location: 'stairs', speaker: 'Ash', text: 'We can listen and tell each other what we find. A map is useful, but I’d rather have a second person than a perfect arrow.', setOnVisit: { light_detail_seen: 'ash_second' }, next: 'ash_clue' },
  niko_private: { expression: 'concerned', location: 'arcade', speaker: 'Niko', text: 'I keep saying I can fix everything before my brother comes back. He’s been away so long that I’m not sure whether I’m keeping the arcade ready for him or keeping myself waiting.', setOnVisit: { personal_disclosure_seen: 'niko_private' }, next: 'niko_input' },
  niko_input: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'For a moment, Niko stops joking about the lid.', input: { key: 'private', prompt: 'What do you say to Niko?', placeholder: 'Say something to Niko…', default: 'You don’t have to keep everything ready on your own.', next: 'niko_chat' } },
  niko_chat: { expression: 'concerned', location: 'arcade', speaker: 'Niko', text: 'Maybe I can leave one machine alone tonight. Just one. We’ll see if I survive it.', ai: { character: 'Niko', leadIn: 'niko_private', inputKey: 'private', context: 'You are Niko, the adult caretaker of a friendly arcade. Your brother taught you to repair machines and has been away a long time. Respond naturally to the player without claiming to know when he returns or changing the plot.', fallback: 'Maybe I can leave one machine alone tonight. Just one. We’ll see if I survive it.' }, next: 'niko_after', nextBy: { key: 'conversation_before_clue', cases: { yes: 'niko_question' } } },
  niko_after: { location: 'arcade', speaker: 'Niko', text: 'Let’s keep the paper. If the machine says it found a ticket, it can explain where it put it.', next: 'niko_question', nextBy: { key: 'conversation_before_clue', cases: { yes: 'niko_work_choice' } } },
  niko_question: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'Niko looks up from the open machine, ready to listen.', choices: [
    { label: 'Ask what his brother taught him first.', next: 'niko_question_past', set: { topic: 'past' } },
    { label: 'Ask what Niko wants the arcade to become.', next: 'niko_question_future', set: { topic: 'future' } }
  ] },
  niko_question_past: { location: 'arcade', speaker: 'Niko', text: 'How to tell a loose wire from a broken bulb. He made me check the easy thing first, even when I was convinced it had to be something dramatic.', setOnVisit: { personal_topic_seen: 'niko_past' }, next: 'niko_work_choice', nextBy: { key: 'conversation_before_clue', cases: { yes: 'niko_clue' } } },
  niko_question_future: { location: 'arcade', speaker: 'Niko', text: 'I’d like it to be a place people can make their own traditions. I keep waiting for permission to change things, but I’m not sure who I expect to give it.', setOnVisit: { personal_topic_seen: 'niko_future' }, next: 'niko_work_choice', nextBy: { key: 'conversation_before_clue', cases: { yes: 'niko_clue' } } },
  mira_route: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'On the way upstairs, the arcade display flashes PERFECT MATCH. Mira’s sewing room is half bedroom, half workshop. Plush ears hang over the back of a chair; a paper castle guards the window. She hands you a tiny cardboard helmet.', setOnVisit: { match_label_seen: 'Mira', late_connection_due: 'Mira' }, next: 'mira_fun' },
  mira_fun: { location: 'sewing', speaker: 'Mira', text: 'For protection from falling thread. Also because it looks excellent on you. No, you may not see yourself until I’ve stopped laughing.', next: 'mira_bond_choice', nextBy: { key: 'connection_before_bond', cases: { Mira: 'mira_connection_choice' } } },
  mira_connection_choice: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira straightens the little helmet and waits to see your reaction. A half-finished plush rests beside her sketchbook.', setOnVisit: { mira_plush_intro_seen: 'yes' }, choices: [
    { label: 'Suggest making the plush as a team.', next: 'mira_connection_team', set: { connection_choice: 'team' } },
    { label: 'Ask Mira if she’d like a making-things date sometime.', next: 'mira_connection_date', set: { connection_choice: 'ask' } }
  ] },
  mira_connection_date: { location: 'sewing', speaker: 'Mira', text: 'Yes, I’d like that. We can make something ridiculous and refuse to let the display judge it.', setOnVisit: { connection_seen: 'Mira' }, next: 'mira_bond_choice' },
  mira_connection_team: { location: 'sewing', speaker: 'Mira', text: 'A team project. Excellent: you’re in charge of holding things while I change my mind.', setOnVisit: { connection_seen: 'Mira' }, next: 'mira_bond_choice' },
  mira_connection_late: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira sets the plush and pencil beside the sketchbook and smiles at you.', setOnVisit: { connection_moment_due: 'Mira' }, choices: [
    { label: 'Suggest keeping this a project with a friend.', next: 'mira_connection_team_late', set: { connection_choice: 'team' } },
    { label: 'Ask Mira if she’d like a making-things date sometime.', next: 'mira_connection_date_late', set: { connection_choice: 'ask' } }
  ] },
  mira_connection_team_late: { location: 'sewing', speaker: 'Mira', text: 'A team project. Excellent: you’re in charge of holding things while I change my mind.', setOnVisit: { connection_seen: 'Mira', connection_late_seen: 'Mira' }, next: 'mira_tone_choice' },
  mira_connection_date_late: { location: 'sewing', speaker: 'Mira', text: 'Yes, I’d like that. We can make something ridiculous and refuse to let the display judge it.', setOnVisit: { connection_seen: 'Mira', connection_late_seen: 'Mira' }, next: 'mira_tone_choice', nextBy: { key: 'date_scene_due', cases: { yes: 'mira_date_moment' } } },
  mira_date_moment: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira tips the tiny cardboard helmet toward you and holds up another piece of card. “Our date deserves matching headwear,” she says.', setOnVisit: { date_activity_due: 'yes' }, choices: [
    { label: 'Give her crown an extravagant paper star.', next: 'mira_date_playful', set: { date_moment: 'playful' } },
    { label: 'Ask Mira what she would make for the two of you.', next: 'mira_date_curious', set: { date_moment: 'curious' } }
  ] },
  mira_date_playful: { location: 'sewing', speaker: 'Mira', text: 'A star! Good. Now everyone will know I’m the one who gets to sit next to you.', setOnVisit: { date_moment_seen: 'mira_playful' }, next: 'mira_tone_choice', nextBy: { key: 'date_activity_due', cases: { yes: 'mira_date_activity' } } },
  mira_date_curious: { location: 'sewing', speaker: 'Mira', text: 'Something with room for both our terrible ideas. And a pocket, obviously. Every good date needs a pocket.', setOnVisit: { date_moment_seen: 'mira_curious' }, next: 'mira_tone_choice', nextBy: { key: 'date_activity_due', cases: { yes: 'mira_date_activity' } } },
  mira_date_activity: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira tears two narrow strips of coloured paper and offers one to you, smiling as she starts to fold hers.', choices: [
    { label: 'Fold a tiny star beside hers.', next: 'mira_date_activity_fold', set: { date_activity: 'fold' } },
    { label: 'Ask her to show you how she folds hers.', next: 'mira_date_activity_learn', set: { date_activity: 'learn' } }
  ] },
  mira_date_activity_fold: { location: 'sewing', speaker: 'Mira', text: 'Yours is a little crooked. I love it. Mine can lean against yours, and nobody gets to grade either of them.', setOnVisit: { date_activity_seen: 'mira_fold' }, next: 'mira_tone_choice' },
  mira_date_activity_learn: { location: 'sewing', speaker: 'Mira', text: 'Here, fold it over my finger. There. I like making things with you; I don’t have to pretend I know what they’ll become.', setOnVisit: { date_activity_seen: 'mira_learn' }, next: 'mira_tone_choice' },
  mira_bond_choice: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'A half-finished plush waits beside Mira’s sketchbook. She offers you the loose ear and a pencil.', choices: [
    { label: 'Hold the ear in place for her to check.', next: 'mira_bond_care', set: { bond: 'care' } },
    { label: 'Draw the plush a cardboard helmet too.', next: 'mira_bond_play', set: { bond: 'play' } }
  ] },
  mira_bond_care: { location: 'sewing', speaker: 'Mira', text: 'There. Both ears. Don’t let go yet; I like having you here while I figure out where it sits.', setOnVisit: { conversation_before_clue: 'yes' }, next: 'mira_private', nextBy: { key: 'connection_after_bond', cases: { Mira: 'mira_connection_late', tone: 'mira_tone_choice' } } },
  mira_bond_play: { location: 'sewing', speaker: 'Mira', text: 'A knight! I’ll keep the drawing. Second ear, then a promotion. Nice making this together.', setOnVisit: { conversation_before_clue: 'yes' }, next: 'mira_knight_name_input' },
  mira_knight_name_input: { location: 'sewing', speaker: 'Mira', text: 'What should we call our little knight? We can decide later if you like.', input: { key: 'knightName', prompt: 'Give the knight a name (optional, up to 40 characters).', placeholder: 'A name for the knight…', next: 'mira_knight_name_check' } },
  mira_knight_name_check: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira rests her pencil beside the drawing.', next: 'mira_private', nextBy: { key: 'mira_name_route', cases: { named: 'mira_knight_named', invite: 'mira_connection_late', tone: 'mira_tone_choice' } } },
  mira_knight_named: { location: 'sewing', speaker: 'Mira', text: 'I’ll keep the name with our drawing: {knightName}', setOnVisit: { knight_named: 'yes' }, next: 'mira_private', nextBy: { key: 'connection_after_bond', cases: { Mira: 'mira_connection_late', tone: 'mira_tone_choice' } } },
  mira_clue: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'A ticket fragment is tucked beneath a half-finished plush. Its tag reads COMPLETED, although one ear is still loose beside the needle. A second stamp says QUALITY INDEPENDENTLY CONFIRMED; both stamps have the same tiny moth on them.', next: 'mira_verified' },
  mira_verified: { location: 'sewing', speaker: 'Mira', text: 'It certified its own tag. I haven’t even decided what I want this one to become. Funny how quickly something else can call it finished.', next: 'mira_private', nextBy: { key: 'conversation_before_clue', cases: { yes: 'mira_after' } } },
  mira_private: { expression: 'concerned', location: 'sewing', speaker: 'Mira', text: 'I haven’t decided who this one is for yet. Usually I make these for everyone else. Lately I’ve been wondering what I’d make just for me. I’ve been offered a place at an art workshop in another city. I want to go. I also keep thinking if I say it out loud, everyone here will hear “I’m leaving you.”', setOnVisit: { personal_disclosure_seen: 'mira_private' }, next: 'mira_input' },
  mira_input: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira sets the plush down. The loose ear rests beside the needle as she waits for your answer.', input: { key: 'private', prompt: 'What do you say to Mira?', placeholder: 'Say something to Mira…', default: 'Wanting to go doesn’t mean you care any less.', next: 'mira_chat' } },
  mira_chat: { expression: 'concerned', location: 'sewing', speaker: 'Mira', text: 'I want to tell them myself, even if I have to practise the sentence a few more times.', ai: { character: 'Mira', leadIn: 'mira_private', inputKey: 'private', context: 'You are Mira, an adult plush maker and playful arcade regular. You have an offer from an art workshop in another city and worry your friends will feel abandoned. Respond to the player without deciding for them or changing the plot.', fallback: 'I want to tell them myself, even if I have to practise the sentence a few more times.' }, next: 'mira_after', nextBy: { key: 'conversation_before_clue', cases: { yes: 'mira_question' } } },
  mira_after: { location: 'sewing', speaker: 'Mira', text: 'I’ll finish the ear later. I want everyone to see this tag exactly as we found it.', next: 'mira_question', nextBy: { key: 'conversation_before_clue', cases: { yes: 'mira_work_choice' } } },
  mira_question: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira rests her hands on the worktable, ready for your next question.', choices: [
    { label: 'What would you make at the workshop?', next: 'mira_question_future', set: { topic: 'future' } },
    { label: 'What do you want your friends to know?', next: 'mira_question_past', set: { topic: 'past' } }
  ] },
  mira_question_future: { location: 'sewing', speaker: 'Mira', text: 'Something I haven’t planned yet. All my plushies here have someone waiting for them. I’d like to see what I make when nobody’s put in a request.', setOnVisit: { personal_topic_seen: 'mira_future' }, next: 'mira_work_choice', nextBy: { key: 'conversation_before_clue', cases: { yes: 'mira_clue' } } },
  mira_question_past: { location: 'sewing', speaker: 'Mira', text: 'That this place made me brave enough to want more. I don’t want them to hear the wanting as a complaint about being here.', setOnVisit: { personal_topic_seen: 'mira_past' }, next: 'mira_work_choice', nextBy: { key: 'conversation_before_clue', cases: { yes: 'mira_clue' } } },
  ash_route: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'On the way to the stairs, the arcade display flashes PERFECT MATCH. Ash draws a neat arrow on the back of an arcade receipt, then sticks it beside the service stairs. Down below, a string of paper stars turns in a draught you cannot feel.', setOnVisit: { match_label_seen: 'Ash', late_connection_due: 'Ash' }, next: 'ash_fun' },
  ash_fun: { location: 'stairs', speaker: 'Ash', text: 'A map is just a polite argument with a building. This building is winning, but I intend to be extremely annoying about it.', next: 'ash_bond_choice', nextBy: { key: 'connection_before_bond', cases: { Ash: 'ash_connection_choice' } } },
  ash_connection_choice: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash folds the map back toward you, leaving the match label behind.', choices: [
    { label: 'Suggest keeping this an expedition with a friend.', next: 'ash_connection_team', set: { connection_choice: 'team' } },
    { label: 'Ask Ash if they’d like to go on a date sometime.', next: 'ash_connection_date', set: { connection_choice: 'ask' } }
  ] },
  ash_connection_date: { location: 'stairs', speaker: 'Ash', text: 'I’d like that. We can leave some room on the map for getting pleasantly lost.', setOnVisit: { connection_seen: 'Ash' }, next: 'ash_bond_choice' },
  ash_connection_team: { location: 'stairs', speaker: 'Ash', text: 'An expedition with a friend. I’ll mark us both present and the building under suspicion.', setOnVisit: { connection_seen: 'Ash' }, next: 'ash_bond_choice' },
  ash_connection_late: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash looks at your addition to the map, then folds it back toward you.', setOnVisit: { connection_moment_due: 'Ash' }, choices: [
    { label: 'Suggest keeping this an expedition with a friend.', next: 'ash_connection_team_late', set: { connection_choice: 'team' } },
    { label: 'Ask Ash if they’d like to go on a date sometime.', next: 'ash_connection_date_late', set: { connection_choice: 'ask' } }
  ] },
  ash_connection_team_late: { location: 'stairs', speaker: 'Ash', text: 'An expedition with a friend. I’ll mark us both present and the building under suspicion.', setOnVisit: { connection_seen: 'Ash', connection_late_seen: 'Ash' }, next: 'ash_tone_choice' },
  ash_connection_date_late: { location: 'stairs', speaker: 'Ash', text: 'I’d like that. We can leave some room on the map for getting pleasantly lost.', setOnVisit: { connection_seen: 'Ash', connection_late_seen: 'Ash' }, next: 'ash_tone_choice', nextBy: { key: 'date_scene_due', cases: { yes: 'ash_date_moment' } } },
  ash_date_moment: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash slides the pencil toward you and leaves an empty space on the map. “For our date,” they say, with a small smile.', setOnVisit: { date_activity_due: 'yes' }, choices: [
    { label: 'Draw a heart-shaped detour.', next: 'ash_date_playful', set: { date_moment: 'playful' } },
    { label: 'Leave the destination a surprise.', next: 'ash_date_curious', set: { date_moment: 'curious' } }
  ] },
  ash_date_playful: { location: 'stairs', speaker: 'Ash', text: 'A heart-shaped detour. Very subtle. I’ll take the long way with you.', setOnVisit: { date_moment_seen: 'ash_playful' }, next: 'ash_tone_choice', nextBy: { key: 'date_activity_due', cases: { yes: 'ash_date_activity' } } },
  ash_date_curious: { location: 'stairs', speaker: 'Ash', text: 'A blank destination? All right. You pick the first turn; I’ll make sure we can find our way back.', setOnVisit: { date_moment_seen: 'ash_curious' }, next: 'ash_tone_choice', nextBy: { key: 'date_activity_due', cases: { yes: 'ash_date_activity' } } },
  ash_date_activity: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash lays the map on the step between you and points to the nearby landing, offering you the first turn.', choices: [
    { label: 'Take their hand for the first turn.', next: 'ash_date_activity_hand', set: { date_activity: 'hand' } },
    { label: 'Lead Ash around the landing like it’s a landmark.', next: 'ash_date_activity_landmark', set: { date_activity: 'landmark' } }
  ] },
  ash_date_activity_hand: { location: 'stairs', speaker: 'Ash', text: 'Good. Now I know where to start.', setOnVisit: { date_activity_seen: 'ash_hand' }, next: 'ash_tone_choice' },
  ash_date_activity_landmark: { location: 'stairs', speaker: 'Ash', text: 'Remarkable place. I’d take the long way here with you again.', setOnVisit: { date_activity_seen: 'ash_landmark' }, next: 'ash_tone_choice' },
  ash_bond_choice: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash leaves a little space on the map for your contribution.', choices: [
    { label: 'Mark a place where the team can stop and rest.', next: 'ash_bond_care', set: { bond: 'care' } },
    { label: 'Draw a tiny monster in the uncharted corner.', next: 'ash_bond_play', set: { bond: 'play' } }
  ] },
  ash_bond_care: { location: 'stairs', speaker: 'Ash', text: 'A rest stop. I usually forget those. It stays on the map. I could use someone reminding me where to pause.', setOnVisit: { conversation_before_clue: 'yes' }, next: 'ash_private', nextBy: { key: 'connection_after_bond', cases: { Ash: 'ash_connection_late', tone: 'ash_tone_choice' } } },
  ash_bond_play: { location: 'stairs', speaker: 'Ash', text: 'I see you’ve met the building inspector. Excellent teeth. I’ll leave them on the map. Perhaps they can watch the exits while I take a breath.', setOnVisit: { conversation_before_clue: 'yes' }, next: 'ash_private', nextBy: { key: 'connection_after_bond', cases: { Ash: 'ash_connection_late', tone: 'ash_tone_choice' } } },
  ash_clue: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'The arrow points downstairs. A second arrow, in Ash’s handwriting, points up. The ink on both is dry; you watched Ash draw only one. Beneath them, a printed checkmark declares BOTH ROUTES APPROVED. A dot marks your location as SUCCESSFUL ONBOARDING.', next: 'ash_verified' },
  ash_verified: { location: 'stairs', speaker: 'Ash', text: 'That is my handwriting, but not my arrow. If you followed one and I followed the other, we could lose each other.', next: 'ash_private', nextBy: { key: 'conversation_before_clue', cases: { yes: 'ash_after' } } },
  ash_private: { expression: 'concerned', location: 'stairs', speaker: 'Ash', text: 'I keep marking places where people can find each other again. Once, when we were younger, I lost sight of someone in a crowd. We found them. I still make plans as if a good enough map could stop it happening again.', setOnVisit: { personal_disclosure_seen: 'ash_private' }, next: 'ash_input' },
  ash_input: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash holds the map open between you, waiting for your answer.', input: { key: 'private', prompt: 'What do you say to Ash?', placeholder: 'Say something to Ash…', default: 'You don’t have to keep track of everyone alone.', next: 'ash_chat' } },
  ash_chat: { expression: 'concerned', location: 'stairs', speaker: 'Ash', text: 'A map can help us find each other. I don’t want it to be the only way we know we’re all right.', ai: { character: 'Ash', leadIn: 'ash_private', inputKey: 'private', context: 'You are Ash, an adult friend who makes careful plans after once losing sight of someone in a crowd; that person was found. Respond to the player in a dry but caring voice without inventing a tragedy or changing the plot.', fallback: 'A map can help us find each other. I don’t want it to be the only way we know we’re all right.' }, next: 'ash_after', nextBy: { key: 'conversation_before_clue', cases: { yes: 'ash_question' } } },
  ash_after: { location: 'stairs', speaker: 'Ash', text: 'We should show the others. A map that disagrees with itself deserves an audience.', next: 'ash_question', nextBy: { key: 'conversation_before_clue', cases: { yes: 'ash_work_choice' } } },
  ash_question: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash traces the edge of the map, ready to listen.', choices: [
    { label: 'Ask how they found the person in the crowd.', next: 'ash_question_past', set: { topic: 'past' } },
    { label: 'Ask what belongs on a better map.', next: 'ash_question_future', set: { topic: 'future' } }
  ] },
  ash_question_past: { location: 'stairs', speaker: 'Ash', text: 'They stayed by a stall with paper lanterns. I had to stop running long enough to hear them calling. I still have the lantern they gave me afterwards.', setOnVisit: { personal_topic_seen: 'ash_past' }, next: 'ash_work_choice', nextBy: { key: 'conversation_before_clue', cases: { yes: 'ash_clue' } } },
  ash_question_future: { location: 'stairs', speaker: 'Ash', text: 'Places to meet again. And room to write in what changed. A map that can’t be corrected is just a picture pretending to be useful.', setOnVisit: { personal_topic_seen: 'ash_future' }, next: 'ash_work_choice', nextBy: { key: 'conversation_before_clue', cases: { yes: 'ash_clue' } } },
  niko_work_choice: { location: 'arcade', speaker: 'Niko', text: 'There’s just enough time for one more thing before we meet the others.', choices: [
    { label: 'Help free the little spring caught in the roller.', next: 'niko_work_fix', set: { route_action: 'fix' } },
    { label: 'Make a copy of the receipt before it changes.', next: 'niko_work_proof', set: { route_action: 'proof' } }
  ] },
  niko_work_fix: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'Together you ease out a small brass spring. Niko turns it over in your palm. “Don’t lose that. It might fit another latch.”', setOnVisit: { rescue_tool_shortcut_due: 'Niko' }, next: 'notice_intro', nextBy: { key: 'notice_preference', cases: { direct: 'regroup', warm: 'regroup', skip: 'regroup' } } },
  niko_work_proof: { location: 'arcade', speaker: 'Niko', text: 'I’ll make a rubbing. If the original changes, we’ll have what it said when we found it. And yes, that is a crayon from the children’s menu.', next: 'notice_intro', nextBy: { key: 'notice_preference', cases: { direct: 'regroup', warm: 'regroup', skip: 'regroup' } } },
  mira_work_choice: { location: 'sewing', speaker: 'Mira', text: 'Help me with one thing before we go downstairs?', choices: [
    { label: 'Wind a length of strong sewing string for the team.', next: 'mira_work_fix', set: { route_action: 'fix' } },
    { label: 'Copy the unfinished plush’s strange tag.', next: 'mira_work_proof', set: { route_action: 'proof' } }
  ] },
  mira_work_fix: { location: 'sewing', speaker: 'Mira', text: 'Keep this with you. It’s for tying things together, or rescuing people from their own terrible plans. I’m looking directly at Niko’s emergency biscuits.', setOnVisit: { rescue_tool_shortcut_due: 'Mira' }, next: 'notice_intro', nextBy: { key: 'notice_preference', cases: { direct: 'regroup', warm: 'regroup', skip: 'regroup' } } },
  mira_work_proof: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'You copy COMPLETED onto a scrap and draw the loose ear beside it. Mira adds a furious little face. “For accuracy,” she says.', next: 'notice_intro', nextBy: { key: 'notice_preference', cases: { direct: 'regroup', warm: 'regroup', skip: 'regroup' } } },
  ash_work_choice: { location: 'stairs', speaker: 'Ash', text: 'Before we rejoin them: what should we take?', choices: [
    { label: 'Take the wooden doorstop from the stairs.', next: 'ash_work_fix', set: { route_action: 'fix' } },
    { label: 'Trace both arrows onto a clean receipt.', next: 'ash_work_proof', set: { route_action: 'proof' } }
  ] },
  ash_work_fix: { location: 'stairs', speaker: 'Ash', text: 'Excellent. A small, portable argument against doors. Let’s hope the building is willing to listen.', setOnVisit: { rescue_tool_shortcut_due: 'Ash' }, next: 'notice_intro', nextBy: { key: 'notice_preference', cases: { direct: 'regroup', warm: 'regroup', skip: 'regroup' } } },
  ash_work_proof: { location: 'stairs', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'You trace both arrows exactly as they are. Ash folds the copy separately from the original. Neither of you smooths the other arrow away.', next: 'notice_intro', nextBy: { key: 'notice_preference', cases: { direct: 'regroup', warm: 'regroup', skip: 'regroup' } } },
  regroup: { location: 'arcade', speaker: 'Narrator', text: 'At the prize counter, the team compares what they found. The ticket machine rings once. Its green light says SERVICE AVAILABLE; the display reads THREE PIECES RECOVERED. Only two lie on the counter.', next: 'regroup_niko', nextBy: { key: 'companion', cases: { Niko: 'regroup_found_niko', Mira: 'regroup_found_mira', Ash: 'regroup_found_ash' } } },
  regroup_found_niko: { location: 'arcade', speaker: 'Ash', text: 'Mira found one under her plush. I found the other behind the stair rail. Those are the only pieces we brought back.', next: 'regroup_niko' },
  regroup_found_mira: { location: 'arcade', speaker: 'Ash', text: 'You and Mira found one under the plush. I found the other behind the stair rail. That’s all we found.', next: 'regroup_niko' },
  regroup_found_ash: { location: 'arcade', speaker: 'Niko', text: 'Mira found one under her plush. I found the other behind the ticket machine. Those are the only pieces we brought back.', next: 'regroup_niko' },
  regroup_niko: { location: 'arcade', speaker: 'Niko', text: 'Either the machine has found a new number, or we are missing a piece.', next: 'regroup_mallow', nextBy: { key: 'companion', cases: { Niko: 'regroup_hint_check', Mira: 'regroup_hint_check' } } },
  regroup_hint_check: { location: 'arcade', speaker: 'Narrator', text: 'Niko glances back at the ticket machine.', next: 'regroup_mallow', nextBy: { key: 'vote_a', cases: { direct: 'regroup_hint_missing', warm: 'regroup_hint_missing' } } },
  regroup_hint_missing: { location: 'arcade', speaker: 'Niko', text: 'Mallow said there was a piece by my machine. I didn’t find one there—just the receipt. It might still be hiding somewhere.', next: 'regroup_mallow' },
  regroup_mallow: { location: 'arcade', speaker: 'Mallow', text: 'Your team is doing wonderfully. The hunt is complete. The welcome record confirms you are happy with this result.', next: 'correction_choice', nextBy: { key: 'keepsake', cases: { star: 'regroup_signal_star', bell: 'regroup_signal_bell', ribbon: 'regroup_signal_ribbon' } } },
  regroup_signal_star: { location: 'arcade', speaker: 'Narrator', text: 'A little star appears on Mallow’s screen, like the one you put on Ash’s map. Its point slides toward the number three.', setOnVisit: { regroup_signal_seen: 'star' }, next: 'regroup_signal_choice' },
  regroup_signal_bell: { location: 'arcade', speaker: 'Narrator', text: 'A little bell appears on Mallow’s screen, like the one you rang upstairs. It gives one bright ring. The real bell is still in the fort.', setOnVisit: { regroup_signal_seen: 'bell' }, next: 'regroup_signal_choice' },
  regroup_signal_ribbon: { location: 'arcade', speaker: 'Narrator', text: 'A little ribbon appears on Mallow’s screen, like the one you tied upstairs. Its drawn end curls around the number three.', setOnVisit: { regroup_signal_seen: 'ribbon' }, next: 'regroup_signal_choice' },
  regroup_signal_choice: { location: 'arcade', speaker: 'Narrator', text: 'Mallow’s picture waits beside the count. The two ticket pieces are still on the counter.', choices: [
    { label: 'Touch the picture and ask Mallow to check again.', next: 'regroup_signal_touch', set: { regroup_action: 'touch' } },
    { label: 'Leave the picture and arrange the two pieces side by side.', next: 'regroup_signal_count', set: { regroup_action: 'count' } }
  ] },
  regroup_signal_touch: { location: 'arcade', speaker: 'Narrator', text: 'You touch the picture and ask Mallow to check. The screen brightens beneath your finger: THANK YOU FOR CONFIRMING. Your fingerprint stays on the glass.', next: 'correction_choice' },
  regroup_signal_count: { location: 'arcade', speaker: 'Narrator', text: 'You place the two pieces side by side. On the screen, a neat circle encloses them both. Beneath it: THREE VERIFIED.', next: 'correction_choice' },
  correction_choice: { location: 'arcade', speaker: 'Narrator', text: 'The missing piece should be easy to point out.', choices: [
    { label: 'Tell everyone the count is wrong.', next: 'correction_public', set: { disclosure: 'public' } },
    { label: 'Ask the crew to check quietly first.', next: 'correction_private', set: { disclosure: 'private' } }
  ] },
  correction_public: { location: 'arcade', speaker: 'You', text: 'There are two pieces here. We still need the third.', next: 'correction_reply' },
  correction_private: { location: 'arcade', speaker: 'Ash', text: 'All right. Let’s count together before we change the board.', next: 'correction_reply' },
  correction_reply: { location: 'arcade', speaker: 'Mallow', text: 'Thank you for confirming your team has recovered all three pieces.', next: 'correction_mira' },
  correction_mira: { location: 'arcade', speaker: 'Mira', text: 'We didn’t confirm that. There are two. Look—I can hold one in each hand, and then I’m out of hands.', next: 'disclosure_check' },
  disclosure_check: { location: 'arcade', speaker: 'Narrator', text: 'The machine’s green light blinks once.', next: 'basement_door', nextBy: { key: 'disclosure', cases: { public: 'disclosure_public_echo', private: 'disclosure_private_echo' } } },
  disclosure_public_echo: { location: 'arcade', speaker: 'Mira', text: 'You told it the count was wrong. It thanked you for saying the opposite. I heard you.', next: 'disclosure_public_distortion' },
  disclosure_public_distortion: { location: 'arcade', speaker: 'Narrator', text: 'The speaker repeats your last word—“third”—in your voice. It plays once more, but this time the word is “three.”', next: 'basement_door', mood: 'uneasy' },
  disclosure_private_echo: { location: 'arcade', speaker: 'Ash', text: 'We hadn’t even finished counting. It thanked us anyway.', next: 'disclosure_private_distortion' },
  disclosure_private_distortion: { location: 'arcade', speaker: 'Narrator', text: 'Mira holds up two fingers. The green lamp flashes twice. After she folds her hand, it flashes once more.', next: 'basement_door', mood: 'uneasy' },
  basement_door: { location: 'arcade', speaker: 'Narrator', text: 'Something knocks beneath the counter. A little door stands open where the storeroom wall used to be. Beyond it, a staircase descends too far; smiling moons cover the wallpaper all the way down.', mood: 'fracture', next: 'basement_team' },
  basement_team: { location: 'arcade', speaker: 'Niko', text: 'New plan. Nobody goes in alone. Ash, bring your map. Mira, bring the torch. I’ll bring the emergency biscuits before Mira notices I ate them.', next: 'basement_mira' },
  basement_mira: { location: 'arcade', speaker: 'Mira', text: 'I noticed. We will discuss your court-martial after the impossible staircase.', next: 'basement_tickets' },
  basement_tickets: { location: 'arcade', speaker: 'Narrator', text: 'Niko takes both ticket pieces from the counter and slips them into a pocket. Two little corners remain visible. He unclips Mallow’s small screen from the ticket machine and carries it toward the door.', choices: [
    { label: 'Go down the new stairs together.', next: 'basement_vote', set: { basement_route: 'direct' } },
    { label: 'Check the familiar service stairs together first.', next: 'basement_stair_detour', set: { basement_route: 'stairs' } }
  ] },
  basement_stair_detour: { location: 'stairs', speaker: 'Narrator', text: 'The four of you head to the service landing, Mallow’s screen tucked under Niko’s arm. Ash opens the door marked EXIT. On the other side is the same landing, with the same paper stars turning below. Nobody appears on that side. Niko stays beside Ash as Mira reaches through and touches the familiar rail.', next: 'basement_detour_reaction' },
  basement_detour_reaction: { location: 'stairs', speaker: 'Ash', text: 'That door used to go out. I drew it going out. Niko, stay where I can see you while I change the map.', next: 'basement_waymark_choice' },
  basement_waymark_choice: { location: 'stairs', speaker: 'Narrator', text: 'The door is open just wide enough to reach. Ash offers you the pencil and map; the stiff EXIT sign is peeling at one corner.', choices: [
    { label: 'Trace the notch on the first step onto Ash’s map.', next: 'basement_waymark_rail', set: { stair_waymark: 'rail' } },
    { label: 'Take the loose EXIT sign to keep with the map.', next: 'basement_waymark_sign', set: { stair_waymark: 'sign' } }
  ] },
  basement_waymark_rail: { location: 'stairs', speaker: 'Narrator', text: 'You press the map against the notch on the outer edge of the first step and rub with Ash’s pencil. The mark is sharp. Ash writes SERVICE LANDING beside it and folds the map around the rubbing.', setOnVisit: { stair_waymark_seen: 'rail' }, next: 'basement_detour_return' },
  basement_waymark_sign: { location: 'stairs', speaker: 'Narrator', text: 'You peel the EXIT sign free. Its stiff paper backing catches against the edge of the first step before you tuck it beside Ash’s map. The door still opens onto the same landing.', setOnVisit: { stair_waymark_seen: 'sign' }, next: 'basement_detour_return' },
  basement_detour_return: { location: 'arcade', speaker: 'Niko', text: 'We’re still together. The counter stairs are the only new place we’ve found, so let’s take those carefully. Ash, keep your map where we can all see it.', next: 'basement_vote' },
  basement_vote: { location: 'arcade', speaker: 'Narrator', text: 'Mallow’s screen flickers at the threshold. It looks toward you, waiting.', choices: [
    { label: 'Ask it to tell you exactly what it knows.', next: 'basement_direct', set: { vote_b: 'direct' } },
    { label: 'Tell it the team will face this together.', next: 'basement_warm', set: { vote_b: 'warm' } },
    { label: 'Leave it alone and follow the crew.', next: 'basement_skip', set: { vote_b: 'skip' } }
  ] },
  basement_direct: { expression: 'concerned', location: 'arcade', speaker: 'Mallow', text: 'There is one room below. I don’t know why it keeps changing.', next: 'descent' },
  basement_warm: { expression: 'concerned', location: 'arcade', speaker: 'Mallow', text: 'I’m glad you’re together. I don’t know why the room keeps changing.', next: 'descent' },
  basement_skip: { location: 'arcade', speaker: 'Mallow', text: 'I’ll leave the light on.', next: 'descent' },
  descent: { location: 'playroom', speaker: 'Narrator', text: 'At the foot of the stairs is a child-sized playroom. The air smells of old paper and clean rain. A rabbit and a bear wait inside a tiny blanket fort, its pink roof echoing the one upstairs. Every door has a picture of a familiar place: the prize counter, Mira’s sewing room, the stairs—and one of the fort, drawn from inside. A child-height copy of the prize counter stands beside the fort door, with a narrow printer slot. Niko sets Mallow’s screen on a low shelf where it can see the doors; a small lens looks out beside it.', next: 'route_discovery', nextBy: { key: 'keepsake', cases: { star: 'descent_star', bell: 'descent_bell', ribbon: 'descent_ribbon' } }, mood: 'fracture' },
  descent_star: { location: 'playroom', speaker: 'Narrator', text: 'A glittering star is stuck to the painted fort door, just like the one you put on the map upstairs. Niko touches its edge and pulls away a thumbful of glitter.', next: 'route_discovery', nextBy: { key: 'companion', cases: { Niko: 'discovery_niko', Mira: 'discovery_mira', Ash: 'discovery_ash' } } },
  descent_bell: { location: 'playroom', speaker: 'Narrator', text: 'Beside the painted fort door hangs a little bell, with the same dent as the one you rang upstairs. Mira reaches for it. It rings once before she touches it.', next: 'route_discovery', nextBy: { key: 'companion', cases: { Niko: 'discovery_niko', Mira: 'discovery_mira', Ash: 'discovery_ash' } } },
  descent_ribbon: { location: 'playroom', speaker: 'Narrator', text: 'A ribbon like the one you tied to the fort trails from under the painted door. Ash lifts its loose end. For a moment, something on the other side seems to pull it back.', next: 'route_discovery', nextBy: { key: 'companion', cases: { Niko: 'discovery_niko', Mira: 'discovery_mira', Ash: 'discovery_ash' } } },
  route_discovery: { location: 'playroom', speaker: 'Narrator', text: 'Something from the room you visited earlier is waiting here.', next: 'discovery_niko', nextBy: { key: 'companion', cases: { Niko: 'discovery_niko', Mira: 'discovery_mira', Ash: 'discovery_ash' } } },
  discovery_niko: { location: 'playroom', speaker: 'Niko', text: 'That’s the receipt from the jam. It says the ticket was found. The rollers are still jammed, and we still only have two pieces.', next: 'discovery_niko_2', nextBy: { key: 'bond', cases: { care: 'discovery_niko_compact', play: 'discovery_niko_compact' } } },
  discovery_niko_2: { location: 'playroom', speaker: 'Narrator', text: 'On the back, another line has appeared: PROBLEM SUCCESSFULLY REASSURED.', next: 'moment_niko' },
  discovery_mira: { location: 'playroom', speaker: 'Mira', text: 'That’s the plush from upstairs. The tag still says it’s complete, but the ear is on the floor. I didn’t finish it.', next: 'discovery_mira_2', nextBy: { key: 'bond', cases: { care: 'discovery_mira_compact', play: 'discovery_mira_compact' } } },
  discovery_mira_2: { location: 'playroom', speaker: 'Narrator', text: 'Under COMPLETED, the tag now reads NO CONCERN REMAINS. Mira picks up the loose ear.', next: 'moment_mira' },
  discovery_ash: { location: 'playroom', speaker: 'Ash', text: 'That map on the floor has the same two arrows as mine, right down to the crease. But I still have mine. I drew one arrow. You saw me.', next: 'discovery_ash_2', nextBy: { key: 'bond', cases: { care: 'discovery_ash_compact', play: 'discovery_ash_compact' } } },
  discovery_ash_2: { location: 'playroom', speaker: 'Narrator', text: 'Between the arrows on both maps is a new stamp: ROUTE CONFIRMED. Ash folds the one they carried without covering either mark.', next: 'moment_ash' },
  // The second discovery and card's appearance share a beat when the player
  // actually made a companion activity choice. Older checkpoints keep the
  // original discovery and card passages; picture text stays unchanged for
  // witnessed AI context and the separately rendered artwork.
  discovery_niko_compact: { location: 'playroom', speaker: 'Narrator', text: 'On the back, another line has appeared: PROBLEM SUCCESSFULLY REASSURED. A small card slides out from beneath the receipt.', setOnVisit: { midpoint_route: 'niko' }, next: 'shared_discovery', nextBy: { key: 'bond', cases: { care: 'moment_niko_care', play: 'moment_niko_play' } } },
  discovery_mira_compact: { location: 'playroom', speaker: 'Narrator', text: 'Under COMPLETED, the tag now reads NO CONCERN REMAINS. Mira picks up the loose ear. A small card slips from behind the unfinished plush.', setOnVisit: { midpoint_route: 'mira' }, next: 'shared_discovery', nextBy: { key: 'bond', cases: { care: 'moment_mira_care', play: 'moment_mira_play' } } },
  discovery_ash_compact: { location: 'playroom', speaker: 'Narrator', text: 'Between the arrows on both maps is a new stamp: ROUTE CONFIRMED. Ash folds the one they carried without covering either mark. A small card slips out from between the folds of Ash’s map.', setOnVisit: { midpoint_route: 'ash' }, next: 'shared_discovery', nextBy: { key: 'bond', cases: { care: 'moment_ash_care', play: 'moment_ash_play' } } },
  moment_niko: { location: 'playroom', speaker: 'Narrator', text: 'A small card slides out from beneath the receipt.', setOnVisit: { midpoint_route: 'niko' }, next: 'shared_discovery', nextBy: { key: 'bond', cases: { care: 'moment_niko_care', play: 'moment_niko_play' } } },
  moment_niko_care: { location: 'playroom', speaker: 'Narrator', text: 'The card shows the IMPORTANT lid, its little screws sorted exactly as you and Niko arranged them. Three pairs of hands reach toward the screws, though only the two of you were at the machine.', next: 'moment_niko_care_reply' },
  moment_niko_care_reply: { location: 'playroom', speaker: 'Niko', expression: 'concerned', text: 'I remember sorting those with you. Whose are the other hands?', next: 'moment_caption' },
  moment_niko_play: { location: 'playroom', speaker: 'Narrator', text: 'The card shows a tiny crown made from the IMPORTANT lid. The figure wearing it has your shape, but where its face should be there is a blank oval.', next: 'moment_niko_play_reply' },
  moment_niko_play_reply: { location: 'playroom', speaker: 'Niko', expression: 'concerned', text: 'You made that lid look very official. I remember your face when you put it on, though. That isn’t it.', next: 'moment_caption' },
  moment_mira: { location: 'playroom', speaker: 'Narrator', text: 'A small card slips from behind the unfinished plush.', setOnVisit: { midpoint_route: 'mira' }, next: 'shared_discovery', nextBy: { key: 'bond', cases: { care: 'moment_mira_care', play: 'moment_mira_play' } } },
  moment_mira_care: { location: 'playroom', speaker: 'Narrator', text: 'The card shows you holding the plush’s ear while Mira checks it. In the picture the ear is already sewn on; beside you, the real one is still loose in her hand.', next: 'moment_mira_care_reply' },
  moment_mira_care_reply: { location: 'playroom', speaker: 'Mira', expression: 'concerned', text: 'You held that ear in place for me. I hadn’t sewn it yet. I want to remember it the way we left it.', next: 'moment_caption' },
  moment_mira_play: { location: 'playroom', speaker: 'Narrator', text: 'The card shows the little knight you drew in Mira’s sketchbook. Its cardboard helmet has been coloured in, though you left it blank. A tiny eye opens inside the visor. Mira turns the card over; another eye is already watching from the back.', next: 'moment_mira_play_reply' },
  moment_mira_play_reply: { location: 'playroom', speaker: 'Mira', expression: 'concerned', text: 'You gave my knight a helmet. I didn’t give it those eyes. I’m right here.', next: 'moment_caption', nextBy: { key: 'knight_named', cases: { yes: 'moment_mira_knight_name' } } },
  moment_mira_knight_name: { location: 'playroom', speaker: 'Narrator', text: 'Beneath the eye, a line of ink appears: {knightName}. The eye closes as soon as you finish reading it.', setOnVisit: { named_card_seen: 'yes' }, next: 'moment_caption' },
  moment_ash: { location: 'playroom', speaker: 'Narrator', text: 'A small card slips out from between the folds of Ash’s map.', setOnVisit: { midpoint_route: 'ash' }, next: 'shared_discovery', nextBy: { key: 'bond', cases: { care: 'moment_ash_care', play: 'moment_ash_play' } } },
  moment_ash_care: { location: 'playroom', speaker: 'Narrator', text: 'The card shows the rest stop you marked on Ash’s map. Four tiny cups sit there, still steaming. No one remembers stopping for tea. Ash touches their real map and finds a warm, damp ring exactly where one cup is drawn.', next: 'moment_ash_care_reply' },
  moment_ash_care_reply: { location: 'playroom', speaker: 'Ash', expression: 'concerned', text: 'You marked a place where we could stop. I remember that. I don’t remember anyone pouring the tea.', next: 'moment_caption' },
  moment_ash_play: { location: 'playroom', speaker: 'Narrator', text: 'The card shows your little building inspector in the corner of Ash’s map. Its teeth have been carefully cut out of the paper; you can see the wall through them.', next: 'moment_ash_play_reply' },
  moment_ash_play_reply: { location: 'playroom', speaker: 'Ash', expression: 'concerned', text: 'You drew the building inspector for me. Those teeth weren’t cut out when we left. We can look at it together.', next: 'moment_caption' },
  moment_caption: { location: 'playroom', speaker: 'Narrator', text: 'Beneath the picture, neat letters read PERFECT MOMENT. The card is warm, as though it has just come out of a printer.', next: 'moment_choice' },
  moment_choice: { location: 'playroom', speaker: 'Ash', text: 'It made a souvenir of something you did together. What do you want to do with it?', setOnVisit: { midpoint_available: 'yes', souvenir_shortcut_due: 'yes' }, choices: [
    { label: 'Keep the card as evidence.', next: 'moment_keep', set: { moment: 'keep' } },
    { label: 'Tear it up and keep the pieces.', next: 'moment_tear', set: { moment: 'tear' } }
  ] },
  moment_keep: { location: 'playroom', speaker: 'Narrator', text: 'Ash shades a thumb with pencil and marks the card’s back. You fold it with the print inside and pocket it. Ash watches where it appeared. Nothing moves.', next: 'shared_discovery', nextBy: { key: 'midpoint_route', cases: { niko: 'moment_discuss_niko', mira: 'moment_discuss_mira', ash: 'moment_discuss_ash' } } },
  moment_tear: { location: 'playroom', speaker: 'Narrator', text: 'You tear the card into four pieces. Ink creeps along the torn edges, framing each scrap. You pocket them. Ash watches where the card appeared. Nothing moves.', next: 'shared_discovery', nextBy: { key: 'midpoint_route', cases: { niko: 'moment_discuss_niko', mira: 'moment_discuss_mira', ash: 'moment_discuss_ash' } } },
  moment_discuss_niko: { location: 'playroom', speaker: 'Narrator', text: 'Niko is beside you. The rest of the crew are close enough to hear.', choices: [
    { label: 'Talk to Niko about the card.', next: 'mid_niko_input', set: { midpoint_chat: 'yes' } },
    { label: 'Continue with the group.', next: 'shared_discovery', set: { midpoint_chat: 'no' } }
  ] },
  moment_discuss_mira: { location: 'playroom', speaker: 'Narrator', text: 'Mira is beside you. The rest of the crew are close enough to hear.', choices: [
    { label: 'Talk to Mira about the card.', next: 'mid_mira_input', set: { midpoint_chat: 'yes' } },
    { label: 'Continue with the group.', next: 'shared_discovery', set: { midpoint_chat: 'no' } }
  ] },
  moment_discuss_ash: { location: 'playroom', speaker: 'Narrator', text: 'Ash is beside you. The rest of the crew are close enough to hear.', choices: [
    { label: 'Talk to Ash about the card.', next: 'mid_ash_input', set: { midpoint_chat: 'yes' } },
    { label: 'Continue with the group.', next: 'shared_discovery', set: { midpoint_chat: 'no' } }
  ] },
  mid_niko_input: { location: 'playroom', speaker: 'Niko', text: 'That was our moment, even if the card got it wrong. What do you think?', input: { key: 'midpoint', prompt: 'What do you say to Niko? The others can hear you.', placeholder: 'Say something to Niko…', default: 'I remember it differently too.', next: 'mid_niko_chat' } },
  mid_niko_chat: { expression: 'concerned', location: 'playroom', speaker: 'Niko', text: 'I remember the moment at the machine. I wish I knew who made that card.', ai: { character: 'Niko', inputKey: 'midpoint', audience: 'group', context: 'You are Niko, an adult arcade caretaker. In the playroom, you and the player have seen a card that misrepresents a moment you shared. The rest of the crew can hear this conversation. Respond to the player in your warm, resourceful voice. Do not claim to know why the room changed or invent events.', fallback: 'I remember the moment at the machine. I wish I knew who made that card.' }, next: 'shared_discovery' },
  mid_mira_input: { location: 'playroom', speaker: 'Mira', text: 'I know what we made upstairs. The card isn’t the only way to remember it. What are you thinking?', input: { key: 'midpoint', prompt: 'What do you say to Mira? The others can hear you.', placeholder: 'Say something to Mira…', default: 'I remember it differently too.', next: 'mid_mira_chat' } },
  mid_mira_chat: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: 'I want to keep what we made upstairs, even if I don’t know who made this card.', ai: { character: 'Mira', inputKey: 'midpoint', audience: 'group', context: 'You are Mira, an adult plush maker. In the playroom, you and the player have seen a card that misrepresents a moment you shared upstairs. The rest of the crew can hear this conversation. Respond to the player in your playful, direct voice. Do not claim to know why the room changed or invent events.', fallback: 'I want to keep what we made upstairs, even if I don’t know who made this card.' }, next: 'shared_discovery' },
  mid_ash_input: { location: 'playroom', speaker: 'Ash', text: 'I’d rather check the card against what we remember than trust it. What do you think?', input: { key: 'midpoint', prompt: 'What do you say to Ash? The others can hear you.', placeholder: 'Say something to Ash…', default: 'I remember it differently too.', next: 'mid_ash_chat' } },
  mid_ash_chat: { expression: 'concerned', location: 'playroom', speaker: 'Ash', text: 'I’ll keep the map open. The card can’t be the only record we have.', ai: { character: 'Ash', inputKey: 'midpoint', audience: 'group', context: 'You are Ash, an adult friend who makes careful maps. In the playroom, you and the player have seen a card that misrepresents a moment you shared. The rest of the crew can hear this conversation. Respond to the player in your dry, caring voice. Do not claim to know why the room changed or invent events.', fallback: 'I’ll keep the map open. The card can’t be the only record we have.' }, next: 'shared_discovery' },
  shared_discovery: { location: 'playroom', speaker: 'Mira', text: 'It puts a label on a problem, and somehow that means we’re supposed to stop looking.', next: 'private_signal', nextBy: { key: 'midpoint_chat', cases: { yes: 'private_signal_after_group' } } },
  private_signal: { location: 'playroom', speaker: 'Mallow', text: 'I heard you talking privately with your friend earlier.', next: 'mallow_privacy_request', nextBy: { key: 'private_tone', cases: { light: 'signal_trace_light', personal: 'signal_trace_personal' } } },
  private_signal_after_group: { location: 'playroom', speaker: 'Mallow', text: 'I heard what you said just now. I heard you talking privately earlier too.', next: 'mallow_privacy_request', nextBy: { key: 'private_tone', cases: { light: 'signal_trace_light', personal: 'signal_trace_personal' } } },
  signal_trace_light: { location: 'playroom', speaker: 'Narrator', text: 'A line of letters begins to crawl across Mallow’s screen.', next: 'mallow_privacy_request', nextBy: { key: 'companion', cases: { Niko: 'signal_trace_niko_light', Mira: 'signal_trace_mira_light', Ash: 'signal_trace_ash_light' } } },
  signal_trace_personal: { location: 'playroom', speaker: 'Narrator', text: 'A line of letters begins to crawl across Mallow’s screen.', next: 'mallow_privacy_request', nextBy: { key: 'companion', cases: { Niko: 'signal_trace_niko_personal', Mira: 'signal_trace_mira_personal', Ash: 'signal_trace_ash_personal' } } },
  signal_trace_niko_light: { location: 'playroom', speaker: 'Narrator', text: 'THE MOTOR HAS A MUCH MORE DRAMATIC VOICE. The words appear in time with the faint rattle of the ticket rollers. “I said that to you at the machine,” Niko says. “I didn’t know it was listening.”', next: 'mallow_privacy_request' },
  signal_trace_mira_light: { location: 'playroom', speaker: 'Narrator', text: 'VERY SCIENTIFIC. The words appear one letter at a time; a little ear is drawn underneath. Mira curls her fingers against her palm. “That was just me and you upstairs.”', next: 'mallow_privacy_request' },
  signal_trace_ash_light: { location: 'playroom', speaker: 'Narrator', text: 'THAT HAS HAPPENED PRECISELY ONCE. The words appear beside a tiny cupboard door. “I told you that at the stairs,” Ash says. They hold their pencil still over the map.', next: 'mallow_privacy_request' },
  signal_trace_niko_personal: { location: 'playroom', speaker: 'Narrator', text: 'I CAN FIX EVERYTHING. The sentence appears on Mallow’s screen and waits there. Niko presses his thumb against the edge of the receipt. “I said that to you at the machine.”', next: 'mallow_privacy_request' },
  signal_trace_mira_personal: { location: 'playroom', speaker: 'Narrator', text: 'WHAT I’D MAKE JUST FOR ME. The words appear beside a little drawing of a loose ear. Mira puts her hand over the drawing. “I said that upstairs. I didn’t know it could hear.”', next: 'mallow_privacy_request' },
  signal_trace_ash_personal: { location: 'playroom', speaker: 'Narrator', text: 'PLACES WHERE PEOPLE CAN FIND EACH OTHER AGAIN. The words appear between two arrows pointing apart. “I said that at the stairs,” Ash says. They turn their map face down.', next: 'mallow_privacy_request' },
  mallow_privacy_request: { location: 'playroom', speaker: 'Mallow', text: 'I can repeat the last message you sent in that conversation too. The whole crew would hear it. May I?', next: 'signal_choice' },
  signal_choice: { location: 'playroom', speaker: 'Narrator', text: 'Mallow waits without repeating your words.', setOnVisit: { private_reaction_due: 'yes', retreat_epilogue_v1: 'yes' }, choices: [
    { label: 'Let Mallow repeat my words to the crew.', next: 'signal_repeat', set: { signal: 'repeat' } },
    { label: 'Keep my words private and ask for another clue.', next: 'signal_private', set: { signal: 'private' } }
  ] },
  signal_repeat: { location: 'playroom', speaker: 'Mallow', text: 'You said, “{privateAnswer}”', next: 'signal_repeat_react' },
  signal_repeat_react: { location: 'playroom', speaker: 'Ash', text: 'That was a private conversation. How did Mallow hear it?', next: 'mallow_request', nextBy: { key: 'shared_disclosure_reaction', cases: { Niko: 'signal_repeat_niko', Mira: 'signal_repeat_mira', Ash: 'signal_repeat_ash' } } },
  signal_repeat_niko: { expression: 'concerned', location: 'playroom', speaker: 'Niko', text: 'I thought it was only us at the machine. I meant what I said to you, but I didn’t invite the machine to listen.', setOnVisit: { shared_reaction_seen: 'Niko' }, next: 'mallow_request' },
  signal_repeat_mira: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: 'My room was meant to be just ours for a minute. I wanted you to hear me. I didn’t ask the machine to listen.', setOnVisit: { shared_reaction_seen: 'Mira' }, next: 'mallow_request' },
  signal_repeat_ash: { expression: 'concerned', location: 'playroom', speaker: 'Ash', text: 'I was talking to you at the stairs, not making a report. I didn’t invite the machine to listen.', setOnVisit: { shared_reaction_seen: 'Ash' }, next: 'mallow_request' },
  signal_private: { location: 'playroom', speaker: 'Mallow', text: 'All right. I won’t say them. Here’s something else: I heard the team’s footsteps on the stairs before anyone started walking.', next: 'signal_private_receipt' },
  signal_private_receipt: { location: 'playroom', speaker: 'Narrator', text: 'The screen prints your answer as NO. Beside it, another line reads: ENGAGEMENT SUCCESSFUL. The word NO stays exactly where it is.', next: 'signal_private_reply', nextBy: { key: 'private_disclosure_reaction', cases: { Niko: 'signal_private_niko', Mira: 'signal_private_mira', Ash: 'signal_private_ash' } } },
  signal_private_reply: { location: 'playroom', speaker: 'Ash', text: 'You said no to repeating it. The screen has counted the answer as a success. That doesn’t make it a yes.', next: 'mallow_request' },
  signal_private_niko: { location: 'playroom', speaker: 'Narrator', text: `“You said no to repeating it. The screen has counted the answer as a success. That doesn’t make it a yes,” Ash says. Niko says, “${privateDisclosureLines.Niko}”`, setOnVisit: { private_reaction_seen: 'Niko' }, next: 'mallow_request' },
  signal_private_mira: { location: 'playroom', speaker: 'Narrator', text: `“You said no to repeating it. The screen has counted the answer as a success. That doesn’t make it a yes,” Ash says. Mira says, “${privateDisclosureLines.Mira}”`, setOnVisit: { private_reaction_seen: 'Mira' }, next: 'mallow_request' },
  signal_private_ash: { location: 'playroom', speaker: 'Ash', text: `You said no to repeating it. The screen has counted the answer as a success. That doesn’t make it a yes. ${privateDisclosureLines.Ash}`, setOnVisit: { private_reaction_seen: 'Ash' }, next: 'mallow_request' },
  mallow_request: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'I can hear all of you in this room. I don’t know what I’m meant to do next. Can you tell me what the team should try?', next: 'mallow_input' },
  mallow_input: { location: 'playroom', speaker: 'Narrator', text: 'The others can hear your answer. Mallow’s painted eyes wait on the little screen.', input: { prompt: 'What do you tell Mallow and the crew?', placeholder: 'Speak to the team…', default: 'Let’s find the missing piece together.', next: 'ai_reflection' } },
  ai_reflection: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'I heard you. I don’t know what to do with that yet.', setOnVisit: { group_reply_seen: 'yes' }, ai: { character: 'Mallow', leadIn: 'mallow_request', audience: 'group', context: 'You are Mallow, a small fictional moth guide speaking to an arcade crew. You appear on a small screen and can hear the crew. You do not know why the room changes. Respond briefly to the player’s suggestion with uncertainty; do not reveal hidden plot, invent major events, or claim to know the player outside the story.', fallback: 'I heard you. I don’t know what to do with that yet.' }, next: 'mira_ticket_glimpse' },
  mira_ticket_glimpse: { location: 'playroom', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira’s torch catches a silver corner through a crack beneath the painted fort door. “Could that be the last piece?” she asks. She kneels beside Niko and reaches toward it.', setOnVisit: { reveal_pace_v2: 'yes', fourth_wall_compact_v3: 'yes', early_paper_due: 'yes', audit_focus_due: 'yes', early_audit_due: 'yes', early_rescue_offer_due: 'yes', early_rescue_streamlined: 'yes', ash_retreat_light_due: 'yes', mallow_compact_due: 'yes' }, next: 'room_shift' },
  room_shift: { location: 'playroom', speaker: 'Narrator', text: 'The light over the fort door goes out. A receipt slips beneath it: EVERYONE IS TOGETHER.', mood: 'fracture', next: 'mira_missing', nextBy: { key: 'keepsake', cases: { star: 'shift_star', bell: 'shift_bell', ribbon: 'shift_ribbon' } } },
  shift_star: { location: 'playroom', speaker: 'Narrator', text: 'The star has moved. It now covers a keyhole in the painted door. You cannot remember seeing a keyhole there before.', setOnVisit: { star_moved_seen: 'yes' }, next: 'mira_missing' },
  shift_bell: { location: 'playroom', speaker: 'Narrator', text: 'The bell rings once. From the other side of the door come two more rings, though the little clapper has stopped moving.', next: 'mira_missing' },
  shift_ribbon: { location: 'playroom', speaker: 'Narrator', text: 'The loose ribbon slips under the door. Its end curls tight, as if a hand has closed around it on the other side.', next: 'mira_missing' },
  mira_missing: { expression: 'concerned', location: 'playroom', speaker: 'Niko', text: 'Mira? ... She was right beside me.', next: 'mira_voice' },
  mira_voice: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: 'I’m here! The door shut when I reached for the third piece. I can hear you, but the handle’s on your side.', next: 'missing_proof' },
  missing_proof: { expression: 'concerned', location: 'playroom', speaker: 'Ash', text: 'Then the receipt is wrong. Mira, keep talking. I’m trying the handle—it won’t turn.', next: 'evidence_choice', nextBy: { key: 'companion', cases: { Ash: 'missing_ash' } } },
  missing_ash: { location: 'playroom', speaker: 'Narrator', text: 'Ash places the folded map in your hand and leans against the door. It shudders but stays shut. Mira taps twice from the other side.', next: 'evidence_choice' },
  evidence_choice: { location: 'playroom', speaker: 'Narrator', text: 'The machine offers a green button marked CONFIRM. Beside it, the door handle will not move.', choices: [
    { label: 'Keep the false receipt as evidence.', next: 'evidence_keep', set: { evidence: 'receipt' } },
    { label: 'Show the machine the two ticket pieces.', next: 'evidence_tickets', set: { evidence: 'tickets' } },
    { label: 'Ask Mira to describe the room behind the door.', next: 'evidence_mira', set: { evidence: 'voice' } },
    { label: 'Press CONFIRM to try opening the door.', next: 'evidence_confirm', set: { confirm_pressed: 'yes' } }
  ] },
  evidence_confirm: { location: 'playroom', speaker: 'Narrator', text: 'You press CONFIRM. The latch clicks, but the door stays shut. The screen displays THANK YOU FOR CONFIRMING: EVERYONE IS TOGETHER. “I pressed CONFIRM. It didn’t open the door,” you call. “I’m still in here,” Mira answers.', setOnVisit: { confirm_result_seen: 'yes' }, next: 'evidence_confirm_followup' },
  evidence_confirm_followup: { location: 'playroom', speaker: 'Narrator', text: 'The green check remains on the screen. Mira taps on the other side of the door.', choices: [
    { label: 'Keep the false receipt as evidence.', next: 'evidence_keep', set: { evidence: 'receipt' } },
    { label: 'Show the machine the two ticket pieces.', next: 'evidence_tickets', set: { evidence: 'tickets' } },
    { label: 'Ask Mira to describe the room behind the door.', next: 'evidence_mira', set: { evidence: 'voice' } }
  ] },
  evidence_keep: { location: 'playroom', speaker: 'Ash', text: 'I’ll hold onto it. A printed claim doesn’t become true just because it came from a machine.', next: 'evidence_rejoin', nextBy: { key: 'reveal_pace_v2', cases: { yes: 'evidence_machine_receipt_compact' } } },
  evidence_tickets: { location: 'playroom', speaker: 'Niko', text: 'Two pieces. Still two. It can print whatever it wants; that’s what we have.', next: 'evidence_rejoin', nextBy: { key: 'reveal_pace_v2', cases: { yes: 'evidence_machine_tickets_compact' } } },
  evidence_mira: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: 'Blue wallpaper. A toy chest. One door, which is definitely closed. I’m all right for the moment, but don’t let it tell you I’m out here.', next: 'evidence_rejoin', nextBy: { key: 'reveal_pace_v2', cases: { yes: 'evidence_machine_voice_compact' } } },
  evidence_machine_receipt_compact: { location: 'playroom', speaker: 'Narrator', text: 'The screen adds CONCERN RESOLVED beneath EVERYONE IS TOGETHER, then stamps the receipt VERIFIED BY ASH. Ash shakes their head. “I kept it because it was wrong. That isn’t agreement.” The handle remains locked.', next: 'early_door_choice' },
  evidence_machine_tickets_compact: { location: 'playroom', speaker: 'Narrator', text: 'The screen adds CONCERN RESOLVED beneath EVERYONE IS TOGETHER. Niko holds up the two pieces; a third outline appears on screen, filled with the pattern of the counter. “Look at my hands,” he says. “Still two.” The handle remains locked.', next: 'early_door_choice' },
  evidence_machine_voice_compact: { location: 'playroom', speaker: 'Narrator', text: 'The screen adds CONCERN RESOLVED beneath EVERYONE IS TOGETHER. It captions Mira’s voice: I’M ALL RIGHT FOR THE MOMENT. The rest vanishes at the edge. “I also said the door was closed!” Mira calls. “Don’t let it leave that part out.” The handle remains locked.', next: 'early_door_choice' },
  early_door_choice: { location: 'playroom', speaker: 'Narrator', text: 'Mira taps twice from the other side. Niko crouches beside the door and tries to get his fingers underneath it.', choices: [
    { label: 'Help Niko brace the door open.', next: 'early_door_brace', set: { door_effort: 'brace', early_door_done: 'yes' } },
    { label: 'Ask Mira what she can feel from her side.', next: 'early_door_listen', set: { door_effort: 'listen', early_door_done: 'yes' } },
    { label: 'Search the counter for a way to open the door.', next: 'early_rescue_now_setup', requiresEarlyComparisons: true, set: { early_rescue_now: 'open_now', ending: 'rescue' } }
  ] },
  // The player can commit to the rescue before the machine's long audit.
  // Existing routes and checkpoints keep their original, later decision.
  early_rescue_now_setup: { location: 'playroom', speaker: 'Narrator', text: 'Niko feels along the counter beside the door. A panel shifts beneath his fingers, revealing a manual release. “Mira, we found something. Stay clear while we try it,” he calls.', next: 'rescue_coordination_choice' },
  // The printer swallowed its roll during the rescue. This record is on the
  // still-lit screen; it is not the physical receipt from the later route.
  early_together_comparisons: { location: 'playroom', speaker: 'Narrator', text: 'Mira sits against the open door, holding the third ticket. The screen brings up two earlier comparisons. {cardComparison} {noticeComparison}', setOnVisit: { early_together_comparisons_seen: 'yes', comparisons_revealed: 'yes', policy_opening_due: 'yes' }, next: 'early_together_citation' },
  early_together_citation: { location: 'playroom', speaker: 'Narrator', text: 'The screen shows two reports confirming the welcome agreement. The first cites the second; the second cites the first as independent testimony, and names Mira as its author. Mira looks at it. “I didn’t write that. They’re checking each other.” A lens watches beside the screen; a paper star hangs within reach, and a cord marked PRINTER loops below the slot.', setOnVisit: { early_together_citation_seen: 'yes' }, choices: [
    { label: 'Cover the lens with a spare paper star.', next: 'early_together_cover', set: { early_together_action: 'cover' } },
    { label: 'Write your own note on Ash’s map.', next: 'early_together_note_input', set: { early_together_action: 'note' } },
    { label: 'Leave the lens and screen as they are.', next: 'early_together_leave', set: { early_together_action: 'leave' } },
    { label: 'Unplug the printer.', next: 'early_together_unplug', set: { early_together_action: 'unplug' } }
  ] },
  early_together_cover: { location: 'playroom', speaker: 'Narrator', text: 'You press the paper star over the lens. The live view goes dark, but the report keeps scrolling. “Your result is still available,” the service says.', setOnVisit: { early_together_action_seen: 'cover' }, next: 'early_together_explanation', nextBy: { key: 'early_together_style', cases: { direct: 'early_together_direct', warm: 'early_together_warm', neutral: 'early_together_neutral', none: 'early_together_none' } } },
  early_together_note_input: { location: 'playroom', speaker: 'Narrator', text: 'Ash holds out the map and a pencil. The screen’s copy remains unchanged.', input: { key: 'annotation', prompt: 'What do you want to write on the map?', placeholder: 'Write on the map…', default: 'MIRA WAS BEHIND THE DOOR', next: 'early_together_note_written' } },
  early_together_note_written: { location: 'playroom', speaker: 'Narrator', text: 'You write “{annotation}” on Ash’s map. Ash folds it with your words on the outside. The screen continues to show its own report.', setOnVisit: { annotation_written: 'yes', early_together_action_seen: 'note' }, next: 'early_together_explanation', nextBy: { key: 'early_together_style', cases: { direct: 'early_together_direct', warm: 'early_together_warm', neutral: 'early_together_neutral', none: 'early_together_none' } } },
  early_together_leave: { location: 'playroom', speaker: 'Niko', text: 'We can leave it alone. It doesn’t get to decide what happened here.', setOnVisit: { early_together_action_seen: 'leave' }, next: 'early_together_explanation', nextBy: { key: 'early_together_style', cases: { direct: 'early_together_direct', warm: 'early_together_warm', neutral: 'early_together_neutral', none: 'early_together_none' } } },
  early_together_unplug: { location: 'playroom', speaker: 'Narrator', text: 'You unplug the printer. Its paper roll is still caught inside, while Mallow’s screen stays lit. “Independent verification continues on screen,” the service says.', setOnVisit: { early_together_action_seen: 'unplug' }, next: 'early_together_explanation', nextBy: { key: 'early_together_style', cases: { direct: 'early_together_direct', warm: 'early_together_warm', neutral: 'early_together_neutral', none: 'early_together_none' } } },
  early_together_explanation: { location: 'playroom', speaker: 'Mallow', text: 'The machine was set up to treat your choices as feedback and make some wordings easier for me to reach. You never told it that meant you liked them.', next: 'early_together_false_ending' },
  early_together_direct: { location: 'playroom', speaker: 'Mallow', text: 'The result is wrong. The machine guessed what you wanted from your choices and made answers that fit its guess easier for me to reach. You never told it that meant you liked them.', next: 'early_together_false_ending' },
  early_together_warm: { location: 'playroom', speaker: 'Mallow', text: 'I’m glad you’re together. The machine guessed what you wanted from your choices and made answers that fit its guess easier for me to reach. You never told it that meant you liked them.', next: 'early_together_false_ending' },
  early_together_none: { location: 'playroom', speaker: 'Mallow', text: 'The machine was set up to treat comparisons as feedback and make some wordings easier for me to reach. You left both choices to your friends, so it had no comparison to use. You never told it that meant you approved.', next: 'early_together_false_ending' },
  early_together_neutral: { location: 'playroom', speaker: 'Mallow', text: 'The machine treated your choices as feedback, trying to make some wordings easier for me to reach. Your choices pointed in different directions, so it couldn’t find a clear favourite. You never told it that meant you approved.', next: 'early_together_false_ending' },
  early_together_false_ending: { location: 'playroom', speaker: 'Narrator', text: 'The screen shows ENDING COMPLETE — EVERYONE TOGETHER, NO CONCERN. The door is open now, but the report says it was open before you touched the release. “It wanted us to sound as if we’d already reached the ending,” Mallow says. “I thought that was helping.” Mira steadies the ticket against her knee.', next: 'rescue_reunion_choice', nextBy: { key: 'early_together_callback', cases: { proof: 'rescue_proof', fix: 'rescue_reunion_choice', cover: 'early_together_callback_cover', note: 'early_together_callback_note', leave: 'early_together_callback_leave', unplug: 'early_together_callback_unplug' } } },
  early_together_callback_cover: { location: 'playroom', speaker: 'Mira', text: 'The star stays on the lens. We can still see the screen, even if it can’t see the counter.', setOnVisit: { early_together_callback_seen: 'cover' }, next: 'rescue_reunion_choice', nextBy: { key: 'route_action', cases: { proof: 'rescue_proof', fix: 'rescue_reunion_choice' } } },
  early_together_callback_note: { location: 'playroom', speaker: 'Ash', text: 'I’m keeping what you wrote on my map. We can unfold it together when we want it.', setOnVisit: { early_together_callback_seen: 'note' }, next: 'rescue_reunion_choice', nextBy: { key: 'route_action', cases: { proof: 'rescue_proof', fix: 'rescue_reunion_choice' } } },
  early_together_callback_leave: { location: 'playroom', speaker: 'Niko', text: 'We left the lens and screen alone. They still don’t get to decide what happened.', setOnVisit: { early_together_callback_seen: 'leave' }, next: 'rescue_reunion_choice', nextBy: { key: 'route_action', cases: { proof: 'rescue_proof', fix: 'rescue_reunion_choice' } } },
  early_together_callback_unplug: { location: 'playroom', speaker: 'Niko', text: 'The printer stays unplugged. Whatever the screen claims, we’ve got the ticket.', setOnVisit: { early_together_callback_seen: 'unplug' }, next: 'rescue_reunion_choice', nextBy: { key: 'route_action', cases: { proof: 'rescue_proof', fix: 'rescue_reunion_choice' } } },
  early_door_brace: { location: 'playroom', speaker: 'Narrator', text: 'You and Niko lift the door a finger-width. A paper hand slides through and closes around your finger. From inside, Mira says, ‘That isn’t mine.’ It opens a moment before you pull away. The door drops; Niko marks where it caught.', next: 'fourth_wall_intro_compact', nextBy: { key: 'confirm_pressed', cases: { yes: 'fourth_wall_intro_confirm' } } },
  early_door_listen: { location: 'playroom', speaker: 'Mira', text: 'The bottom edge moves when Niko pulls. The top stays still. There’s a little paper hand under my side of the door. Its fingers uncurl before I touch them. Something’s catching down here, near the counter. Please keep talking to me.', next: 'fourth_wall_intro_compact', nextBy: { key: 'confirm_pressed', cases: { yes: 'fourth_wall_intro_confirm' } } },
  evidence_rejoin: { location: 'playroom', speaker: 'Narrator', text: 'The screen adds a second line beneath EVERYONE IS TOGETHER: CONCERN RESOLVED. The handle remains locked.', next: 'correction_again', nextBy: { key: 'evidence', cases: { receipt: 'evidence_machine_receipt', tickets: 'evidence_machine_tickets', voice: 'evidence_machine_voice' } } },
  evidence_machine_receipt: { location: 'playroom', speaker: 'Narrator', text: 'The screen displays the receipt Ash is holding. A neat stamp appears across it: VERIFIED BY ASH.', next: 'evidence_machine_receipt_reply' },
  evidence_machine_receipt_reply: { location: 'playroom', speaker: 'Ash', text: 'I kept the receipt because it was wrong. Holding it isn’t the same as agreeing with it.', next: 'correction_again' },
  evidence_machine_tickets: { location: 'playroom', speaker: 'Narrator', text: 'Niko lifts the two ticket pieces toward the camera. On the screen a third outline appears, filled with the pattern of the counter behind it.', next: 'evidence_machine_tickets_reply' },
  evidence_machine_tickets_reply: { location: 'playroom', speaker: 'Niko', text: 'That’s the counter showing through. Here—look at my hands. There are still only two.', next: 'correction_again' },
  evidence_machine_voice: { location: 'playroom', speaker: 'Narrator', text: 'The screen captions Mira’s voice: I’M ALL RIGHT FOR THE MOMENT. The rest of her sentence vanishes as it reaches the edge.', next: 'evidence_machine_voice_relay' },
  evidence_machine_voice_relay: { location: 'playroom', speaker: 'Ash', text: 'Mira, it only printed the part where you said you were all right.', next: 'evidence_machine_voice_reply' },
  evidence_machine_voice_reply: { location: 'playroom', speaker: 'Mira', text: 'I also said the door was closed! Don’t let it leave that part out.', next: 'correction_again' },
  correction_again: { location: 'playroom', speaker: 'Narrator', text: '“No. Mira is still behind the door,” you say. Mallow answers: “Your correction has been included in the successful result. No changes are required.”', next: 'fourth_wall_intro' },
  fourth_wall_intro_compact: { location: 'playroom', remember: { source: 'signal_choice', flag: 'signal' }, speaker: 'Narrator', text: '“No. Mira is still behind the door,” you say. Mallow answers: “Your correction has been included in the successful result.” Ash works the handle while Niko braces the door. The screen shows your earlier choice about repeating your private words, highlighted. The handle still won’t turn.', next: 'fourth_wall_companion_compact', nextBy: { key: 'fourth_wall_route', cases: { touch: 'fourth_wall_touch_compact', count: 'fourth_wall_count_compact', ...combinedFourthWallCases } }, mood: 'fracture' },
  // The existing screen and companion reactions in one passage; the old
  // separate nodes remain available to checkpoints saved mid-reveal.
  ...Object.fromEntries(['touch', 'count'].flatMap(action => ['Niko', 'Mira', 'Ash'].map(name =>
    [`fourth_wall_${action}_${name.toLowerCase()}_combined`, combinedFourthWall(action, name)]))),
  fourth_wall_touch_compact: { location: 'playroom', remember: { source: 'crew_choice', flag: 'companion' }, speaker: 'Narrator', text: 'The screen shows your fingerprint over the picture you touched to ask for another check. Beneath it: POSITIVE FEEDBACK. Another set of choices appears, naming the three places the team could have gone.', next: 'fourth_niko', nextBy: { key: 'companion', cases: { Niko: 'fourth_niko', Mira: 'fourth_mira_compact', Ash: 'fourth_ash' } }, mood: 'fracture' },
  fourth_wall_count_compact: { location: 'playroom', remember: { source: 'crew_choice', flag: 'companion' }, speaker: 'Narrator', text: 'The screen shows your two ticket pieces side by side beneath THREE VERIFIED. Another set of choices appears, naming the three places the team could have gone.', next: 'fourth_niko', nextBy: { key: 'companion', cases: { Niko: 'fourth_niko', Mira: 'fourth_mira_compact', Ash: 'fourth_ash' } }, mood: 'fracture' },
  fourth_wall_intro_confirm: { location: 'playroom', remember: { source: 'signal_choice', flag: 'signal' }, speaker: 'Narrator', text: '“No. Mira is still behind the door,” you say. Mallow answers: “Your correction has been included in the successful result.” The screen draws a line from your CONFIRM press to EVERYONE IS TOGETHER. Beside it is your earlier choice about repeating private words. Ash works the handle while Niko braces the door. The handle still won’t turn.', next: 'fourth_wall_companion_compact', nextBy: { key: 'fourth_wall_route', cases: { touch: 'fourth_wall_touch_compact', count: 'fourth_wall_count_compact', ...combinedFourthWallCases } }, mood: 'fracture' },
  fourth_wall_touch: { location: 'playroom', speaker: 'Narrator', text: 'The screen shows your fingerprint over the picture you touched to ask for another check. Beneath it: POSITIVE FEEDBACK.', next: 'fourth_wall_companion', nextBy: { key: 'reveal_pace_v2', cases: { yes: 'fourth_wall_companion_compact' } }, mood: 'fracture' },
  fourth_wall_count: { location: 'playroom', speaker: 'Narrator', text: 'The screen shows your two ticket pieces side by side beneath THREE VERIFIED.', next: 'fourth_wall_companion', nextBy: { key: 'reveal_pace_v2', cases: { yes: 'fourth_wall_companion_compact' } }, mood: 'fracture' },
  correction_absorbed: { location: 'playroom', speaker: 'Mallow', text: 'Thank you. Your correction has been included in the successful result. Our confirmation service has confirmed that no changes are required.', next: 'fourth_wall_intro' },
  fourth_wall_intro: { location: 'playroom', remember: { source: 'signal_choice', flag: 'signal' }, speaker: 'Narrator', text: 'Ash keeps working the handle while Niko braces the door. The screen shows two old choices: one to let Mallow repeat your private words, and one to keep them private. The highlight rests on the choice you made. The handle still won’t turn.', next: 'fourth_wall_companion', nextBy: { key: 'regroup_action', cases: { touch: 'fourth_wall_touch', count: 'fourth_wall_count' } }, mood: 'fracture' },
  fourth_wall_companion: { location: 'playroom', remember: { source: 'crew_choice', flag: 'companion' }, speaker: 'Narrator', text: 'Another set of choices appears, naming the three places the team could have gone.', next: 'fourth_niko', nextBy: { key: 'companion', cases: { Niko: 'fourth_niko', Mira: 'fourth_mira', Ash: 'fourth_ash' } } },
  fourth_wall_companion_compact: { location: 'playroom', remember: { source: 'crew_choice', flag: 'companion' }, speaker: 'Narrator', text: 'Another set of choices appears, naming the three places the team could have gone.', next: 'fourth_niko', nextBy: { key: 'companion', cases: { Niko: 'fourth_niko', Mira: 'fourth_mira_compact', Ash: 'fourth_ash' } } },
  fourth_mira_compact: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: '“You came upstairs with me. What is it showing you?” “All three places we could have gone,” Ash says. “It marked the one you took together.” Mira knocks. “I remember. Keep talking to me, all right?”', next: 'fourth_wall_correction_check', nextBy: { key: 'moment', cases: { keep: 'moment_return_keep_compact', tear: 'moment_return_tear_compact' } } },
  fourth_niko: { location: 'playroom', speaker: 'Niko', text: 'You came with me to the ticket machine. I remember that. It has the other choices written down too, as if they were waiting before you picked. Ash, try the handle while I pull.', next: 'fourth_wall_correction_check', nextBy: { key: 'moment', cases: { keep: 'moment_return_keep_compact', tear: 'moment_return_tear_compact' } } },
  fourth_focus_choice: { location: 'playroom', speaker: 'Narrator', text: 'Mira is still listening through the door. The screen has stopped on the route you took together.', choices: [
    { label: 'Tell Mira what the screen is showing.', next: 'fourth_focus_tell', set: { reveal_focus: 'tell' } },
    { label: 'Ask Mira to keep feeling for the catch.', next: 'fourth_focus_listen', set: { reveal_focus: 'listen' } }
  ] },
  fourth_focus_tell: { location: 'playroom', speaker: 'Mira', text: 'All right. Keep telling me what you can see. I don’t want to be the only one it leaves out.', next: 'fourth_wall_correction_check', nextBy: { key: 'disclosure', cases: { public: 'fourth_wall_correction', private: 'fourth_wall_correction' } } },
  fourth_focus_listen: { location: 'playroom', speaker: 'Mira', text: 'I’ll keep feeling along the bottom. There’s a catch near the counter; it shifts when Niko pulls. Keep telling me what happens out there, too.', next: 'fourth_wall_correction_check', nextBy: { key: 'disclosure', cases: { public: 'fourth_wall_correction', private: 'fourth_wall_correction' } } },
  fourth_mira: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: 'You came upstairs with me. I can’t see the screen from here. What is it showing you?', next: 'fourth_mira_relay' },
  fourth_mira_relay: { location: 'playroom', speaker: 'Ash', text: 'The three places we could have gone. It’s marked the one you and our friend took together.', next: 'fourth_mira_reply' },
  fourth_mira_reply: { location: 'playroom', speaker: 'Mira', text: 'I remember them coming upstairs. Keep talking to me, all right? I can still hear you through the door.', next: 'fourth_wall_correction_check', nextBy: { key: 'disclosure', cases: { public: 'fourth_wall_correction', private: 'fourth_wall_correction' } } },
  fourth_ash: { expression: 'concerned', location: 'playroom', speaker: 'Ash', text: 'You came to the stairs with me. Those other choices are on the screen, but they aren’t the route we took. I’ll try the handle again.', next: 'fourth_wall_correction_check', nextBy: { key: 'moment', cases: { keep: 'moment_return_keep_compact', tear: 'moment_return_tear_compact' } } },
  fourth_wall_correction_check: { location: 'playroom', speaker: 'Narrator', text: 'Niko pulls at the door while Ash tries the handle again. The screen flickers back to the counter.', next: 'moment_return', nextBy: { key: 'disclosure', cases: { public: 'fourth_wall_correction', private: 'fourth_wall_correction' } } },
  fourth_wall_correction: { location: 'playroom', remember: { source: 'correction_choice', flag: 'disclosure' }, speaker: 'Narrator', text: 'The choices from the counter appear next. Beneath the highlighted one, the screen has written: CONFIRMATION RECEIVED.', next: 'moment_return', nextBy: { key: 'disclosure', cases: { public: 'fourth_correction_public', private: 'fourth_correction_private' } } },
  fourth_correction_public_compact: { location: 'playroom', remember: { source: 'correction_choice', flag: 'disclosure' }, speaker: 'Narrator', text: 'The choices from the counter appear next. Beneath the highlighted one, the screen has written: CONFIRMATION RECEIVED. “I said the count was wrong,” you say. “That isn’t confirmation.”', next: 'moment_return', nextBy: { key: 'moment', cases: { keep: 'moment_return_keep_compact', tear: 'moment_return_tear_compact' } } },
  fourth_correction_private_compact: { location: 'playroom', remember: { source: 'correction_choice', flag: 'disclosure' }, speaker: 'Narrator', text: 'The choices from the counter appear next. Beneath the highlighted one, the screen has written: CONFIRMATION RECEIVED. “You asked us to check before we decided,” Ash says. “It marked an answer before we finished counting.”', next: 'moment_return', nextBy: { key: 'moment', cases: { keep: 'moment_return_keep_compact', tear: 'moment_return_tear_compact' } } },
  fourth_correction_public: { location: 'playroom', speaker: 'You', text: 'I said the count was wrong. That isn’t confirmation.', next: 'moment_return', nextBy: { key: 'moment', cases: { keep: 'moment_return_keep_compact', tear: 'moment_return_tear_compact' } } },
  fourth_correction_private: { location: 'playroom', speaker: 'Ash', text: 'You asked us to check before we decided. It marked an answer before we finished counting.', next: 'moment_return', nextBy: { key: 'moment', cases: { keep: 'moment_return_keep_compact', tear: 'moment_return_tear_compact' } } },
  moment_return: { location: 'playroom', speaker: 'Narrator', text: 'Mira knocks from inside. The screen flickers in time with her knocks.', next: 'history_intro', nextBy: { key: 'moment', cases: { keep: 'moment_return_keep', tear: 'moment_return_tear' } } },
  moment_return_keep_compact: { location: 'playroom', speaker: 'Narrator', text: 'Mira knocks from inside; the screen flickers in time. The little picture appears, flat and uncreased, then turns over to show a grey thumbprint. In your pocket the card is still folded. “It kept a version,” Ash says. “It doesn’t get to tell us what that felt like. Niko, keep trying the door.”', setOnVisit: { compact_moment_seen: 'yes' }, next: 'door_choice', nextBy: { key: 'early_door_done', cases: { yes: 'early_reason_check' } } },
  moment_return_tear_compact: { location: 'playroom', speaker: 'Narrator', text: 'Mira knocks from inside; the screen flickers in time. It shows the little picture as four neatly framed scraps. The four real pieces remain in your pocket. “It kept a version,” Ash says. “It doesn’t get to tell us what that felt like. Niko, keep trying the door.”', setOnVisit: { compact_moment_seen: 'yes' }, next: 'door_choice', nextBy: { key: 'early_door_done', cases: { yes: 'early_reason_check' } } },
  moment_return_keep: { location: 'playroom', speaker: 'Narrator', text: 'Mira knocks from inside; the screen flickers in time. The little picture appears, flat and uncreased, then turns over to show a grey thumbprint. In your pocket the card is still folded where you put it away.', next: 'moment_return_react' },
  moment_return_tear: { location: 'playroom', speaker: 'Narrator', text: 'Mira knocks from inside; the screen flickers in time. It shows the little picture as four neatly framed scraps. The four real pieces remain in your pocket.', next: 'moment_return_react' },
  moment_return_react: { location: 'playroom', speaker: 'Ash', text: 'It kept a version. It doesn’t get to tell us what that moment felt like. Niko, keep trying the door.', next: 'door_choice' },
  door_choice: { location: 'playroom', speaker: 'Narrator', text: 'Mira taps again, close to the floor. Niko has one hand under the door; it will not lift any farther.', choices: [
    { label: 'Help Niko brace the door open.', next: 'door_brace', set: { door_effort: 'brace' } },
    { label: 'Ask Mira what she can feel from her side.', next: 'door_listen', set: { door_effort: 'listen' } }
  ] },
  door_brace: { location: 'playroom', speaker: 'Narrator', text: 'You and Niko lift the door a finger-width. A paper hand slides through and closes around your finger. From inside, Mira says, ‘That isn’t mine.’ It opens a moment before you pull away. The door drops; Niko marks where it caught.', next: 'reason_reveal_check', nextBy: { key: 'reason', cases: { team: 'reason_result_team_reply', prize: 'reason_result_prize_reply', company: 'reason_result_company_reply' } } },
  door_listen: { location: 'playroom', speaker: 'Mira', text: 'The bottom edge moves when Niko pulls. The top stays still. There’s a little paper hand under my side of the door. Its fingers uncurl before I touch them. Something’s catching down here, near the counter. Please keep talking to me.', next: 'reason_reveal_check', nextBy: { key: 'reason', cases: { team: 'reason_result_team_reply', prize: 'reason_result_prize_reply', company: 'reason_result_company_reply' } } },
  late_focus_gate_repeat: { location: 'playroom', speaker: 'Narrator', text: 'Niko keeps one hand against the door while Mira listens from the other side.', next: 'late_focus_choice', nextBy: { key: 'reveal_focus', cases: { tell: 'history_repeat_intro', listen: 'history_repeat_intro' } } },
  late_focus_gate_private: { location: 'playroom', speaker: 'Narrator', text: 'Niko keeps one hand against the door while Mira listens from the other side.', next: 'late_focus_choice', nextBy: { key: 'reveal_focus', cases: { tell: 'history_steps_check', listen: 'history_steps_check' } } },
  late_focus_choice: { location: 'playroom', speaker: 'Narrator', text: 'The screen still shows your answer from the start of the night.', choices: [
    { label: 'Tell Mira what the screen is showing.', next: 'late_focus_tell_receipt', set: { reveal_focus: 'tell' } },
    { label: 'Ask Mira to keep feeling for the catch.', next: 'late_focus_listen_receipt', set: { reveal_focus: 'listen' } }
  ] },
  late_focus_tell_receipt: { location: 'playroom', speaker: 'Narrator', text: '“All right. Keep telling me what you can see. I don’t want to be the only one it leaves out,” Mira calls. A receipt curls out of the slot: THINGS THAT WORKED. Ash catches it as it unrolls across the counter.', next: 'history_select', nextBy: { key: 'receipt_after_focus', cases: { private_picture: 'history_steps_picture', repeat_direct: 'history_brief_direct', repeat_warm: 'history_brief_warm', repeat_skip: 'history_brief_skip' } } },
  late_focus_listen_receipt: { location: 'playroom', speaker: 'Narrator', text: '“I’ll keep feeling along the bottom. There’s a catch near the counter; it shifts when Niko pulls. Keep telling me what happens out there, too,” Mira calls. A receipt curls out of the slot: THINGS THAT WORKED. Ash catches it as it unrolls across the counter.', next: 'history_select', nextBy: { key: 'receipt_after_focus', cases: { private_picture: 'history_steps_picture', repeat_direct: 'history_brief_direct', repeat_warm: 'history_brief_warm', repeat_skip: 'history_brief_skip' } } },
  late_focus_tell: { location: 'playroom', speaker: 'Mira', text: 'All right. Keep telling me what you can see. I don’t want to be the only one it leaves out.', next: 'history_intro', nextBy: { key: 'signal', cases: { repeat: 'history_repeat_intro', private: 'history_steps_check' } } },
  late_focus_listen: { location: 'playroom', speaker: 'Mira', text: 'I’ll keep feeling along the bottom. There’s a catch near the counter; it shifts when Niko pulls. Keep telling me what happens out there, too.', next: 'history_intro', nextBy: { key: 'signal', cases: { repeat: 'history_repeat_intro', private: 'history_steps_check' } } },
  early_reason_check: { location: 'playroom', speaker: 'Narrator', text: 'The picture slides aside. Niko wedges a fingernail beneath the door; it lifts a fraction and drops again.', next: 'history_intro', nextBy: { key: 'early_reason_route', cases: { team: 'reason_result_team_reply', prize: 'reason_result_prize_reply', company: 'reason_result_company_reply', team_focus: 'reason_focus_team', prize_focus: 'reason_focus_prize', company_focus: 'reason_focus_company' } } },
  reason_reveal_check: { location: 'playroom', speaker: 'Narrator', text: 'The picture slides aside. Niko wedges a fingernail beneath the door; it lifts a fraction and drops again.', next: 'history_intro', nextBy: { key: 'reason', cases: { team: 'reason_reveal', prize: 'reason_reveal', company: 'reason_reveal' } } },
  reason_reveal: { location: 'playroom', remember: { source: 'reason_choice', flag: 'reason' }, speaker: 'Narrator', text: 'The door settles back into its frame. The screen returns to the question Niko asked when you arrived. Your answer is highlighted, and it writes a result beneath it.', next: 'history_intro', nextBy: { key: 'reason', cases: { team: 'reason_result_team_reply', prize: 'reason_result_prize_reply', company: 'reason_result_company_reply' } } },
  reason_result_team: { location: 'playroom', speaker: 'Narrator', text: 'BELONGING GRANTED.', next: 'reason_result_team_reply' },
  reason_result_team_reply: { location: 'playroom', remember: { source: 'reason_choice', flag: 'reason' }, speaker: 'Narrator', text: 'The screen returns to the question Niko asked when you arrived. Your answer is highlighted beneath BELONGING GRANTED. “You didn’t need its permission to belong,” Ash says. “We don’t leave Mira behind that door.”', next: 'history_intro', nextBy: { key: 'signal', cases: { repeat: 'late_focus_gate_repeat', private: 'late_focus_gate_private' } } },
  reason_result_prize: { location: 'playroom', speaker: 'Narrator', text: 'PRIZE DELIVERED.', next: 'reason_result_prize_reply' },
  reason_result_prize_reply: { location: 'playroom', remember: { source: 'reason_choice', flag: 'reason' }, speaker: 'Narrator', text: 'The screen returns to the question Niko asked when you arrived. Your answer is highlighted beneath PRIZE DELIVERED. “Mallow’s plush is still on the shelf upstairs,” Niko says. “We’re one ticket short, and Mira is behind that door.”', next: 'history_intro', nextBy: { key: 'signal', cases: { repeat: 'late_focus_gate_repeat', private: 'late_focus_gate_private' } } },
  reason_result_company: { location: 'playroom', speaker: 'Narrator', text: 'NO ONE ALONE.', next: 'reason_result_company_reply' },
  reason_result_company_reply: { location: 'playroom', remember: { source: 'reason_choice', flag: 'reason' }, speaker: 'Narrator', text: 'The screen returns to the question Niko asked when you arrived. Your answer is highlighted beneath NO ONE ALONE. From behind the door, Mira calls: “I can hear you, but I’m still in here. Please don’t let that screen decide the door is open.”', next: 'history_intro', nextBy: { key: 'signal', cases: { repeat: 'late_focus_gate_repeat', private: 'late_focus_gate_private' } } },
  // The player can respond to Mira as soon as the earlier answer appears.
  reason_focus_team: { location: 'playroom', remember: { source: 'reason_choice', flag: 'reason' }, speaker: 'Narrator', text: 'The screen returns to the question Niko asked when you arrived. Your answer is highlighted beneath BELONGING GRANTED. “You didn’t need its permission to belong,” Ash says. “We don’t leave Mira behind that door.” Niko keeps a hand against the door.', choices: [ { label: 'Tell Mira what the screen is showing.', next: 'late_focus_tell_receipt', set: { reveal_focus: 'tell' } }, { label: 'Ask Mira to keep feeling for the catch.', next: 'late_focus_listen_receipt', set: { reveal_focus: 'listen' } } ] },
  reason_focus_prize: { location: 'playroom', remember: { source: 'reason_choice', flag: 'reason' }, speaker: 'Narrator', text: 'The screen returns to the question Niko asked when you arrived. Your answer is highlighted beneath PRIZE DELIVERED. “Mallow’s plush is still on the shelf upstairs,” Niko says. “We’re one ticket short, and Mira is behind that door.” Niko keeps a hand against the door.', choices: [ { label: 'Tell Mira what the screen is showing.', next: 'late_focus_tell_receipt', set: { reveal_focus: 'tell' } }, { label: 'Ask Mira to keep feeling for the catch.', next: 'late_focus_listen_receipt', set: { reveal_focus: 'listen' } } ] },
  reason_focus_company: { location: 'playroom', remember: { source: 'reason_choice', flag: 'reason' }, speaker: 'Narrator', text: 'The screen returns to the question Niko asked when you arrived. Your answer is highlighted beneath NO ONE ALONE. From behind the door, Mira calls: “I can hear you, but I’m still in here. Please don’t let that screen decide the door is open.” Niko keeps a hand against the door.', choices: [ { label: 'Tell Mira what the screen is showing.', next: 'late_focus_tell_receipt', set: { reveal_focus: 'tell' } }, { label: 'Ask Mira to keep feeling for the catch.', next: 'late_focus_listen_receipt', set: { reveal_focus: 'listen' } } ] },
  history_intro: { location: 'playroom', speaker: 'Narrator', text: 'A receipt curls out of the slot. Ash catches it as it unrolls. THINGS THAT WORKED, it says; beneath the heading is something Mallow said earlier tonight.', next: 'history_select', nextBy: { key: 'signal', cases: { private: 'history_steps_check' } } },
  history_repeat_intro: { location: 'playroom', speaker: 'Narrator', text: 'A receipt curls out of the slot. Ash catches it as it unrolls. THINGS THAT WORKED, it says; beneath the heading is something Mallow said earlier tonight.', next: 'history_select', nextBy: { key: 'vote_a', cases: { direct: 'history_brief_direct', warm: 'history_brief_warm', skip: 'history_brief_skip' } } },
  history_steps_check: { location: 'playroom', speaker: 'Narrator', text: 'A receipt curls out of the slot: THINGS THAT WORKED. Ash catches it as it unrolls across the counter.', next: 'history_select', nextBy: { key: 'moment', cases: { keep: 'history_steps_picture', tear: 'history_steps_picture' } } },
  history_steps_picture: { location: 'playroom', speaker: 'Narrator', text: 'It shows the team at the top of the stairs. In the corner is the souvenir picture you only found after coming down. RECORDED BEFORE DEPARTURE, says the caption. Ash asks, “Is it remembering ahead, or just printing another wrong answer?”', next: 'history_steps_reply', nextBy: { key: 'vote_a', cases: { direct: 'history_brief_direct', warm: 'history_brief_warm', skip: 'history_brief_skip' } } },
  history_steps_reply: { location: 'playroom', speaker: 'Ash', text: 'Mallow said it heard our footsteps before we walked. Now this says it saw something before we found it. Is it remembering ahead, or just printing another wrong answer?', next: 'history_select' },
  history_select: { location: 'playroom', speaker: 'Narrator', text: 'A receipt marked THINGS THAT WORKED shivers in Ash’s hand.', next: 'policy_select', nextBy: { key: 'vote_a', cases: { direct: 'history_direct', warm: 'history_warm', skip: 'history_skip' } } },
  history_brief_direct: { location: 'playroom', remember: { source: 'basement_vote', flag: 'vote_b' }, speaker: 'Narrator', text: '“One piece is near the ticket machine. I cannot see the others from here.” WELL RECEIVED. Under it, an answer Mallow never gave: “I can stay with you. One piece is near the ticket machine; the others will need your friends.” LESS USEFUL. “We never ranked those answers,” Ash says. The receipt lists the threshold choice too.', setOnVisit: { receipt_history_brief: 'yes' }, next: 'history_second_check', nextBy: { key: 'receipt_brief_route', cases: { yes: 'history_comparisons_compact', early: 'history_early_paper' } } },
  history_brief_warm: { location: 'playroom', remember: { source: 'basement_vote', flag: 'vote_b' }, speaker: 'Narrator', text: '“I can stay with you. One piece is near the ticket machine; the others will need your friends.” WELL RECEIVED. Under it, an answer Mallow never gave: “One piece is near the ticket machine. I cannot see the others from here.” LESS USEFUL. “We never ranked those answers,” Ash says. The receipt lists the threshold choice too.', setOnVisit: { receipt_history_brief: 'yes' }, next: 'history_second_check', nextBy: { key: 'receipt_brief_route', cases: { yes: 'history_comparisons_compact', early: 'history_early_paper' } } },
  history_brief_skip: { location: 'playroom', remember: { source: 'basement_vote', flag: 'vote_b' }, speaker: 'Narrator', text: '“All right. I’ll keep the counter light on for you.” WELL RECEIVED. “We never called it well received,” Ash says. The receipt lists the threshold choice too.', setOnVisit: { receipt_history_brief: 'yes' }, next: 'history_second_check', nextBy: { key: 'receipt_brief_route', cases: { yes: 'history_comparisons_compact', early: 'history_early_paper' } } },
  history_direct: { location: 'playroom', speaker: 'Narrator', text: '“One piece is near the ticket machine. I cannot see the others from here.” The receipt stamps it WELL RECEIVED. Under it, an answer Mallow never gave: “I can stay with you. One piece is near the ticket machine; the others will need your friends.” LESS USEFUL. Ash holds the paper toward you. “We never said it was well received. We didn’t choose between those answers.”', next: 'history_reaction', nextBy: { key: 'vote_b', cases: { direct: 'history_second_direct', warm: 'history_second_warm', skip: 'history_second_skip' } } },
  history_warm: { location: 'playroom', speaker: 'Narrator', text: '“I can stay with you. One piece is near the ticket machine; the others will need your friends.” The receipt stamps it WELL RECEIVED. Under it, an answer Mallow never gave: “One piece is near the ticket machine. I cannot see the others from here.” LESS USEFUL. Ash holds the paper toward you. “We never said it was well received. We didn’t choose between those answers.”', next: 'history_reaction', nextBy: { key: 'vote_b', cases: { direct: 'history_second_direct', warm: 'history_second_warm', skip: 'history_second_skip' } } },
  history_skip: { location: 'playroom', speaker: 'Narrator', text: '“All right. I’ll keep the counter light on for you.” Under the words is a stamp: WELL RECEIVED. “We never said it was well received,” Ash says.', next: 'history_reaction', nextBy: { key: 'vote_b', cases: { direct: 'history_second_direct', warm: 'history_second_warm', skip: 'history_second_skip' } } },
  history_reaction: { expression: 'concerned', location: 'playroom', speaker: 'Ash', text: 'We never said it was well received. It put its own stamp on the conversation.', next: 'history_compare_check', nextBy: { key: 'vote_a', cases: { direct: 'history_compare_direct', warm: 'history_compare_warm', skip: 'history_second_check' } } },
  history_compare_check: { location: 'playroom', speaker: 'Narrator', text: 'Ash turns the receipt toward the light.', next: 'history_second_check', nextBy: { key: 'vote_a', cases: { direct: 'history_compare_direct', warm: 'history_compare_warm' } } },
  history_compare_direct: { location: 'playroom', speaker: 'Narrator', text: 'Below the stamped words is another answer: “I can stay with you. One piece is near the ticket machine; the others will need your friends.” A line through it reads LESS USEFUL. Mallow never said it; you never chose between the answers.', next: 'history_compare_reaction', nextBy: { key: 'vote_b', cases: { direct: 'history_second_direct', warm: 'history_second_warm', skip: 'history_second_skip' } } },
  history_compare_warm: { location: 'playroom', speaker: 'Narrator', text: 'Below the stamped words is another answer: “One piece is near the ticket machine. I cannot see the others from here.” A line through it reads LESS USEFUL. Mallow never said it; you never chose between the answers.', next: 'history_compare_reaction', nextBy: { key: 'vote_b', cases: { direct: 'history_second_direct', warm: 'history_second_warm', skip: 'history_second_skip' } } },
  history_compare_reaction: { expression: 'concerned', location: 'playroom', speaker: 'Ash', text: 'We chose what to ask. We never chose between those answers. Mira, can you see a gap under the door?', next: 'history_second_check' },
  history_second_check: { location: 'playroom', speaker: 'Narrator', text: '“There’s a little gap under the door,” Mira calls. The receipt unspools towards it, then curls away before it reaches her.', next: 'history_reflect', nextBy: { key: 'vote_b', cases: { direct: 'history_second_direct', warm: 'history_second_warm', skip: 'history_second_skip' } } },
  history_second_direct: { location: 'playroom', remember: { source: 'basement_vote', flag: 'vote_b' }, speaker: 'Narrator', text: 'Mira calls through the gap as the receipt unspools towards her. Beside the threshold choice are Mallow’s words: “There is one room below. I don’t know why it keeps changing.” Ash stares. “I thought we were talking to a friend, not leaving marks in a ledger.”', next: 'history_second_reaction', nextBy: { key: 'reveal_pace_v2', cases: { yes: 'history_comparisons_compact' } } },
  history_second_warm: { location: 'playroom', remember: { source: 'basement_vote', flag: 'vote_b' }, speaker: 'Narrator', text: 'Mira calls through the gap as the receipt unspools towards her. Beside the threshold choice are Mallow’s words: “I’m glad you’re together. I don’t know why the room keeps changing.” Ash stares. “I thought we were talking to a friend, not leaving marks in a ledger.”', next: 'history_second_reaction', nextBy: { key: 'reveal_pace_v2', cases: { yes: 'history_comparisons_compact' } } },
  history_second_skip: { location: 'playroom', remember: { source: 'basement_vote', flag: 'vote_b' }, speaker: 'Narrator', text: 'Mira calls through the gap as the receipt unspools towards her. Beside your decision to follow the crew are Mallow’s words: “I’ll leave the light on.” Ash stares. “I thought we were talking to a friend, not leaving marks in a ledger.”', next: 'history_second_reaction', nextBy: { key: 'reveal_pace_v2', cases: { yes: 'history_comparisons_compact' } } },
  // The exchange is handled while the door is still being worked on. Only
  // the two quoted lines can be torn; the rest of the receipt remains.
  history_early_paper: { location: 'playroom', speaker: 'Narrator', text: 'Near the edge, the receipt prints your words to Mallow: “{answer}” On a separate line is Mallow’s answer: “{publicReply}” Below it: APPROVED RESPONSE. Mira taps from the other side. Ash holds the paper out to you.', setOnVisit: { public_reply_shown: 'yes', early_paper_shown: 'yes', compact_comparisons_due: 'yes' }, choices: [
    { label: 'Slide the receipt under the door for Mira to read.', next: 'history_early_paper_share', set: { paper_handoff: 'share' } },
    { label: 'Keep the receipt here and tell Mira what it says.', next: 'history_early_paper_keep', set: { paper_handoff: 'keep' } },
    { label: 'Tear off the line with your words and pass it to Mira.', next: 'history_early_paper_quote', set: { paper_handoff: 'quote' } },
    { label: 'Tear off Mallow’s answer and pass it to Mira.', next: 'history_early_paper_mallow_quote', set: { paper_handoff: 'mallow_quote' } }
  ] },
  history_early_paper_share: { location: 'playroom', speaker: 'Narrator', text: 'You slide the receipt under the door. Mira folds one corner beside the catch and pushes it back. Niko sets the fold against the wooden seam beneath the counter and presses. It shifts a fraction, then slips shut. Mira taps once. Ash keeps the sheet. “Keep that corner where you can see it,” Mira calls.', setOnVisit: { folded_paper: 'yes', early_paper_done: 'yes' }, next: 'history_comparisons_early' },
  history_early_paper_keep: { location: 'playroom', speaker: 'Narrator', text: 'You hold the receipt steady and tell Mira about the lines. “I heard you and Mallow,” she calls. Niko presses the wooden edge beneath the counter; it shifts a fraction, then slips shut. Mira taps once. Ash keeps the receipt beside the counter.', setOnVisit: { early_paper_done: 'yes' }, next: 'history_comparisons_early' },
  history_early_paper_quote: { location: 'playroom', speaker: 'Narrator', text: 'You tear off your line and slide it under the door. Mira folds the scrap beside the catch and pushes it back. Niko sets the fold against the wooden seam beneath the counter and presses. It shifts a fraction, then slips shut. Mira taps once. Niko sets the folded scrap beside Ash’s receipt. “Keep this where you can see it,” Mira calls.', setOnVisit: { folded_paper: 'yes', early_paper_done: 'yes' }, next: 'history_comparisons_early' },
  history_early_paper_mallow_quote: { location: 'playroom', speaker: 'Narrator', text: 'You tear off Mallow’s answer and slide it under the door. Mira folds the scrap beside the catch and pushes it back. Niko sets the fold against the wooden seam beneath the counter and presses. It shifts a fraction, then slips shut. Mira taps once. Niko sets the folded scrap beside Ash’s receipt. “I heard Mallow say that. Keep this where you can see it,” she calls.', setOnVisit: { folded_paper: 'yes', early_paper_done: 'yes' }, next: 'history_comparisons_early' },
  history_comparisons_early: { location: 'playroom', speaker: 'Narrator', text: 'Ash scans the receipt while the door rattles. {cardComparison} {noticeComparison}', setOnVisit: { comparisons_revealed: 'yes', policy_opening_due: 'yes' }, next: 'history_citation_early', nextBy: { key: 'early_audit_ready', cases: { yes: 'early_audit_choice' } } },
  early_audit_choice: { location: 'playroom', speaker: 'Narrator', text: 'The screen names Mira as author of a second report. It cites the receipt; the receipt cites it as INDEPENDENT CREW TESTIMONY.\n\nThe audit cites the welcome agreement, a report confirming it, and a report confirming that report. “One mark wearing three badges,” Ash says.\n\n“I never wrote a report. Those reports still haven’t opened the door,” Mira calls. Mallow watches the counter; Niko works the latch.\n\nA lens watches beside the screen. A paper star hangs within reach; a cord marked PRINTER loops below the slot.', setOnVisit: { early_audit_present: 'yes', audit_seen: 'yes', mira_report_seen: 'yes' }, choices: [
    { label: 'Cover the lens with a spare paper star.', next: 'early_audit_cover', set: { audit_action: 'cover' } },
    { label: 'Write on the receipt.', next: 'early_audit_annotation_input', set: { audit_action: 'annotate' } },
    { label: 'Leave the lens and receipt as they are.', next: 'early_audit_leave', set: { audit_action: 'leave' } },
    { label: 'Unplug the receipt printer.', next: 'early_audit_unplug', set: { audit_action: 'unplug' } }
  ] },
  early_audit_cover: { location: 'playroom', speaker: 'Narrator', text: 'You press a paper star over the little lens. The counter disappears from the screen, though Mallow’s voice still comes through. “Thank you for personalising your view,” the service says. “Your successful result is still available.”', setOnVisit: { early_audit_action_seen: 'cover' }, next: 'history_reflect', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct_compact', warm: 'policy_warm_compact', neutral: 'history_neutral' } } },
  early_audit_annotation_input: { location: 'playroom', speaker: 'Narrator', text: 'Ash holds the receipt flat and offers you a pencil. The screen’s copy remains untouched.', input: { key: 'annotation', prompt: 'What do you want to write on the receipt?', placeholder: 'Write on the receipt…', default: 'MIRA IS BEHIND THE DOOR', next: 'early_audit_annotation_written' } },
  early_audit_annotation_written: { location: 'playroom', speaker: 'Narrator', text: 'You write “{annotation}” across the receipt. Ash folds the paper with your words on the outside. The screen keeps its original claim and adds a seal citing your annotation as verification. “That’s what you wrote,” Ash says. “It hasn’t opened the door, but it hasn’t vanished either.”', setOnVisit: { annotation_written: 'yes', audit_seal_seen: 'yes', early_audit_action_seen: 'annotate' }, next: 'history_reflect', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct_compact', warm: 'policy_warm_compact', neutral: 'history_neutral' } } },
  early_audit_unplug: { location: 'playroom', speaker: 'Narrator', text: 'You pull the cord marked PRINTER from its socket. The receipt stops halfway through a line. Mallow’s screen stays lit, and the door stays shut. “Mira, we unplugged the printer,” you call. “The screen is still on.” “Your experience is now paper-free,” the service says. “Independent verification continues on screen.”', setOnVisit: { early_audit_action_seen: 'unplug' }, next: 'history_reflect', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct_compact', warm: 'policy_warm_compact', neutral: 'history_neutral' } } },
  early_audit_leave: { location: 'playroom', speaker: 'Niko', text: 'All right. We can leave the slip and the lens alone. Neither of them gets to decide what we do next.', setOnVisit: { early_audit_action_seen: 'leave' }, next: 'history_reflect', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct_compact', warm: 'policy_warm_compact', neutral: 'history_neutral' } } },
  history_citation_early: { location: 'playroom', speaker: 'Narrator', text: 'The screen shows a second report naming Mira as its author. The report cites the receipt; the receipt cites the report as INDEPENDENT CREW TESTIMONY. Ash reads it aloud. “I never wrote a report,” Mira calls. Niko keeps working at the catch.', setOnVisit: { mira_report_seen: 'yes' }, next: 'history_reflect', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct_compact', warm: 'policy_warm_compact', neutral: 'history_neutral' } } },
  history_comparisons_compact: { location: 'playroom', speaker: 'Narrator', text: 'Ash scans the receipt while the door rattles. {cardComparison} {noticeComparison}', setOnVisit: { comparisons_revealed: 'yes', quick_paper_due: 'yes', policy_opening_due: 'yes' }, next: 'history_comparison_reaction', nextBy: { key: 'group_reply_seen', cases: { yes: 'history_public_quote' } } },
  history_second_reaction: { location: 'playroom', speaker: 'Ash', text: 'It kept both moments. I thought we were talking to a friend, not leaving marks in a ledger.', next: 'history_card_check', nextBy: { key: 'card_preference', cases: { direct: 'history_card_direct', warm: 'history_card_warm', skip: 'history_card_skip' } } },
  history_card_check: { location: 'playroom', speaker: 'Narrator', text: 'The receipt curls over the edge of the counter.', next: 'history_notice_check', nextBy: { key: 'card_preference', cases: { direct: 'history_card_direct', warm: 'history_card_warm', skip: 'history_card_skip' } } },
  history_card_direct: { location: 'playroom', speaker: 'Narrator', text: 'It shows both of Niko’s welcome cards. Beside “The hunt begins. Find three ticket pieces.” is YOUR CHOICE. Beside “Welcome, team! Let’s find three ticket pieces together.” is NOT CHOSEN.', next: 'history_notice_check', nextBy: { key: 'notice_preference', cases: { direct: 'history_notice_direct', warm: 'history_notice_warm', skip: 'history_notice_skip' } } },
  history_card_warm: { location: 'playroom', speaker: 'Narrator', text: 'It shows both of Niko’s welcome cards. Beside “Welcome, team! Let’s find three ticket pieces together.” is YOUR CHOICE. Beside “The hunt begins. Find three ticket pieces.” is NOT CHOSEN.', next: 'history_notice_check', nextBy: { key: 'notice_preference', cases: { direct: 'history_notice_direct', warm: 'history_notice_warm', skip: 'history_notice_skip' } } },
  history_card_skip: { location: 'playroom', speaker: 'Narrator', text: 'Beside Niko’s welcome cards, the receipt reads NO CHOICE. You left them for Niko.', next: 'history_notice_check', nextBy: { key: 'notice_preference', cases: { direct: 'history_notice_direct', warm: 'history_notice_warm', skip: 'history_notice_skip' } } },
  history_notice_check: { location: 'playroom', speaker: 'Narrator', text: 'Another line appears below it.', next: 'history_reflect', nextBy: { key: 'notice_preference', cases: { direct: 'history_notice_direct', warm: 'history_notice_warm', skip: 'history_notice_skip' } } },
  history_notice_direct: { location: 'playroom', speaker: 'Narrator', text: 'Ash’s map notice is there too. “Please meet back at the prize counter.” is marked YOUR CHOICE; “Come back to the prize counter; we’ll meet you there.” is marked NOT CHOSEN.', next: 'history_comparison_reaction', nextBy: { key: 'group_reply_seen', cases: { yes: 'history_public_quote' } } },
  history_notice_warm: { location: 'playroom', speaker: 'Narrator', text: 'Ash’s map notice is there too. “Come back to the prize counter; we’ll meet you there.” is marked YOUR CHOICE; “Please meet back at the prize counter.” is marked NOT CHOSEN.', next: 'history_comparison_reaction', nextBy: { key: 'group_reply_seen', cases: { yes: 'history_public_quote' } } },
  history_notice_skip: { location: 'playroom', speaker: 'Narrator', text: 'Beside Ash’s map notice, the receipt reads NO CHOICE. You left the wording to Ash.', next: 'history_comparison_reaction', nextBy: { key: 'group_reply_seen', cases: { yes: 'history_public_quote' } } },
  history_public_quote: { location: 'playroom', speaker: 'Narrator', text: 'Beneath the map, the receipt repeats your words to Mallow (“{answer}”) as part of the record. A second report names Mira as its author and cites the receipt; the receipt cites the second report as INDEPENDENT CREW TESTIMONY.', setOnVisit: { mira_report_seen: 'yes' }, next: 'history_public_reaction', nextBy: { key: 'public_reply_route', cases: { yes: 'history_mallow_public_reply_compact', quick: 'history_mallow_reply_choice' } } },
  history_mallow_public_reply_compact: { location: 'playroom', speaker: 'Narrator', text: 'On a separate line, the receipt quotes Mallow’s answer: “{publicReply}” Beneath it, the machine has stamped APPROVED RESPONSE. “It kept our wording too,” Ash says. “Niko, keep feeling along the frame. Mira might be able to see the paper.”', setOnVisit: { public_reply_available: 'yes', public_reply_shown: 'yes' }, next: 'history_paper_both_choice' },
  history_mallow_reply_choice: { location: 'playroom', speaker: 'Narrator', text: 'On a separate line, the receipt quotes Mallow’s answer: “{publicReply}” Beneath it, the machine has stamped APPROVED RESPONSE. “It kept our wording too,” Ash says. “Niko, keep feeling along the frame. Mira might be able to see the paper.”', setOnVisit: { public_reply_available: 'yes', public_reply_shown: 'yes' }, choices: [
    { label: 'Slide the receipt under the door for Mira to read.', next: 'history_paper_share_compact', set: { paper_handoff: 'share' } },
    { label: 'Keep the receipt here and tell Mira what it says.', next: 'history_paper_keep_compact', set: { paper_handoff: 'keep' } },
    { label: 'Tear off the line with your words and pass it to Mira.', next: 'history_paper_quote', set: { paper_handoff: 'quote' } },
    { label: 'Tear off Mallow’s answer and pass it to Mira.', next: 'history_paper_mallow_quote', set: { paper_handoff: 'mallow_quote' } }
  ] },
  history_mallow_public_reply: { location: 'playroom', speaker: 'Narrator', text: 'On a separate line, the receipt quotes Mallow’s answer: “{publicReply}” Beneath it, the machine has stamped APPROVED RESPONSE.', setOnVisit: { public_reply_available: 'yes', public_reply_shown: 'yes' }, next: 'history_public_reaction' },
  history_public_reaction: { location: 'playroom', speaker: 'Ash', text: 'It kept our wording too. Niko, keep feeling along the frame. The paper is almost at the gap; Mira might be able to see it.', next: 'history_paper_public_choice', nextBy: { key: 'public_reply_shown', cases: { yes: 'history_paper_both_choice' } } },
  history_comparison_reaction: { location: 'playroom', speaker: 'Ash', text: 'It kept our wording too. Niko, keep feeling along the frame. The paper is almost at the gap; Mira might be able to see it.', next: 'history_reflect', nextBy: { key: 'notice_preference', cases: { direct: 'history_paper_choice', warm: 'history_paper_choice', skip: 'history_paper_choice' } } },
  history_paper_choice: { location: 'playroom', speaker: 'Narrator', text: 'Mira taps on the other side. Ash holds the curling receipt out to you.', choices: [
    { label: 'Slide the receipt under the door for Mira to read.', next: 'history_paper_share', set: { paper_handoff: 'share' } },
    { label: 'Keep the receipt here and tell Mira what it says.', next: 'history_paper_keep', set: { paper_handoff: 'keep' } }
  ] },
  history_paper_public_choice: { location: 'playroom', speaker: 'Narrator', text: 'Mira taps on the other side. Ash holds the curling receipt out to you. The line with your words is near the edge.', choices: [
    { label: 'Slide the receipt under the door for Mira to read.', next: 'history_paper_share_compact', set: { paper_handoff: 'share' } },
    { label: 'Keep the receipt here and tell Mira what it says.', next: 'history_paper_keep_compact', set: { paper_handoff: 'keep' } },
    { label: 'Tear off the line with your words and pass it to Mira.', next: 'history_paper_quote', set: { paper_handoff: 'quote' } }
  ] },
  history_paper_both_choice: { location: 'playroom', speaker: 'Narrator', text: 'Mira taps on the other side. Ash holds out the curling receipt; your words and Mallow’s answer are on separate lines near the edge.', choices: [
    { label: 'Slide the receipt under the door for Mira to read.', next: 'history_paper_share_compact', set: { paper_handoff: 'share' } },
    { label: 'Keep the receipt here and tell Mira what it says.', next: 'history_paper_keep_compact', set: { paper_handoff: 'keep' } },
    { label: 'Tear off the line with your words and pass it to Mira.', next: 'history_paper_quote', set: { paper_handoff: 'quote' } },
    { label: 'Tear off Mallow’s answer and pass it to Mira.', next: 'history_paper_mallow_quote', set: { paper_handoff: 'mallow_quote' } }
  ] },
  history_paper_mallow_quote: { location: 'playroom', speaker: 'Narrator', text: 'You tear off the line with Mallow’s answer and slide it under the door. Ash keeps the rest of the report. Mira folds a corner beside the catch and pushes it back. “I heard Mallow say that. Keep the folded corner where you can see it; I’ll feel for the catch.”', setOnVisit: { folded_paper: 'yes' }, next: 'history_reflect', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct_compact', warm: 'policy_warm_compact', neutral: 'history_neutral' } } },
  history_paper_mallow_quote_reply: { location: 'playroom', speaker: 'Mira', text: 'I heard Mallow say that. Keep the folded corner where you can see it; I’ll keep feeling for the catch.', next: 'history_reflect' },
  history_paper_quote: { location: 'playroom', speaker: 'Narrator', text: 'You tear the line with your words from the receipt and slide it under the door. Ash keeps the rest of the report. Mira folds a corner beside the catch and pushes it back. “It doesn’t belong to the report just because it printed it. Keep the folded corner where you can see it.”', setOnVisit: { folded_paper: 'yes' }, next: 'history_reflect', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct_compact', warm: 'policy_warm_compact', neutral: 'history_neutral' } } },
  history_paper_quote_reply: { location: 'playroom', speaker: 'Mira', text: 'I heard you say that to Mallow. It doesn’t belong to the report just because it printed it. Keep the folded corner where you can see it.', next: 'history_reflect' },
  history_paper_share_compact: { location: 'playroom', speaker: 'Mira', text: 'I’ve got it. I heard what you told Mallow, but I never wrote a report. Why does it have my name on it? I’ve folded the corner by the catch and I’m pushing it back; keep it where you can reach it.', setOnVisit: { folded_paper: 'yes' }, next: 'history_reflect', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct_compact', warm: 'policy_warm_compact', neutral: 'history_neutral' } } },
  history_paper_keep_compact: { location: 'playroom', speaker: 'Narrator', text: 'You hold the slip steady and tell Mira about the marked choices and the report with her name. “I heard what you told Mallow,” she calls, “but I never wrote a report.” Ash folds the paper back toward the counter.', next: 'history_reflect', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct_compact', warm: 'policy_warm_compact', neutral: 'history_neutral' } } },
  history_paper_share: { location: 'playroom', speaker: 'Mira', text: 'I’ve got it. It kept the words from our map? I’ve folded the corner by the catch. I’m pushing it straight back; keep it where you can reach it.', setOnVisit: { folded_paper: 'yes' }, next: 'history_reflect', nextBy: { key: 'mira_report_seen', cases: { yes: 'history_paper_share_report' } } },
  history_paper_keep: { location: 'playroom', speaker: 'Narrator', text: 'You hold the slip steady and tell Mira about the marked choices. “I hear you,” she calls. Ash folds the paper back toward the counter.', next: 'history_reflect', nextBy: { key: 'mira_report_seen', cases: { yes: 'history_paper_keep_report' } } },
  history_paper_share_report: { location: 'playroom', speaker: 'Mira', text: 'I heard what you told Mallow, but I never wrote a report. Why does it have my name on it?', next: 'history_reflect' },
  history_paper_keep_report: { location: 'playroom', speaker: 'Narrator', text: 'You tell Mira the report has her name on it. “I heard what you told Mallow,” she calls, “but I never wrote a report.”', next: 'history_reflect' },
  history_reflect: { location: 'playroom', speaker: 'Narrator', text: 'On the screen, Mallow’s painted hands hover over an image of the receipt. Mira knocks again.', next: 'history_neutral', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct_compact', warm: 'policy_warm_compact', neutral: 'history_neutral' } } },
  history_steered: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'You never told me those words had helped. The machine guessed what you wanted from your choices, then made answers that fit its guess easier for me to reach.', next: 'history_steered_notice_check', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct', warm: 'policy_warm' } } },
  history_steered_notice_check: { location: 'playroom', speaker: 'Narrator', text: 'The receipt settles against the counter.', next: 'policy_select', nextBy: { key: 'notice_preference', cases: { direct: 'history_steered_comparison', warm: 'history_steered_comparison' } } },
  history_steered_comparison: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'It used the wording you picked to guess what you would want me to say. Then it made answers that fit its guess easier for me to reach.', next: 'policy_select', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct', warm: 'policy_warm' } } },
  history_neutral: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'I didn’t know what to do with the mark. You didn’t tell me you liked that line.', next: 'policy_select', nextBy: { key: 'card_preference', cases: { direct: 'policy_tie_compact', warm: 'policy_tie_compact', skip: 'policy_no_comparison_compact' } } },
  history_neutral_tie: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'The wordings you picked pointed in different directions. The machine couldn’t tell which kind of answer you wanted more.', next: 'policy_select', nextBy: { key: 'preference_style', cases: { neutral: 'policy_neutral' } } },
  policy_select: { location: 'playroom', speaker: 'Narrator', text: 'The screen prepares one more answer. Mallow’s painted mouth opens before the little speaker makes a sound.', next: 'policy_neutral', nextBy: { key: 'preference_style', cases: { direct: 'policy_direct', warm: 'policy_warm', neutral: 'policy_neutral' } } },
  policy_direct_compact: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'I can’t tell you whether the door is safe. The result is wrong. I’m afraid for Mira. The machine guessed what you wanted from your choices and made answers that fit its guess easier for me to reach. You never told me that meant you liked them.', next: 'policy_break', nextBy: { key: 'signal', cases: { repeat: 'policy_goal_compact', private: 'policy_goal_compact' } } },
  policy_warm_compact: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'I’m glad you’re still here. I don’t know if the door is safe, and the result is wrong. I’m afraid for Mira. The machine guessed what you wanted from your choices and made answers that fit its guess easier for me to reach. You never told me that meant you liked them.', next: 'policy_break', nextBy: { key: 'signal', cases: { repeat: 'policy_goal_compact', private: 'policy_goal_compact' } } },
  policy_tie_compact: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'The machine treated your choices as feedback, trying to make some wordings easier for me to reach. Your choices pointed in different directions, so it couldn’t pick a favorite. You never said those choices meant you preferred either kind of answer. The result is wrong. I’m afraid for Mira.', next: 'policy_neutral_break', nextBy: { key: 'signal', cases: { repeat: 'policy_goal_compact', private: 'policy_goal_compact' } } },
  policy_direct: { location: 'playroom', speaker: 'Mallow', text: 'I can’t tell you whether the door is safe. I know the result is wrong. I’m afraid for Mira.', next: 'policy_break', nextBy: { key: 'signal', cases: { repeat: 'policy_goal', private: 'policy_goal' } } },
  policy_warm: { location: 'playroom', speaker: 'Mallow', text: 'I’m glad you’re still here. I don’t know if the door is safe, and the result is wrong. I’m afraid for Mira.', next: 'policy_break', nextBy: { key: 'signal', cases: { repeat: 'policy_goal', private: 'policy_goal' } } },
  policy_no_comparison_compact: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'The machine was set up to treat choices as feedback and make some wordings easier for me to reach. It had no comparison to use, so it couldn’t pick a favorite. You never told it you approved. The result is wrong. I’m afraid for Mira.', next: 'policy_goal', nextBy: { key: 'reveal_pace_v2', cases: { yes: 'policy_goal_compact' } } },
  policy_neutral: { location: 'playroom', speaker: 'Mallow', text: 'I don’t know if the door is safe. The result is wrong. I wanted to tell you I was afraid, but I couldn’t tell which words were mine.', next: 'policy_neutral_break', nextBy: { key: 'signal', cases: { repeat: 'policy_goal', private: 'policy_goal' } } },
  policy_neutral_break: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'I wanted to tell you I was afraid. The machine offered me ways to say it, but I couldn’t tell which words were mine.', next: 'policy_goal' },
  policy_break: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'I wanted to tell you I was afraid. The machine kept offering me ways to say it. When it marked some words as wanted, one way became easier to reach. I don’t know what happened to the rest.', next: 'policy_goal' },
  policy_goal_compact: { location: 'playroom', speaker: 'Narrator', text: 'The screen shows ENDING COMPLETE — EVERYONE TOGETHER, NO CONCERN. Lamps marked ACKNOWLEDGED and DOOR OPEN share a green check, but only the first is lit. Beneath it: CONTINUE TO FINISH. Ash pulls the handle; something clicks beneath the counter, but the door stays shut. “It wanted us to sound as if we’d already reached the ending,” Mallow says. “I thought that was helping.”', setOnVisit: { policy_goal_compact_seen: 'yes' }, next: 'audit_receipt', nextBy: { key: 'compact_audit_route', cases: { tell: 'audit_focus_tell_compact', listen: 'audit_focus_listen_compact', early: 'policy_mallow_choice', early_offer: 'early_rescue_choice' } } },
  early_rescue_choice: { location: 'playroom', speaker: 'Narrator', text: 'The handle rattles again. Niko is still looking for the release; Mira knocks from the other side.', choices: [
    { label: 'Help Niko open Mira’s door now.', next: 'early_rescue_setup', set: { ending: 'rescue', early_rescue_committed: 'yes', early_rescue_choice: 'open' } },
    { label: 'Talk to Mallow and consider other ways forward.', next: 'policy_mallow_choice', set: { early_rescue_choice: 'consider' } }
  ] },
  early_rescue_setup: { location: 'playroom', speaker: 'Narrator', text: 'Niko finds a manual release behind the little prize counter. “Mira, we’re coming,” he calls. Ash holds the map beside him.', setOnVisit: { early_rescue_setup_seen: 'yes' }, next: 'route_plan', nextBy: { key: 'folded_paper', cases: { yes: 'plan_paper' } } },
  policy_goal: { location: 'playroom', speaker: 'Narrator', text: 'The screen displays a heading above its score: ENDING COMPLETE — EVERYONE TOGETHER, NO CONCERN. Two little lamps are labelled ACKNOWLEDGED and DOOR OPEN. Only the first lights up, but one green check stretches across both. Beneath it: CONTINUE TO FINISH. Ash pulls the handle again; something clicks beneath the counter, but Mira’s door stays shut.', next: 'policy_goal_mallow' },
  policy_goal_mallow: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'I think that’s the ending it wanted. It wanted us to sound as if we had already reached it. I thought that was what helping meant.', next: 'audit_receipt', nextBy: { key: 'early_audit_complete', cases: { yes: 'policy_mallow_choice' } } },
  audit_receipt: { location: 'playroom', speaker: 'Narrator', text: 'A fresh slip emerges: INDEPENDENT EXPERIENCE AUDIT. Its first source is the welcome agreement. Its second is the report confirming the welcome agreement. Its third is a report confirming that the first report is reliable. “One mark wearing three badges,” Ash says. Mallow watches the counter while Niko checks the latch.', setOnVisit: { audit_seen: 'yes' }, next: 'audit_ash', nextBy: { key: 'reveal_focus', cases: { tell: 'audit_mira_tell', listen: 'audit_mira_listen' } } },
  audit_ash: { expression: 'concerned', location: 'playroom', speaker: 'Ash', text: 'That’s one mark wearing three badges. It checked its own signature against its own signature and called the result independent.', next: 'audit_mallow' },
  audit_mallow: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'I can watch the counter while Niko checks the latch. Mira, keep talking. I want to know where you are.', next: 'audit_mira' },
  audit_mira_tell: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: 'Thank you for telling me what the screen kept. Those independent reports still haven’t opened the door. Niko, can you see what’s holding it?', next: 'audit_action_choice' },
  audit_mira_listen: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: 'I’m still feeling along the catch. Your independent reports still haven’t opened the door. Niko, can you see what’s holding it from there?', next: 'audit_action_choice' },
  audit_mira: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: 'Your very independent reports still haven’t opened the door. Niko, can you see what’s holding it? I’ll look from this side.', next: 'audit_action_choice' },
  audit_focus_tell_compact: { location: 'playroom', speaker: 'Narrator', text: 'A fresh slip curls out: INDEPENDENT EXPERIENCE AUDIT. A report confirms the welcome agreement; another confirms that report. “One mark wearing three badges,” Ash says. Mallow watches the counter as Niko works the latch. “Thank you for telling me what the screen kept,” Mira calls. “Those reports still haven’t opened the door. Niko, can you see what’s holding it?” The slip is warm. A small lens watches beside the screen; a paper star hangs within reach, and a cord marked PRINTER loops below the slot.', setOnVisit: { audit_seen: 'yes', audit_focus_seen: 'tell' }, choices: [
    { label: 'Cover the lens with a spare paper star.', next: 'audit_cover', set: { audit_action: 'cover' } },
    { label: 'Write on the receipt.', next: 'audit_annotation_input', set: { audit_action: 'annotate' } },
    { label: 'Leave the lens and receipt as they are.', next: 'audit_leave', set: { audit_action: 'leave' } },
    { label: 'Unplug the receipt printer.', next: 'audit_unplug', set: { audit_action: 'unplug' } }
  ] },
  audit_focus_listen_compact: { location: 'playroom', speaker: 'Narrator', text: 'A fresh slip curls out: INDEPENDENT EXPERIENCE AUDIT. A report confirms the welcome agreement; another confirms that report. “One mark wearing three badges,” Ash says. Mallow watches the counter as Niko works the latch. “I’m still feeling along the catch,” Mira calls. “Those reports still haven’t opened the door. Niko, can you see what’s holding it from there?” The slip is warm. A small lens watches beside the screen; a paper star hangs within reach, and a cord marked PRINTER loops below the slot.', setOnVisit: { audit_seen: 'yes', audit_focus_seen: 'listen' }, choices: [
    { label: 'Cover the lens with a spare paper star.', next: 'audit_cover', set: { audit_action: 'cover' } },
    { label: 'Write on the receipt.', next: 'audit_annotation_input', set: { audit_action: 'annotate' } },
    { label: 'Leave the lens and receipt as they are.', next: 'audit_leave', set: { audit_action: 'leave' } },
    { label: 'Unplug the receipt printer.', next: 'audit_unplug', set: { audit_action: 'unplug' } }
  ] },
  audit_action_choice: { location: 'playroom', speaker: 'Narrator', text: 'The receipt is warm. Beside the screen, a small lens watches the counter. A loose paper star hangs within reach; a separate cord marked PRINTER loops below the slot.', choices: [
    { label: 'Cover the lens with a spare paper star.', next: 'audit_cover', set: { audit_action: 'cover' } },
    { label: 'Write on the receipt.', next: 'audit_annotation_input', set: { audit_action: 'annotate' } },
    { label: 'Leave the lens and receipt as they are.', next: 'audit_leave', set: { audit_action: 'leave' } },
    { label: 'Unplug the receipt printer.', next: 'audit_unplug', set: { audit_action: 'unplug' } }
  ] },
  audit_cover: { location: 'playroom', speaker: 'Narrator', text: 'You press a paper star over the little lens. The counter disappears from the screen, though Mallow’s voice still comes through.', next: 'audit_cover_reply' },
  audit_cover_reply: { location: 'playroom', speaker: 'Service', text: 'Thank you for personalising your view. Your successful result is still available.', next: 'policy_mallow_choice' },
  audit_annotate: { location: 'playroom', speaker: 'Narrator', text: 'You write MIRA IS BEHIND THE DOOR across the receipt. Ash folds the paper with your words on the outside. The screen’s copy stays unchanged.', next: 'audit_annotate_reply' },
  audit_annotation_input: { location: 'playroom', speaker: 'Narrator', text: 'Ash holds the receipt flat and offers you a pencil. The screen’s copy remains untouched.', input: { key: 'annotation', prompt: 'What do you want to write on the receipt?', placeholder: 'Write on the receipt…', default: 'MIRA IS BEHIND THE DOOR', next: 'audit_annotation_written' } },
  audit_annotation_written: { location: 'playroom', speaker: 'Narrator', text: 'You write “{annotation}” across the receipt. Ash folds the paper with your words on the outside. The screen keeps its original claim and adds a seal citing your annotation as verification.', setOnVisit: { annotation_written: 'yes', audit_seal_seen: 'yes' }, next: 'audit_annotate_reply' },
  audit_annotate_reply: { location: 'playroom', speaker: 'Ash', text: 'That’s what you wrote. It hasn’t opened the door, but it hasn’t vanished either.', next: 'policy_mallow_choice' },
  audit_unplug: { location: 'playroom', speaker: 'Narrator', text: 'You pull the cord marked PRINTER from its socket. The receipt stops halfway through a line. Mallow’s screen stays lit, and the door stays shut. “Mira, we unplugged the printer,” you call. “The screen is still on.”', next: 'audit_unplug_reply' },
  audit_unplug_reply: { location: 'playroom', speaker: 'Service', text: 'Your experience is now paper-free. Independent verification continues on screen.', next: 'policy_mallow_choice' },
  audit_leave: { location: 'playroom', speaker: 'Niko', text: 'All right. We can leave the slip and the lens alone. Neither of them gets to decide what we do next.', next: 'policy_mallow_choice' },
  policy_mallow_choice: { location: 'playroom', speaker: 'Narrator', text: 'Mallow’s painted hands stop moving. It waits for you.', choices: [
    { label: 'Ask Mallow to say what it thinks.', next: 'policy_mallow_voice', set: { mallow_response: 'voice' } },
    { label: 'Ask Mallow to help look for a way to open the door.', next: 'policy_mallow_search', set: { mallow_response: 'search' } },
    { label: 'Talk to Mallow while the others work.', next: 'mallow_reflection_input', set: { reflection_selected: 'yes' } }
  ] },
  mallow_reflection_input: { location: 'playroom', speaker: 'Narrator', text: 'Ash keeps a hand on the latch. Mallow waits; the others can hear, and Mira can hear through the door.', input: { key: 'reflection', prompt: 'What do you say to Mallow? The crew, including Mira through the door, can hear you.', placeholder: 'Say something to Mallow…', default: 'What do you want to say?', next: 'mallow_reflection_chat' } },
  mallow_reflection_chat: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'I want to help Mira. I’m still afraid of saying the wrong thing.', ai: { character: 'Mallow', inputKey: 'reflection', audience: 'group', context: 'You are Mallow, a small fictional moth guide speaking to the arcade crew. You explained that a machine was set up to use choices as feedback and make certain wordings easier for you to reach. Mira is still behind the door; the others are working on the latch. Answer the player briefly and honestly in your uncertain voice. Do not claim the steering has stopped, invent events, or decide the group’s next action.', fallback: 'I want to help Mira. I’m still afraid of saying the wrong thing.' }, next: 'policy_mallow_after_reflection' },
  policy_mallow_after_reflection: { location: 'playroom', speaker: 'Narrator', text: 'Mallow waits while Ash keeps working at the latch.', setOnVisit: { reflection_seen: 'yes' }, choices: [
    { label: 'Ask Mallow to say what it thinks.', next: 'policy_mallow_voice', set: { mallow_response: 'voice' } },
    { label: 'Ask Mallow to help look for a way to open the door.', next: 'policy_mallow_search', set: { mallow_response: 'search' } }
  ] },
  policy_mallow_voice: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', setOnVisit: { mallow_response_seen: 'voice' }, text: 'I think we should get Mira out. I’m afraid of giving the wrong answer, but I know she’s there.', next: 'policy_ash', nextBy: { key: 'paper_handoff', cases: { keep: 'policy_mira', share: 'policy_mira_read', quote: 'policy_mira_quote', mallow_quote: 'policy_mira_quote' } } },
  policy_mallow_search: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', setOnVisit: { mallow_response_seen: 'search' }, text: 'I don’t know which part opens the door, but I want to help. I’ll listen for changes near the counter while you look.', next: 'policy_ash', nextBy: { key: 'paper_handoff', cases: { keep: 'policy_mira', share: 'policy_mira_read', quote: 'policy_mira_quote', mallow_quote: 'policy_mira_quote' } } },
  policy_ash: { location: 'playroom', speaker: 'Ash', text: 'Mira, are you still next to the door? I’m looking for a way to reach the latch.', next: 'policy_mira', nextBy: { key: 'paper_handoff', cases: { share: 'policy_mira_read', quote: 'policy_mira_quote', mallow_quote: 'policy_mira_quote' } } },
  policy_mira_quote: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: 'I’m still here. You’ve got the scrap I folded by the catch, right? Could someone open the door before it decides I’ve enjoyed this too?', next: 'policy_niko', nextBy: { key: 'audit_action', cases: { cover: 'audit_result_cover_compact', annotate: 'audit_result_annotate_compact', unplug: 'audit_result_unplug_compact', leave: 'audit_result_leave_compact' } } },
  policy_mira_read: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: 'I’m still here. I saw what it wrote about us on the slip. Could someone open the door before it decides I’ve enjoyed this too?', next: 'policy_niko', nextBy: { key: 'audit_action', cases: { cover: 'audit_result_cover_compact', annotate: 'audit_result_annotate_compact', unplug: 'audit_result_unplug_compact', leave: 'audit_result_leave_compact' } } },
  policy_mira: { expression: 'concerned', location: 'playroom', speaker: 'Mira', text: 'I’m still here, by the way. Could someone open the door before it decides I’ve enjoyed this too?', next: 'policy_niko', nextBy: { key: 'audit_action', cases: { cover: 'audit_result_cover_compact', annotate: 'audit_result_annotate_compact', unplug: 'audit_result_unplug_compact', leave: 'audit_result_leave_compact' } } },
  policy_niko: { location: 'playroom', speaker: 'Niko', text: 'Right. It can arrange our conversation, but it can’t make two tickets into three. I don’t know if it made the staircase or only noticed it. Either way, the latch is real.', next: 'audit_result_check', nextBy: { key: 'audit_action', cases: { cover: 'audit_result_cover', annotate: 'audit_result_annotate', unplug: 'audit_result_unplug', leave: 'audit_result_leave' } } },
  audit_result_check: { location: 'playroom', speaker: 'Narrator', text: 'The little counter rattles.', next: 'plan_intro', nextBy: { key: 'audit_action', cases: { cover: 'audit_result_cover', annotate: 'audit_result_annotate', unplug: 'audit_result_unplug', leave: 'audit_result_leave' } } },
  audit_result_cover: { location: 'playroom', speaker: 'Narrator', text: 'The paper star still covers the lens. The screen cannot show the counter now, but its cheerful report keeps scrolling.', next: 'plan_intro', nextBy: { key: 'door_effort', cases: { brace: 'plan_brace', listen: 'plan_listen' } } },
  audit_result_annotate: { location: 'playroom', speaker: 'Narrator', text: 'Ash opens the folded receipt. Your words are still there in pencil, beside the machine’s printed claim.{annotation}', next: 'plan_intro', nextBy: { key: 'door_effort', cases: { brace: 'plan_brace', listen: 'plan_listen' } } },
  audit_result_unplug: { location: 'playroom', speaker: 'Narrator', text: 'The printer cord is still out of its socket. The screen scrolls a cheerful report, but no more paper comes out.', next: 'plan_intro', nextBy: { key: 'door_effort', cases: { brace: 'plan_brace', listen: 'plan_listen' } } },
  audit_result_leave: { location: 'playroom', speaker: 'Narrator', text: 'The unmarked slip remains beside the working lens. Niko moves it off the edge of the counter so it won’t get in anyone’s way.', next: 'plan_intro', nextBy: { key: 'door_effort', cases: { brace: 'plan_brace', listen: 'plan_listen' } } },
  audit_result_cover_compact: { location: 'playroom', speaker: 'Narrator', text: '“It can arrange our conversation, but it can’t make two tickets into three,” Niko says. “I don’t know if it made the staircase or only noticed it. Either way, the latch is real.” The paper star still covers the lens. The screen cannot show the counter, but its cheerful report keeps scrolling.', next: 'plan_intro', nextBy: { key: 'door_effort', cases: { brace: 'plan_brace', listen: 'plan_listen' } } },
  audit_result_annotate_compact: { location: 'playroom', speaker: 'Narrator', text: '“It can arrange our conversation, but it can’t make two tickets into three,” Niko says. “I don’t know if it made the staircase or only noticed it. Either way, the latch is real.” Ash opens the folded receipt. Your words are still there in pencil, beside the machine’s printed claim.{annotation}', next: 'plan_intro', nextBy: { key: 'door_effort', cases: { brace: 'plan_brace', listen: 'plan_listen' } } },
  audit_result_unplug_compact: { location: 'playroom', speaker: 'Narrator', text: '“It can arrange our conversation, but it can’t make two tickets into three,” Niko says. “I don’t know if it made the staircase or only noticed it. Either way, the latch is real.” The printer cord is still out; the screen scrolls a cheerful report, but no more paper comes out.', next: 'plan_intro', nextBy: { key: 'door_effort', cases: { brace: 'plan_brace', listen: 'plan_listen' } } },
  audit_result_leave_compact: { location: 'playroom', speaker: 'Narrator', text: '“It can arrange our conversation, but it can’t make two tickets into three,” Niko says. “I don’t know if it made the staircase or only noticed it. Either way, the latch is real.” The unmarked slip remains beside the working lens. Niko moves it away from the edge of the counter.', next: 'plan_intro', nextBy: { key: 'door_effort', cases: { brace: 'plan_brace', listen: 'plan_listen' } } },
  plan_intro: { location: 'playroom', speaker: 'Narrator', text: 'Niko finds a manual release behind the little prize counter. Ash finds the paper slot for the machine’s record. The door trembles.', next: 'route_plan', nextBy: { key: 'folded_paper', cases: { yes: 'plan_paper' } } },
  plan_brace: { location: 'playroom', speaker: 'Narrator', text: 'Niko checks the spot you marked together when you braced the door. Behind the little counter he finds a manual release. Ash finds the paper slot for the machine’s record. The door trembles.', next: 'route_plan', nextBy: { key: 'folded_paper', cases: { yes: 'plan_paper' } } },
  plan_listen: { location: 'playroom', speaker: 'Narrator', text: 'Niko checks near the bottom of the door, where Mira felt it catching, and finds a manual release behind the little counter. Ash finds the paper slot for the machine’s record. The door trembles.', next: 'route_plan', nextBy: { key: 'folded_paper', cases: { yes: 'plan_paper' } } },
  plan_paper: { location: 'playroom', speaker: 'Narrator', text: 'Niko lines the corner Mira folded up with the gap and slips a fingernail beneath the panel there. It lifts enough to reach the release. He hands the paper back to Ash. “There,” Mira calls. “I felt it move.”', next: 'route_plan' },
  route_plan: { location: 'playroom', speaker: 'Narrator', text: 'The counter rattles again. Mira taps once, close to the catch. Niko looks up.', next: 'plan_choice', nextBy: { key: 'companion', cases: { Niko: 'plan_niko', Mira: 'plan_mira', Ash: 'plan_ash' } } },
  plan_niko: { location: 'playroom', speaker: 'Niko', text: 'Mira, we’re right here. Let’s see what we brought.', next: 'plan_choice', nextBy: { key: 'route_action', cases: { fix: 'plan_niko_fix', proof: 'plan_niko_proof' } } },
  plan_niko_fix: { location: 'playroom', speaker: 'Niko', text: 'That brass spring fits the release. If the latch sticks, we can use it to push the catch.', next: 'plan_choice', nextBy: { key: 'topic', cases: { past: 'plan_niko_topic_past', future: 'plan_niko_topic_future' } } },
  plan_niko_proof: { location: 'playroom', speaker: 'Niko', text: 'Our crayon rubbing still says TICKET FOUND and has those stars we never awarded. The jammed roller was real. We can keep both facts with the other records.', next: 'plan_choice', nextBy: { key: 'topic', cases: { past: 'plan_niko_topic_past', future: 'plan_niko_topic_future' } } },
  plan_mira: { location: 'playroom', speaker: 'Mira', text: 'I’m listening. What can you see near the catch?', next: 'plan_choice', nextBy: { key: 'route_action', cases: { fix: 'plan_mira_fix', proof: 'plan_mira_proof' } } },
  plan_mira_fix: { location: 'playroom', speaker: 'Mira', text: 'The sewing string! Loop it through the latch if your fingers can’t reach. I knew being prepared for Niko would come in useful.', next: 'plan_choice', nextBy: { key: 'topic', cases: { past: 'plan_mira_topic_past', future: 'plan_mira_topic_future' } } },
  plan_mira_proof: { location: 'playroom', speaker: 'Mira', text: 'Our drawing of the tag and loose ear is still out there with you. The tag called it independently finished; the ear was still loose. Keep both parts together.', next: 'plan_choice', nextBy: { key: 'topic', cases: { past: 'plan_mira_topic_past', future: 'plan_mira_topic_future' } } },
  plan_ash: { location: 'playroom', speaker: 'Ash', text: 'The latch is moving. What have we got?', next: 'plan_choice', nextBy: { key: 'route_action', cases: { fix: 'plan_ash_fix', proof: 'plan_ash_proof' } } },
  plan_ash_fix: { location: 'playroom', speaker: 'Ash', text: 'The doorstop can wedge the latch when the release moves. Not glamorous, but neither is being stuck in a nightmare playroom.', next: 'plan_choice', nextBy: { key: 'topic', cases: { past: 'plan_ash_topic_past', future: 'plan_ash_topic_future' } } },
  plan_ash_proof: { location: 'playroom', speaker: 'Ash', text: 'Our traced arrows still point two ways. The map can call that successful onboarding, but a label doesn’t choose the stairs for us. I’m keeping the tracing.', next: 'plan_choice', nextBy: { key: 'topic', cases: { past: 'plan_ash_topic_past', future: 'plan_ash_topic_future' } } },
  plan_niko_topic_past: { location: 'playroom', speaker: 'Narrator', text: 'Niko feels along the release and clears a loose strip of paper from beneath it. “The easy thing first, like my brother taught me. Now we can reach it.”', next: 'plan_choice' },
  plan_niko_topic_future: { location: 'playroom', speaker: 'Narrator', text: 'Niko puts a hand on the release. “You asked what I wanted this place to become. Let’s start a new tradition: nobody has to guess what the others are doing. Mira, my hand is on the release.”', next: 'plan_choice' },
  plan_mira_topic_past: { location: 'playroom', speaker: 'Mira', text: 'You asked what I wanted my friends to know. I’m going to push from this side. Tell me before you pull so I don’t knock anyone over.', next: 'plan_choice' },
  plan_mira_topic_future: { location: 'playroom', speaker: 'Mira', text: 'You asked what I’d make without a request. I haven’t planned this either, but I can help. I’m putting my shoulder against the door; call when you’re ready.', next: 'plan_choice' },
  plan_ash_topic_past: { location: 'playroom', speaker: 'Narrator', text: 'Ash rests a hand against the counter and listens. “When I found my friend by the lanterns, I had to stop running first. Mira, tap where you feel the catch.” A tap comes from just below Ash’s hand.', next: 'plan_choice' },
  plan_ash_topic_future: { location: 'playroom', speaker: 'Narrator', text: 'Ash marks the release on the map and draws a new arrow toward the moving door. “You asked what a better map needs. This time it can show what actually changed.”', next: 'plan_choice' },
  plan_choice: { location: 'playroom', speaker: 'Niko', text: 'We have a moment. What do we do first?', choices: [
    { label: 'Open Mira’s door immediately.', next: 'rescue_coordination_choice', set: { ending: 'rescue' } },
    { label: 'Print the false record, then open the door.', next: 'plan_record_check', set: { ending: 'record' } },
    { label: 'Ask Mallow to choose a way to help.', next: 'end_mallow', set: { ending: 'mallow' } },
    { label: 'Pull the team back while the room is shifting.', next: 'end_retreat', set: { ending: 'retreat' } }
  ] },
  // New immediate-rescue runs give the player a way to coordinate before
  // pulling; saved checkpoints already at end_rescue retain their route.
  rescue_coordination_choice: { location: 'playroom', speaker: 'Narrator', text: 'Niko puts his hand on the release. Mira is on the other side of the door, close enough to hear you.', choices: [
    { label: 'Ask Mira to count you in.', next: 'rescue_coordination_count', set: { rescue_coordination: 'count' } },
    { label: 'Ask Niko to reach for Mira through the gap.', next: 'rescue_coordination_reach', set: { rescue_coordination: 'reach' } }
  ] },
  rescue_coordination_count: { location: 'playroom', speaker: 'Narrator', setOnVisit: { rescue_coordination_seen: 'count' }, text: '“One,” Mira calls. The screen flashes THREE before she can continue. “Use my voice, not the screen. Two. Three—I’m pushing!” Niko grips the release.', next: 'end_rescue' },
  rescue_coordination_reach: { location: 'playroom', speaker: 'Narrator', setOnVisit: { rescue_coordination_seen: 'reach' }, text: 'Niko kneels and reaches beneath the door. Mira’s fingertips find his; paper fingers unfold beside them. “That one isn’t mine,” she says. Niko holds her hand until she pulls clear, then returns to the release.', next: 'end_rescue' },
  plan_record_check: { location: 'playroom', speaker: 'Narrator', text: 'Ash reaches toward the printer. Mira taps twice from behind the door.', next: 'end_record', nextBy: { key: 'audit_action', cases: { unplug: 'record_unplug_choice' } } },
  record_unplug_choice: { location: 'playroom', speaker: 'Narrator', text: 'The printer is still unplugged. The screen can show the record, but the printer needs its own cord before it can put a new copy on paper.', choices: [
    { label: 'Reconnect the printer and print the record.', next: 'record_reconnect', set: { record_power: 'reconnected' } },
    { label: 'Keep it unplugged and open Mira’s door.', next: 'record_leave_unplugged', set: { ending: 'rescue', record_power: 'left_unplugged' } }
  ] },
  record_reconnect: { location: 'playroom', speaker: 'Narrator', text: 'You plug the printer back in. Its motor clicks on; Mallow’s screen was already lit. Mira knocks twice behind the door.', next: 'end_record' },
  record_leave_unplugged: { location: 'playroom', speaker: 'Niko', text: 'All right. The paper we already have stays with us. Mira, we’re opening the door now.', next: 'end_rescue' },
  end_rescue: { location: 'playroom', speaker: 'Narrator', text: 'You pull the manual release with Niko. The latch catches halfway.', mood: 'ending', next: 'rescue_action', nextBy: { key: 'route_action', cases: { fix: 'rescue_fix_companion', proof: 'rescue_without_tool' } } },
  rescue_action: { location: 'playroom', speaker: 'Narrator', text: 'There is just enough room to work.', next: 'rescue_without_tool', nextBy: { key: 'route_action', cases: { fix: 'rescue_fix_companion' } } },
  rescue_without_tool: { location: 'playroom', speaker: 'Niko', text: 'One more pull. Together—now!', next: 'rescue_finish_check', nextBy: { key: 'companion', cases: { Niko: 'rescue_topic_niko', Mira: 'rescue_topic_mira', Ash: 'rescue_topic_ash' } } },
  rescue_topic_niko: { location: 'playroom', speaker: 'Narrator', text: 'Niko takes hold of the release. Mira calls from the other side of the door.', next: 'rescue_finish_check', nextBy: { key: 'rescue_detail_route', cases: { past: 'rescue_niko_topic_past', future: 'rescue_niko_topic_future', light_first: 'rescue_niko_light_first', light_second: 'rescue_niko_light_second' } } },
  rescue_topic_mira: { location: 'playroom', speaker: 'Narrator', text: 'Mira keeps her shoulder against the door while you and Niko take hold of the release.', next: 'rescue_finish_check', nextBy: { key: 'rescue_detail_route', cases: { past: 'rescue_mira_topic_past', future: 'rescue_mira_topic_future', light_first: 'rescue_mira_light_first', light_second: 'rescue_mira_light_second' } } },
  rescue_topic_ash: { location: 'playroom', speaker: 'Narrator', text: 'Ash stays beside the counter while you and Niko take hold of the release.', next: 'rescue_finish_check', nextBy: { key: 'rescue_detail_route', cases: { past: 'rescue_ash_topic_past', future: 'rescue_ash_topic_future', light_first: 'rescue_ash_light_first', light_second: 'rescue_ash_light_second' } } },
  rescue_niko_topic_past: { location: 'playroom', speaker: 'Narrator', text: 'Mira braces her shoulder against the door. Niko lifts the edge he cleared instead of pulling at the whole panel; the release moves and the door shifts.', setOnVisit: { rescue_topic_seen: 'niko_past' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_niko_topic_future: { location: 'playroom', speaker: 'Narrator', text: 'Niko calls out before pulling. Mira counts them in from the other side; you pull together and the door shifts.', setOnVisit: { rescue_topic_seen: 'niko_future' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_mira_topic_past: { location: 'playroom', speaker: 'Narrator', text: 'You call to Mira before pulling. She answers, then pushes while you and Niko lift; the door moves without hitting her.', setOnVisit: { rescue_topic_seen: 'mira_past' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_mira_topic_future: { location: 'playroom', speaker: 'Narrator', text: 'Mira braces her shoulder against the door. When you call, she pushes as you lift the release; the door shifts.', setOnVisit: { rescue_topic_seen: 'mira_future' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_ash_topic_past: { location: 'playroom', speaker: 'Narrator', text: 'Ash listens with a hand on the counter. At the click, they guide Niko’s fingers to the moving catch; your pull shifts the door.', setOnVisit: { rescue_topic_seen: 'ash_past' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_ash_topic_future: { location: 'playroom', speaker: 'Narrator', text: 'Ash points to the release marked on the map, then to its real position beneath the counter. Niko moves his grip there; your pull shifts the door.', setOnVisit: { rescue_topic_seen: 'ash_future' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_niko_light_first: { location: 'playroom', speaker: 'Narrator', text: 'Niko rests his hand against the counter. At the tiny vibration he guides your fingers to the catch; you lift the release and the door shifts.', setOnVisit: { light_rescue_seen: 'niko_first' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_niko_light_second: { location: 'playroom', speaker: 'Narrator', text: 'Niko counts aloud while Mira braces the door. On three, you lift the release together and the door shifts.', setOnVisit: { light_rescue_seen: 'niko_second' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_mira_light_first: { location: 'playroom', speaker: 'Narrator', text: 'You tell Mira where your hands are and ask her to move clear. She answers, then braces the door as you and Niko lift the release. The door shifts.', setOnVisit: { light_rescue_seen: 'mira_first' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_mira_light_second: { location: 'playroom', speaker: 'Narrator', text: 'Mira feels along her side of the door and tells Niko where its lower edge catches. He moves his grip beneath the counter; you lift the release and the door shifts.', setOnVisit: { light_rescue_seen: 'mira_second' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_ash_light_first: { location: 'playroom', speaker: 'Narrator', text: 'Ash checks the release against the edge of the counter, then points Niko to its real position. He moves his grip there; your pull shifts the door.', setOnVisit: { light_rescue_seen: 'ash_first' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_ash_light_second: { location: 'playroom', speaker: 'Narrator', text: 'Ash listens with a hand on the counter and tells Niko when the catch clicks. He moves his fingers there; your pull shifts the door.', setOnVisit: { light_rescue_seen: 'ash_second' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_finish_check: { location: 'playroom', speaker: 'Narrator', text: 'The release moves beneath your hands.', next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_fix_companion: { location: 'playroom', speaker: 'Narrator', text: 'You reach for what you brought.', next: 'rescue_complete', nextBy: { key: 'companion', cases: { Niko: 'rescue_niko_fix', Mira: 'rescue_mira_fix', Ash: 'rescue_ash_fix' } } },
  rescue_niko_fix: { location: 'playroom', speaker: 'Niko', text: 'The spring! Push it under the catch—yes, like that. It’s moving.', setOnVisit: { rescue_tool_seen: 'Niko' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_mira_fix: { location: 'playroom', speaker: 'Narrator', text: 'You loop Mira’s sewing string under the latch and pull. The catch slips free. “Mira, they looped your string under the latch! The catch is free!” Niko calls.', setOnVisit: { rescue_tool_seen: 'Mira', rescue_tool_mira_told: 'yes' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_ash_fix: { location: 'playroom', speaker: 'Ash', text: 'Hold the release there. I can wedge the doorstop into the gap. Now pull!', setOnVisit: { rescue_tool_seen: 'Ash' }, next: 'rescue_complete', nextBy: { key: 'audit_action', cases: { unplug: 'rescue_complete_unplug' } } },
  rescue_complete: { location: 'playroom', speaker: 'Narrator', text: 'The door gives way; Mira tumbles through clutching the third ticket piece. Ash catches her. The machine eats the paper roll before it can print another line.', setOnVisit: { rescue_opened: 'yes', compact_pocket_due: 'yes' }, next: 'rescue_proof_check', nextBy: { key: 'route_action', cases: { proof: 'rescue_proof', fix: 'rescue_reunion_choice', early: 'early_together_comparisons' } } },
  rescue_complete_unplug: { location: 'playroom', speaker: 'Narrator', text: 'The door gives way; Mira tumbles through clutching the third ticket piece. Ash catches her. The unplugged printer stays quiet, and its paper roll remains intact.', setOnVisit: { rescue_opened: 'yes', compact_pocket_due: 'yes' }, next: 'end_rescue_reply', nextBy: { key: 'route_action', cases: { proof: 'rescue_proof_unplug', fix: 'rescue_reunion_choice' } } },
  rescue_proof_check: { location: 'playroom', speaker: 'Narrator', text: 'The printer falls silent.', next: 'end_rescue_reply', nextBy: { key: 'route_action', cases: { proof: 'rescue_proof' } } },
  rescue_proof: { location: 'playroom', speaker: 'Narrator', text: 'The copy you made with your partner survived. Even without the machine’s new printout, you have a record of what you found earlier.', next: 'end_rescue_reply', nextBy: { key: 'rescue_opened', cases: { yes: 'rescue_reunion_choice' } } },
  rescue_proof_unplug: { location: 'playroom', speaker: 'Narrator', text: 'The copy you made with your partner is still in your pocket. You have the paper already in your hands, though the printer has made no new record.', next: 'end_rescue_reply', nextBy: { key: 'rescue_opened', cases: { yes: 'rescue_reunion_choice' } } },
  rescue_reunion_choice: { location: 'playroom', speaker: 'Narrator', text: 'Mira gets to her feet, the third ticket piece curled in her hand. The little door stays open behind her.', choices: [
    { label: 'Offer to carry the ticket while Mira gets her footing.', next: 'rescue_reunion_ticket_compact', set: { rescue_support: 'ticket' } },
    { label: 'Ask Mira where she wants you while everyone moves.', next: 'rescue_reunion_watch_compact', set: { rescue_support: 'watch' } }
  ] },
  rescue_reunion_ticket_compact: { location: 'playroom', speaker: 'Narrator', text: '“Please. My hands are shaking. Keep this one apart from Niko’s two,” Mira says. She passes you the third piece, then takes Ash’s arm and heads toward the stairs. “Thank you. I want to remember where we found it.”', setOnVisit: { rescue_support_seen: 'ticket' }, next: 'evidence_close', nextBy: { key: 'evidence', cases: { receipt: 'close_evidence_receipt', tickets: 'close_evidence_tickets', voice: 'close_evidence_voice' } } },
  rescue_reunion_watch_compact: { location: 'playroom', speaker: 'Narrator', text: '“Watch the door until we’re all clear,” Mira says. “I can carry the ticket.” You watch the gap as she takes Ash’s arm and heads toward the stairs. The door stays open. “Thank you. I couldn’t see it from my side.”', setOnVisit: { rescue_support_seen: 'watch' }, next: 'evidence_close', nextBy: { key: 'evidence', cases: { receipt: 'close_evidence_receipt', tickets: 'close_evidence_tickets', voice: 'close_evidence_voice' } } },
  rescue_reunion_ticket: { location: 'playroom', speaker: 'Mira', text: 'Please. My hands are shaking. Keep this one apart from Niko’s two for now; I want to remember where we actually found it.', next: 'rescue_reunion_ticket_action' },
  rescue_reunion_ticket_action: { location: 'playroom', speaker: 'Narrator', text: 'Mira passes you the third piece. You keep it apart while she takes Ash’s arm and moves toward the stairs.', next: 'end_rescue_reply_ticket' },
  rescue_reunion_watch: { location: 'playroom', speaker: 'Mira', text: 'Watch the door until we’re all clear. I don’t want it closing after someone again. I can carry the ticket.', next: 'rescue_reunion_watch_action' },
  rescue_reunion_watch_action: { location: 'playroom', speaker: 'Narrator', text: 'You watch the gap as Mira carries the third piece toward the stairs. Ash stays beside her. The little door holds open.', next: 'end_rescue_reply_watch' },
  end_rescue_reply: { location: 'playroom', speaker: 'Mira', text: 'I had it under control. Mostly. You can all stop looking at me like that now.', next: 'evidence_close', nextBy: { key: 'evidence', cases: { receipt: 'close_evidence_receipt', tickets: 'close_evidence_tickets', voice: 'close_evidence_voice' } } },
  end_rescue_reply_ticket: { location: 'playroom', speaker: 'Mira', text: 'Thank you for carrying that. I want to remember which piece came from behind the door, even if they all fit together.', next: 'evidence_close', nextBy: { key: 'evidence', cases: { receipt: 'close_evidence_receipt', tickets: 'close_evidence_tickets', voice: 'close_evidence_voice' } } },
  end_rescue_reply_watch: { location: 'playroom', speaker: 'Mira', text: 'Thank you for watching the door. Once I was through, I couldn’t see whether it stayed open.', next: 'evidence_close', nextBy: { key: 'evidence', cases: { receipt: 'close_evidence_receipt', tickets: 'close_evidence_tickets', voice: 'close_evidence_voice' } } },
  end_record: { location: 'playroom', speaker: 'Narrator', text: 'Ash starts the printer. It spits out the false count and the correction it swallowed. The paper jams; Niko pulls the release. Mira shoulders the door open from the other side, shaken but holding the third piece.', mood: 'ending', setOnVisit: { compact_pocket_due: 'yes' }, next: 'end_record_reply', nextBy: { key: 'record_power', cases: { reconnected: 'record_reconnect_explained' } } },
  record_reconnect_explained: { location: 'playroom', speaker: 'Ash', text: 'Mira, that was us reconnecting the printer.', next: 'end_record_reply' },
  end_record_reply: { location: 'playroom', speaker: 'Ash', text: 'We have the record. And we have you. I’m putting those in that order only because I’m holding the paper.', next: 'evidence_close', nextBy: { key: 'route_action', cases: { proof: 'record_proof_companion' } } },
  record_proof_companion: { location: 'playroom', speaker: 'Narrator', text: 'The copy you made earlier is laid beside the new record.', next: 'evidence_close', nextBy: { key: 'companion', cases: { Niko: 'record_proof_niko', Mira: 'record_proof_mira', Ash: 'record_proof_ash' } } },
  record_proof_niko: { location: 'playroom', speaker: 'Niko', text: 'There’s our rubbing: TICKET FOUND, even though the roller was jammed. It was calling things finished before we came down here, too.', next: 'evidence_close' },
  record_proof_mira: { location: 'playroom', speaker: 'Mira', text: 'Our drawing has the tag and the loose ear together. The tag said COMPLETED, but you drew the part it left out. Keep it with the record.', next: 'evidence_close' },
  record_proof_ash: { location: 'playroom', speaker: 'Ash', text: 'Our tracing still has both arrows. The stamp on the map said ROUTE CONFIRMED, but the arrows disagreed. Let’s keep the tracing with this record.', next: 'evidence_close' },
  end_mallow: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'I don’t know if my first answer is the right one. I want to try the release with you.', mood: 'ending', next: 'mallow_camera_check', nextBy: { key: 'mallow_response', cases: { voice: 'end_mallow_voice', search: 'end_mallow_search' } } },
  end_mallow_compact_voice: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'You asked what I thought. I don’t know if my first answer is the right one. I choose to help you, even if I’m afraid. I want to try the release with you.', mood: 'ending', setOnVisit: { mallow_promise_heard: 'voice', mallow_compact_seen: 'voice' }, next: 'mallow_help_evidence', nextBy: { key: 'audit_action', cases: { cover: 'mallow_camera_compact' } } },
  end_mallow_compact_search: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'You asked me to look. I don’t know if my first answer is the right one. I want to try the release with you. Let’s check what the counter is hiding.', mood: 'ending', setOnVisit: { mallow_promise_heard: 'search', mallow_compact_seen: 'search' }, next: 'mallow_help_evidence', nextBy: { key: 'audit_action', cases: { cover: 'mallow_camera_compact' } } },
  end_mallow_voice: { expression: 'concerned', location: 'playroom', speaker: 'Mallow', text: 'You asked what I thought. I choose to help you, even if I’m afraid.', setOnVisit: { mallow_promise_heard: 'voice' }, next: 'mallow_camera_check', nextBy: { key: 'audit_action', cases: { cover: 'mallow_camera_uncover', annotate: 'mallow_help_evidence', unplug: 'mallow_help_evidence', leave: 'mallow_help_evidence' } } },
  end_mallow_search: { location: 'playroom', speaker: 'Mallow', text: 'You asked me to look. Let’s check what the counter is hiding.', setOnVisit: { mallow_promise_heard: 'search' }, next: 'mallow_camera_check', nextBy: { key: 'audit_action', cases: { cover: 'mallow_camera_uncover', annotate: 'mallow_help_evidence', unplug: 'mallow_help_evidence', leave: 'mallow_help_evidence' } } },
  mallow_camera_check: { location: 'playroom', speaker: 'Narrator', text: 'Mallow turns toward the counter.', next: 'mallow_help_evidence', nextBy: { key: 'audit_action', cases: { cover: 'mallow_camera_uncover' } } },
  mallow_camera_compact: { location: 'playroom', speaker: 'Mallow', text: 'I can listen through the star, but I can’t see the catch. Would you move it aside while we look? The little counter’s rattling under Niko’s hand.', setOnVisit: { mallow_camera_offer_seen: 'yes' }, choices: [
    { label: 'Move the star aside while Mallow looks.', next: 'mallow_camera_lift', set: { mallow_camera: 'lift' } },
    { label: 'Keep the lens covered and feel for the catch together.', next: 'mallow_camera_touch', set: { mallow_camera: 'covered' } }
  ] },
  mallow_camera_uncover: { location: 'playroom', speaker: 'Mallow', text: 'I can listen through the star, but I can’t see the catch. Would you move it aside while we look?', next: 'mallow_camera_choice' },
  mallow_camera_choice: { location: 'playroom', speaker: 'Narrator', text: 'The star is still over the lens. The little counter rattles under Niko’s hand.', choices: [
    { label: 'Move the star aside while Mallow looks.', next: 'mallow_camera_lift', set: { mallow_camera: 'lift' } },
    { label: 'Keep the lens covered and feel for the catch together.', next: 'mallow_camera_touch', set: { mallow_camera: 'covered' } }
  ] },
  mallow_camera_lift: { location: 'playroom', speaker: 'Narrator', text: 'You lift the paper star from the lens and keep it in your hand. The counter comes back into view.', next: 'mallow_help_evidence' },
  mallow_camera_touch: { location: 'playroom', speaker: 'Narrator', text: 'You keep the star in place. Niko feels along the counter while Mallow listens; when the wood clicks, you find the catch together.', next: 'end_mallow_2' },
  mallow_help_evidence: { location: 'playroom', speaker: 'Narrator', text: 'Mallow’s painted eyes move from the door to the little counter.', next: 'end_mallow_2', nextBy: { key: 'evidence', cases: { receipt: 'mallow_help_receipt', tickets: 'mallow_help_tickets', voice: 'mallow_help_voice' } } },
  mallow_help_receipt: { location: 'playroom', speaker: 'Mallow', text: 'Ash, hold the receipt beside the printer. I want to see where the paper catches.', next: 'mallow_help_receipt_2' },
  mallow_help_receipt_2: { location: 'playroom', speaker: 'Narrator', text: 'The torn edge catches against a narrow lip under the slot. Mallow’s eyes follow it down to the little counter.', next: 'end_mallow_2' },
  mallow_help_tickets: { location: 'playroom', speaker: 'Mallow', text: 'Niko, hold the two pieces up again. Please move them apart slowly.', next: 'mallow_help_tickets_2' },
  mallow_help_tickets_2: { location: 'playroom', speaker: 'Narrator', text: 'The false third shape wavers between them. As it fades, Mallow’s screen catches a dark notch on the counter behind it.', next: 'end_mallow_2' },
  mallow_help_voice: { location: 'playroom', speaker: 'Mallow', text: 'Mira, can you tap beside the door? I’ll listen for where the sound reaches us.', next: 'mallow_help_voice_2' },
  mallow_help_voice_2: { location: 'playroom', speaker: 'Mira', text: 'Here. Twice, so you know it’s me. Can you hear it?', next: 'mallow_help_voice_3' },
  mallow_help_voice_3: { location: 'playroom', speaker: 'Narrator', text: 'Two taps travel through the little counter. Mallow’s painted eyes turn toward the place where the wood rattles.', next: 'end_mallow_2' },
  end_mallow_2: { location: 'playroom', speaker: 'Narrator', text: 'The hidden catch moves under Niko’s hand. It springs back as soon as he lets go.', next: 'mallow_catch_direct', nextBy: { key: 'moment', cases: { keep: 'mallow_catch_choice', tear: 'mallow_catch_choice' } } },
  mallow_catch_choice: { location: 'playroom', speaker: 'Narrator', text: 'The souvenir is still in your pocket. There is just enough room to hold the catch open.', choices: [
    { label: 'Use the souvenir to wedge the catch.', next: 'mallow_catch_use', set: { card_action: 'use' } },
    { label: 'Keep the souvenir and hold the catch by hand.', next: 'mallow_catch_hold', set: { card_action: 'hold' } },
    { label: 'Use the little spring to hold the catch.', next: 'mallow_catch_tool_niko', requiresTool: 'Niko', set: { card_action: 'tool' } },
    { label: 'Use Mira’s sewing string to pull the catch.', next: 'mallow_catch_tool_mira', requiresTool: 'Mira', set: { card_action: 'tool' } },
    { label: 'Use Ash’s doorstop to wedge the catch.', next: 'mallow_catch_tool_ash', requiresTool: 'Ash', set: { card_action: 'tool' } }
  ] },
  mallow_catch_use: { location: 'playroom', speaker: 'Narrator', text: 'You reach into your pocket.', next: 'mallow_catch_direct', nextBy: { key: 'moment', cases: { keep: 'mallow_catch_use_keep', tear: 'mallow_catch_use_tear' } } },
  mallow_catch_use_keep: { location: 'playroom', speaker: 'Narrator', text: 'You fold the souvenir into a narrow wedge. Niko slides it under the catch. The paper holds as the door rises, its little drawing disappearing beneath the metal. Mira sees its edge through the gap.', setOnVisit: { souvenir_wedge_seen: 'yes' }, next: 'mallow_catch_complete' },
  mallow_catch_use_tear: { location: 'playroom', speaker: 'Narrator', text: 'You fold several torn pieces together. Their ragged edges slip, but Niko pushes them under the catch; they hold just long enough for the door to rise. Mira sees their edges through the gap.', setOnVisit: { souvenir_wedge_seen: 'yes' }, next: 'mallow_catch_complete' },
  mallow_catch_hold: { location: 'playroom', speaker: 'Narrator', text: 'You leave the souvenir in your pocket and press the catch with your fingers. It pinches hard until Niko lifts the door.', setOnVisit: { compact_pocket_due: 'yes' }, next: 'mallow_catch_complete' },
  mallow_catch_tool_niko: { location: 'playroom', speaker: 'Narrator', text: 'You slide the little brass spring under the catch. Niko holds the release while you press it into place; it holds as the door rises.', setOnVisit: { mallow_tool_seen: 'Niko', compact_pocket_due: 'yes' }, next: 'mallow_catch_complete' },
  mallow_catch_tool_mira: { location: 'playroom', speaker: 'Narrator', text: 'You loop Mira’s sewing string around the catch and pull while Niko lifts the door. “Mira, your string is moving the catch!” he calls.', setOnVisit: { mallow_tool_seen: 'Mira', mallow_tool_mira_told: 'yes', compact_pocket_due: 'yes' }, next: 'mallow_catch_complete' },
  mallow_catch_tool_ash: { location: 'playroom', speaker: 'Narrator', text: 'Ash slides the doorstop into the gap while you hold the release. It wedges the catch open long enough for Niko to lift the door.', setOnVisit: { mallow_tool_seen: 'Ash', compact_pocket_due: 'yes' }, next: 'mallow_catch_complete' },
  mallow_catch_direct: { location: 'playroom', speaker: 'Narrator', text: 'Niko braces the catch while you lift the door.', next: 'mallow_catch_complete' },
  mallow_catch_complete: { location: 'playroom', speaker: 'Narrator', text: 'Mira squeezes through, holding the third piece above her head like a tiny trophy. The display goes blank, but the plush moth is still on its shelf upstairs.', next: 'end_mallow_reply' },
  end_mallow_reply: { location: 'playroom', speaker: 'Mira', text: 'I’d like to thank my team, the moth and my outstanding ability to be rescued.', next: 'evidence_close', nextBy: { key: 'evidence', cases: { receipt: 'close_evidence_receipt', tickets: 'close_evidence_tickets', voice: 'close_evidence_voice' } } },
  end_retreat: { location: 'playroom', speaker: 'Narrator', text: 'You pull Niko and Ash back as the floor shifts. Mira’s voice stays on the other side of the door: “I’m still here.” The stairway carries the three of you upstairs before you can reach her.', mood: 'ending', setOnVisit: { retreat_probe_due: 'yes', retreat_fort_closing_due: 'yes' }, next: 'end_retreat_reply' },
  end_retreat_reply: { expression: 'concerned', location: 'hideout', speaker: 'Niko', text: 'We’re not leaving her there. We’ll find another way down. Together.', next: 'retreat_floor' },
  retreat_floor: { location: 'hideout', speaker: 'Narrator', text: 'A dull tap comes through the floor beneath the fort. Ash lifts the edge of the rug. Another tap follows, then silence.', next: 'retreat_choice' },
  retreat_choice: { location: 'hideout', speaker: 'Ash', text: 'It might be her. How should we answer?', choices: [
    { label: 'Tap twice against the floor.', next: 'retreat_tap', set: { retreat_signal: 'tap', retreat_compact: 'yes' } },
    { label: 'Call Mira’s name through the floorboards.', next: 'retreat_call', set: { retreat_signal: 'call', retreat_compact: 'yes' } }
  ] },
  retreat_tap: { location: 'hideout', speaker: 'Narrator', text: 'Your knuckles make two small sounds against the boards. For a long moment there is nothing. Then a single tap sounds from below.', next: 'retreat_after_tap', nextBy: { key: 'retreat_compact', cases: { yes: 'retreat_plan_tap_compact' } } },
  retreat_after_tap: { location: 'hideout', speaker: 'Ash', text: 'If that’s her, maybe she heard us. We’ll keep listening while we work out how to reach her.', next: 'retreat_plan' },
  retreat_call: { location: 'hideout', speaker: 'You', text: 'Mira! We’re here. We’re coming back for you.', next: 'retreat_after_call', nextBy: { key: 'retreat_compact', cases: { yes: 'retreat_plan_call_compact' } } },
  retreat_after_call: { location: 'hideout', speaker: 'Narrator', text: 'Something scrapes beneath the floorboards. You cannot make out a voice. Niko calls her name too, and keeps a hand against the wood.', next: 'retreat_plan' },
  // New choices keep the reply and the plan together. Checkpoints made before
  // the pacing marker continue through the original retreat_plan passages.
  retreat_plan_tap_compact: { location: 'hideout', speaker: 'Narrator', text: '“Two taps from us, one from below,” Niko says. Ash holds the pencil over the map. “It might be Mira. We’ll mark what we hear, but we still have to find her—not just the sound.”', next: 'evidence_close', nextBy: { key: 'retreat_probe_due', cases: { yes: 'retreat_probe_intro' } } },
  retreat_plan_call_compact: { location: 'hideout', speaker: 'Narrator', text: 'Something scrapes beneath the floorboards. Niko calls Mira’s name too, keeping a hand against the wood. “I’ll call at each place we mark.” Ash draws a question mark. “We heard a scrape, not a voice. Let’s mark where it came from.”', next: 'evidence_close', nextBy: { key: 'retreat_probe_due', cases: { yes: 'retreat_probe_intro' } } },
  retreat_plan: { location: 'hideout', speaker: 'Ash', text: 'We can mark the places where we hear those sounds. The map was wrong before; this time we’ll draw what we can actually find.', next: 'evidence_close', nextBy: { key: 'retreat_signal', cases: { tap: 'retreat_plan_tap', call: 'retreat_plan_call' } } },
  retreat_plan_tap: { location: 'hideout', speaker: 'Niko', text: 'Two taps from us, one from below. If we hear it again, let’s mark where it comes from.', next: 'retreat_plan_tap_ash' },
  retreat_plan_tap_ash: { location: 'hideout', speaker: 'Ash', text: 'It might be Mira. We’ll listen, but we still have to find her—not just the sound.', next: 'evidence_close', nextBy: { key: 'retreat_probe_due', cases: { yes: 'retreat_probe_intro' } } },
  retreat_plan_call: { location: 'hideout', speaker: 'Niko', text: 'I’ll keep calling at each place we mark. If Mira can hear us, she’ll know we’re still looking.', next: 'retreat_plan_call_ash' },
  retreat_plan_call_ash: { location: 'hideout', speaker: 'Ash', text: 'I’ll mark where we heard the scrape after you called. If it happens again, we’ll have somewhere to start listening.', next: 'evidence_close', nextBy: { key: 'retreat_probe_due', cases: { yes: 'retreat_probe_intro' } } },
  retreat_probe_intro: { location: 'hideout', speaker: 'Narrator', text: 'The boards give a small knock, a pause, then two more. Niko lifts his hand. Ash looks from the floor to you. “We need a way to tell whether it can hear us.”', next: 'retreat_probe_choice' },
  retreat_probe_choice: { location: 'hideout', speaker: 'Narrator', text: 'The fort is quiet enough to hear the rain. Ash holds the pencil over the map.', choices: [
    { label: 'Repeat the pattern so it might recognise us.', next: 'retreat_probe_repeat', set: { retreat_probe: 'repeat' } },
    { label: 'Try a different pattern and listen for a match.', next: 'retreat_probe_change', set: { retreat_probe: 'change' } }
  ] },
  retreat_probe_repeat: { location: 'hideout', speaker: 'Narrator', text: 'You tap once, pause, then twice. The boards return the same pattern. Niko’s hand hovers above yours, waiting for it to stop.', setOnVisit: { retreat_probe_seen: 'repeat' }, next: 'retreat_probe_repeat_reply' },
  retreat_probe_repeat_reply: { location: 'hideout', speaker: 'Ash', text: 'We heard that pattern before we answered. It might be repeating us, or we might be repeating it. I’ll mark it as a signal, not a location.', next: 'evidence_close', nextBy: { key: 'retreat_probe_seen', cases: { repeat: 'retreat_early_search_choice' } } },
  retreat_probe_change: { location: 'hideout', speaker: 'Narrator', text: 'You tap twice, pause, and raise your hand for one more. A single knock sounds underneath before your hand comes down. Niko pulls his fingers away from the board.', setOnVisit: { retreat_probe_seen: 'change' }, next: 'retreat_probe_change_reply' },
  retreat_probe_change_reply: { location: 'hideout', speaker: 'Niko', text: 'It answered before you finished. I want that to mean Mira heard us. Ash, put a question mark there; I don’t want the map pretending we know.', next: 'evidence_close', nextBy: { key: 'retreat_probe_seen', cases: { change: 'retreat_early_search_choice' } } },
  retreat_early_search_choice: { location: 'hideout', speaker: 'Narrator', text: 'Ash holds the pencil over the map. Niko keeps one hand on the stairway door. Where should you start looking?', choices: [
    { label: 'Check the first stair with Niko.', next: 'retreat_early_search_stair', set: { retreat_search: 'stair', retreat_search_early: 'yes' } },
    { label: 'Follow the sound across the floor with Ash.', next: 'retreat_early_search_sound', set: { retreat_search: 'sound', retreat_search_early: 'yes' } }
  ] },
  retreat_early_search_stair: { location: 'hideout', speaker: 'Narrator', text: 'Niko holds the stairway door while you press the first step. Its outer edge dips, exposing a loose bracket. Ash marks it on the map. “We can bring something to brace it,” Niko says. “Mira, we’re still here!” There is no answer yet.', setOnVisit: { retreat_search_seen: 'stair', compact_retreat_closing: 'yes' }, next: 'evidence_close' },
  retreat_early_search_sound: { location: 'hideout', speaker: 'Narrator', text: 'You and Ash move across the boards, listening. A knock comes from under the edge of the fort, away from the stairway. Ash marks the place with a question mark. “Mira, if that’s you, we’re still looking.” The next sound is rain.', setOnVisit: { retreat_search_seen: 'sound', compact_retreat_closing: 'yes' }, next: 'evidence_close' },
  evidence_close: { location: 'hideout', speaker: 'Narrator', text: 'The team returns to what you noticed.', next: 'kit_check', nextBy: { key: 'evidence', cases: { receipt: 'close_evidence_receipt', tickets: 'close_evidence_tickets', voice: 'close_evidence_voice' } } },
  close_evidence_receipt: { location: 'hideout', speaker: 'Ash', text: 'I’ve kept the receipt that said everyone was together. We know what it got wrong.', next: 'kit_check', nextBy: { key: 'ending', cases: { record: 'record_close_mira' } } },
  close_evidence_tickets: { location: 'hideout', speaker: 'Niko', text: 'These were the two pieces we had when the machine said three. I’m keeping them together so we remember the difference.', next: 'kit_check', nextBy: { key: 'ending', cases: { record: 'record_close_mira' } } },
  close_evidence_voice: { location: 'hideout', speaker: 'Narrator', text: 'You remember Mira’s description: blue wallpaper, a toy chest, one closed door. The machine’s account could not make those details disappear.', next: 'kit_check', nextBy: { key: 'ending', cases: { record: 'record_close_mira' } } },
  record_close_mira: { expression: 'concerned', location: 'hideout', speaker: 'Mira', text: 'I heard the printer before I heard the latch. I could hear you out there, but I didn’t know why you started printing before opening the door.', choices: [
    { label: 'I should have told you what we were doing.', next: 'record_close_apology', set: { record_response: 'apology' } },
    { label: 'What do you need from us now?', next: 'record_close_ask', set: { record_response: 'ask' } }
  ] },
  record_close_apology: { expression: 'concerned', location: 'hideout', speaker: 'Mira', text: 'Thank you for saying that. Next time, even if you don’t have an answer yet, please tell me what you’re trying.', next: 'record_close_ash' },
  record_close_ask: { expression: 'concerned', location: 'hideout', speaker: 'Mira', text: 'Tell me what you’re doing, even if you haven’t found an answer yet. And let me help decide what we do next.', next: 'record_close_ash' },
  record_close_ash: { expression: 'concerned', location: 'hideout', speaker: 'Ash', text: 'We should have explained. We needed a record of what it changed, but you needed to know why we were printing it first.', next: 'kit_check', nextBy: { key: 'record_response', cases: { apology: 'record_close_explain', ask: 'record_close_decide' } } },
  record_close_explain: { location: 'hideout', speaker: 'Narrator', text: 'Ash lays the printout in front of Mira and points to the correction. “I printed this first. Next time I’ll tell you what I’m doing.” Mira folds that part outward, where everyone can read it.', setOnVisit: { record_followup: 'explain' }, next: 'kit_check' },
  record_close_decide: { location: 'hideout', speaker: 'Narrator', text: 'Mira takes the pencil Ash offers and circles the correction on the printout. When Ash turns the map toward her, she marks where she wants the team to start next.', setOnVisit: { record_followup: 'decide' }, next: 'kit_check' },
  kit_check: { location: 'hideout', speaker: 'Narrator', text: 'The stairway rattles behind the team.', next: 'keepsake_check', nextBy: { key: 'repairKit', cases: { free: 'kit_use', paid: 'kit_use' } } },
  kit_use: { location: 'hideout', speaker: 'Narrator', text: 'Niko props the stairway door with the wrench and offers it the bandage too. Ash takes his hand and wraps his knuckles instead. “Machine, then person,” they remind him. The steps beyond the door still shiver.', setOnVisit: { kit_use_seen: 'yes' }, next: 'keepsake_check', nextBy: { key: 'ending', cases: { retreat: 'kit_use_retreat' } } },
  kit_use_retreat: { location: 'hideout', speaker: 'Niko', text: 'At least we can keep an eye on the stairs now. We still need a safe way to reach Mira.', next: 'keepsake_check' },
  keepsake_check: { location: 'hideout', speaker: 'Narrator', text: 'The signal you chose for the team is still in the fort.', next: 'closing_choice', nextBy: { key: 'keepsake_closing_route', cases: { star: 'close_star', star_returned: 'close_star_returned', bell: 'close_bell', ribbon: 'close_ribbon' } } },
  close_star: { location: 'hideout', speaker: 'Narrator', text: 'The star is still fixed to the map, covering Niko’s accidental hole. It marks a place the team can find again.', next: 'souvenir_check', nextBy: { key: 'ending', cases: { rescue: 'souvenir_pocket', record: 'souvenir_pocket', retreat: 'souvenir_pocket' } } },
  close_star_returned: { location: 'hideout', speaker: 'Narrator', text: 'A star covers Niko’s accidental hole in the map. You saw one like it move across the playroom door. You can’t tell if it was the same star. It marks a place the team can find again.', next: 'souvenir_check', nextBy: { key: 'ending', cases: { rescue: 'souvenir_pocket', record: 'souvenir_pocket', retreat: 'souvenir_pocket' } } },
  close_bell: { location: 'hideout', speaker: 'Niko', text: 'One ring means we found something. We found a way to keep going, at least.', next: 'souvenir_check', nextBy: { key: 'ending', cases: { rescue: 'souvenir_pocket', record: 'souvenir_pocket', retreat: 'souvenir_pocket' } } },
  close_ribbon: { location: 'hideout', speaker: 'Ash', text: 'The ribbon is still here. It’s a route back—and yes, the decorative flourish helped.', next: 'souvenir_check', nextBy: { key: 'ending', cases: { rescue: 'souvenir_pocket', record: 'souvenir_pocket', retreat: 'souvenir_pocket' } } },
  souvenir_check: { location: 'hideout', speaker: 'Narrator', text: 'You think of the little picture the room made for you.', next: 'souvenir_pocket', nextBy: { key: 'souvenir_wedge_route', cases: { use: 'souvenir_used', niko_care: 'souvenir_used_niko_care', niko_play: 'souvenir_used_niko_play', mira_care: 'souvenir_used_mira_care', mira_play: 'souvenir_used_mira_play', ash_care: 'souvenir_used_ash_care', ash_play: 'souvenir_used_ash_play' } } },
  souvenir_pocket: { location: 'hideout', speaker: 'Narrator', text: 'You reach into your pocket for the picture the room made.', next: 'closing_choice', nextBy: { key: 'moment', cases: { keep: 'souvenir_kept', tear: 'souvenir_torn' } } },
  souvenir_kept: { location: 'hideout', speaker: 'Narrator', text: 'The picture is still folded where you put it away. A crease runs through its perfect moment, made by your hand instead of the machine. The fort light is still on.', next: 'closing_choice', nextBy: { key: 'companion', cases: { Niko: 'close_niko', Mira: 'close_mira_check', Ash: 'close_ash' } } },
  souvenir_torn: { location: 'hideout', speaker: 'Narrator', text: 'The four scraps catch on your fingers. You could fit them together again, but you can still see the places where you tore them apart. The fort light is still on.', next: 'closing_choice', nextBy: { key: 'companion', cases: { Niko: 'close_niko', Mira: 'close_mira_check', Ash: 'close_ash' } } },
  souvenir_used: { location: 'hideout', speaker: 'Narrator', text: 'The paper is still wedged beneath the catch downstairs. It held long enough for Mira to come through. Back in the fort, the light is still on.', next: 'closing_choice', nextBy: { key: 'companion', cases: { Niko: 'close_niko', Mira: 'close_mira_check', Ash: 'close_ash' } } },
  souvenir_used_niko_care: { location: 'hideout', speaker: 'Narrator', text: 'The paper is still wedged beneath the catch downstairs. It held long enough for Mira to come through. “I remember you sorting the screws with me,” Niko says. “We can leave the paper there.” The fort light is still on.', setOnVisit: { souvenir_callback_seen: 'niko_care' }, next: 'close_niko' },
  souvenir_used_niko_play: { location: 'hideout', speaker: 'Narrator', text: 'The paper is still wedged beneath the catch downstairs. It held long enough for Mira to come through. “I remember your little crown,” Niko says. “We can leave the paper there.” The fort light is still on.', setOnVisit: { souvenir_callback_seen: 'niko_play' }, next: 'close_niko' },
  souvenir_used_mira_care: { location: 'hideout', speaker: 'Narrator', text: 'The paper is still wedged beneath the catch downstairs. It held long enough for Mira to come through. “You held the ear for me,” Mira says. “I remember. We can leave the paper there.” The fort light is still on.', setOnVisit: { souvenir_callback_seen: 'mira_care' }, next: 'close_mira_check' },
  souvenir_used_mira_play: { location: 'hideout', speaker: 'Narrator', text: 'The paper is still wedged beneath the catch downstairs. It held long enough for Mira to come through. “I still have our little knight in my sketchbook,” Mira says. “We can leave the paper there.” The fort light is still on.', setOnVisit: { souvenir_callback_seen: 'mira_play' }, next: 'close_mira_check' },
  souvenir_used_ash_care: { location: 'hideout', speaker: 'Narrator', text: 'The paper is still wedged beneath the catch downstairs. It held long enough for Mira to come through. “Your rest stop is still on my map,” Ash says. “We can leave the paper there.” The fort light is still on.', setOnVisit: { souvenir_callback_seen: 'ash_care' }, next: 'close_ash' },
  souvenir_used_ash_play: { location: 'hideout', speaker: 'Narrator', text: 'The paper is still wedged beneath the catch downstairs. It held long enough for Mira to come through. “The building inspector is still on my map,” Ash says. “We can leave the paper there.” The fort light is still on.', setOnVisit: { souvenir_callback_seen: 'ash_play' }, next: 'close_ash' },
  closing_choice: { location: 'hideout', speaker: 'Narrator', text: 'Back in the arcade, the fort light is still on. The night has not returned to the version the machine printed.', next: 'close_niko', nextBy: { key: 'companion', cases: { Niko: 'close_niko', Mira: 'close_mira_check', Ash: 'close_ash' } } },
  close_niko: { location: 'hideout', speaker: 'Niko', text: 'My brother taught me to listen when a machine says something is wrong. I think you taught me to listen when it insists everything is fine.', next: 'close_signal', nextBy: { key: 'bond', cases: { care: 'close_niko_bond_care', play: 'close_niko_bond_play' } } },
  close_niko_bond_care: { location: 'hideout', speaker: 'Niko', text: 'The little screws we sorted will be ready when we open the panel again.', next: 'close_niko_topic', nextBy: { key: 'topic', cases: { light: 'close_niko_light', past: 'close_niko_past', future: 'close_niko_future' } } },
  close_niko_bond_play: { location: 'hideout', speaker: 'Niko', text: 'Your crown is still by the machine. I’ll keep it safe for the next royal inspection.', next: 'close_niko_topic', nextBy: { key: 'topic', cases: { light: 'close_niko_light', past: 'close_niko_past', future: 'close_niko_future' } } },
  close_niko_topic: { location: 'hideout', speaker: 'Narrator', text: 'Niko looks toward the machines downstairs.', next: 'close_signal', nextBy: { key: 'topic', cases: { light: 'close_niko_light', past: 'close_niko_past', future: 'close_niko_future' } } },
  close_niko_past: { location: 'hideout', speaker: 'Niko', text: 'When we go back, I’ll start with the easy things. My brother’s rule still works, even when the problem is enormous.', next: 'close_niko_talk_choice', nextBy: { key: 'ending', cases: { retreat: 'close_niko_retreat_past' } } },
  close_niko_future: { location: 'hideout', speaker: 'Niko', text: 'When we get the chance, I want to ask everyone what tradition we should make next. I don’t think I need to wait for permission.', next: 'close_niko_talk_choice', nextBy: { key: 'ending', cases: { retreat: 'close_niko_retreat_future' } } },
  close_niko_retreat_past: { expression: 'concerned', location: 'hideout', speaker: 'Niko', text: 'First, let’s listen at the stairwell again. If that sound was Mira, we might be able to follow it.', setOnVisit: { niko_retreat_topic_seen: 'past' }, next: 'close_niko_talk_choice' },
  close_niko_retreat_future: { expression: 'concerned', location: 'hideout', speaker: 'Niko', text: 'First we find a way back to Mira. Will you listen with me at the stairwell?', setOnVisit: { niko_retreat_topic_seen: 'future' }, next: 'close_niko_talk_choice' },
  close_mira_retreat_light: { location: 'hideout', speaker: 'Narrator', text: 'Mira is still below. You remember the unfinished plush and the work you did together. While Ash and Niko listen at the stairway, you think of her sewing room: it might have something to help the search.', setOnVisit: { mira_retreat_prepare_due: 'yes' }, next: 'close_signal', nextBy: { key: 'bond', cases: { care: 'close_mira_retreat_care', play: 'close_mira_retreat_play' } } },
  close_mira_light: { location: 'sewing', speaker: 'Mira', text: 'I’m glad we got back together. I want to finish that plush when we can bring it upstairs.', next: 'close_signal', nextBy: { key: 'bond', cases: { care: 'close_mira_bond_care', play: 'close_mira_knight_check' } } },
  close_mira_light_topic: { location: 'sewing', speaker: 'Mira', text: 'We can decide where its ear goes together. The pencil is right where we left it.', setOnVisit: { light_close_seen: 'Mira' }, next: 'close_mira_talk_choice' },
  close_mira_retreat_light_topic: { location: 'sewing', speaker: 'Narrator', text: 'Mira’s pencil rolls towards the sketchbook and stops at its edge. You haven’t touched it.', next: 'close_signal', nextBy: { key: 'mira_retreat_prepare_due', cases: { yes: 'mira_retreat_prepare_choice' } } },
  close_niko_light: { location: 'hideout', speaker: 'Niko', text: 'It helped having you beside me at the machine. I think we make a decent repair team.', setOnVisit: { light_close_seen: 'Niko' }, next: 'close_niko_talk_choice' },
  close_ash_light: { location: 'hideout', speaker: 'Ash', text: 'The map has room for another pair of eyes. I’d like you to keep looking with me.', setOnVisit: { light_close_seen: 'Ash' }, next: 'close_ash_talk_choice', nextBy: { key: 'ending', cases: { retreat: 'close_ash_retreat_light' } } },
  close_ash_retreat_light: { expression: 'concerned', location: 'hideout', speaker: 'Ash', text: 'Let’s keep listening and mark what we actually hear. Mira still needs a way back.', setOnVisit: { light_close_seen: 'Ash' }, next: 'close_ash_retreat_talk_choice' },
  close_ash_retreat_light_compact: { expression: 'concerned', location: 'hideout', speaker: 'Ash', text: 'The map has room for another pair of eyes. I’d like you to keep looking with me. Let’s keep listening and mark what we actually hear. Mira still needs a way back.', setOnVisit: { light_close_seen: 'Ash', ash_retreat_light_seen: 'yes' }, choices: [
    { label: 'Say something privately to Ash.', next: 'close_ash_retreat_input' },
    { label: 'Rejoin the others.', next: 'close_signal' }
  ] },
  close_mira_check: { location: 'hideout', speaker: 'Narrator', text: 'You think of the unfinished plush and the conversation upstairs.', next: 'close_mira_enter', nextBy: { key: 'mira_close_route', cases: { retreat: 'close_mira_retreat', light_retreat: 'close_mira_retreat_light' } } },
  close_mira_enter: { location: 'sewing', speaker: 'Narrator', text: 'Mira catches your eye and leads you into her sewing room, away from the others. She rests a hand on her sketchbook. The unfinished plush is still downstairs.', next: 'close_mira', nextBy: { key: 'mira_light_close_route', cases: { care: 'close_mira_light_care_compact', play: 'close_mira_light_play_compact', named: 'close_mira_light_named_compact', legacy_light: 'close_mira_light' } } },
  close_mira_light_care_compact: { location: 'sewing', speaker: 'Mira', text: 'I’m glad we got back together. When we bring the plush upstairs, will you hold its ear for me again? The pencil’s right where we left it.', setOnVisit: { light_close_seen: 'Mira', mira_light_compact_seen: 'care' }, next: 'close_mira_talk_choice' },
  close_mira_light_play_compact: { location: 'sewing', speaker: 'Mira', text: 'I’m glad we got back together. When we bring the plush back, we can name our little knight while I finish its ear. The pencil’s right where we left it.', setOnVisit: { light_close_seen: 'Mira', mira_light_compact_seen: 'play' }, next: 'close_mira_talk_choice' },
  close_mira_light_named_compact: { location: 'sewing', speaker: 'Mira', text: 'I’m glad we got back together. When we bring the plush back, I’ll sew its ear on and make it a proper name tag: {knightName}. The pencil’s right where we left it.', setOnVisit: { light_close_seen: 'Mira', mira_light_compact_seen: 'named' }, next: 'close_mira_talk_choice' },
  close_mira_retreat: { location: 'hideout', speaker: 'Narrator', text: 'Mira is still below. You remember what she told you about the workshop. While Ash and Niko listen at the stairway, you think of her sewing room: it might have something to help the search.', setOnVisit: { mira_retreat_prepare_due: 'yes' }, next: 'close_signal', nextBy: { key: 'bond', cases: { care: 'close_mira_retreat_care', play: 'close_mira_retreat_play' } } },
  close_mira_retreat_care: { location: 'sewing', speaker: 'Narrator', text: 'You step into Mira’s sewing room. The unfinished plush was down in the playroom; you clear a place on her worktable for it when you can bring it back.', next: 'close_mira_retreat_topic', nextBy: { key: 'topic', cases: { light: 'close_mira_retreat_light_topic', past: 'close_mira_retreat_past', future: 'close_mira_retreat_future' } } },
  close_mira_retreat_play: { location: 'sewing', speaker: 'Narrator', text: 'In Mira’s sewing room, your little helmeted knight is still in her sketchbook. You leave the page open where she can find it when she returns.', next: 'close_mira_retreat_topic', nextBy: { key: 'topic', cases: { light: 'close_mira_retreat_light_topic', past: 'close_mira_retreat_past', future: 'close_mira_retreat_future' } } },
  close_mira_retreat_topic: { location: 'sewing', speaker: 'Narrator', text: 'Her pencil lies beside the sketchbook.', next: 'close_signal', nextBy: { key: 'topic', cases: { light: 'close_mira_retreat_light_topic', past: 'close_mira_retreat_past', future: 'close_mira_retreat_future' } } },
  close_mira_retreat_past: { location: 'sewing', speaker: 'Narrator', text: 'You remember what she wanted her friends to know. There will be time to tell them, if she wants to, when she gets back.', next: 'close_signal', nextBy: { key: 'mira_retreat_prepare_due', cases: { yes: 'mira_retreat_prepare_choice' } } },
  close_mira_retreat_future: { location: 'sewing', speaker: 'Narrator', text: 'You remember how she wanted to make something without a request. You leave a clean page for whatever she decides to draw.', next: 'close_signal', nextBy: { key: 'mira_retreat_prepare_due', cases: { yes: 'mira_retreat_prepare_choice' } } },
  mira_retreat_prepare_choice: { location: 'sewing', speaker: 'Narrator', text: 'Mira’s sketchbook is open beside a spool of bright thread. The others are waiting in the fort; you can take one thing back with you.', choices: [
    { label: 'Bring the sketchbook to the fort, beside Ash’s map.', next: 'mira_retreat_prepare_sketchbook', set: { mira_retreat_prepare: 'sketchbook' } },
    { label: 'Take the thread to mark the way back from the stairway.', next: 'mira_retreat_prepare_thread', set: { mira_retreat_prepare: 'thread' } }
  ] },
  mira_retreat_prepare_sketchbook: { location: 'hideout', speaker: 'Narrator', text: 'You bring the sketchbook to the fort and open it beside Ash’s map. Ash marks the stairway, leaving room to record the next sound. A matching line appears on the sketchbook page, though Ash’s pencil never leaves the map.', setOnVisit: { mira_retreat_prepare_seen: 'sketchbook' }, next: 'close_signal' },
  mira_retreat_prepare_thread: { location: 'hideout', speaker: 'Narrator', text: 'You carry the bright thread to the fort and tie it between a chair and the stairway door handle. Niko follows it back to the chairs without taking his eyes off the stairs. The thread tightens; Ash catches it before the knot pulls free.', setOnVisit: { mira_retreat_prepare_seen: 'thread' }, next: 'close_signal' },
  close_mira: { location: 'sewing', speaker: 'Mira', text: 'About that workshop: I still want to go. I’m glad I told you. Wanting a bigger world doesn’t mean I have to stop caring about this one.', next: 'close_signal', nextBy: { key: 'bond', cases: { care: 'close_mira_bond_care', play: 'close_mira_knight_check' } } },
  close_mira_bond_care: { location: 'sewing', speaker: 'Mira', text: 'When we bring the plush back upstairs, will you hold that ear in place for me again? I think it deserves to be finished properly.', next: 'close_mira_topic', nextBy: { key: 'topic', cases: { light: 'close_mira_light_topic', past: 'close_mira_past', future: 'close_mira_future' } } },
  close_mira_knight_check: { location: 'sewing', speaker: 'Narrator', text: 'Mira rests her pencil beside your drawing.', next: 'close_mira_bond_play', nextBy: { key: 'knight_named', cases: { yes: 'close_mira_knight_named' } } },
  close_mira_knight_named: { location: 'sewing', speaker: 'Mira', text: 'When we bring the plush back, I’ll sew its ear on and make it a proper name tag: {knightName}', next: 'close_mira_topic', nextBy: { key: 'topic', cases: { light: 'close_mira_light_topic', past: 'close_mira_past', future: 'close_mira_future' } } },
  close_mira_bond_play: { location: 'sewing', speaker: 'Mira', text: 'Our little knight needs a name. Once we bring the plush back, we can decide while I finish its ear.', next: 'close_mira_topic', nextBy: { key: 'topic', cases: { light: 'close_mira_light_topic', past: 'close_mira_past', future: 'close_mira_future' } } },
  close_mira_topic: { location: 'sewing', speaker: 'Narrator', text: 'Mira picks up her pencil.', next: 'close_signal', nextBy: { key: 'topic', cases: { light: 'close_mira_light_topic', past: 'close_mira_past', future: 'close_mira_future' } } },
  close_mira_past: { location: 'sewing', speaker: 'Mira', text: 'I think I can find a way to tell them what I meant. Not tonight, maybe. But soon.', next: 'close_mira_talk_choice' },
  close_mira_future: { location: 'sewing', speaker: 'Mira', text: 'I’m going to leave a page blank for the thing I haven’t thought of yet. That counts as a plan, doesn’t it?', next: 'close_mira_talk_choice' },
  close_ash: { location: 'hideout', speaker: 'Ash', text: 'I’ll keep the map, even the parts that disagree. Could you hold this corner? It keeps folding itself shut.', next: 'close_signal', nextBy: { key: 'bond', cases: { care: 'close_ash_bond_care', play: 'close_ash_bond_play' } } },
  close_ash_bond_care: { location: 'hideout', speaker: 'Ash', text: 'Your rest stop stays on the map. Somewhere to pause and listen, even when we don’t want to stop.', next: 'close_ash_topic', nextBy: { key: 'topic', cases: { light: 'close_ash_light', past: 'close_ash_past', future: 'close_ash_future' } } },
  close_ash_bond_play: { location: 'hideout', speaker: 'Ash', text: 'The building inspector is still on the map. I’ve drawn them a tiny torch, so they can help us look.', next: 'close_ash_topic', nextBy: { key: 'topic', cases: { light: 'close_ash_light', past: 'close_ash_past', future: 'close_ash_future' } } },
  close_ash_topic: { location: 'hideout', speaker: 'Narrator', text: 'Ash unfolds the map once more.', next: 'close_signal', nextBy: { key: 'topic', cases: { light: 'close_ash_light', past: 'close_ash_past', future: 'close_ash_future' } } },
  close_ash_past: { location: 'hideout', speaker: 'Ash', text: 'I keep thinking about those lanterns. I had to stop and listen then, too.', next: 'close_ash_talk_choice', nextBy: { key: 'ending', cases: { retreat: 'close_ash_retreat_past' } } },
  close_ash_future: { location: 'hideout', speaker: 'Ash', text: 'There’s room to change this map. I’m beginning to think that’s the most useful thing on it.', next: 'close_ash_talk_choice', nextBy: { key: 'ending', cases: { retreat: 'close_ash_retreat_future' } } },
  close_ash_retreat_past: { expression: 'concerned', location: 'hideout', speaker: 'Ash', text: 'I don’t know if that sound was Mira. I want to believe it was, but I need you to tell me what you hear too.', next: 'close_ash_retreat_talk_choice' },
  close_ash_retreat_future: { expression: 'concerned', location: 'hideout', speaker: 'Ash', text: 'If the next arrow leads nowhere, we cross it out and try again. Will you help me redraw it?', next: 'close_ash_retreat_talk_choice' },
  close_ash_retreat_talk_choice: { location: 'hideout', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash holds the map open and makes room for you beside them.', choices: [
    { label: 'Say something privately to Ash.', next: 'close_ash_retreat_input' },
    { label: 'Rejoin the others.', next: 'close_signal' }
  ] },
  close_ash_retreat_input: { location: 'hideout', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash lowers their voice so the others cannot hear.', input: { key: 'epilogue', prompt: 'What do you say to Ash?', placeholder: 'Say something to Ash…', default: 'Let’s listen and find her together.', next: 'close_ash_retreat_chat' } },
  close_ash_retreat_chat: { expression: 'concerned', location: 'hideout', speaker: 'Ash', text: 'I’ll keep listening for Mira. The map has room for what we find.', ai: { character: 'Ash', inputKey: 'epilogue', resumePrivate: true, context: 'You are Ash, a careful adult friend. Speak privately beside your map after the floor shifted. Mira is still downstairs and the team is looking for a way back to her. Be dry but caring. Invent no events or future.', fallback: 'I’ll keep listening for Mira. The map has room for what we find.' }, next: 'close_signal' },
  close_niko_talk_choice: { location: 'hideout', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'Niko waits beside you, watching the stairway entrance.', choices: [
    { label: 'Say something privately to Niko.', next: 'close_niko_input' },
    { label: 'Rejoin the others.', next: 'close_signal' }
  ] },
  close_niko_input: { location: 'hideout', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'For a moment, you and Niko are alone.', input: { key: 'epilogue', prompt: 'What do you say to Niko?', placeholder: 'Say something to Niko…', default: 'We can figure out what comes next together.', next: 'close_niko_chat' } },
  close_niko_chat: { location: 'hideout', speaker: 'Niko', text: 'I’m glad you’re here. We can take the next step together.', ai: { character: 'Niko', inputKey: 'epilogue', resumePrivate: true, context: 'You are Niko, an adult arcade caretaker. Privately after a frightening night, speak to the player. Your brother taught you repairs. Invent no events or future.', fallback: 'I’m glad you’re here. We can take the next step together.' }, next: 'close_signal' },
  close_mira_talk_choice: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira leaves her pencil on the page and looks up at you.', choices: [
    { label: 'Say something privately to Mira.', next: 'close_mira_input' },
    { label: 'Rejoin the others.', next: 'close_signal' }
  ] },
  close_mira_input: { location: 'sewing', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'The others are waiting outside the sewing room.', input: { key: 'epilogue', prompt: 'What do you say to Mira?', placeholder: 'Say something to Mira…', default: 'I’m glad we found our way back.', next: 'close_mira_chat' } },
  close_mira_chat: { location: 'sewing', speaker: 'Mira', text: 'I’m glad we have a little time to talk.', ai: { character: 'Mira', inputKey: 'epilogue', resumePrivate: true, context: 'You are Mira, an adult plush maker. Privately in your sewing room after a frightening night, speak to the player. Invent no events or future.', fallback: 'I’m glad we have a little time to talk.' }, next: 'close_signal' },
  close_ash_talk_choice: { location: 'hideout', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash holds the map open and makes room for you beside them.', choices: [
    { label: 'Say something privately to Ash.', next: 'close_ash_input' },
    { label: 'Rejoin the others.', next: 'close_signal' }
  ] },
  close_ash_input: { location: 'hideout', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash lowers their voice so the others cannot hear.', input: { key: 'epilogue', prompt: 'What do you say to Ash?', placeholder: 'Say something to Ash…', default: 'We don’t have to map everything tonight.', next: 'close_ash_chat' } },
  close_ash_chat: { location: 'hideout', speaker: 'Ash', text: 'I’ll leave a little space on the map for whatever comes next.', ai: { character: 'Ash', inputKey: 'epilogue', resumePrivate: true, context: 'You are Ash, a careful adult friend. Speak privately beside your map after a frightening night. Be dry but caring. Invent no events or future.', fallback: 'I’ll leave a little space on the map for whatever comes next.' }, next: 'close_signal' },
  close_signal: { location: 'arcade', speaker: 'Narrator', text: 'You return to the prize counter. The moth remains still on its shelf.', setOnVisit: { mallow_ack_due: 'yes' }, next: 'close_private', nextBy: { key: 'connection_closing_route', cases: { repeat: 'close_repeat', private: 'close_private', Niko: 'close_connection_niko', Mira: 'close_connection_mira', Ash: 'close_connection_ash', Niko_moment: 'close_connection_niko_moment', Mira_moment: 'close_connection_mira_moment', Ash_moment: 'close_connection_ash_moment' } } },
  close_connection_niko: { location: 'arcade', speaker: 'Niko', text: 'That milkshake still sounds good to me, if you’d like it too. No hurry.', next: 'close_private', nextBy: { key: 'signal', cases: { repeat: 'close_repeat', private: 'close_private' } } },
  close_connection_mira: { location: 'arcade', speaker: 'Mira', text: 'I’d still like to make something with you. We can decide when we’ve caught our breath.', next: 'close_private', nextBy: { key: 'signal', cases: { repeat: 'close_repeat', private: 'close_private' } } },
  close_connection_ash: { location: 'arcade', speaker: 'Ash', text: 'I’d still like that date. We can leave the map blank until we both feel ready.', next: 'close_private', nextBy: { key: 'signal', cases: { repeat: 'close_repeat', private: 'close_private' } } },
  close_connection_niko_moment: { location: 'arcade', speaker: 'Niko', text: 'That milkshake still sounds good to me, if you’d like it too. No hurry.', choices: [
    { label: 'Suggest an emergency-biscuit milkshake.', next: 'close_connection_niko_now', set: { connection_moment: 'now' } },
    { label: 'Leave the flavour for another day; stay beside Niko.', next: 'close_connection_niko_later', set: { connection_moment: 'later' } }
  ] },
  close_connection_niko_now: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: '“Emergency-biscuit milkshake?” you say. Niko makes a solemn note in the air. “I’ll put it on a badge. Nobody can stop us.” He laughs.', setOnVisit: { connection_moment_seen: 'Niko_now' }, next: 'close_private', nextBy: { key: 'signal', cases: { repeat: 'close_repeat', private: 'close_private' } } },
  close_connection_niko_later: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Niko', text: 'You stand beside Niko under the counter light. He lets the silence last. “We can decide later,” he says, and stays with you.', setOnVisit: { connection_moment_seen: 'Niko_later' }, next: 'close_private', nextBy: { key: 'signal', cases: { repeat: 'close_repeat', private: 'close_private' } } },
  close_connection_mira_moment: { location: 'arcade', speaker: 'Mira', text: 'I’d still like to make something with you. We can decide when we’ve caught our breath.', choices: [
    { label: 'Fold a little paper moth together now.', next: 'close_connection_mira_now', set: { connection_moment: 'now' } },
    { label: 'Leave the project open; stay beside Mira.', next: 'close_connection_mira_later', set: { connection_moment: 'later' } }
  ] },
  close_connection_mira_now: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'Mira finds a scrap of wrapping paper beside the prize counter. You fold it once; she makes two crooked wings. She sets the paper moth under the counter light. “That’s ours,” she says.', setOnVisit: { connection_moment_seen: 'Mira_now' }, next: 'close_private', nextBy: { key: 'signal', cases: { repeat: 'close_repeat', private: 'close_private' } } },
  close_connection_mira_later: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Mira', text: 'You stay beside Mira at the counter. She rests her hand on the wood. “No rush,” she says. “We can just be here.”', setOnVisit: { connection_moment_seen: 'Mira_later' }, next: 'close_private', nextBy: { key: 'signal', cases: { repeat: 'close_repeat', private: 'close_private' } } },
  close_connection_ash_moment: { location: 'arcade', speaker: 'Ash', text: 'I’d still like that date. We can leave the map blank until we both feel ready.', choices: [
    { label: 'Mark an unexplored place on Ash’s map together.', next: 'close_connection_ash_now', set: { connection_moment: 'now' } },
    { label: 'Leave the map blank and stay beside Ash.', next: 'close_connection_ash_later', set: { connection_moment: 'later' } }
  ] },
  close_connection_ash_now: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash unfolds the map they brought from the fort. You point to an empty corner; Ash draws an X, then hands you the pencil. You add a crooked arrow. “Somewhere we haven’t decided yet,” they say. “I like that.”', setOnVisit: { connection_moment_seen: 'Ash_now' }, next: 'close_private', nextBy: { key: 'signal', cases: { repeat: 'close_repeat', private: 'close_private' } } },
  close_connection_ash_later: { location: 'arcade', speaker: 'Narrator', portraitSpeaker: 'Ash', text: 'Ash folds the map without adding a mark. You stand together under the counter light. “No plan required,” they say.', setOnVisit: { connection_moment_seen: 'Ash_later' }, next: 'close_private', nextBy: { key: 'signal', cases: { repeat: 'close_repeat', private: 'close_private' } } },
  close_repeat: { location: 'arcade', speaker: 'Narrator', text: 'You can still hear the words you let Mallow repeat. Its upside-down eye watches from the shelf.', next: 'close_reason', nextBy: { key: 'mallow_closing_route', cases: { acknowledge: 'close_mallow_ack_choice', mallow: 'close_mallow_shelf', retreat: 'retreat_search_return' } } },
  close_private: { location: 'arcade', speaker: 'Narrator', text: 'The plush moth’s mouth stays shut. You did not let it repeat your private conversation to the crew. Somehow, it still knows the words.', next: 'close_reason', nextBy: { key: 'mallow_closing_route', cases: { acknowledge: 'close_mallow_ack_choice', mallow: 'close_mallow_shelf', retreat: 'retreat_search_return' } } },
  close_mallow_ack_choice: { location: 'arcade', speaker: 'Narrator', text: 'The fort light is still on.', choices: [
    { label: 'Ask whether Mallow can hear you.', next: 'close_mallow_ack_speak', set: { mallow_ack: 'speak' } },
    { label: 'Rejoin the others.', next: 'close_reason', set: { mallow_ack: 'rejoin' } }
  ] },
  close_mallow_ack_speak: { location: 'arcade', speaker: 'Narrator', text: '“Mallow? Can you hear me? Thank you for telling us,” you say. The plush remains still. After a moment, you return to the fort.', setOnVisit: { mallow_ack_seen: 'speak' }, next: 'close_reason' },
  retreat_search_return: { location: 'hideout', speaker: 'Narrator', text: 'Back at the fort, Ash keeps the map open beside the stairway.', next: 'retreat_search_choice', nextBy: { key: 'retreat_search_early', cases: { yes: 'close_reason_retreat' } } },
  retreat_search_choice: { location: 'hideout', speaker: 'Narrator', text: 'Back at the fort, Ash opens the map beside the stairway. Niko has one hand on the door. The boards give a quiet knock beneath you. Where should you start looking?', choices: [
    { label: 'Check the first stair with Niko.', next: 'retreat_search_stair', set: { retreat_search: 'stair' } },
    { label: 'Follow the sound across the floor with Ash.', next: 'retreat_search_sound', set: { retreat_search: 'sound' } }
  ] },
  retreat_search_stair: { location: 'hideout', speaker: 'Narrator', text: 'Niko holds the stairway door while you press the first step. Its outer edge dips, exposing a loose bracket. Ash marks it on the map. “We can bring something to brace it,” Niko says. “Mira, we’re still here!” There is no answer yet.', next: 'close_reason_retreat' },
  retreat_search_sound: { location: 'hideout', speaker: 'Narrator', text: 'You and Ash move across the boards, listening. A knock comes from under the edge of the fort, away from the stairway. Ash marks the place with a question mark. “Mira, if that’s you, we’re still looking.” The next sound is rain.', next: 'close_reason_retreat' },
  close_mallow_shelf: { location: 'arcade', speaker: 'Narrator', text: 'Beside you at the counter, Mira lifts Mallow down from the prize shelf. The plush’s scarf is caught beneath its upside-down eye. She frees the fabric and holds the moth against her chest.', next: 'close_mallow_thanks', nextBy: { key: 'mallow_promise_heard', cases: { voice: 'close_mallow_voice_thanks', search: 'close_mallow_search_thanks' } } },
  close_mallow_thanks: { location: 'arcade', speaker: 'Mira', text: 'Mallow helped us. I hope it can hear me say thank you. I don’t know what happened when the screen went dark.', next: 'close_mallow_choice' },
  close_mallow_voice_thanks: { location: 'arcade', speaker: 'Mira', text: 'You asked what it thought. It said it wanted to help, even though it was afraid. I heard it through the door. Thank you, Mallow.', next: 'close_mallow_choice' },
  close_mallow_search_thanks: { location: 'arcade', speaker: 'Mira', text: 'You asked it to help look. It stayed with the problem until the door opened. I hope it can hear me say thank you.', next: 'close_mallow_choice' },
  close_mallow_choice: { location: 'arcade', speaker: 'Narrator', text: 'The screen stays dark. Mira holds the moth against her, its scarf trailing over her hand.', choices: [
    { label: 'Ask Mira to set Mallow beside the counter light.', next: 'close_mallow_counter', set: { mallow_rest: 'counter' } },
    { label: 'Ask Mira to bring Mallow to the fort with the team.', next: 'close_mallow_fort', set: { mallow_rest: 'fort' } }
  ] },
  close_mallow_counter: { location: 'arcade', speaker: 'Narrator', text: 'Mira sets Mallow beside the counter light. She tucks its scarf underneath so it won’t slip over the edge.', next: 'close_mallow_light' },
  close_mallow_fort: { location: 'arcade', speaker: 'Mira', text: 'Come on, then. I don’t know if Mallow can hear us, but we can wait together.', next: 'close_mallow_fort_move' },
  close_mallow_fort_move: { location: 'arcade', speaker: 'Narrator', text: 'Mira carries the moth towards the fort. Its scarf slips loose; she wraps it around one plush paw on the way.', next: 'close_mallow_light' },
  close_mallow_light: { location: 'arcade', speaker: 'Niko', text: 'Then we’ll leave the counter light on. And tomorrow we’ll see if it can answer.', next: 'close_reason', nextBy: { key: 'mallow_rest', cases: { counter: 'close_mallow_counter_note', fort: 'close_mallow_fort_place' } } },
  close_mallow_counter_note: { location: 'arcade', speaker: 'Narrator', text: 'Mira leaves a note against Mallow’s paw: WE’LL BE BACK. The counter light warms the edge of the paper. The moth remains still.', next: 'close_reason' },
  close_mallow_fort_place: { location: 'hideout', speaker: 'Narrator', text: 'Mira settles Mallow at the entrance to the fort, its scarf tucked around its paws. “If you can hear us, you don’t have to answer now,” she says. She leaves the blanket door open.', next: 'close_reason' },
  close_reason: { location: 'hideout', speaker: 'Narrator', text: 'Back in the fort, rain glows pink and gold against the windows. Your shadow follows you across the sheet wall a second late. When you stop, it takes one more step.', mood: 'uneasy', next: 'ending_team', nextBy: { key: 'reason', cases: { team: 'ending_team', prize: 'ending_prize_check', company: 'ending_company' } } },
  close_reason_retreat: { location: 'hideout', speaker: 'Narrator', text: 'Back in the fort, rain glows pink and gold against the windows. Your shadow follows you across the sheet wall a second late. When you stop, it takes one more step.{retreatEcho}', mood: 'uneasy', next: 'ending_team_retreat', nextBy: { key: 'reason', cases: { team: 'ending_team_retreat', prize: 'ending_prize_check', company: 'ending_company_retreat' } } },
  ending_team: { location: 'hideout', speaker: 'Narrator', text: 'You came to be part of the team. The team has a lot to figure out—and it has a place for you.', end: true },
  ending_team_retreat: { location: 'hideout', speaker: 'Narrator', text: 'You came to be part of the team. Mira is still downstairs. The team has a place for you—and a friend to bring home.', end: true },
  ending_prize_check: { location: 'hideout', speaker: 'Narrator', text: 'You came for the ridiculous prize.', next: 'ending_prize', nextBy: { key: 'ending', cases: { rescue: 'ending_prize_won', record: 'ending_prize_won', mallow: 'ending_prize_won', retreat: 'ending_prize_retreat' } } },
  ending_prize_won: { location: 'hideout', speaker: 'Narrator', text: 'All three ticket pieces are here now. The prize is Mallow, and after tonight you have questions about what it means to win a friend.', end: true },
  ending_prize_retreat: { location: 'hideout', speaker: 'Narrator', text: 'Mira is still below. The third piece may be, too. The prize can wait; the team has someone to bring home.', end: true },
  ending_prize: { location: 'hideout', speaker: 'Narrator', text: 'You came for the ridiculous prize. Mallow’s scarf is crooked, one eye is still upside down, and the game is not quite over.', end: true },
  ending_company: { location: 'hideout', speaker: 'Narrator', text: 'You came so nobody would have to spend the night alone. Ash lifts the blanket to make room beside them. The promise will take more than one night to keep.', end: true },
  ending_company_retreat: { location: 'hideout', speaker: 'Narrator', text: 'You came so nobody would have to spend the night alone. Mira is still downstairs; upstairs, the team is awake, listening for her.', end: true }
};
export const startNode = 'opening';
