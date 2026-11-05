// Spoken quotations that appear inside an authored passage. These cues are
// explicit: printed text, recollections and player-supplied text are not cast.
// Any unmarked words retain the passage's speaker. Text remains unchanged on
// screen; these boundaries only select the voice for read-aloud.
const combinedFourthWallCues = Object.fromEntries(['touch', 'count'].flatMap(action => [
  [`fourth_wall_${action}_niko_combined`, [['Niko', '“You came with me to the ticket machine. I remember that. It has the other choices written down too, as if they were waiting before you picked. Ash, try the handle while I pull.”']]],
  [`fourth_wall_${action}_mira_combined`, [['Mira', '“You came upstairs with me. What is it showing you?”'], ['Ash', '“All three places we could have gone,”'], ['Ash', '“It marked the one you took together.”'], ['Mira', '“I remember. Keep talking to me, all right?”']]],
  [`fourth_wall_${action}_ash_combined`, [['Ash', '“You came to the stairs with me. Those other choices are on the screen, but they aren’t the route we took. I’ll try the handle again.”']]]
]));

const cues = {
  early_rescue_now_setup: [['Niko', '“Mira, we found something. Stay clear while we try it,”']],
  early_together_citation: [['Mira', '“I didn’t write that. They’re checking each other.”']],
  early_together_cover: [['Service', '“Your result is still available,”']],
  early_together_unplug: [['Service', '“Independent verification continues on screen,”']],
  early_together_false_ending: [['Mallow', '“It wanted us to sound as if we’d already reached the ending,”'], ['Mallow', '“I thought that was helping.”']],
  niko_date_moment: [['Niko', '“A reservation for two,”']],
  mira_date_moment: [['Mira', '“Our date deserves matching headwear,”']],
  ash_date_moment: [['Ash', '“For our date,”']],
  close_connection_niko_now: [['You', '“Emergency-biscuit milkshake?”'], ['Niko', '“I’ll put it on a badge. Nobody can stop us.”']],
  close_connection_niko_later: [['Niko', '“We can decide later,”']],
  close_connection_mira_now: [['Mira', '“That’s ours,”']],
  close_connection_mira_later: [['Mira', '“No rush,”'], ['Mira', '“We can just be here.”']],
  close_connection_ash_now: [['Ash', '“Somewhere we haven’t decided yet,”'], ['Ash', '“I like that.”']],
  close_connection_ash_later: [['Ash', '“No plan required,”']],
  audit_focus_tell_compact: [['Ash', '“One mark wearing three badges,”'], ['Mira', '“Thank you for telling me what the screen kept,”'], ['Mira', '“Those reports still haven’t opened the door. Niko, can you see what’s holding it?”']],
  audit_focus_listen_compact: [['Ash', '“One mark wearing three badges,”'], ['Mira', '“I’m still feeling along the catch,”'], ['Mira', '“Those reports still haven’t opened the door. Niko, can you see what’s holding it from there?”']],
  history_early_paper_share: [['Mira', '“Keep that corner where you can see it,”']],
  history_early_paper_keep: [['Mira', '“I heard you and Mallow,”']],
  history_early_paper_quote: [['Mira', '“Keep this where you can see it,”']],
  history_early_paper_mallow_quote: [['Mira', '“I heard Mallow say that. Keep this where you can see it,”']],
  history_citation_early: [['Mira', '“I never wrote a report,”']],
  early_rescue_setup: [['Niko', '“Mira, we’re coming,”']],
  early_audit_choice: [['Ash', '“One mark wearing three badges,”'], ['Mira', '“I never wrote a report. Those reports still haven’t opened the door,”']],
  early_audit_cover: [['Service', '“Thank you for personalising your view,”'], ['Service', '“Your successful result is still available.”']],
  early_audit_annotation_written: [['Ash', '“That’s what you wrote,”'], ['Ash', '“It hasn’t opened the door, but it hasn’t vanished either.”']],
  early_audit_unplug: [['You', '“Mira, we unplugged the printer,”'], ['You', '“The screen is still on.”'], ['Service', '“Your experience is now paper-free,”'], ['Service', '“Independent verification continues on screen.”']],
  ...combinedFourthWallCues,
  close_mallow_ack_speak: [['You', '“Mallow? Can you hear me? Thank you for telling us,”']],
  mallow_team_wave: [['Mallow', '“I practised a team wave. They don’t always arrive together.”'], ['Mira', '“Perfect. That’s how the team waves now.”']],
  retreat_plan_tap_compact: [['Niko', '“Two taps from us, one from below,”'], ['Ash', '“It might be Mira. We’ll mark what we hear, but we still have to find her—not just the sound.”']],
  retreat_plan_call_compact: [['Niko', '“I’ll call at each place we mark.”'], ['Ash', '“We heard a scrape, not a voice. Let’s mark where it came from.”']],
  niko_note: [['Niko', '“My brother wrote that,”'], ['Niko', '“I keep reading it aloud when the machines get stubborn.”']],
  niko_work_fix: [['Niko', '“Don’t lose that. It might fit another latch.”']],
  mira_work_proof: [['Mira', '“For accuracy,”']],
  disclosure_public_distortion: [['You', '“third”'], ['You', '“three.”']],
  mira_ticket_glimpse: [['Mira', '“Could that be the last piece?”']],
  signal_trace_niko_light: [['Niko', '“I said that to you at the machine,”'], ['Niko', '“I didn’t know it was listening.”']],
  signal_trace_mira_light: [['Mira', '“That was just me and you upstairs.”']],
  signal_trace_ash_light: [['Ash', '“I told you that at the stairs,”']],
  signal_trace_niko_personal: [['Niko', '“I said that to you at the machine.”']],
  signal_trace_mira_personal: [['Mira', '“I said that upstairs. I didn’t know it could hear.”']],
  signal_trace_ash_personal: [['Ash', '“I said that at the stairs,”']],
  signal_private_niko: [['Ash', '“You said no to repeating it. The screen has counted the answer as a success. That doesn’t make it a yes,”'], ['Niko', '“Thanks for keeping it between us. I didn’t ask the machine to listen.”']],
  signal_private_mira: [['Ash', '“You said no to repeating it. The screen has counted the answer as a success. That doesn’t make it a yes,”'], ['Mira', '“Thank you. I wanted you to hear me; I didn’t invite it into my room.”']],
  evidence_confirm: [['You', '“I pressed CONFIRM. It didn’t open the door,”'], ['Mira', '“I’m still in here,”']],
  evidence_machine_receipt_compact: [['Ash', '“I kept it because it was wrong. That isn’t agreement.”']],
  evidence_machine_tickets_compact: [['Niko', '“Look at my hands,”'], ['Niko', '“Still two.”']],
  evidence_machine_voice_compact: [['Mira', '“I also said the door was closed!”'], ['Mira', '“Don’t let it leave that part out.”']],
  correction_again: [['You', '“No. Mira is still behind the door,”'], ['Mallow', '“Your correction has been included in the successful result. No changes are required.”']],
  fourth_wall_intro_compact: [['You', '“No. Mira is still behind the door,”'], ['Mallow', '“Your correction has been included in the successful result.”']],
  fourth_wall_intro_confirm: [['You', '“No. Mira is still behind the door,”'], ['Mallow', '“Your correction has been included in the successful result.”']],
  fourth_correction_public_compact: [['You', '“I said the count was wrong,”'], ['You', '“That isn’t confirmation.”']],
  fourth_correction_private_compact: [['Ash', '“You asked us to check before we decided,”'], ['Ash', '“It marked an answer before we finished counting.”']],
  fourth_mira_compact: { defaultSpeaker: 'Narrator', spans: [['Mira', '“You came upstairs with me. What is it showing you?”'], ['Ash', '“All three places we could have gone,”'], ['Ash', '“It marked the one you took together.”'], ['Mira', '“I remember. Keep talking to me, all right?”']] },
  moment_return_keep_compact: [['Ash', '“It kept a version,”'], ['Ash', '“It doesn’t get to tell us what that felt like. Niko, keep trying the door.”']],
  moment_return_tear_compact: [['Ash', '“It kept a version,”'], ['Ash', '“It doesn’t get to tell us what that felt like. Niko, keep trying the door.”']],
  early_door_brace: [['Mira', '‘That isn’t mine.’']],
  door_brace: [['Mira', '‘That isn’t mine.’']],
  late_focus_tell_receipt: [['Mira', '“All right. Keep telling me what you can see. I don’t want to be the only one it leaves out,”']],
  late_focus_listen_receipt: [['Mira', '“I’ll keep feeling along the bottom. There’s a catch near the counter; it shifts when Niko pulls. Keep telling me what happens out there, too,”']],
  reason_result_team_reply: [['Ash', '“You didn’t need its permission to belong,”'], ['Ash', '“We don’t leave Mira behind that door.”']],
  reason_result_prize_reply: [['Niko', '“Mallow’s plush is still on the shelf upstairs,”'], ['Niko', '“We’re one ticket short, and Mira is behind that door.”']],
  reason_result_company_reply: [['Mira', '“I can hear you, but I’m still in here. Please don’t let that screen decide the door is open.”']],
  reason_focus_team: [['Ash', '“You didn’t need its permission to belong,”'], ['Ash', '“We don’t leave Mira behind that door.”']],
  reason_focus_prize: [['Niko', '“Mallow’s plush is still on the shelf upstairs,”'], ['Niko', '“We’re one ticket short, and Mira is behind that door.”']],
  reason_focus_company: [['Mira', '“I can hear you, but I’m still in here. Please don’t let that screen decide the door is open.”']],
  history_steps_picture: [['Ash', '“Is it remembering ahead, or just printing another wrong answer?”']],
  history_brief_direct: [['Ash', '“We never ranked those answers,”']],
  history_brief_warm: [['Ash', '“We never ranked those answers,”']],
  history_brief_skip: [['Ash', '“We never called it well received,”']],
  history_direct: [['Ash', '“We never said it was well received. We didn’t choose between those answers.”']],
  history_warm: [['Ash', '“We never said it was well received. We didn’t choose between those answers.”']],
  history_skip: [['Ash', '“We never said it was well received,”']],
  history_second_check: [['Mira', '“There’s a little gap under the door,”']],
  history_second_direct: [['Ash', '“I thought we were talking to a friend, not leaving marks in a ledger.”']],
  history_second_warm: [['Ash', '“I thought we were talking to a friend, not leaving marks in a ledger.”']],
  history_second_skip: [['Ash', '“I thought we were talking to a friend, not leaving marks in a ledger.”']],
  history_mallow_public_reply_compact: [['Ash', '“It kept our wording too,”'], ['Ash', '“Niko, keep feeling along the frame. Mira might be able to see the paper.”']],
  history_mallow_reply_choice: [['Ash', '“It kept our wording too,”'], ['Ash', '“Niko, keep feeling along the frame. Mira might be able to see the paper.”']],
  history_paper_mallow_quote: [['Mira', '“I heard Mallow say that. Keep the folded corner where you can see it; I’ll feel for the catch.”']],
  history_paper_quote: [['Mira', '“It doesn’t belong to the report just because it printed it. Keep the folded corner where you can see it.”']],
  history_paper_keep_compact: [['Mira', '“I heard what you told Mallow,”'], ['Mira', '“but I never wrote a report.”']],
  policy_goal_compact: [['Mallow', '“It wanted us to sound as if we’d already reached the ending,”'], ['Mallow', '“I thought that was helping.”']],
  history_paper_keep: [['Mira', '“I hear you,”']],
  history_paper_keep_report: [['Mira', '“I heard what you told Mallow,”'], ['Mira', '“but I never wrote a report.”']],
  audit_receipt: [['Ash', '“One mark wearing three badges,”']],
  audit_unplug: [['You', '“Mira, we unplugged the printer,”'], ['You', '“The screen is still on.”']],
  audit_result_cover_compact: [['Niko', '“It can arrange our conversation, but it can’t make two tickets into three,”'], ['Niko', '“I don’t know if it made the staircase or only noticed it. Either way, the latch is real.”']],
  audit_result_annotate_compact: [['Niko', '“It can arrange our conversation, but it can’t make two tickets into three,”'], ['Niko', '“I don’t know if it made the staircase or only noticed it. Either way, the latch is real.”']],
  audit_result_unplug_compact: [['Niko', '“It can arrange our conversation, but it can’t make two tickets into three,”'], ['Niko', '“I don’t know if it made the staircase or only noticed it. Either way, the latch is real.”']],
  audit_result_leave_compact: [['Niko', '“It can arrange our conversation, but it can’t make two tickets into three,”'], ['Niko', '“I don’t know if it made the staircase or only noticed it. Either way, the latch is real.”']],
  plan_paper: [['Mira', '“There,”'], ['Mira', '“I felt it move.”']],
  plan_niko_topic_past: [['Niko', '“The easy thing first, like my brother taught me. Now we can reach it.”']],
  plan_niko_topic_future: [['Niko', '“You asked what I wanted this place to become. Let’s start a new tradition: nobody has to guess what the others are doing. Mira, my hand is on the release.”']],
  plan_ash_topic_past: [['Ash', '“When I found my friend by the lanterns, I had to stop running first. Mira, tap where you feel the catch.”']],
  plan_ash_topic_future: [['Ash', '“You asked what a better map needs. This time it can show what actually changed.”']],
  rescue_coordination_count: [['Mira', '“One,”'], ['Mira', '“Use my voice, not the screen. Two. Three—I’m pushing!”']],
  rescue_coordination_reach: [['Mira', '“That one isn’t mine,”']],
  mallow_catch_tool_mira: [['Niko', '“Mira, your string is moving the catch!”']],
  rescue_mira_fix: [['Niko', '“Mira, they looped your string under the latch! The catch is free!”']],
  rescue_reunion_ticket_compact: [['Mira', '“Please. My hands are shaking. Keep this one apart from Niko’s two,”'], ['Mira', '“Thank you. I want to remember where we found it.”']],
  rescue_reunion_watch_compact: [['Mira', '“Watch the door until we’re all clear,”'], ['Mira', '“I can carry the ticket.”'], ['Mira', '“Thank you. I couldn’t see it from my side.”']],
  end_retreat: [['Mira', '“I’m still here.”']],
  retreat_probe_intro: [['Ash', '“We need a way to tell whether it can hear us.”']],
  retreat_early_search_stair: [['Niko', '“We can bring something to brace it,”'], ['Niko', '“Mira, we’re still here!”']],
  retreat_early_search_sound: [['Ash', '“Mira, if that’s you, we’re still looking.”']],
  record_close_explain: [['Ash', '“I printed this first. Next time I’ll tell you what I’m doing.”']],
  kit_use: [['Ash', '“Machine, then person,”']],
  retreat_search_stair: [['Niko', '“We can bring something to brace it,”'], ['Niko', '“Mira, we’re still here!”']],
  retreat_search_sound: [['Ash', '“Mira, if that’s you, we’re still looking.”']],
  souvenir_used_niko_care: [['Niko', '“I remember you sorting the screws with me,”'], ['Niko', '“We can leave the paper there.”']],
  souvenir_used_niko_play: [['Niko', '“I remember your little crown,”'], ['Niko', '“We can leave the paper there.”']],
  souvenir_used_mira_care: [['Mira', '“You held the ear for me,”'], ['Mira', '“I remember. We can leave the paper there.”']],
  souvenir_used_mira_play: [['Mira', '“I still have our little knight in my sketchbook,”'], ['Mira', '“We can leave the paper there.”']],
  souvenir_used_ash_care: [['Ash', '“Your rest stop is still on my map,”'], ['Ash', '“We can leave the paper there.”']],
  souvenir_used_ash_play: [['Ash', '“The building inspector is still on my map,”'], ['Ash', '“We can leave the paper there.”']],
  close_mallow_fort_place: [['Mira', '“If you can hear us, you don’t have to answer now,”']]
};

/** Return ordered text and speaker spans, falling back safely on stale text.
 * The exact rendered passage is always retained, including interpolation. */
export function castSpeech(nodeId, speaker, text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const cue = cues[nodeId];
  if (!cue) return [{ speaker, text }];
  const spans = Array.isArray(cue) ? cue : cue.spans;
  const defaultSpeaker = Array.isArray(cue) ? speaker : cue.defaultSpeaker;
  let offset = 0;
  const parts = [];
  for (const [voice, quote] of spans) {
    const start = text.indexOf(quote, offset);
    // Require every authored cue to match in order. Never guess attribution if
    // a passage has changed or a user-provided interpolation altered the text.
    if (start < 0 || text.indexOf(quote, start + quote.length) !== -1) return [{ speaker, text }];
    if (start > offset) parts.push({ speaker: defaultSpeaker, text: text.slice(offset, start) });
    parts.push({ speaker: voice, text: quote });
    offset = start + quote.length;
  }
  if (offset < text.length) parts.push({ speaker: defaultSpeaker, text: text.slice(offset) });
  return parts;
}

export { cues as authoredVoiceCues };
