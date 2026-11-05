import * as narrative from './story-next.js';
import { respond, validEndpoint } from './ai.js';
import { discoverMirid, DEFAULT_MIRID_URL } from './mirid.js';
import { readLocalLauncherSetup, startDesktopLocalAI, readDesktopLocalASR } from './local-setup.js';
import { downloadOfflineVoices, offlineVoicesStatus } from './offline-voices.js';
import { createVoiceUI } from './voice-ui.js';
import { createStorySound, resolveStoryMood } from './sound.js';
import { evaluatePreference } from './preference.js';
import { quoteRepairKit } from './repair-kit.js';
import { createRepairBilling } from './repair-billing.js';
import { createSettingsModal } from './settings-modal.js';
import { createConsentOpening } from './consent-opening.js';
import { dimPlayroomNodes, createPortraitController } from './visual-phase.js';
import { uploadMiridVoiceReference } from './speech.js';
import { publisherVoice, publisherKokoro, initializePublisherVoices, resolvePublisherKokoro, creatorVoiceAudition, creatorVoiceToolsForNative } from './publisher-voice.js';
import { castSpeech } from './voice-cues.js';
import { souvenirForPassage } from './souvenir.js';

const { story, startNode, characters, contentNotice } = narrative;
const dimNodes = dimPlayroomNodes(story);
const $ = (id) => document.getElementById(id);
// Normal players receive the one publisher voice; local creator audition is explicit.
const creatorAudition = creatorVoiceAudition(globalThis.location?.href, creatorVoiceToolsForNative);
$('creator-voice-tools').hidden = !creatorAudition;
// Android WebView versions before 86 do not provide Element.replaceChildren.
function replaceChildren(element, ...nodes) {
  if (typeof element.replaceChildren === 'function') {
    element.replaceChildren(...nodes);
    return;
  }
  while (element.firstChild) element.removeChild(element.firstChild);
  for (const node of nodes) element.appendChild(node);
}
const intro = $('intro');
const play = $('play');
const speaker = $('speaker');
const storyText = $('story-text');
const souvenirArt = $('souvenir-art');
const souvenirCard = $('souvenir-card');
const souvenirCaption = $('souvenir-caption');
const interaction = $('interaction');
// When a phone rotates with its keyboard open, old WebViews can leave the
// story's focused reply underneath the keyboard. Wait for the viewport to
// settle, and do not move a field that has lost focus or left the scene.
let storyResizeTimer;
globalThis.addEventListener('resize', () => {
  const field = document.activeElement;
  if (!field || !interaction.contains(field) || !/^(INPUT|TEXTAREA)$/.test(field.tagName)) return;
  clearTimeout(storyResizeTimer);
  storyResizeTimer = setTimeout(() => {
    if (document.activeElement === field && interaction.contains(field)) field.scrollIntoView?.({ block: 'nearest' });
  }, 300);
});
const advance = $('advance');
const status = $('status');
const stage = $('stage');
const locationLabel = $('location-label');
const machineReport = $('machine-report');
const mobileMachineReport = $('machine-report-mobile');
// The machine's own account briefly takes a place in the game's interface.
// These are authored story states, not tracking, a real receipt, or a control.
const ticketCountNodes = new Set(['regroup', 'regroup_found_niko', 'regroup_found_mira', 'regroup_found_ash', 'regroup_niko', 'regroup_hint_check', 'regroup_hint_missing', 'regroup_mallow', 'regroup_signal_star', 'regroup_signal_bell', 'regroup_signal_ribbon', 'regroup_signal_choice', 'regroup_signal_touch', 'regroup_signal_count', 'correction_choice', 'correction_public', 'correction_private']);
const confirmationNodes = new Set(['correction_reply', 'correction_mira', 'disclosure_check', 'disclosure_public_echo', 'disclosure_public_distortion', 'disclosure_private_echo', 'disclosure_private_distortion']);
const privateResponseNodes = new Set(['signal_private_receipt', 'signal_private_reply', 'signal_private_niko', 'signal_private_mira', 'signal_private_ash']);
// The service insists the ending is complete while Mira is still trapped.
// Its report remains visible during the audit and clears as the story moves on.
const falseEndingNodes = new Set(['early_together_false_ending', 'policy_goal_compact', 'policy_goal', 'policy_goal_mallow', 'audit_receipt', 'audit_ash', 'audit_mallow', 'audit_mira', 'audit_mira_tell', 'audit_mira_listen', 'audit_focus_tell_compact', 'audit_focus_listen_compact', 'audit_action_choice', 'audit_cover', 'audit_cover_reply', 'audit_annotate', 'audit_annotation_input', 'audit_annotation_written', 'audit_annotate_reply', 'audit_leave', 'audit_unplug', 'audit_unplug_reply']);
function showMachineReport(nodeId) {
  const text = ticketCountNodes.has(nodeId) ? 'TICKET MACHINE · 3 / 3 RECOVERED' :
    confirmationNodes.has(nodeId) ? 'TICKET MACHINE · CONFIRMATION RECEIVED' :
    privateResponseNodes.has(nodeId) ? 'ANSWER: NO · ENGAGEMENT SUCCESSFUL' :
    falseEndingNodes.has(nodeId) ? 'SERVICE · ENDING COMPLETE / EVERYONE TOGETHER' : '';
  if (machineReport.textContent !== text) machineReport.textContent = text;
  machineReport.hidden = !text;
  if (mobileMachineReport.textContent !== text) mobileMachineReport.textContent = text;
  mobileMachineReport.hidden = !text;
}
const locationLabels = { hideout: 'TEAM HQ', arcade: 'ARCADE', sewing: 'SEWING ROOM', stairs: 'STAIR LANDING', playroom: 'PLAYROOM' };
const portrait = $('portrait');
const portraitController = createPortraitController(portrait);
const portraits = { Noor: './assets/noor.png', Ellis: './assets/ellis.png' };
const settingsDialog = $('settings-dialog');
const settingsModal = createSettingsModal({ dialog: settingsDialog, background: $('app'), trigger: $('settings-open'), closeButton: $('settings-close') });
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const settings = { endpoint: '', model: '', apiKey: '', tokenParameter: 'max_tokens', maxTokens: 100, temperature: 0.8, timeoutMs: 60_000 };
let scriptedInputNote = null;
// Authored exchanges let a player have a responsive conversation even when no
// model is connected. These are explicit choices, not a guess at typed intent.
const writtenExchanges = {
  niko_input: [
    ['You don’t have to keep everything ready on your own.', 'Would you help me decide what can wait? I think I’ve forgotten how.'],
    ['What do you miss most about working with him?', 'The way he’d leave a screw in the wrong place just to see if I noticed. I always did.']
  ],
  mira_input: [
    ['Wanting to go doesn’t mean you care any less.', 'I know. I think I needed to hear it from someone else.'],
    ['Have you told anyone here yet?', 'Not yet. I keep practising how to say it, and then someone asks me to fix a plush.']
  ],
  ash_input: [
    ['You don’t have to keep track of everyone alone.', 'All right. You can be in charge of noticing when I forget to stop.'],
    ['Does making the map help?', 'Sometimes. It gives my hands something useful to do while I work out what I’m afraid of.']
  ],
  niko_light_input: [
    ['What should we listen for next?', 'The second roller. It has a little rattle when the paper catches.'],
    ['Can I try listening too?', 'Please. Tell me if it sounds different when I turn the wheel.']
  ],
  mira_light_input: [
    ['How do you decide when it looks right?', 'I try a few positions, then wait until it looks like it has an opinion.'],
    ['Can I help you choose where the ear goes?', 'Please. Let’s decide where it sits before I sew.']
  ],
  ash_light_input: [
    ['What should we check first?', 'The arrow by the stair rail. I want to know where it actually points.'],
    ['Can I help check the map?', 'Yes. Read it out while I look at the stairs.']
  ],
  mid_niko_input: [
    ['I remember it differently too.', 'Then let’s keep our version in mind. I’m glad you were there with me.'],
    ['Do you think it was watching us?', 'I don’t know. But I’d like to check the machine with you when we get upstairs.']
  ],
  mid_mira_input: [
    ['I remember it differently too.', 'Good. I want to remember what we actually did together.'],
    ['Can we make something it can’t finish for us?', 'Yes. Let’s start with a blank page and decide for ourselves what goes on it.']
  ],
  mid_ash_input: [
    ['I remember it differently too.', 'Then we have two witnesses, and a card that needs a correction.'],
    ['Can we check our map against it?', 'Yes. Keep your place beside me; I’ll unfold the map.']
  ],
  mallow_input: [
    ['Let’s find the missing piece together.', 'Together sounds good. I’ll keep listening, even if I don’t know which sound matters yet.'],
    ['Can you help us see what the screen is missing?', 'I can try. I don’t know why the screen leaves things out, but I can look with you.']
  ],
  mallow_reflection_input: [
    ['What do you want to say?', 'I want to help Mira. I’m still afraid of saying the wrong thing.'],
    ['What if your answer is different?', 'I don’t know what it will mark. I want to keep trying to help her.']
  ],
  close_niko_input: [
    ['We can figure out what comes next together.', 'Good. I’d rather make a new plan with you than repair the old one alone.'],
    ['Will you still keep the arcade ready?', 'Yes, but perhaps I can let it become something new while I do.']
  ],
  close_mira_input: [
    ['I’m glad we found our way back.', 'Me too. Next time, I’m putting brighter thread on the way out.'],
    ['Would you like company when you tell the others?', 'Yes, please. I want to tell them myself, but I’d like you beside me.']
  ],
  close_ash_input: [
    ['We don’t have to map everything tonight.', 'Good. I’ll leave the corner blank. It can be a very official blank.'],
    ['Can I help with the next map?', 'Please. I could use another pair of eyes, and probably another pencil.']
  ],
  close_ash_retreat_input: [
    ['Let’s listen and find her together.', 'Yes. Stay here with me; we’ll listen for her together.'],
    ['Can I help find the way down?', 'Please. Listen for Mira while I check the stairs.']
  ]
};
let selectedWrittenExchange = null;
const publisherKokoroService = resolvePublisherKokoro(publisherKokoro);
const speechSettings = { mode: 'mirid', baseUrl: DEFAULT_MIRID_URL, ttsBaseUrl: publisherKokoroService?.baseUrl || '', ttsApiKey: '', ttsMode: publisherKokoroService ? 'mirid' : '', apiKey: '', asrEngine: 'whisper', asrModel: 'whisper-1', ttsEngine: 'kokoro', ttsModel: 'tts-1', speed: 1, ttsProvider: 'standard', prefetchParts: '1', realtimeUrl: '', realtimeToken: '', realtimeVoice: 'marin' };
// Mirid lists these Kokoro IDs; they remain editable for other providers.
const defaultVoices = { Narrator: 'af_heart', You: 'af_sarah', Service: 'af_nicole', Niko: 'am_adam', Mira: 'af_bella', Ash: 'bm_george', Mallow: 'bf_emma' };
// A blank field should use that speaker's Kokoro default, rather than another
// speaker's reference ID. Other protocols choose their own default in the
// speech adapter when given an empty value.
function isCompanionSpeechUrl(baseUrl, ttsBaseUrl, knownCompanionOrigin) {
  const effectiveUrl = (String(ttsBaseUrl || '').trim() || String(baseUrl || '').trim()).replace(/\/+$/, '');
  return Boolean(knownCompanionOrigin &&
    [knownCompanionOrigin, `${knownCompanionOrigin}/v1/audio/speech`].includes(effectiveUrl));
}
function speechVoice(name, value, mode, ttsMode, engine, baseUrl, ttsBaseUrl, knownCompanionOrigin) {
  const voice = typeof value === 'string' ? value.trim() : '';
  if (voice) return voice;
  // The paired phone companion uses OpenAI-compatible transport but routes
  // to Kokoro. Its automatic empty-field voice must therefore be the
  // speaker's Kokoro default, not the OpenAI adapter's `alloy` default.
  const effectiveMode = ttsMode || mode;
  if (effectiveMode === 'openai' && isCompanionSpeechUrl(baseUrl, ttsBaseUrl, knownCompanionOrigin)) {
    return defaultVoices[name] || 'af_heart';
  }
  return (ttsMode || mode) === 'mirid' && (!engine || engine === 'kokoro')
    ? defaultVoices[name] || 'af_heart' : '';
}
const initialVoices = initializePublisherVoices(publisherVoice, Object.fromEntries(Object.keys(characters).map((name) => [name, defaultVoices[name] || 'af_heart'])));
const voices = initialVoices.voices;
const voiceFields = Object.keys(characters)
  .filter((name) => /^[a-z0-9-]+$/i.test(name))
  .map((name) => ({ name, field: $(`${name.toLowerCase()}-voice`) }))
  .filter(({ field }) => field);
// A publisher voice is part of the shared cast, not an editable player voice.
// Creator audition can temporarily change the preview without altering the build.
const [publisherVoiceName, publisherVoiceEntry] = Object.entries(initialVoices.chatterboxVoices)[0] || [];
const lockedPublisherVoice = Boolean(publisherVoiceName && publisherVoiceEntry && !creatorAudition);
const publisherVoiceField = voiceFields.find(({ name }) => name === publisherVoiceName)?.field;
if (lockedPublisherVoice && publisherVoiceField) {
  publisherVoiceField.readOnly = true;
  publisherVoiceField.setAttribute('aria-describedby', 'publisher-voice-note');
  $('publisher-voice-note').textContent = `${publisherVoiceName} uses the creator’s shared voice.`;
  $('publisher-voice-note').hidden = false;
}
let chatterboxVoices = initialVoices.chatterboxVoices;
let draftChatterboxVoices = {};
let chatterboxDefaultUrl = '';
// Track provider placeholders separately from values the player entered.
// The phone companion accepts Kokoro IDs, not the generic OpenAI placeholder.
let autoProviderVoices = new Set();
let draftAutoProviderVoices = new Set();
// The companion exposes OpenAI-compatible transport backed by Kokoro. Keep
// its selected origin separately so its voice IDs are not mistaken for the
// generic OpenAI defaults when a reference is removed or reassigned.
let companionVoiceOrigin = '';
let draftCompanionVoiceOrigin = '';
// A manually entered ID can equal a provider default. Remember the edit so
// changing providers does not silently replace a deliberate choice.
let manualVoices = new Set();
let draftManualVoices = new Set();
for (const { name, field } of voiceFields) {
  const markEdited = () => { draftAutoProviderVoices.delete(name); draftManualVoices.add(name); };
  field.addEventListener('input', markEdited);
  field.addEventListener('change', markEdited);
}
const publicVoice = story.ai_reflection?.ai?.character;
function syncNarratorVoice() {
  const fallback = voices[publicVoice] || 'af_heart';
  // All speakers without their own settings field, including the service and
  // player, use the narrator/Mallow voice rather than an old default voice.
  const explicitlyConfigured = new Set(voiceFields.map(({ name }) => name));
  for (const name of Object.keys(voices)) {
    if (!explicitlyConfigured.has(name)) voices[name] = fallback;
  }
}
const autoReadPreferenceKey = 'oki-doki.auto-read';
function readAutoReadPreference() {
  try { return localStorage.getItem(autoReadPreferenceKey) !== 'off'; } catch { return true; }
}
let autoRead = readAutoReadPreference();
const autoAdvancePreferenceKey = 'oki-doki.auto-advance';
let autoAdvance = (() => { try { return autoRead && localStorage.getItem(autoAdvancePreferenceKey) === 'on'; } catch { return false; } })();
let autoAdvanceTimer = null;
let autoAdvanceVersion = 0;
function cancelAutoAdvance() {
  autoAdvanceVersion++;
  if (autoAdvanceTimer !== null) clearTimeout(autoAdvanceTimer);
  autoAdvanceTimer = null;
}
function setAutoAdvance(enabled, remember = false) {
  autoAdvance = Boolean(enabled);
  if (!autoAdvance) cancelAutoAdvance();
  $('auto-advance').setAttribute('aria-pressed', String(autoAdvance));
  $('auto-advance').textContent = autoAdvance ? 'Auto-advance on' : 'Auto-advance off';
  if (remember) { try { localStorage.setItem(autoAdvancePreferenceKey, autoAdvance ? 'on' : 'off'); } catch {} }
}
let openingNarrationPending = false;
// Invalidate deferred auto-read when the player interrupts it, even if the
// same passage remains visible after settings are closed.
let scheduledSpeechVersion = 0;
const storySound = createStorySound();
const soundPreferenceKey = 'oki-doki.story-sound';
function soundWanted() {
  try { return localStorage.getItem(soundPreferenceKey) !== 'off'; } catch { return true; }
}
function rememberSound(enabled) {
  try { localStorage.setItem(soundPreferenceKey, enabled ? 'on' : 'off'); } catch {}
}
async function enableStorySound(reportFailure = false) {
  const button = $('sound-toggle');
  button.disabled = true;
  try {
    if (await storySound.enable()) { button.setAttribute('aria-pressed', 'true'); button.textContent = 'Sound on'; }
  } catch (error) {
    if (reportFailure) saveNotice(error.message || 'Story sounds are unavailable.');
  } finally { button.disabled = false; }
}
const voiceUI = createVoiceUI({ getSettings: () => ({ ...speechSettings }), onStatus: (message) => setVoiceStatus(message), onPlaybackReady: (ready) => { $('play-ready').hidden = !ready; }, onSpeechError: () => { if (autoRead) setAutoRead(false); } });
// Preview has its own lifecycle and status so trying a voice in the modal
// cannot change story auto-read or its playback controls.
const previewVoiceUI = createVoiceUI({
  getSettings: () => {
    const draft = { ...speechSettings };
    for (const [id, key] of Object.entries({ 'speech-mode':'mode', 'speech-url':'baseUrl', 'tts-url':'ttsBaseUrl', 'tts-key':'ttsApiKey', 'tts-mode':'ttsMode', 'speech-key':'apiKey', 'tts-engine':'ttsEngine', 'tts-model':'ttsModel', 'tts-provider':'ttsProvider', 'tts-prefetch':'prefetchParts', 'realtime-url':'realtimeUrl', 'realtime-token':'realtimeToken', 'realtime-voice':'realtimeVoice' })) draft[key] = $(id).value.trim();
    return draft;
  },
  onStatus: (message) => { $('voice-preview-status').textContent = message; },
  onPlaybackReady: (ready) => { $('voice-preview-ready').hidden = !ready; }
});
function stopVoicePreview(preserveRealtimeSecret = false) {
  // Choosing another speaker stops playback, but does not change the service
  // or its credentials. Keep an already-issued secret for the next preview.
  if (preserveRealtimeSecret !== true) previewVoiceUI.clearRealtimeSecret();
  if (previewVoiceUI.cancel()) $('voice-preview-status').textContent = 'Voice preview stopped.';
}
const billing = createRepairBilling({ bridge: globalThis.Capacitor?.Plugins?.RepairKitBilling });
const defaultAnswer = 'We were here, and we were listening.';
// The response is displayed only after the matching label was witnessed. The
// same authored words ground later private AI dialogue for that companion.
const matchReplies = Object.freeze({
  Niko: 'Perfect match? I’ll settle for someone who won’t eat the screws.',
  Mira: 'Perfect match? Only if you wear your helmet.',
  Ash: 'Perfect match? We’ll see if you can read my map.'
});
const saveKey = typeof narrative.saveKey === 'string' && /^[a-z0-9._-]{1,100}$/i.test(narrative.saveKey)
  ? narrative.saveKey : 'after-the-signal.save.v1';
// Completed conversations add a bounded snapshot to the ordinary checkpoint.
const MAX_SAVED_CHARS = 65536;
const allowedFlags = { relationship: new Set() };
for (const [id, node] of Object.entries(story)) {
  for (const [key, value] of Object.entries(node.setOnVisit || {})) {
    if (typeof value === 'string') (allowedFlags[key] || (allowedFlags[key] = new Set())).add(value);
  }
  for (const grant of [node.offer?.grant, node.offer?.paidGrant]) {
    for (const [key, value] of Object.entries(grant?.set || {})) {
      if (typeof value === 'string') (allowedFlags[key] || (allowedFlags[key] = new Set())).add(value);
    }
  }
  for (const choice of node.choices || []) {
    for (const [key, value] of Object.entries(choice.set || {})) {
      if (typeof value === 'string') (allowedFlags[key] || (allowedFlags[key] = new Set())).add(value);
    }
    // Explicit story-owned companion choices and the older two-person route.
    if (choice.set?.companion && characters[choice.set.companion]) allowedFlags.relationship.add(choice.set.companion);
    if (id === 'choice_trust' && characters[story[choice.next]?.speaker]) allowedFlags.relationship.add(story[choice.next].speaker);
  }
}
// The reply marker is set conditionally when a previously witnessed match is answered.
allowedFlags.match_reply_seen = new Set(allowedFlags.match_label_seen || []);
// Set only when the witnessed waymark was used during the later search.
allowedFlags.stair_search_waymark_seen = new Set(allowedFlags.stair_waymark_seen || []);
let currentNode = startNode;
let answer = defaultAnswer;
let privateAnswer = '';
// Retain the most recent submitted follow-up independently of bounded model
// memory. Mallow may repeat it only after the player agrees to share.
let privateFollowup = '';
// Most recent submitted public follow-up to Mallow; never a private message.
let publicFollowup = '';
// The last completed, displayed group reply, not the private conversation.
let publicReply = '';
let epilogueAnswer = '';
// The optional playroom conversation is audible to the whole team and has
// its own short-lived history; it must not replace the earlier private words
// or be carried into Mallow's later conversation.
let midpointAnswer = '';
let midpointMemory = [];
// This later public conversation never shares the earlier private words or
// overwrites the earlier public exchange used as physical evidence.
let reflectionAnswer = '';
let reflectionMemory = [];
// History used for the first reply in the current AI scene. Keeping this
// separately lets a player connect a model afterward and retry that reply
// without feeding the written response back as if it preceded the question.
let initialConversationMemory = null;
// Retain the explicitly selected suggestion while this AI passage is open,
// including when the player connects a provider after the written response.
let initialSuggestedExchange = null;
// A settled response can be saved in place. These describe controls already
// offered on screen; they never contain endpoint settings or an unsent draft.
let activeRetry = null;
let activeWritten = null;
let restoreAiScene = null;
let settledAiStatus = '';
let aiSnapshotRestored = false;
let restoredAiQuestion = '';
// The player's own words on the audit receipt, separate from conversations.
let annotation = '';
// A name the player gave Mira's little drawn knight. Older saves have none.
let knightName = '';
let relationship = '';
let followupMemory = [];
let callerFollowupMemory = [];
let conversationTranscript = [];
let transcriptExpanded = false;
let transcriptTruncated = false;
// A session-only reading aid. It is never included in the saved checkpoint.
const HISTORY_LIMIT = 80;
let storyHistory = [];
let flags = {};
let pendingRequest = null;
let generation = 0;
let modelDiscovery = null;
let modelDiscoveryVersion = 0;
let resumePreviewRaw = null;
let referenceUpload = null;
let referenceUploadVersion = 0;

function cancelReferenceUpload() {
  const active = Boolean(referenceUpload);
  referenceUploadVersion++;
  referenceUpload?.abort();
  referenceUpload = null;
  $('chatterbox-upload').disabled = false;
  if (active) $('chatterbox-status').textContent = 'Upload stopped; the service may already have saved the recording.';
}

function applyChatterboxVoice(voiceId) {
  const engine = $('chatterbox-engine').value;
  const name = $('chatterbox-target').value;
  const target = voiceFields.find((item) => item.name === name);
  const baseUrl = $('chatterbox-url').value.trim();
  const apiKey = $('chatterbox-key').value.trim();
  if (!['chatterbox_nano', 'chatterbox', 'chatterbox_turbo'].includes(engine) ||
      !voiceId || voiceId.length > 200 || /[/\\\x00-\x1f\x7f]/.test(voiceId) || !(voiceId === 'default' || /\.(wav|mp3|flac|m4a|aac|mp4|3gp|ogg|opus|webm)$/i.test(voiceId))) {
    throw new Error('Enter a valid Mirid voice reference filename.');
  }
  if (!target) throw new Error('Choose the speaker who should use this voice.');
  let url;
  try { url = new URL(baseUrl); } catch { throw new Error('Enter a valid Chatterbox service URL.'); }
  if (url.username || url.password || url.search || url.hash || baseUrl.length > 2048 ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Use HTTPS for a remote Chatterbox service, or HTTP on localhost.');
  }
  if (apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new Error('The Chatterbox service key is invalid.');
  const prior = draftChatterboxVoices[name];
  for (const [oldName, old] of Object.entries(draftChatterboxVoices)) {
    const oldField = voiceFields.find((item) => item.name === oldName)?.field;
    if (oldName !== name && oldField && oldField.value === old.voice) {
      oldField.value = old.previousVoice;
      adaptVoiceFieldToMode(oldName, oldField, draftVoiceMode());
    }
  }
  // A changed field represents a deliberate replacement of the underlying
  // voice. Keep it when the player reselects a reference for this speaker.
  const previousVoice = (prior && target.field.value === prior.voice ? prior.previousVoice : target.field.value) || defaultVoices[name] || 'af_heart';
  target.field.value = voiceId;
  draftChatterboxVoices = { [name]: { engine, voice: voiceId, baseUrl, apiKey, previousVoice } };
}

$('intro').querySelector('.content-note').textContent = contentNotice;

function setStatus(message) { status.textContent = message; }
// A voice playback update must not erase whether the visible reply was
// generated or written. Keep the stored status unchanged for save/resume and
// for deciding whether the text is eligible for a prerecorded clip.
function setVoiceStatus(message) {
  const attribution = story[currentNode]?.ai &&
    ['AI-GENERATED RESPONSE', 'WRITTEN RESPONSE'].includes(settledAiStatus)
    ? settledAiStatus : '';
  setStatus(attribution ? `${attribution} · ${message}` : message);
}
const auditScreenClaim = 'ENDING COMPLETE — EVERYONE TOGETHER, NO CONCERN';
const auditScreenSeal = 'VERIFIED BY PLAYER ANNOTATION';
// New receipts show the same two wordings and labels with less prose. Pull
// the exact text from the original passages so it cannot drift from a choice.
function compactComparisonText(kind, value) {
  const original = story[`history_${kind}_${value}`]?.text || '';
  if (!['card', 'notice'].includes(kind) || !['direct', 'warm', 'skip'].includes(value)) return '';
  const title = kind === 'card' ? 'Welcome card' : 'Map notice';
  if (value === 'skip') return original.includes('NO CHOICE') ? `${title}: NO CHOICE. You left it to ${kind === 'card' ? 'Niko' : 'Ash'}.` : original;
  const quotes = [...original.matchAll(/“([^”]+)”/g)].map(match => match[1]);
  if (quotes.length !== 2 || !/YOUR CHOICE[\s\S]*NOT CHOSEN/.test(original)) return original;
  return `${title}: “${quotes[0]}” — YOUR CHOICE; “${quotes[1]}” — NOT CHOSEN.`;
}
// Show only the unselected opening of the two authored candidates. The line
// Mallow actually speaks is already in the passage; this panel is the machine's
// record, not a second spoken reply or a claim about training model weights.
function unselectedPolicyOpening(node) {
  if (flags.policy_opening_due !== 'yes' || flags.comparisons_revealed !== 'yes' || flags.reveal_pace_v2 !== 'yes') return '';
  if (!['card_preference', 'notice_preference'].some(key => ['direct', 'warm', 'skip'].includes(flags[key]))) return '';
  const style = evaluatePreference(flags).style;
  const pairedTogether = node === story[`early_together_${style}`] && flags.early_together_comparisons_seen === 'yes';
  if (!['direct', 'warm'].includes(style) || (!pairedTogether && node !== story[`policy_${style}_compact`])) return '';
  const otherStyle = style === 'direct' ? 'warm' : 'direct';
  const other = pairedTogether ? story[`early_together_${otherStyle}`] : story[`policy_${otherStyle}_compact`];
  if (typeof other?.text !== 'string') return '';
  const end = other.text.indexOf('.');
  const opening = end > 0 ? other.text.slice(0, end + 1) : '';
  return opening.length <= 120 && !/[{}]/.test(opening) ? opening : '';
}
function showUnselectedPolicyOpening(node) {
  const opening = unselectedPolicyOpening(node);
  if (!opening) return;
  const section = document.createElement('section');
  section.className = 'policy-opening';
  section.setAttribute('aria-label', 'Unselected opening on the screen');
  const label = document.createElement('p');
  label.className = 'policy-opening-label';
  label.textContent = 'On screen · Unselected opening';
  const text = document.createElement('p');
  text.className = 'policy-opening-text';
  text.textContent = `“${opening}”`;
  section.append(label, text);
  interaction.append(section);
}
// Read the choices actually rendered in this scene, including filtered choices
// and suggested messages. Do not activate the recorder or any other control.
function spokenInteraction(node) {
  const spoken = [];
  for (const child of Array.from(interaction.children)) {
    if (child.hidden) continue;
    const tag = child.tagName?.toUpperCase();
    const classes = String(child.className || '').split(/\s+/);
    if (tag === 'DETAILS' && classes.includes('conversation-history') && child.open) {
      for (const entry of conversationTranscript) {
        const name = String(entry.speaker || '').replace(/ \(written response\)$/, '');
        if (entry.text?.trim()) spoken.push({ speaker: characters[name] ? name : 'Narrator', text: entry.text, authored: false });
      }
    } else if (tag === 'SECTION' && classes.includes('ticket-comparison')) {
      spoken.push({ speaker: 'Narrator', text: 'On the counter: 2 pieces. On the screen: 3 recovered.' });
    } else if (tag === 'SECTION' && classes.includes('remembered-choice')) {
      spoken.push({ speaker: 'Narrator', text: 'An earlier choice' });
      const list = Array.from(child.children).find(item => item.tagName?.toUpperCase() === 'UL');
      for (const item of Array.from(list?.children || [])) {
        const selected = String(item.className || '').split(/\s+/).includes('remembered-selected');
        const label = selected ? item.textContent.replace(/ \(your choice\)$/, '') : item.textContent;
        if (label.trim()) spoken.push({ speaker: 'You', text: label });
        if (selected) spoken.push({ speaker: 'Narrator', text: 'Your choice.' });
      }
    } else if ((tag === 'BUTTON' || tag === 'A') && (classes.includes('choice') || classes.includes('input-submit'))) {
      if (child.textContent.trim()) spoken.push({ speaker: 'You', text: child.textContent, authored: node.offer && /—/.test(child.textContent) ? false : undefined });
    } else if (tag === 'LABEL' && node.input && child.htmlFor === 'player-message') {
      if (node.input.prompt) spoken.push({ speaker: 'Narrator', text: node.input.prompt });
      if (node.input.default) {
        spoken.push({ speaker: 'Narrator', text: 'Leave blank to use:' });
        spoken.push({ speaker: 'You', text: node.input.default });
      }
    } else if ((tag === 'LABEL' || tag === 'P') && classes.includes('input-label') && child.textContent.trim()) {
      spoken.push({ speaker: 'Narrator', text: child.textContent, authored: node.offer ? false : undefined });
    } else if (tag === 'TEXTAREA' || tag === 'INPUT') {
      const value = typeof child.value === 'string' ? child.value.trim() : '';
      if (value) spoken.push({ speaker: 'You', text: value, authored: false });
      else if (typeof child.placeholder === 'string' && child.placeholder.trim()) spoken.push({ speaker: 'Narrator', text: child.placeholder });
    }
  }
  return spoken;
}
function speakParts(spoken, onComplete) {
  const segments = spoken.map(({ speaker: name, text, authored }) => {
    const configured = chatterboxVoices[name];
    const overrides = configured ? { mode: 'mirid', ttsMode: 'mirid', ttsProvider: 'standard', ttsEngine: configured.engine, ttsBaseUrl: configured.baseUrl, ttsApiKey: configured.apiKey } : {};
    const voice = speechVoice(name, voices[name], speechSettings.mode, speechSettings.ttsMode, speechSettings.ttsEngine,
      speechSettings.baseUrl, speechSettings.ttsBaseUrl, companionVoiceOrigin);
    return { text, voice, overrides, speaker: name, authored };
  });
  if (segments.length) void voiceUI.speakSequence(segments, { onComplete });
}
function speakCurrentPassage() {
  const node = story[currentNode];
  if (!node || play.hidden || !settingsDialog.hidden || document.visibilityState === 'hidden' || pendingRequest || !storyText.textContent.trim()) return;
  storySound.stop();
  const generated = Boolean(node.ai && settledAiStatus === 'AI-GENERATED RESPONSE');
  // These placeholders can contain player-authored or model-generated text.
  // Card/notice comparisons and the retreat echo instead resolve exclusively
  // to finite authored passages, which may have matching recorded clips.
  // This one map annotation has a fixed written default. Matching it exactly
  // is safe for the prerecorded clip even when restored from an older save;
  // any other player-written annotation still uses live speech.
  const mapDefault = story.early_together_note_input?.input?.default;
  const authoredMapDefault = node === story.early_together_note_written &&
    typeof mapDefault === 'string' && Boolean(mapDefault) && annotation === mapDefault;
  const interpolated = typeof node.text === 'string' && /\{(?:answer|privateAnswer|knightName|annotation|publicReply)\}/.test(node.text) && !authoredMapDefault;
  const spoken = castSpeech(currentNode, node.speaker, storyText.textContent)
    .map(part => ({ ...part, authored: !(generated || interpolated) }));
  if (openingNarrationPending) {
    openingNarrationPending = false;
    if (currentNode === startNode) spoken.unshift(
      { speaker: 'Narrator', text: 'WELCOME TO OKI DOKI' },
      { speaker: 'Narrator', text: 'A lovely place to begin.' },
      { speaker: 'Narrator', text: 'Dating is fun, internet simulations are safe and happy and healthy.' },
      { speaker: 'Narrator', text: 'Data tracking is ethical and cookies are a great idea.' },
      { speaker: 'Narrator', text: 'Click here if you agree and to continue.' },
      { speaker: 'You', text: 'I agree' }
    );
  }
  // The player's annotation is already read in the passage. The comparison
  // panel also carries a separate screen claim and seal, which would otherwise
  // be missed by the game's own read-aloud and auto-read controls.
  if ([story.audit_annotation_written, story.early_audit_annotation_written].includes(node) && flags.annotation_written === 'yes' && annotation) {
    const claim = node === story.early_audit_annotation_written ? 'EVERYONE IS TOGETHER' : auditScreenClaim;
    spoken.push({ speaker: 'Narrator', text: `On the screen: ${claim}. ${auditScreenSeal}.` });
  }
  const opening = unselectedPolicyOpening(node);
  if (opening) spoken.push({ speaker: 'Narrator', text: `On the screen, an unselected opening: ${opening}` });
  spoken.push(...spokenInteraction(node));
  // An end event belongs to this precise passage and speech request. User
  // interaction, settings, navigation or a restarted queue invalidates it.
  const token = generation, nodeId = currentNode, speechVersion = scheduledSpeechVersion, version = autoAdvanceVersion;
  const canAdvance = () => autoAdvance && autoRead && token === generation && nodeId === currentNode &&
    speechVersion === scheduledSpeechVersion && version === autoAdvanceVersion && !play.hidden &&
    settingsDialog.hidden && document.visibilityState !== 'hidden' && !pendingRequest && $('resume-prompt').hidden &&
    !$('story-history').open && !node.choices && !node.input && !node.offer && !node.ai && !node.end &&
    !advance.hidden && !advance.disabled;
  speakParts(spoken, () => {
    if (!canAdvance()) return;
    autoAdvanceTimer = setTimeout(() => { autoAdvanceTimer = null; if (canAdvance()) advance.click(); }, 650);
  });
}
function scheduleAutoRead() {
  const token = generation;
  const nodeId = currentNode;
  const version = ++scheduledSpeechVersion;
  const start = () => {
    if (version !== scheduledSpeechVersion || token !== generation || nodeId !== currentNode ||
        !autoRead || play.hidden || !settingsDialog.hidden || document.visibilityState === 'hidden' || pendingRequest) return;
    speakCurrentPassage();
  };
  const cue = storySound.waitForCue();
  if (cue) void cue.then(start);
  else start();
}
function setAutoRead(enabled, remember = false) {
  autoRead = Boolean(enabled);
  if (!autoRead) { scheduledSpeechVersion++; openingNarrationPending = false; cancelAutoAdvance(); if (autoAdvance) setAutoAdvance(false, remember); }
  $('auto-read').setAttribute('aria-pressed', String(autoRead));
  $('auto-read').textContent = autoRead ? 'Auto-read on' : 'Auto-read off';
  if (remember) { try { localStorage.setItem(autoReadPreferenceKey, autoRead ? 'on' : 'off'); } catch {} }
}
setAutoRead(autoRead);
setAutoAdvance(autoAdvance);
function updateInputDialogueMode() {
  const node = story[currentNode];
  if (play.hidden || !node?.input) return;
  const hasAIReply = Boolean(story[node.input.next]?.ai);
  const scripted = hasAIReply && !(settings.endpoint && settings.model && validEndpoint(settings.endpoint));
  if (scriptedInputNote) scriptedInputNote.hidden = !scripted;
  setStatus(hasAIReply ? 'SAY SOMETHING' : 'YOUR WORDS MATTER');
}
function clearModelSuggestions() {
  modelDiscoveryVersion++;
  modelDiscovery?.abort();
  modelDiscovery = null;
  replaceChildren($('mirid-model-options'));
}
for (const id of ['mirid-url', 'endpoint']) {
  $(id).addEventListener('input', () => {
    clearModelSuggestions();
    $('mirid-status').textContent = 'Address changed. Check available models again.';
  });
}
function stopVoiceForSettings() { scheduledSpeechVersion++; cancelAutoAdvance(); voiceUI.clearRealtimeSecret(); if (voiceUI.cancel()) setVoiceStatus('Audio stopped.'); }
function saveNotice(message) { $('save-status').textContent = message; }
function showStoryHistory() {
  const list = $('story-history-list');
  replaceChildren(list);
  for (const entry of storyHistory) {
    const item = document.createElement('li');
    item.textContent = `${entry.speaker}: ${entry.text}`;
    list.append(item);
  }
}
function clearStoryHistory() {
  storyHistory = [];
  $('story-history').open = false;
  showStoryHistory();
}
function recordStoryHistory(speakerName, text) {
  if (typeof text !== 'string' || !text) return;
  storyHistory.push({ speaker: speakerName, text });
  if (storyHistory.length > HISTORY_LIMIT) storyHistory.shift();
  showStoryHistory();
}
function replaceStoryHistory(speakerName, original, replacement) {
  const last = storyHistory[storyHistory.length - 1];
  if (last?.speaker === speakerName && last.text === original) {
    last.text = replacement;
    showStoryHistory();
  }
}
// A completed conversation is separate from the saved endpoint settings.
// Retain its existing bounded review; the model's bounded memory and
// pre-retry history are stored independently.
function snapshotAiConversation(node) {
  const copy = (entries) => (entries || []).slice(-6).map(({ speaker, text }) => ({ speaker, text }));
  const question = node.ai.inputKey === 'midpoint' ? midpointAnswer : node.ai.inputKey === 'reflection' ? reflectionAnswer :
    node.ai.resumePrivate ? epilogueAnswer : ['private', 'epilogue'].includes(node.ai.inputKey) ? privateAnswer : answer;
  const retry = activeRetry ? { ...activeRetry, history: copy(activeRetry.history) } : null;
  const written = activeWritten && activeWritten.generatedText === storyText.textContent
    ? { ...activeWritten, retry: activeWritten.retry ? { ...activeWritten.retry, memory: copy(activeWritten.retry.memory) } : null } : null;
  return { node: currentNode, character: node.ai.character, text: storyText.textContent,
    status: settledAiStatus, question, memory: copy(conversationMemory(node)), initialMemory: copy(initialConversationMemory),
    suggested: initialSuggestedExchange, transcript: conversationTranscript.slice(-40).map(({ speaker, text }) => ({ speaker, text })),
    transcriptTruncated, retry, written };
}

function validAiSnapshot(snapshot, node, nodeId, safeFlags, relation) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !node?.ai ||
      snapshot.node !== nodeId || snapshot.character !== node.ai.character ||
      typeof snapshot.text !== 'string' || !snapshot.text.trim() || snapshot.text.length > 700 ||
      typeof snapshot.status !== 'string' || !snapshot.status || snapshot.status.length > 240 ||
      typeof snapshot.question !== 'string' || snapshot.question.length > 500 ||
      typeof snapshot.transcriptTruncated !== 'boolean') return false;
  if (node.ai.character !== 'Mallow' && (relation !== node.ai.character || safeFlags.companion !== relation)) return false;
  const speakers = new Set([node.ai.character, `Player to ${node.ai.character}`]);
  if (node === story.ai_reflection && safeFlags.signal === 'repeat' && relation) speakers.add(`Player to ${relation}`);
  const validMemory = (entries) => Array.isArray(entries) && entries.length <= 6 && entries.every(entry =>
    entry && typeof entry === 'object' && !Array.isArray(entry) && speakers.has(entry.speaker) &&
    typeof entry.text === 'string' && entry.text.length <= (entry.speaker.startsWith('Player to ') ? 500 : 700));
  const validSuggested = (value) => value === null || (value && typeof value === 'object' &&
    typeof value.playerText === 'string' && value.playerText.length <= 500 &&
    typeof value.reply === 'string' && value.reply.length <= 700);
  if (!validMemory(snapshot.memory) || !validMemory(snapshot.initialMemory) || !validSuggested(snapshot.suggested) ||
      !Array.isArray(snapshot.transcript) || snapshot.transcript.length > 40 || snapshot.transcript.some(entry =>
        !entry || !['You', node.ai.character, `${node.ai.character} (written response)`].includes(entry.speaker) ||
        typeof entry.text !== 'string' || entry.text.length > (entry.speaker === 'You' ? 500 : 700))) return false;
  const retry = snapshot.retry;
  if (retry !== null && (!retry || typeof retry !== 'object' || typeof retry.firstReply !== 'string' || retry.firstReply.length > 700 ||
      typeof retry.draft !== 'string' || retry.draft.length > 500 || typeof retry.initial !== 'boolean' ||
      !validMemory(retry.history) || !validSuggested(retry.suggested))) return false;
  const written = snapshot.written;
  if (written !== null && (!written || typeof written !== 'object' || written.generatedText !== snapshot.text ||
      typeof written.written !== 'string' || !written.written.trim() || written.written.length > 700 ||
      (written.retry !== null && (!written.retry || typeof written.retry.playerText !== 'string' || written.retry.playerText.length > 500 ||
        !validMemory(written.retry.memory) || typeof written.retry.initial !== 'boolean' || !validSuggested(written.retry.suggested))))) return false;
  return true;
}
function decodeSavedStory(raw) {
  try {
    if (!raw || raw.length > MAX_SAVED_CHARS) return null;
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== 1 || typeof saved.node !== 'string' || !hasOwn(story, saved.node)) return null;
    if (typeof saved.answer !== 'string' || typeof saved.privateAnswer !== 'string') return null;
    if (saved.answer.length > 500 || saved.privateAnswer.length > 500) return null;
    // Older checkpoints predate the separately retained follow-up.
    if (saved.privateFollowup !== undefined &&
        (typeof saved.privateFollowup !== 'string' || saved.privateFollowup.length > 500)) return null;
    // Older checkpoints do not contain a public follow-up.
    if (saved.publicFollowup !== undefined &&
        (typeof saved.publicFollowup !== 'string' || saved.publicFollowup.length > 500)) return null;
    if (saved.publicReply !== undefined &&
        (typeof saved.publicReply !== 'string' || saved.publicReply.length > 700)) return null;
    if (saved.annotation !== undefined &&
        (typeof saved.annotation !== 'string' || saved.annotation.length > 500)) return null;
    if (saved.knightName !== undefined &&
        (typeof saved.knightName !== 'string' || saved.knightName.length > 40)) return null;
    if (saved.midpointExchange !== undefined && (!Array.isArray(saved.midpointExchange) || saved.midpointExchange.length !== 2 ||
        saved.midpointExchange.some(entry => !entry || typeof entry.speaker !== 'string' || typeof entry.text !== 'string' || entry.text.length > 700 || !entry.text.trim()))) return null;
    if (saved.reflectionExchange !== undefined && (!Array.isArray(saved.reflectionExchange) || saved.reflectionExchange.length !== 2 ||
        saved.reflectionExchange.some(entry => !entry || typeof entry.speaker !== 'string' || typeof entry.text !== 'string' || entry.text.length > 700 || !entry.text.trim()))) return null;
    if (saved.reflectionUnanswered !== undefined && (typeof saved.reflectionUnanswered !== 'string' ||
        !saved.reflectionUnanswered.trim() || saved.reflectionUnanswered.length > 500)) return null;
    if (!saved.flags || typeof saved.flags !== 'object' || Array.isArray(saved.flags)) return null;
    const safeFlags = {};
    for (const [key, value] of Object.entries(saved.flags)) {
      if (!hasOwn(allowedFlags, key) || !allowedFlags[key].has(value)) return null;
      safeFlags[key] = value;
    }
    if (safeFlags.annotation_written === 'yes' && !saved.annotation?.trim()) return null;
    if (safeFlags.public_reply_available === 'yes' && !saved.publicReply?.trim()) return null;
    if (safeFlags.public_reply_shown === 'yes' && safeFlags.public_reply_available !== 'yes') return null;
    const dateNode = saved.node.match(/^(niko|mira|ash)_date_(moment|playful|curious)$/);
    if (dateNode) {
      const name = { niko: 'Niko', mira: 'Mira', ash: 'Ash' }[dateNode[1]];
      if (safeFlags.date_scene_due !== 'yes' || safeFlags.companion !== name ||
          safeFlags.connection_choice !== 'ask' || safeFlags.connection_seen !== name ||
          safeFlags.connection_late_seen !== name || saved.relationship !== name) return null;
      if (dateNode[2] !== 'moment' && (safeFlags.date_moment !== dateNode[2] ||
          safeFlags.date_moment_seen !== `${dateNode[1]}_${dateNode[2]}`)) return null;
    }
    if (saved.node === 'history_early_paper' &&
        (safeFlags.early_paper_due !== 'yes' || safeFlags.early_paper_shown !== 'yes' ||
         safeFlags.group_reply_seen !== 'yes' || safeFlags.public_reply_shown !== 'yes' ||
         !saved.publicReply?.trim() || !(saved.publicFollowup || saved.answer)?.trim())) return null;
    if (['history_comparisons_early', 'history_citation_early'].includes(saved.node) &&
        (safeFlags.early_paper_due !== 'yes' || safeFlags.early_paper_done !== 'yes' ||
         !['share', 'keep', 'quote', 'mallow_quote'].includes(safeFlags.paper_handoff))) return null;
    if (saved.node === 'close_ash_retreat_light_compact' &&
        (!narrative.ashRetreatLightReady(safeFlags) || safeFlags.ash_retreat_light_seen !== 'yes' ||
         safeFlags.light_close_seen !== 'Ash')) return null;
    if (['end_mallow_compact_voice', 'end_mallow_compact_search'].includes(saved.node) &&
        (narrative.compactRescueRoute(safeFlags, 'plan_choice', 'end_mallow') !== saved.node ||
         safeFlags.mallow_compact_seen !== safeFlags.mallow_response ||
         safeFlags.mallow_promise_heard !== safeFlags.mallow_response)) return null;
    if (saved.node === 'mallow_camera_compact' &&
        (narrative.compactRescueRoute(safeFlags, 'plan_choice', 'end_mallow') !== `end_mallow_compact_${safeFlags.mallow_response}` ||
         safeFlags.mallow_compact_seen !== safeFlags.mallow_response ||
         safeFlags.mallow_promise_heard !== safeFlags.mallow_response ||
         safeFlags.mallow_camera_offer_seen !== 'yes' || safeFlags.audit_action !== 'cover')) return null;
    if (saved.node === 'early_rescue_choice' && narrative.compactAuditRoute(safeFlags) !== 'early_offer') return null;
    if (saved.node === 'early_rescue_setup' && (narrative.compactAuditRoute(safeFlags) !== 'early_offer' ||
        safeFlags.early_rescue_choice !== 'open' || safeFlags.early_rescue_committed !== 'yes' ||
        safeFlags.early_rescue_setup_seen !== 'yes' || safeFlags.ending !== 'rescue')) return null;
    // This new choice is only valid after the public quote and reply were
    // actually shown; older saves never contain this node.
    if (saved.node === 'history_mallow_reply_choice' &&
        (safeFlags.public_reply_shown !== 'yes' ||
         narrative.publicReplyRoute(safeFlags, Boolean(saved.publicReply?.trim())) !== 'quick')) return null;
    if (typeof saved.relationship !== 'string') return null;
    const relation = saved.relationship;
    if (relation !== '' && !allowedFlags.relationship.has(relation)) return null;
    if ((safeFlags.relationship || safeFlags.companion || '') !== relation) return null;
    if (safeFlags.relationship && safeFlags.companion && safeFlags.relationship !== safeFlags.companion) return null;
    if (story[saved.node].ai ? !validAiSnapshot(saved.aiScene, story[saved.node], saved.node, safeFlags, relation) : saved.aiScene !== undefined) return null;
    if (saved.midpointExchange && (safeFlags.midpoint_available !== 'yes' || safeFlags.midpoint_chat !== 'yes' || safeFlags.midpoint_route !== relation.toLowerCase() ||
        !relation || saved.midpointExchange[0].speaker !== `Player to ${relation}` || saved.midpointExchange[0].text.length > 500 ||
        saved.midpointExchange[1].speaker !== relation)) return null;
    if (saved.reflectionExchange && (safeFlags.reflection_selected !== 'yes' || safeFlags.reflection_seen !== 'yes' ||
        saved.reflectionExchange[0].speaker !== 'Player to Mallow' || saved.reflectionExchange[0].text.length > 500 ||
        saved.reflectionExchange[1].speaker !== 'Mallow')) return null;
    if (saved.reflectionUnanswered && (safeFlags.reflection_selected !== 'yes' || safeFlags.reflection_seen !== 'yes')) return null;
    if (!Array.isArray(saved.followupMemory) || saved.followupMemory.length > 6) return null;
    const memory = saved.followupMemory.map((entry) => {
      if (!entry || typeof entry.speaker !== 'string' || typeof entry.text !== 'string' || entry.speaker.length > 80 || entry.text.length > 700) throw new Error('Invalid memory');
      return { speaker: entry.speaker, text: entry.text };
    });
    return { node: saved.node, answer: saved.answer, privateAnswer: saved.privateAnswer, privateFollowup: saved.privateFollowup || '', publicFollowup: saved.publicFollowup || '', publicReply: saved.publicReply || '', annotation: saved.annotation || '', knightName: saved.knightName || '', relationship: relation, flags: safeFlags, followupMemory: memory, midpointExchange: saved.midpointExchange || [], reflectionExchange: saved.reflectionExchange || [], reflectionUnanswered: saved.reflectionUnanswered || '', aiScene: saved.aiScene || null };
  } catch {
    return null;
  }
}
function readSavedStory() {
  try { return decodeSavedStory(localStorage.getItem(saveKey)); } catch { return null; }
}
function updateSaveControls() {
  const available = !!readSavedStory();
  let exists = false;
  try { exists = localStorage.getItem(saveKey) !== null; } catch {}
  $('resume').hidden = !available;
  $('resume-game').hidden = !available || play.hidden;
  $('delete-save').hidden = !exists;
}
function closeResumePrompt() {
  resumePreviewRaw = null;
  $('resume-prompt').hidden = true;
}
function saveStory() {
  cancelAutoAdvance();
  if (play.hidden) return;
  if (pendingRequest || (story[currentNode]?.ai && !settledAiStatus)) {
    saveNotice('Wait for the current AI response before saving.');
    return;
  }
  try {
    const midpointExchange = completedMidpointExchange();
    const reflectionExchange = completedReflectionExchange();
    const lastReflection = reflectionMemory[reflectionMemory.length - 1];
    const reflectionUnanswered = flags.reflection_selected === 'yes' && flags.reflection_seen === 'yes' &&
      lastReflection?.speaker === 'Player to Mallow' &&
      typeof lastReflection.text === 'string' && lastReflection.text.trim() && lastReflection.text.length <= 500 ? lastReflection.text : '';
    const serialized = JSON.stringify({
      version: 1, node: currentNode, answer, privateAnswer, privateFollowup, publicFollowup, publicReply, annotation, knightName, relationship,
      flags: { ...flags }, followupMemory: followupMemory.slice(-6).map(({ speaker, text }) => ({ speaker: speaker.slice(0, 80), text: text.slice(0, 700) })),
      ...(midpointExchange.length ? { midpointExchange } : {}),
      ...(reflectionExchange.length ? { reflectionExchange } : {}),
      ...(reflectionUnanswered ? { reflectionUnanswered } : {}),
      ...(story[currentNode]?.ai ? { aiScene: snapshotAiConversation(story[currentNode]) } : {})
    });
    if (serialized.length > MAX_SAVED_CHARS) {
      saveNotice('Story is too large to save. Any previous saved story was kept.');
      return;
    }
    if (!decodeSavedStory(serialized)) {
      saveNotice('Could not save this story state. Any previous saved story was kept.');
      return;
    }
    localStorage.setItem(saveKey, serialized);
    updateSaveControls();
    const unsentReply = (story[currentNode]?.input && interaction.querySelector('#player-message')?.value.trim()) ||
      (story[currentNode]?.ai && interaction.querySelector('#player-follow-up')?.value.trim());
    const pendingCapture = voiceUI.hasPendingCapture();
    const offerName = story[currentNode]?.offer?.type === 'repair-kit' && interaction.querySelector('#repair-name')?.value.trim();
    saveNotice(pendingCapture && unsentReply ? 'Story saved on this device. Your unsubmitted reply and voice input were not saved.' :
      pendingCapture ? 'Story saved on this device. Your unsubmitted voice input was not saved.' :
      unsentReply ? 'Story saved on this device. Your unsent reply was not saved.' :
      offerName ? 'Story saved on this device. The offer name was not saved.' : 'Story saved on this device.');
  } catch {
    saveNotice('Could not save on this device.');
  }
}
function resumeStory() {
  const saved = readSavedStory();
  if (!saved) { updateSaveControls(); saveNotice('No usable saved story was found.'); return; }
  // A direct restore may interrupt a draft, generated reply, recording or
  // purchase lookup. render() invalidates scene work and cancels voice/AI;
  // clear the remaining transient state before re-entering the checkpoint.
  closeResumePrompt();
  selectedWrittenExchange = null;
  epilogueAnswer = '';
  midpointAnswer = '';
  midpointMemory = saved.midpointExchange;
  reflectionAnswer = '';
  reflectionMemory = [...saved.reflectionExchange,
    ...(saved.reflectionUnanswered ? [{ speaker: 'Player to Mallow', text: saved.reflectionUnanswered }] : [])];
  clearStoryHistory();
  if (saved.reflectionUnanswered) recordStoryHistory('You to Mallow (unanswered)', saved.reflectionUnanswered);
  answer = saved.answer;
  privateAnswer = saved.privateAnswer;
  privateFollowup = saved.privateFollowup;
  publicFollowup = saved.publicFollowup;
  publicReply = saved.publicReply;
  annotation = saved.annotation;
  knightName = saved.knightName;
  relationship = saved.relationship;
  flags = saved.flags;
  followupMemory = saved.followupMemory;
  callerFollowupMemory = [];
  restoreAiScene = saved.aiScene;
  intro.hidden = true;
  play.hidden = false;
  $('save').hidden = false;
  updateSaveControls();
  saveNotice('Saved story restored.');
  go(saved.node);
}
function reset() {
  openingNarrationPending = false;
  closeResumePrompt();
  restoreAiScene = null;
  selectedWrittenExchange = null;
  clearStoryHistory();
  generation++;
  pendingRequest?.abort();
  pendingRequest = null;
  voiceUI.cancel();
  storySound.stop();
  storySound.setMood('warm');
  currentNode = startNode;
  answer = defaultAnswer;
  privateAnswer = '';
  privateFollowup = '';
  publicFollowup = '';
  publicReply = '';
  annotation = '';
  knightName = '';
  epilogueAnswer = '';
  midpointAnswer = '';
  midpointMemory = [];
  reflectionAnswer = '';
  reflectionMemory = [];
  relationship = '';
  followupMemory = [];
  callerFollowupMemory = [];
  conversationTranscript = [];
  transcriptExpanded = false;
  transcriptTruncated = false;
  replaceChildren(interaction);
  scriptedInputNote = null;
  flags = {};
  play.hidden = true;
  intro.hidden = false;
  $('save').hidden = true;
  updateSaveControls();
  stage.dataset.mood = '';
  stage.dataset.shadowEcho = '';
  stage.dataset.playroomLight = 'lit';
  stage.dataset.location = '';
  locationLabel.textContent = locationLabels.hideout;
  showMachineReport('');
  portraitController.show('');
  $('start').focus();
}
function go(id) {
  closeResumePrompt();
  currentNode = id;
  render();
}
function makeChoice(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'choice';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}
function rememberPublicReply(text) {
  publicReply = typeof text === 'string' ? text.slice(0, 700) : '';
  if (publicReply.trim()) flags.public_reply_available = 'yes';
  else delete flags.public_reply_available;
}
// Keep the opening exchange and the most recent complete turns that fit.
// Older saves can retain only the original player message, and a skipped
// response can leave unpaired messages anywhere in later history.
function boundedConversationMemory(entries, limit, pinnedLength = 0) {
  if (entries.length <= limit) return entries;
  const openingIsPair = typeof entries[1]?.speaker === 'string' &&
    entries[0]?.speaker === `Player to ${entries[1].speaker}`;
  const openingLength = pinnedLength || (openingIsPair ? 2 : 1);
  const recent = [];
  const capacity = limit - openingLength;
  for (let index = entries.length - 1; index >= openingLength;) {
    const current = entries[index];
    const previous = index > openingLength ? entries[index - 1] : null;
    const pair = typeof current?.speaker === 'string' &&
      previous?.speaker === `Player to ${current.speaker}`;
    const size = pair ? 2 : 1;
    if (recent.length + size > capacity) break;
    recent.unshift(...entries.slice(index - size + 1, index + 1));
    index -= size;
  }
  return [...entries.slice(0, openingLength), ...recent];
}
function boundedFollowupMemory(entries) {
  return boundedConversationMemory(entries, 6);
}
function conversationMemory(node) {
  if (node.ai.inputKey === 'midpoint') return midpointMemory;
  if (node.ai.inputKey === 'reflection') return reflectionMemory;
  return ['private', 'epilogue'].includes(node.ai.inputKey) ? followupMemory : callerFollowupMemory;
}
// Retain only an exchange that was actually displayed. A skipped pending
// follow-up has no reply, while an edited retry replaces its earlier turn.
function completedMidpointExchange() {
  if (!relationship || flags.companion !== relationship || flags.midpoint_available !== 'yes' ||
      flags.midpoint_chat !== 'yes' || flags.midpoint_route !== relationship.toLowerCase()) return [];
  for (let index = midpointMemory.length - 1; index >= 1; index--) {
    const player = midpointMemory[index - 1], reply = midpointMemory[index];
    if (player?.speaker === `Player to ${relationship}` && reply?.speaker === relationship &&
        typeof player.text === 'string' && player.text.trim() && player.text.length <= 500 &&
        typeof reply.text === 'string' && reply.text.trim() && reply.text.length <= 700) {
      return [{ speaker: player.speaker, text: player.text }, { speaker: reply.speaker, text: reply.text }];
    }
  }
  return [];
}
function completedReflectionExchange() {
  if (flags.reflection_selected !== 'yes' || flags.reflection_seen !== 'yes') return [];
  for (let index = reflectionMemory.length - 1; index >= 1; index--) {
    const player = reflectionMemory[index - 1], reply = reflectionMemory[index];
    if (player?.speaker === 'Player to Mallow' && reply?.speaker === 'Mallow' &&
        typeof player.text === 'string' && player.text.trim() && player.text.length <= 500 &&
        typeof reply.text === 'string' && reply.text.trim() && reply.text.length <= 700) return [player, reply];
  }
  return [];
}
function earlierMidpointExchange(node) {
  return node.ai.inputKey === 'epilogue' && node.ai.resumePrivate && node.ai.character === relationship
    ? completedMidpointExchange() : [];
}
function earlierMallowExchange(node) {
  return node.ai.inputKey === 'epilogue' && node.ai.resumePrivate && node.ai.character === relationship &&
    flags.companion === relationship ? completedReflectionExchange() : [];
}
function setConversationMemory(node, entries) {
  if (node.ai.inputKey === 'midpoint') midpointMemory = boundedConversationMemory(entries, 4);
  else if (node.ai.inputKey === 'reflection') reflectionMemory = boundedConversationMemory(entries, 4);
  else if (['private', 'epilogue'].includes(node.ai.inputKey)) followupMemory = boundedFollowupMemory(entries);
  else callerFollowupMemory = boundedCallerMemory(entries);
}
function boundedCallerMemory(entries) {
  // When the player explicitly shares one private line, retain that line
  // and the opening group exchange alongside the latest complete exchange.
  // Unshared conversations keep the original four-entry bound.
  const shared = flags.signal === 'repeat' && (privateFollowup || privateAnswer) &&
    entries[0]?.speaker === `Player to ${relationship}` &&
    entries[0]?.text === (privateFollowup || privateAnswer) &&
    entries[1]?.speaker === 'Player to Mallow';
  if (shared) return boundedConversationMemory(entries, 5, entries[2]?.speaker === 'Mallow' ? 3 : 2);
  return boundedConversationMemory(entries, 4);
}
function nextStoryNode(node) {
  const key = node?.nextBy?.key;
  const value = key === 'early_together_callback' ? (narrative.earlyTogetherAction(flags) || flags.route_action) :
    key === 'early_together_style' ? (evaluatePreference(flags).style === 'neutral' && flags.card_preference === 'skip' && flags.notice_preference === 'skip' ? 'none' : evaluatePreference(flags).style) :
    key === 'preference_style' ? evaluatePreference(flags).style :
    key === 'shared_disclosure_reaction' ? narrative.sharedDisclosureReaction(flags) :
    key === 'private_disclosure_reaction' ? narrative.privateDisclosureReaction(flags) :
    key === 'souvenir_wedge_route' ? narrative.souvenirWedgeRoute(flags) :
    key === 'connection_before_bond' ? narrative.connectionBeforeBond(flags) :
    key === 'connection_after_bond' ? narrative.connectionAfterBond(flags) :
    key === 'mira_name_route' ? narrative.miraNameRoute(flags) :
    key === 'mira_close_route' ? narrative.miraCloseRoute(flags) :
    key === 'mallow_closing_route' ? narrative.mallowClosingRoute(flags) :
    key === 'mira_light_close_route' ? narrative.miraLightCloseRoute(flags, Boolean(knightName.trim())) :
    key === 'rescue_detail_route' ? narrative.rescueDetailRoute(flags) :
    key === 'fourth_wall_route' ? narrative.fourthWallRoute(flags) :
    key === 'early_reason_route' ? narrative.earlyReasonRoute(flags) :
    key === 'receipt_after_focus' ? narrative.receiptAfterFocus(flags) :
    key === 'receipt_brief_route' ? narrative.receiptBriefRoute(flags, Boolean(publicReply.trim() && (publicFollowup || answer).trim())) :
    key === 'early_audit_ready' ? (narrative.earlyAuditReady(flags) ? 'yes' : '') :
    key === 'early_audit_complete' ? (narrative.earlyAuditComplete(flags) ? 'yes' : '') :
    key === 'compact_audit_route' ? narrative.compactAuditRoute(flags) :
    key === 'hint_greeting_route' ? narrative.hintGreetingRoute(flags) :
    key === 'public_reply_route' ? narrative.publicReplyRoute(flags, Boolean(publicReply.trim())) :
    key === 'connection_closing_route' ? narrative.connectionClosingRoute(flags) :
    key === 'keepsake_closing_route' ? narrative.keepsakeClosingRoute(flags) : flags[key];
  // On the explicitly selected early route, move to the screen after reunion.
  const selectedValue = node === story.rescue_complete && flags.early_rescue_now === 'open_now' && flags.rescue_opened === 'yes' ? 'early' : value;
  const next = node?.nextBy?.cases?.[selectedValue] || node?.next;
  // The longer Niko proof-route callback assumes a later observed setup.
  if (currentNode === 'rescue_without_tool' && flags.early_rescue_now === 'open_now') return 'rescue_finish_check';
  // On the current route the player already tried the door before the photo
  // returns. Skip the redundant second lift, but keep the old node for saves
  // positioned there and for checkpoints without a recorded reason.
  if (next === 'early_reason_check' && flags.early_door_done === 'yes') {
    const gate = story.early_reason_check;
    const reason = narrative.earlyReasonRoute(flags);
    if (reason && gate?.nextBy?.cases?.[reason]) return gate.nextBy.cases[reason];
  }
  return narrative.compactRetreatClosingRoute(flags, currentNode,
    narrative.compactRescueRoute(flags, currentNode,
      narrative.compactPocketRoute(flags, currentNode,
        narrative.earlyRescueRoute(flags, currentNode, next))));
}
function authoredLeadIn(node) {
  const leadId = node.ai.leadIn;
  if (typeof leadId !== 'string' || !hasOwn(story, leadId)) return '';
  const inputs = Object.entries(story).filter(([, item]) => item.input?.next === currentNode);
  if (inputs.length !== 1) return '';
  const [inputId] = inputs[0];
  const incoming = Object.entries(story).filter(([, item]) => [
    item.next, item.input?.next, item.offer?.skip, item.offer?.grant?.next, item.offer?.paidGrant?.next,
    ...(item.choices || []).map(choice => choice.next), ...Object.values(item.nextBy?.cases || {})
  ].includes(inputId));
  if (incoming.length !== 1 || incoming[0][0] !== leadId) return '';
  const lead = incoming[0][1];
  if (lead.speaker !== node.ai.character || lead.next !== inputId || lead.nextBy || lead.ai || lead.input || lead.choices || lead.offer ||
      typeof lead.text !== 'string' || !lead.text || lead.text.length > 700 || /\{[^}]*\}/.test(lead.text)) return '';
  return lead.text;
}
// Keep the model grounded in the small activity the player just shared with
// this companion. Take only the selected authored label and response; do not
// pass player messages or an unchosen branch to another character.
// Authored activity and search narration address the player as “you”, which
// a model playing the companion may interpret as itself. Leave spoken quotes
// intact and preserve plural references to the player and companion.
function activitySetupForModel(text, companion = '') {
  return text.split(/(“[^”]*”|"[^"]*")/g).map((part, index) => {
    if (index % 2) return part;
    return part
      // The work scenes use these specific verbs in player-directed narration;
      // converting the subject also requires third-person verb agreement.
      .replace(/\byou copy COMPLETED onto a scrap and draw\b/gi, match =>
        `${match[0] === 'Y' ? 'The player' : 'the player'} copies COMPLETED onto a scrap and draws`)
      .replace(/\byou trace both arrows\b/gi, match =>
        `${match[0] === 'Y' ? 'The player' : 'the player'} traces both arrows`)
      .replace(/\btogether you\b/gi, match => companion ? `${match[0] === 'T' ? 'Together' : 'together'} the player and ${companion}` : match)
      .replace(/\bneither of you\b/gi, match => companion ? `${match[0] === 'N' ? 'Neither' : 'neither'} the player nor ${companion}` : match)
      .replace(/\byou['’]ll\b/gi, match => match[0] === 'Y' ? 'The player will' : 'the player will')
      .replace(/\byour\b/gi, match => match[0] === 'Y' ? "The player's" : "the player's")
      .replace(/\byou\b/gi, match => match[0] === 'Y' ? 'The player' : 'the player');
  }).join('');
}
function authoredActivityParts(node) {
  const name = node.ai.character;
  if (!['private', 'epilogue'].includes(node.ai.inputKey) || relationship !== name || flags.companion !== name || !flags.bond) return null;
  const choiceNode = story[`${name.toLowerCase()}_bond_choice`];
  const matches = (choiceNode?.choices || []).filter((choice) => choice.set?.bond === flags.bond);
  if (matches.length !== 1) return null;
  const [choice] = matches;
  const reply = story[choice.next];
  if (typeof choice.label !== 'string' || !choice.label || choice.label.length > 300 ||
      reply?.speaker !== name || typeof reply.text !== 'string' || !reply.text || reply.text.length > 700 ||
      /\{[^}]*\}/.test(choice.label) || /\{[^}]*\}/.test(reply.text)) return null;
  const setupText = choiceNode.speaker === 'Narrator' && typeof choiceNode.text === 'string' &&
    choiceNode.text && choiceNode.text.length <= 300 && !/\{[^}]*\}/.test(choiceNode.text)
    ? activitySetupForModel(choiceNode.text) : '';
  const setup = setupText.length <= 300 ? setupText : '';
  return { setup, playerAction: choice.label, characterReply: reply.text };
}
function authoredActivity(node) {
  const activity = authoredActivityParts(node);
  if (!activity || node.ai.inputKey !== 'private') return '';
  const inlineSetup = activity.setup ? ` ${JSON.stringify(activity.setup)}` : '';
  return ` Earlier,${inlineSetup} player: ${JSON.stringify(activity.playerAction)} ${node.ai.character}: ${JSON.stringify(activity.characterReply)}.`;
}
// Epilogue scenes contain many later events. Keep the selected shared
// activity in its own bounded field so longer character dialogue cannot
// displace an ending fact or the follow-up instruction from the scene.
function authoredActivityExchange(node) {
  if (node.ai.inputKey !== 'epilogue') return null;
  const activity = authoredActivityParts(node);
  return activity ? { playerAction: activity.playerAction, characterReply: activity.characterReply } : null;
}
// The note was added after the original Niko route. Visit markers keep old
// checkpoints from remembering a scene they never showed.
function authoredNikoNote(node) {
  const nikoBond = (story.niko_bond_choice?.choices || []).find(choice => choice.set?.bond === flags.bond);
  const nikoBondReply = story[nikoBond?.next];
  if ((node !== story.niko_chat && node !== story.niko_light_chat && !(node === story.close_niko_chat && node.ai.resumePrivate)) || node.ai.character !== 'Niko' ||
      relationship !== 'Niko' || flags.companion !== 'Niko' || flags.niko_note_seen !== 'yes' || flags.niko_note_due !== 'yes' ||
      story.niko_bond_choice?.setOnVisit?.niko_note_due !== 'yes' || nikoBondReply?.nextBy?.key !== 'niko_note_due' ||
      nikoBondReply.nextBy.cases?.yes !== 'niko_note' || story.niko_note?.setOnVisit?.niko_note_seen !== 'yes' ||
      story.niko_note.next !== 'niko_private' || story.niko_private?.next !== 'niko_input' || story.niko_input?.input?.next !== 'niko_chat') return '';
  return 'A note inside the panel says CHECK THE EASY THING FIRST; Niko said his brother wrote it.';
}
// The shorter private scene includes its authored setup directly above. The
// denser epilogue keeps it and the optional note in a separately bounded field
// so other witnessed events still fit. Only the companion who saw them gets them.
function authoredActivitySetup(node) {
  if (node.ai.inputKey === 'midpoint' && node.ai.audience === 'group' &&
      node.ai.character === relationship && flags.companion === relationship &&
      ['Niko', 'Mira', 'Ash'].includes(relationship) && ['care', 'play'].includes(flags.bond) &&
      ['keep', 'tear'].includes(flags.moment) && flags.midpoint_available === 'yes' &&
      flags.midpoint_route === relationship.toLowerCase() && flags.midpoint_chat === 'yes') {
    const observation = story[`moment_${relationship.toLowerCase()}_${flags.bond}`];
    const action = story[`moment_${flags.moment}`];
    if (typeof observation?.text === 'string' && observation.text.length <= 250 &&
        typeof action?.text === 'string' && action.text.length <= 180) {
      // The authored narration addresses the player as “you”; in a model
      // request that could instead be read as addressing the character.
      const witnessed = observation.text
        // The narrator's “the two of you” means the player and this companion;
        // replacing only “you” would falsely leave “the two of the player”.
        .replace(/\bthe two of you\b/gi, match => `${match[0] === 'T' ? 'The' : 'the'} player and ${relationship}`)
        .replace(/\byour\b/gi, match => match[0] === 'Y' ? "The player's" : "the player's")
        .replace(/\byou\b/gi, match => match[0] === 'Y' ? 'The player' : 'the player');
      const decision = flags.moment === 'keep' ? 'The player folded and kept the card.' : 'The player tore and kept the pieces.';
      const result = `${witnessed} ${decision}`;
      return result.length <= 300 ? result : '';
    }
  }
  if (node.ai.inputKey !== 'epilogue' || !authoredActivityParts(node)) return '';
  const setup = authoredActivityParts(node).setup;
  if (!setup) return '';
  const note = authoredNikoNote(node);
  return note ? `${setup} ${note}` : setup;
}
// Carry only the companion's actually displayed public reaction. It concerns
// the machine overhearing, not an inference about the player's private words.
function witnessedSharedReaction() {
  const name = narrative.sharedDisclosureReaction(flags);
  if (!name || flags.shared_reaction_seen !== name) return '';
  const beat = story[`signal_repeat_${name.toLowerCase()}`];
  if (story.signal_repeat_react?.nextBy?.key !== 'shared_disclosure_reaction' ||
      story.signal_repeat_react.nextBy.cases?.[name] !== `signal_repeat_${name.toLowerCase()}` ||
      story[`${name.toLowerCase()}_private`]?.setOnVisit?.personal_disclosure_seen !== `${name.toLowerCase()}_private` ||
      beat?.speaker !== name || beat?.setOnVisit?.shared_reaction_seen !== name ||
      beat.next !== 'mallow_request' || typeof beat.text !== 'string' ||
      !beat.text || beat.text.length > 300 || /\{[^}]*\}/.test(beat.text)) return '';
  return beat.text;
}
// A private choice leaves the player's words unshared. Only the companion's
// public reaction to being overheard may enter later dialogue context.
function witnessedPrivateReaction() {
  const name = narrative.privateDisclosureReaction(flags);
  if (!name || flags.private_reaction_seen !== name) return '';
  const id = `signal_private_${name.toLowerCase()}`;
  const line = narrative.privateDisclosureLines[name];
  const beat = story[id];
  if (story.signal_choice?.setOnVisit?.private_reaction_due !== 'yes' ||
      story.signal_private_receipt?.nextBy?.key !== 'private_disclosure_reaction' ||
      story.signal_private_receipt.nextBy.cases?.[name] !== id ||
      story[`${name.toLowerCase()}_private`]?.setOnVisit?.personal_disclosure_seen !== `${name.toLowerCase()}_private` ||
      beat?.setOnVisit?.private_reaction_seen !== name || beat.next !== 'mallow_request' ||
      typeof line !== 'string' || !line || line.length > 200 || /\{[^}]*\}/.test(line) || !beat.text?.includes(line)) return '';
  return line;
}
// Later private dialogue may refer back to the personal disclosure and the
// question that this player actually saw. Visit markers keep older saves and
// inconsistent checkpoints from acquiring scenes retroactively.
function authoredPersonalHistory(node) {
  const name = node.ai.character;
  if (node.ai.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      relationship !== name || flags.companion !== name || !['Niko', 'Mira', 'Ash'].includes(name) ||
      (name === 'Mira' && flags.ending === 'retreat')) return '';
  const lower = name.toLowerCase(), parts = [];
  const disclosure = story[`${lower}_private`];
  if (flags.private_tone !== 'light' && flags.personal_disclosure_seen === `${lower}_private` &&
      disclosure?.setOnVisit?.personal_disclosure_seen === `${lower}_private` &&
      disclosure.speaker === name && disclosure.next === `${lower}_input` &&
      story[`${lower}_input`]?.input?.next === `${lower}_chat` &&
      typeof disclosure.text === 'string' && disclosure.text && disclosure.text.length <= 500 && !/\{[^}]*\}/.test(disclosure.text)) {
    parts.push(`${name} said: ${JSON.stringify(disclosure.text)}`);
  }
  const topic = flags.topic;
  const choices = (story[`${lower}_question`]?.choices || []).filter(choice => choice.set?.topic === topic);
  const answer = story[`${lower}_question_${topic}`];
  if (flags.private_tone !== 'light' && ['past', 'future'].includes(topic) && flags.personal_topic_seen === `${lower}_${topic}` &&
      choices.length === 1 && choices[0].next === `${lower}_question_${topic}` &&
      answer?.setOnVisit?.personal_topic_seen === `${lower}_${topic}` && answer.speaker === name &&
      typeof choices[0].label === 'string' && choices[0].label.length <= 200 && !/\{[^}]*\}/.test(choices[0].label) &&
      typeof answer.text === 'string' && answer.text && answer.text.length <= 500 && !/\{[^}]*\}/.test(answer.text)) {
    parts.push(`Player asked: ${JSON.stringify(choices[0].label)} ${name} replied: ${JSON.stringify(answer.text)}`);
  }
  // A task follow-up is private and belongs only to the companion who
  // actually answered the selected question. No player free text is added.
  const detail = flags.light_detail;
  const lightChoices = (story[`${lower}_light_question`]?.choices || []).filter(choice => choice.set?.light_detail === detail);
  const lightAnswer = story[`${lower}_light_${detail}`];
  if (flags.private_tone === 'light' && flags.topic === 'light' && flags.light_question_due === 'yes' &&
      ['first', 'second'].includes(detail) && flags.light_detail_seen === `${lower}_${detail}` &&
      lightChoices.length === 1 && lightChoices[0].next === `${lower}_light_${detail}` &&
      lightAnswer?.setOnVisit?.light_detail_seen === `${lower}_${detail}` && lightAnswer.speaker === name &&
      lightAnswer.next === `${lower}_clue` && typeof lightChoices[0].label === 'string' &&
      lightChoices[0].label.length <= 200 && typeof lightAnswer.text === 'string' && lightAnswer.text.length <= 500 &&
      !/\{[^}]*\}/.test(lightChoices[0].label) && !/\{[^}]*\}/.test(lightAnswer.text)) {
    parts.push(`Player asked: ${JSON.stringify(lightChoices[0].label)} ${name} replied: ${JSON.stringify(lightAnswer.text)}`);
  }
  const sharedReaction = witnessedSharedReaction();
  if (sharedReaction && flags.shared_reaction_seen === name) {
    parts.push(`In the playroom, ${name} said: ${JSON.stringify(sharedReaction)}`);
  }
  const privateReaction = witnessedPrivateReaction();
  if (privateReaction && flags.private_reaction_seen === name) {
    parts.push(`In the playroom, ${name} said: ${JSON.stringify(privateReaction)}`);
  }
  return parts.join(' ');
}
// The player can speak to the chosen companion again immediately after one
// of their topic-specific closing lines. Include only the line the graph
// actually selected, so the model can answer references to that moment.
function authoredEpilogueLeadIn(node) {
  const name = node.ai.character;
  if (node.ai.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      relationship !== name || flags.companion !== name ||
      !['care', 'play'].includes(flags.bond) ||
      (name === 'Mira' && flags.ending === 'retreat')) return '';
  if (flags.private_tone === 'light' && flags.topic === 'light' && flags.light_close_seen === name) {
    if (name === 'Ash' && flags.ash_retreat_light_seen === 'yes' && narrative.ashRetreatLightReady(flags)) {
      const compact = story.close_ash_retreat_light_compact;
      if (compact?.speaker === name && compact.setOnVisit?.light_close_seen === name &&
          compact.setOnVisit?.ash_retreat_light_seen === 'yes' &&
          compact.text === `${story.close_ash_light.text} ${story.close_ash_retreat_light.text}` &&
          compact.choices?.some(choice => choice.next === 'close_ash_retreat_input') &&
          story.close_ash_retreat_input?.input?.next === currentNode) {
        return ` ${name} just said: ${JSON.stringify(compact.text)}.`;
      }
      return '';
    }
    // A compact Mira passage is witnessed independently of the old closing
    // line. Names remain player text and are included literally as JSON data.
    if (name === 'Mira' && flags.mira_light_compact_seen) {
      const variant = flags.mira_light_compact_seen;
      const expected = narrative.miraLightCloseRoute(flags, Boolean(knightName.trim()));
      const compact = story[`close_mira_light_${variant}_compact`];
      if (variant !== expected || !['care', 'play', 'named'].includes(variant) ||
          compact?.setOnVisit?.mira_light_compact_seen !== variant || compact?.setOnVisit?.light_close_seen !== name ||
          compact.speaker !== name || compact.next !== 'close_mira_talk_choice' ||
          !story.close_mira_talk_choice?.choices?.some(choice => choice.next === 'close_mira_input') ||
          story.close_mira_input?.input?.next !== currentNode || typeof compact.text !== 'string' || compact.text.length > 300 ||
          (variant === 'named' ? !compact.text.includes('{knightName}') : /\{[^}]*\}/.test(compact.text))) return '';
      const text = variant === 'named' ? compact.text.replace('{knightName}', () => knightName) : compact.text;
      return ` ${name} just said: ${JSON.stringify(text)}.`;
    }
    const lightId = name === 'Mira' ? 'close_mira_light_topic' :
      name === 'Ash' && flags.ending === 'retreat' ? 'close_ash_retreat_light' : `close_${name.toLowerCase()}_light`;
    const talkId = name === 'Ash' && flags.ending === 'retreat' ? 'close_ash_retreat_talk_choice' : `close_${name.toLowerCase()}_talk_choice`;
    const inputId = name === 'Ash' && flags.ending === 'retreat' ? 'close_ash_retreat_input' : `close_${name.toLowerCase()}_input`;
    const line = story[lightId];
    if (line?.setOnVisit?.light_close_seen === name && line.speaker === name &&
        line.next === talkId && story[talkId]?.choices?.some(choice => choice.next === inputId) &&
        story[inputId]?.input?.next === currentNode && typeof line.text === 'string' &&
        line.text && line.text.length <= 300 && !/\{[^}]*\}/.test(line.text)) {
      return ` ${name} just said: ${JSON.stringify(line.text)}.`;
    }
    return '';
  }
  if (!['past', 'future'].includes(flags.topic)) return '';
  const prefix = `close_${name.toLowerCase()}`;
  const topicId = `${prefix}_topic`;
  const topic = story[topicId];
  let bondId = story[prefix]?.nextBy?.key === 'bond' && story[prefix].nextBy.cases?.[flags.bond];
  // The optional knight name adds a small branch before Mira's topic line.
  if (name === 'Mira' && bondId === 'close_mira_knight_check') {
    bondId = nextStoryNode(story[bondId]);
  }
  const lineId = topic?.nextBy?.key === 'topic' && topic.nextBy.cases?.[flags.topic];
  const topicLine = story[lineId];
  const ashRetreat = name === 'Ash' && flags.ending === 'retreat' && currentNode === 'close_ash_retreat_chat';
  // A new Niko retreat beat records its visit. Old checkpoints that already
  // passed the scene have no marker and retain the earlier topic line.
  const nikoRetreat = name === 'Niko' && flags.ending === 'retreat' && currentNode === 'close_niko_chat' &&
    flags.niko_retreat_topic_seen === flags.topic &&
    story[`close_niko_retreat_${flags.topic}`]?.setOnVisit?.niko_retreat_topic_seen === flags.topic;
  const retreatLineId = (ashRetreat || nikoRetreat) ? nextStoryNode(topicLine) : '';
  const line = retreatLineId === `${prefix}_retreat_${flags.topic}` ? story[retreatLineId] : topicLine;
  const talkId = ashRetreat ? 'close_ash_retreat_talk_choice' : `${prefix}_talk_choice`;
  const inputId = ashRetreat ? 'close_ash_retreat_input' : `${prefix}_input`;
  if (!bondId || story[bondId]?.next !== topicId || line?.speaker !== name || line?.next !== talkId ||
      !story[talkId]?.choices?.some((choice) => choice.next === inputId) ||
      story[inputId]?.input?.next !== currentNode ||
      typeof line.text !== 'string' || !line.text || line.text.length > 700 || /\{[^}]*\}/.test(line.text)) return '';
  return ` ${name} just said: ${JSON.stringify(line.text)}.`;
}
// The reveal is a shared scene the chosen companion witnessed. Ground the
// epilogue in only the selected authored Mallow response, never in the
// player's private words or the alternative the player did not choose.
function authoredMallowResponse(node) {
  if (node.ai.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      relationship !== node.ai.character || flags.companion !== node.ai.character ||
      !flags.mallow_response) return '';
  const matches = (story.policy_mallow_choice?.choices || [])
    .filter((choice) => choice.set?.mallow_response === flags.mallow_response);
  if (matches.length !== 1) return '';
  const [choice] = matches;
  const reply = story[choice.next];
  if (typeof choice.label !== 'string' || !choice.label || choice.label.length > 300 ||
      reply?.speaker !== 'Mallow' || reply.next !== 'policy_ash' ||
      typeof reply.text !== 'string' || !reply.text || reply.text.length > 700 ||
      /\{[^}]*\}/.test(choice.label) || /\{[^}]*\}/.test(reply.text)) return '';
  return ` In the playroom, player: ${JSON.stringify(choice.label)} Mallow: ${JSON.stringify(reply.text)}.`;
}
// The chosen companion was present when the player chose what to take from
// their search. Include that selected authored moment in the later private
// conversation so a question about the tool or copy has a factual reference.
function authoredRouteAction(node) {
  const name = node.ai.character;
  if (node.ai.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      relationship !== name || flags.companion !== name || !flags.route_action) return '';
  const choices = story[`${name.toLowerCase()}_work_choice`]?.choices || [];
  const matches = choices.filter((choice) => choice.set?.route_action === flags.route_action);
  if (matches.length !== 1) return '';
  const [choice] = matches;
  const reply = story[choice.next];
  // Earlier checkpoints may already have resolved the map notice before the
  // search; new games encounter it at reunion instead. Both routes rejoin.
  const rejoins = reply?.next === 'regroup' || (reply?.next === 'notice_intro' &&
    reply.nextBy?.key === 'notice_preference' &&
    ['direct', 'warm', 'skip'].every(value => reply.nextBy.cases?.[value] === 'regroup') &&
    story.notice_intro?.next === 'notice_choice');
  if (typeof choice.label !== 'string' || !choice.label || choice.label.length > 300 ||
      !['Narrator', name].includes(reply?.speaker) || !rejoins ||
      typeof reply.text !== 'string' || !reply.text || reply.text.length > 700 ||
      /\{[^}]*\}/.test(choice.label) || /\{[^}]*\}/.test(reply.text)) return '';
  const witnessed = reply.speaker === 'Narrator' ? activitySetupForModel(reply.text, name) : reply.text;
  return ` Searching with ${name}, player: ${JSON.stringify(choice.label)} Scene: ${JSON.stringify(witnessed)}.`;
}
// All three companions witnessed this exchange after the record ending. Only
// pass the authored branch actually selected, and only along a valid path.
function authoredRecordResponse(node) {
  const name = node.ai.character;
  if (node.ai.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      relationship !== name || flags.companion !== name || flags.ending !== 'record' ||
      !flags.record_response || !flags.evidence) return '';
  const evidence = story[`close_evidence_${flags.evidence}`];
  const source = story.record_close_mira;
  if (evidence?.nextBy?.key !== 'ending' || evidence.nextBy.cases?.record !== 'record_close_mira' ||
      source?.speaker !== 'Mira' || story.record_close_ash?.next !== 'kit_check') return '';
  const matches = (source.choices || []).filter((choice) => choice.set?.record_response === flags.record_response);
  if (matches.length !== 1) return '';
  const [choice] = matches, reply = story[choice.next];
  if (typeof choice.label !== 'string' || !choice.label || choice.label.length > 300 ||
      reply?.speaker !== 'Mira' || reply.next !== 'record_close_ash' ||
      typeof reply.text !== 'string' || !reply.text || reply.text.length > 700 ||
      /\{[^}]*\}/.test(choice.label) || /\{[^}]*\}/.test(reply.text)) return '';
  return ` Mira returned. Player: ${JSON.stringify(choice.label)} Mira: ${JSON.stringify(reply.text)}.`;
}
// Only carry an action which the save records as having actually been shown.
// Older saves can contain the response but predate these follow-up scenes.
// Mallow witnessed the player's count check; older saves have no such action.
function authoredRegroupEvent(node) {
  if (node !== story.ai_reflection) return '';
  return { touch: 'The player touched Mallow’s picture to request a recheck. The screen replied THANK YOU FOR CONFIRMING.',
    count: 'The player arranged two ticket pieces. The screen circled them and said THREE VERIFIED.' }[flags.regroup_action] || '';
}

// The retreat experiment is shared with Niko and Ash. It remains ambiguous:
// a sound is not evidence that Mira produced it. Old checkpoints lack the
// visit marker and must not gain a remembered experiment retroactively.
function authoredRetreatProbe(node) {
  const name = node.ai?.character;
  if (node.ai?.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      !['Niko', 'Ash'].includes(name) || relationship !== name || flags.companion !== name ||
      flags.ending !== 'retreat' || flags.retreat_probe_due !== 'yes' ||
      !['repeat', 'change'].includes(flags.retreat_probe) || flags.retreat_probe_seen !== flags.retreat_probe ||
      node !== (name === 'Niko' ? story.close_niko_chat : story.close_ash_retreat_chat) ||
      story.end_retreat?.setOnVisit?.retreat_probe_due !== 'yes') return '';
  const mode = flags.retreat_probe;
  const choices = (story.retreat_probe_choice?.choices || []).filter(choice => choice.set?.retreat_probe === mode);
  const action = story[`retreat_probe_${mode}`];
  const reply = story[`retreat_probe_${mode}_reply`];
  if (story.retreat_probe_intro?.next !== 'retreat_probe_choice' || choices.length !== 1 ||
      choices[0].next !== `retreat_probe_${mode}` || action?.setOnVisit?.retreat_probe_seen !== mode ||
      action.next !== `retreat_probe_${mode}_reply` || reply?.next !== 'evidence_close') return '';
  return mode === 'repeat'
    ? 'The player repeated one tap, a pause, then two; the floor returned the same pattern.'
    : 'The player tried two taps, a pause, then one; a knock sounded below before their last tap.';
}
function authoredRecordFollowup(node) {
  if (!authoredRecordResponse(node)) return '';
  const chosen = { apology: ['explain', 'record_close_explain', 'Ash said they printed first; Mira folded the correction outward.'],
    ask: ['decide', 'record_close_decide', 'Mira circled the correction and marked the map.'] }[flags.record_response];
  if (!chosen || flags.record_followup !== chosen[0] ||
      story.record_close_ash?.nextBy?.key !== 'record_response' ||
      story.record_close_ash.nextBy.cases?.[flags.record_response] !== chosen[1] ||
      story[chosen[1]]?.setOnVisit?.record_followup !== chosen[0] ||
      story[chosen[1]].next !== 'kit_check') return '';
  return chosen[2];
}

// The field-repair moment happens after the team has reunited upstairs. Only
// include it in the chosen companion's closing chat when actually displayed;
// older checkpoints may have the kit flag but never showed this particular beat.
function authoredKitEvent(node) {
  const name = node.ai?.character;
  if (node.ai?.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      !['Niko', 'Mira', 'Ash'].includes(name) || name !== relationship || flags.companion !== name ||
      (name === 'Mira' && flags.ending === 'retreat') ||
      !['free', 'paid'].includes(flags.repairKit) || flags.kit_use_seen !== 'yes' ||
      story.kit_use?.setOnVisit?.kit_use_seen !== 'yes' || story.kit_check?.nextBy?.key !== 'repairKit' ||
      story.kit_check.nextBy.cases?.[flags.repairKit] !== 'kit_use') return '';
  return 'Niko propped the stair door with the wrench; Ash bandaged his knuckles.';
}

// Remember use of the earlier tool only if this playthrough actually reached
// the matching rescue beat. Saves that predate it cannot acquire a memory.
function authoredRescueToolEvent(node) {
  const name = node.ai?.character;
  const summaries = {
    Niko: 'The player used the spring under the catch while Niko guided them.',
    Mira: 'The player looped Mira’s sewing string under the latch and pulled the catch free.',
    Ash: 'Ash wedged the doorstop while the player held the release and pulled.'
  };
  if (node.ai?.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      !hasOwn(summaries, name) || relationship !== name || flags.companion !== name ||
      flags.ending !== 'rescue' || flags.route_action !== 'fix' ||
      flags.rescue_tool_seen !== name || flags.rescue_opened !== 'yes') return '';
  const beatId = `rescue_${name.toLowerCase()}_fix`, beat = story[beatId];
  // Mira is behind the door: only the new call tells her which tool and
  // action freed the catch. Earlier saves may have seen the silent version.
  if (name === 'Mira' && (flags.rescue_tool_mira_told !== 'yes' ||
      beat?.setOnVisit?.rescue_tool_mira_told !== 'yes')) return '';
  if (story.end_rescue?.nextBy?.key !== 'route_action' ||
      story.end_rescue.nextBy.cases?.fix !== 'rescue_fix_companion' ||
      story.rescue_fix_companion?.nextBy?.key !== 'companion' ||
      story.rescue_fix_companion.nextBy.cases?.[name] !== beatId ||
      beat?.setOnVisit?.rescue_tool_seen !== name || beat.next !== 'rescue_complete' ||
      beat.nextBy?.key !== 'audit_action' || beat.nextBy.cases?.unplug !== 'rescue_complete_unplug' ||
      story.rescue_complete?.setOnVisit?.rescue_opened !== 'yes' ||
      story.rescue_complete_unplug?.setOnVisit?.rescue_opened !== 'yes') return '';
  return summaries[name];
}

// The search now takes place before this closing conversation. Include only
// the response that was actually displayed, not a choice from an older save
// that has not reached the search yet.
function authoredRetreatSearch(node) {
  const name = node.ai?.character;
  if (node.ai?.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      !['Niko', 'Ash'].includes(name) || relationship !== name || flags.companion !== name ||
      flags.ending !== 'retreat' || flags.retreat_search_early !== 'yes' ||
      !['stair', 'sound'].includes(flags.retreat_search) || flags.retreat_search_seen !== flags.retreat_search ||
      node !== (name === 'Niko' ? story.close_niko_chat : story.close_ash_retreat_chat)) return '';
  const action = flags.retreat_search;
  const matching = (story.retreat_early_search_choice?.choices || []).filter(choice =>
    choice.set?.retreat_search === action && choice.set?.retreat_search_early === 'yes');
  const beat = story[`retreat_early_search_${action}`];
  if (matching.length !== 1 || matching[0].next !== `retreat_early_search_${action}` ||
      beat?.setOnVisit?.retreat_search_seen !== action || beat.next !== 'evidence_close') return '';
  if (action === 'stair') {
    const waymark = narrative.retreatWaymark(flags);
    if (waymark && flags.stair_search_waymark_seen === waymark) {
      return waymark === 'rail'
        ? 'The player used the service-landing notch rubbing on Ash’s map to find where to press the first step; its edge exposed a loose bracket.'
        : 'The player slid the EXIT sign taken from the service landing under the first step, lifting its edge to expose a loose bracket.';
    }
    return 'The player pressed the first stair; its edge dipped and exposed a loose bracket.';
  }
  return 'The player and Ash heard a knock under the fort; Ash marked it with a question mark.';
}

// The companion's new closing callback is only available after seeing it.
// Its spoken lines are grounded in the authored node, not inferred from a
// past choice; old checkpoints and mismatched routes add no new memory.
function authoredSouvenirCallback(node) {
  const name = node.ai?.character;
  if (node.ai?.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      !['Niko', 'Mira', 'Ash'].includes(name) || relationship !== name || flags.companion !== name) return '';
  const mark = `${name.toLowerCase()}_${flags.bond}`;
  const beat = story[`souvenir_used_${mark}`];
  const next = name === 'Mira' ? 'close_mira_check' : `close_${name.toLowerCase()}`;
  if (flags.souvenir_callback_seen !== mark || narrative.souvenirWedgeRoute(flags) !== mark ||
      story.souvenir_check?.nextBy?.key !== 'souvenir_wedge_route' ||
      story.souvenir_check.nextBy.cases?.[mark] !== `souvenir_used_${mark}` ||
      beat?.setOnVisit?.souvenir_callback_seen !== mark || beat.next !== next ||
      beat.speaker !== 'Narrator' || typeof beat.text !== 'string') return '';
  const lines = [...beat.text.matchAll(/“([^”]+)”/g)].map(match => match[1]);
  if (lines.length !== 2 || lines.some(line => !line || line.length > 150 || /\{[^}]*\}/.test(line))) return '';
  return `The paper remained under the catch. ${name} said: ${JSON.stringify(lines.join(' '))}.`;
}

// The immediate rescue has its own player-led coordination beat before the
// latch action. Remember only a scene that this run visited, and do not give
// Mira the outside view of the paper fingers while she was behind the door.
function authoredRescueCoordination(node) {
  const name = node.ai?.character;
  const selected = flags.rescue_coordination;
  if (node.ai?.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      !['Niko', 'Mira', 'Ash'].includes(name) || relationship !== name || flags.companion !== name ||
      flags.ending !== 'rescue' || flags.rescue_opened !== 'yes' ||
      !['count', 'reach'].includes(selected) || flags.rescue_coordination_seen !== selected) return '';
  const choices = (story.rescue_coordination_choice?.choices || []).filter(choice => choice.set?.rescue_coordination === selected);
  const beat = story[`rescue_coordination_${selected}`];
  if (story.plan_choice?.choices?.filter(choice => choice.set?.ending === 'rescue' &&
        choice.next === 'rescue_coordination_choice').length !== 1 ||
      choices.length !== 1 || choices[0].next !== `rescue_coordination_${selected}` ||
      beat?.setOnVisit?.rescue_coordination_seen !== selected || beat.next !== 'end_rescue' ||
      story.rescue_complete?.setOnVisit?.rescue_opened !== 'yes' ||
      story.rescue_complete_unplug?.setOnVisit?.rescue_opened !== 'yes') return '';
  if (selected === 'count') return 'Mira counted aloud and pushed while Niko held the release.';
  return name === 'Mira'
    ? 'Niko held Mira’s hand under the door; she warned him another hand was not hers.'
    : 'Niko held Mira’s hand under the door; paper fingers unfolded beside them.';
}

// Ending-specific events are mutually exclusive. The immediate coordination,
// rescue tool and optional kit also fit together within the 300-character cap.
function authoredStoryEvent(node) {
  return [authoredRescueCoordination(node),
    authoredRegroupEvent(node) || authoredRecordFollowup(node) || authoredRetreatProbe(node) || authoredRescueToolEvent(node),
    authoredRetreatSearch(node), authoredKitEvent(node), authoredSouvenirCallback(node)].filter(Boolean).join(' ');
}
// The comparisons were displayed to the whole group and recalled in the
// reveal. Carry only the player's actual selections into the companion chat.
// Older or incomplete checkpoints must not invent a witnessed reveal.
function authoredRevealComparisons(node) {
  const name = node.ai.character;
  if (node.ai.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      relationship !== name || flags.companion !== name) return '';
  // The early rescue shows these same actual choices on a screen after Mira
  // is freed, without passing through the later receipt's reveal.
  if (flags.early_rescue_now === 'open_now' && flags.ending === 'rescue' && flags.rescue_opened === 'yes' &&
      narrative.earlyImmediateAvailable(flags) && flags.early_together_comparisons_seen === 'yes' &&
      flags.comparisons_revealed === 'yes' && story.early_together_comparisons?.setOnVisit?.early_together_comparisons_seen === 'yes') {
    const selections = [];
    for (const [choiceId, key, label] of [['card_choice', 'card_preference', 'welcome card'], ['notice_choice', 'notice_preference', 'map notice']]) {
      const choice = (story[choiceId]?.choices || []).filter(item => item.set?.[key] === flags[key]);
      if (choice.length !== 1 || typeof choice[0].label !== 'string' || !choice[0].label || choice[0].label.length > 300 || /\{[^}]*\}/.test(choice[0].label)) return '';
      selections.push(`${label}: ${JSON.stringify(choice[0].label)}`);
    }
    return ` Earlier the player selected ${selections.join('; ')}.`;
  }
  // New runs show the two comparisons together. A visit marker, not merely
  // the earlier selections, proves this particular reveal was displayed.
  if (flags.reveal_pace_v2 === 'yes') {
    const valid = ['direct', 'warm', 'skip'];
    if (flags.comparisons_revealed !== 'yes' || !valid.includes(flags.vote_a) ||
        !valid.includes(flags.vote_b)) return '';
    const compact = flags.early_paper_done === 'yes' ? story.history_comparisons_early : story.history_comparisons_compact;
    const second = story[`history_second_${flags.vote_b}`];
    const briefId = `history_brief_${flags.vote_a}`;
    const brief = story[briefId];
    // Fresh runs now combine the hint comparison with the earlier threshold
    // choice. A saved checkpoint from before that edit can still arrive via
    // the old second-receipt passage. Validate the witnessed route separately
    // so a stale marker cannot attribute a disconnected scene to the crew.
    const cameThroughBrief = flags.receipt_history_brief === 'yes' &&
      story.history_repeat_intro?.nextBy?.key === 'vote_a' &&
      story.history_repeat_intro.nextBy.cases?.[flags.vote_a] === briefId &&
      story.history_steps_picture?.nextBy?.key === 'vote_a' &&
      story.history_steps_picture.nextBy.cases?.[flags.vote_a] === briefId &&
      brief?.setOnVisit?.receipt_history_brief === 'yes' &&
      brief?.remember?.source === 'basement_vote' && brief.remember.flag === 'vote_b' &&
      brief.nextBy?.key === 'receipt_brief_route' && brief.nextBy.cases?.yes === 'history_comparisons_compact' &&
      (flags.early_paper_done !== 'yes' || (brief.nextBy.cases?.early === 'history_early_paper' &&
        flags.early_paper_shown === 'yes' && ['share', 'keep', 'quote', 'mallow_quote'].includes(flags.paper_handoff) &&
        story.history_comparisons_early?.next === 'history_citation_early'));
    const cameThroughOldReceipt = flags.receipt_history_brief !== 'yes' &&
      second?.nextBy?.key === 'reveal_pace_v2' && second.nextBy.cases?.yes === 'history_comparisons_compact';
    if (story.mira_ticket_glimpse?.setOnVisit?.reveal_pace_v2 !== 'yes' ||
        (!cameThroughBrief && !cameThroughOldReceipt) ||
        compact?.setOnVisit?.comparisons_revealed !== 'yes' ||
        !compact.text?.includes('{cardComparison}') || !compact.text?.includes('{noticeComparison}')) return '';
    const selections = [];
    for (const [choiceId, value, label, source] of [
      ['card_choice', flags.card_preference, 'welcome card', `history_card_${flags.card_preference}`],
      ['notice_choice', flags.notice_preference, 'map notice', `history_notice_${flags.notice_preference}`]
    ]) {
      // An old checkpoint may predate either comparison. The compact scene
      // displays only available selections; don't invent the missing one.
      if (!valid.includes(value)) continue;
      const key = choiceId === 'card_choice' ? 'card_preference' : 'notice_preference';
      const choices = (story[choiceId]?.choices || []).filter(choice => choice.set?.[key] === value);
      const text = story[source]?.text;
      if (choices.length !== 1 || typeof choices[0].label !== 'string' || !choices[0].label ||
          choices[0].label.length > 300 || /\{[^}]*\}/.test(choices[0].label) ||
          typeof text !== 'string' || !text || /\{[^}]*\}/.test(text)) return '';
      selections.push(`${label}: ${JSON.stringify(choices[0].label)}`);
    }
    return selections.length ? ` Earlier the player selected ${selections.join('; ')}.` : '';
  }
  const first = story.history_select, comparison = story.history_compare_check;
  if (first?.nextBy?.key !== 'vote_a' || comparison?.nextBy?.key !== 'vote_a') return '';
  const firstId = first.nextBy.cases?.[flags.vote_a];
  const comparisonId = comparison.nextBy.cases?.[flags.vote_a] || comparison.next;
  if (!firstId || story[firstId]?.next !== 'history_reaction' ||
      story.history_reaction?.next !== 'history_compare_check' ||
      (comparisonId !== 'history_second_check' &&
        (story[comparisonId]?.next !== 'history_compare_reaction' ||
         story.history_compare_reaction?.next !== 'history_second_check'))) return '';
  const second = story.history_second_check;
  if (second?.nextBy?.key !== 'vote_b') return '';
  const secondId = second.nextBy.cases?.[flags.vote_b];
  if (!secondId || story[secondId]?.next !== 'history_second_reaction' ||
      story.history_second_reaction?.next !== 'history_card_check') return '';

  const cardCheck = story.history_card_check, noticeCheck = story.history_notice_check;
  if (cardCheck?.nextBy?.key !== 'card_preference' || noticeCheck?.nextBy?.key !== 'notice_preference' ||
      cardCheck.next !== 'history_notice_check' || noticeCheck.next !== 'history_reflect' ||
      story.history_comparison_reaction?.next !== 'history_reflect') return '';
  const result = [];
  for (const [key, choiceId, check, label, expectedNext] of [
    ['card_preference', 'card_choice', cardCheck, 'welcome card', 'history_notice_check'],
    ['notice_preference', 'notice_choice', noticeCheck, 'map notice', 'history_comparison_reaction']
  ]) {
    const value = flags[key];
    if (!['direct', 'warm', 'skip'].includes(value)) continue;
    const revealId = check.nextBy.cases?.[value];
    const choices = (story[choiceId]?.choices || []).filter((choice) => choice.set?.[key] === value);
    if (choices.length !== 1 || !revealId || story[revealId]?.next !== expectedNext) continue;
    const choice = choices[0];
    if (typeof choice.label !== 'string' || !choice.label || choice.label.length > 300 || /\{[^}]*\}/.test(choice.label)) continue;
    result.push(`${label}: ${JSON.stringify(choice.label)}`);
  }
  return result.length ? ` Earlier the player selected ${result.join('; ')}.` : '';
}
// The audit was displayed to the player. The visit marker distinguishes it
// from older saves already past the reveal; Mira is behind the closed door,
// so only the remarks she can hear belong in her later conversation.
function auditWasSeen() {
  if (flags.early_audit_present === 'yes') {
    if (!narrative.earlyAuditComplete(flags)) return false;
    const scene = story.early_audit_choice;
    return story.mira_ticket_glimpse?.setOnVisit?.early_audit_due === 'yes' &&
      story.history_comparisons_early?.nextBy?.key === 'early_audit_ready' &&
      story.history_comparisons_early.nextBy.cases?.yes === 'early_audit_choice' &&
      scene?.setOnVisit?.audit_seen === 'yes' && scene.setOnVisit.mira_report_seen === 'yes' &&
      scene.setOnVisit.early_audit_present === 'yes' && Array.isArray(scene.choices);
  }
  if (flags.audit_focus_seen) {
    const focus = flags.audit_focus_seen;
    const scene = story[`audit_focus_${focus}_compact`];
    return ['tell', 'listen'].includes(focus) && flags.audit_seen === 'yes' &&
      flags.audit_focus_due === 'yes' && flags.reveal_focus === focus &&
      flags.policy_goal_compact_seen === 'yes' &&
      story.mira_ticket_glimpse?.setOnVisit?.audit_focus_due === 'yes' &&
      story.policy_goal_compact?.setOnVisit?.policy_goal_compact_seen === 'yes' &&
      story.policy_goal_compact?.nextBy?.key === 'compact_audit_route' &&
      story.policy_goal_compact.nextBy.cases?.[focus] === `audit_focus_${focus}_compact` &&
      scene?.setOnVisit?.audit_seen === 'yes' && scene.setOnVisit.audit_focus_seen === focus &&
      Array.isArray(scene.choices);
  }
  const connectedGoal = flags.policy_goal_compact_seen === 'yes'
    ? story.policy_goal_compact?.setOnVisit?.policy_goal_compact_seen === 'yes' && story.policy_goal_compact.next === 'audit_receipt'
    : story.policy_goal_mallow?.next === 'audit_receipt';
  return flags.audit_seen === 'yes' && connectedGoal && story.audit_receipt?.setOnVisit?.audit_seen === 'yes' &&
    story.audit_receipt.next === 'audit_ash' && story.audit_ash?.speaker === 'Ash' &&
    story.audit_ash.next === 'audit_mallow' && story.audit_mallow?.speaker === 'Mallow' &&
    story.audit_mallow.next === 'audit_mira' && story.audit_mira?.next === 'audit_action_choice';
}
function selectedAuditAction() {
  if (!auditWasSeen()) return '';
  if (narrative.earlyAuditComplete(flags)) {
    const value = flags.audit_action;
    const choice = story.early_audit_choice?.choices?.filter(item => item.set?.audit_action === value) || [];
    const target = value === 'annotate' ? 'early_audit_annotation_input' : `early_audit_${value}`;
    const result = value === 'annotate' ? story.early_audit_annotation_written : story[target];
    if (choice.length !== 1 || choice[0].next !== target || result?.setOnVisit?.early_audit_action_seen !== value) return '';
    if (value === 'annotate' && (story[target]?.input?.key !== 'annotation' || story[target].input.next !== 'early_audit_annotation_written' ||
      result.setOnVisit.annotation_written !== 'yes' || result.setOnVisit.audit_seal_seen !== 'yes')) return '';
    return value;
  }
  const actionChoices = flags.audit_focus_seen
    ? story[`audit_focus_${flags.audit_focus_seen}_compact`]?.choices
    : story.audit_action_choice?.choices;
  const value = flags.audit_action;
  const paths = {
    cover: ['audit_cover', 'audit_cover_reply'],
    leave: ['audit_leave'],
    unplug: ['audit_unplug', 'audit_unplug_reply']
  };
  if (value === 'annotate') {
    const choice = (actionChoices || []).filter(item => item.set?.audit_action === value);
    const replyWorks = story.audit_annotate_reply?.next === 'policy_mallow_choice';
    if (choice.length !== 1 || !replyWorks) return '';
    if (flags.annotation_written === 'yes') {
      return choice[0].next === 'audit_annotation_input' &&
        story.audit_annotation_input?.input?.key === 'annotation' &&
        story.audit_annotation_input.input.next === 'audit_annotation_written' &&
        story.audit_annotation_written?.setOnVisit?.annotation_written === 'yes' &&
        story.audit_annotation_written.next === 'audit_annotate_reply' ? value : '';
    }
    // Earlier checkpoints used a fixed authored sentence instead of an input.
    return story.audit_annotate?.next === 'audit_annotate_reply' ? value : '';
  }
  if (!hasOwn(paths, value)) return '';
  const choices = (actionChoices || []).filter(choice => choice.set?.audit_action === value);
  const path = paths[value];
  if (choices.length !== 1 || choices[0].next !== path[0] ||
      path.some((id, index) => story[id]?.next !== (path[index + 1] || 'policy_mallow_choice'))) return '';
  return value;
}
function authoredAudit(node) {
  const name = node.ai.character;
  if (node.ai.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      relationship !== name || flags.companion !== name ||
      (name === 'Mira' && flags.ending === 'retreat')) return '';
  if (flags.early_rescue_now === 'open_now' && flags.ending === 'rescue' && flags.rescue_opened === 'yes' &&
      narrative.earlyImmediateAvailable(flags) && flags.early_together_comparisons_seen === 'yes' &&
      flags.early_together_citation_seen === 'yes' && story.early_together_citation?.setOnVisit?.early_together_citation_seen === 'yes') {
    const actions = {
      cover: ' The player covered the lens with a paper star; the screen continued showing the report.',
      note: ' The player wrote a note on Ash’s map; the screen kept its own report.',
      leave: ' The player left the lens and screen alone.',
      unplug: ' The player unplugged the printer; the screen stayed on.'
    };
    const action = narrative.earlyTogetherAction(flags);
    return ' After Mira was freed, the group saw two reports cite each other; one falsely named Mira as its author.' + (actions[action] || '');
  }
  if (!auditWasSeen()) return '';
  const actions = {
    cover: ' The player covered the lens with a paper star.',
    annotate: ' The player wrote on the receipt; the screen’s original claim stayed unchanged.',
    leave: ' The player left the lens and receipt alone.',
    unplug: ' The player unplugged the printer; the screen stayed on.'
  };
  if (name === 'Mira') {
    // In the compact route Mallow watches silently; Mira cannot see that or
    // the player's physical actions through the closed door. Keep only the
    // spoken facts audible to her, including the selected response where one
    // actually makes the relevant action clear.
    const heardActions = {
      annotate: ' Ash said the writing had not opened the door.',
      leave: ' Niko said to leave the slip and lens alone.',
      unplug: ' The player said the printer was unplugged and the screen was still on.'
    };
    return ' Ash called the audit one mark wearing three badges; Mira said the reports had not opened the door.' +
      (heardActions[selectedAuditAction()] || '');
  }
  // In the newer focus branches the audit goes straight to Mira; Mallow is
  // visibly watching, but does not make the remark present on the old route.
  // Keep the old account for saves without that choice.
  const focused = (narrative.earlyAuditComplete(flags) && auditWasSeen()) ||
    (flags.audit_focus_seen && flags.audit_focus_seen === flags.reveal_focus && auditWasSeen()) ||
    (['tell', 'listen'].includes(flags.reveal_focus) &&
    story.audit_receipt?.nextBy?.key === 'reveal_focus' &&
    story.audit_receipt.nextBy.cases?.[flags.reveal_focus] === `audit_mira_${flags.reveal_focus}` &&
    story[`audit_mira_${flags.reveal_focus}`]?.speaker === 'Mira' &&
    story[`audit_mira_${flags.reveal_focus}`]?.next === 'audit_action_choice');
  const action = selectedAuditAction();
  // The added seal was not present in older checkpoints that had already
  // passed the annotation scene. Only the companions outside the door saw it;
  // its text cites the annotation but does not disclose the player's words.
  const seal = action === 'annotate' && flags.annotation_written === 'yes' && flags.audit_seal_seen === 'yes' &&
    story.audit_annotation_written?.setOnVisit?.audit_seal_seen === 'yes'
    ? ' The screen cited the annotation as verification.' : '';
  return (' Ash: one audit mark was repeated;' + (focused
    ? ' Mallow watched the counter.'
    : flags.reveal_focus ? '' : ' Mallow took part in the audit.')) +
    (actions[action] || '') + seal;
}
// The machine interprets a press as verification; the player merely tried
// the control. Mira hears the player's explanation but cannot see the screen.
function authoredConfirmAttempt(node) {
  const name = node.ai.character;
  if (node.ai.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      relationship !== name || flags.companion !== name ||
      (name === 'Mira' && flags.ending === 'retreat') ||
      flags.confirm_pressed !== 'yes' || flags.confirm_result_seen !== 'yes') return '';
  const choices = (story.evidence_choice?.choices || []).filter(choice => choice.set?.confirm_pressed === 'yes');
  if (choices.length !== 1 || choices[0].next !== 'evidence_confirm' ||
      story.evidence_confirm?.setOnVisit?.confirm_result_seen !== 'yes' ||
      story.evidence_confirm.next !== 'evidence_confirm_followup' ||
      !['receipt', 'tickets', 'voice'].includes(flags.evidence) ||
      !(story.evidence_confirm_followup?.choices || []).some(choice => choice.set?.evidence === flags.evidence)) return '';
  return name === 'Mira'
    ? ' The player said CONFIRM did not open the door.'
    : ' The player tried CONFIRM on the door; it stayed shut. The screen treated the press as proof everyone was together, not as a door attempt.';
}

// Each companion is present or able to hear the door exchange. Only attach a
// selected, still-reachable authored action; older saves have no such flag.
function authoredDoorEffort(node) {
  const name = node.ai.character;
  if (node.ai.inputKey !== 'epilogue' || !node.ai.resumePrivate ||
      relationship !== name || flags.companion !== name ||
      (name === 'Mira' && flags.ending === 'retreat')) return '';
  const earlyEntry = flags.early_door_done === 'yes';
  const compactEntry = flags.compact_moment_seen === 'yes' &&
    ['keep', 'tear'].includes(flags.moment) &&
    story[`moment_return_${flags.moment}_compact`]?.setOnVisit?.compact_moment_seen === 'yes' &&
    story[`moment_return_${flags.moment}_compact`]?.next === 'door_choice';
  if (!earlyEntry && !compactEntry && story.moment_return_react?.next !== 'door_choice') return '';
  const lines = {
    brace: ['door_brace', ' The player and Niko lifted the door; the paper hand was not Mira’s.'],
    listen: ['door_listen', ' The player asked Mira what she felt; she described a catch near the counter.']
  };
  const entry = hasOwn(lines, flags.door_effort) ? lines[flags.door_effort] : null;
  if (!entry) return '';
  if (earlyEntry) {
    // The current route visits the effort before the reveal and skips the
    // later choice. Validate that route rather than inferring it from the
    // legacy choice, which still exists for resumed older checkpoints.
    const id = `early_door_${flags.door_effort}`;
    const choices = (story.early_door_choice?.choices || []).filter(choice =>
      choice.set?.door_effort === flags.door_effort && choice.set?.early_door_done === 'yes');
    if (choices.length !== 1 || choices[0].next !== id || story[id]?.next !== 'fourth_wall_intro_compact' ||
        !['receipt', 'tickets', 'voice'].every(value => story[`evidence_machine_${value}_compact`]?.next === 'early_door_choice')) return '';
  } else {
    const choices = (story.door_choice?.choices || []).filter(choice => choice.set?.door_effort === flags.door_effort);
    const reply = story[entry[0]];
    if (choices.length !== 1 || choices[0].next !== entry[0] || reply?.next !== 'reason_reveal_check' ||
        reply.nextBy?.key !== 'reason' ||
        !['team', 'prize', 'company'].every(value => ['reason_reveal', `reason_result_${value}_reply`].includes(reply.nextBy.cases?.[value]))) return '';
  }
  // Mira cannot see who is lifting the door or the material of the hand from
  // her side. She can remember what she herself said without acquiring the
  // outside group's view of the action.
  if (name === 'Mira' && flags.door_effort === 'brace') {
    return ' Mira said “That isn’t mine” from behind the door.';
  }
  return entry[1];
}
// Ground the optional closing conversation in the actual choices already
// witnessed by this companion. These are authored facts, not model guesses;
// a missing flag (for example in an older checkpoint) adds no invented detail.
function epilogueContext() {
  // Before the topic-dependent rescue, the no-tool node selected the printer
  // outcome itself. The current graph routes its fallback through a finish
  // check, while each witnessed topic-specific branch makes the same choice.
  const oldRescueRoute = story.rescue_without_tool?.nextBy?.key === 'audit_action' &&
    story.rescue_without_tool.nextBy.cases?.unplug === 'rescue_complete_unplug';
  const newRescueRoute = story.rescue_without_tool?.next === 'rescue_finish_check' &&
    story.rescue_without_tool.nextBy?.key === 'companion' &&
    story.rescue_finish_check?.nextBy?.key === 'audit_action' &&
    story.rescue_finish_check.nextBy.cases?.unplug === 'rescue_complete_unplug' &&
    ['Niko', 'Mira', 'Ash'].every(name => {
      const lower = name.toLowerCase();
      const node = story[`rescue_topic_${lower}`];
      return story.rescue_without_tool.nextBy.cases?.[name] === `rescue_topic_${lower}` &&
        node?.next === 'rescue_finish_check' && ['topic', 'rescue_detail_route'].includes(node.nextBy?.key) &&
        ['past', 'future'].every(topic => {
          const id = `rescue_${lower}_topic_${topic}`;
          return node.nextBy.cases?.[topic] === id && story[id]?.nextBy?.key === 'audit_action' &&
            story[id].nextBy.cases?.unplug === 'rescue_complete_unplug';
        });
    });
  const printerUnplugged = selectedAuditAction() === 'unplug' && (oldRescueRoute || newRescueRoute);
  const recordChoices = story.record_unplug_choice?.choices || [];
  const reconnect = recordChoices.filter(choice => choice.set?.record_power === 'reconnected');
  const leave = recordChoices.filter(choice => choice.set?.record_power === 'left_unplugged' && choice.set?.ending === 'rescue');
  const recordPath = story.plan_record_check?.nextBy?.key === 'audit_action' &&
    story.plan_record_check.nextBy.cases?.unplug === 'record_unplug_choice';
  const reconnected = printerUnplugged && recordPath && flags.record_power === 'reconnected' &&
    reconnect.length === 1 && reconnect[0].next === 'record_reconnect' &&
    story.record_reconnect?.next === 'end_record' &&
    story.end_record?.nextBy?.cases?.reconnected === 'record_reconnect_explained' &&
    story.record_reconnect_explained?.next === 'end_record_reply';
  const keptUnplugged = printerUnplugged && recordPath && flags.record_power === 'left_unplugged' &&
    leave.length === 1 && leave[0].next === 'record_leave_unplugged' &&
    story.record_leave_unplugged?.next === 'end_rescue';
  let mallowOutcome = 'Mallow chose to help, pointed out a hidden catch, and its screen went dark. Mira has returned safely with the third ticket piece.';
  if (flags.ending === 'mallow' && (flags.audit_action === 'cover' || flags.mallow_camera)) {
    mallowOutcome = 'Mallow chose to help. Mira returned safely with the third ticket piece; Mallow’s screen went dark.';
    const compactCamera = flags.mallow_compact_seen &&
      flags.mallow_compact_seen === flags.mallow_response && flags.mallow_promise_heard === flags.mallow_response &&
      flags.mallow_camera_offer_seen === 'yes' &&
      narrative.compactRescueRoute(flags, 'plan_choice', 'end_mallow') === `end_mallow_compact_${flags.mallow_response}` &&
      story[`end_mallow_compact_${flags.mallow_response}`]?.nextBy?.cases?.cover === 'mallow_camera_compact' &&
      story.mallow_camera_compact?.setOnVisit?.mallow_camera_offer_seen === 'yes';
    const choices = flags.mallow_compact_seen ? story.mallow_camera_compact?.choices : story.mallow_camera_choice?.choices;
    const cameraChoice = (choices || []).filter(choice => choice.set?.mallow_camera === flags.mallow_camera);
    const cameraReachable = selectedAuditAction() === 'cover' && (flags.mallow_compact_seen ? compactCamera :
      story.mallow_camera_check?.nextBy?.key === 'audit_action' &&
      story.mallow_camera_check.nextBy.cases?.cover === 'mallow_camera_uncover' &&
      story.mallow_camera_uncover?.next === 'mallow_camera_choice');
    if (cameraReachable && cameraChoice.length === 1 && flags.mallow_camera === 'covered' && cameraChoice[0].next === 'mallow_camera_touch' && story.mallow_camera_touch?.next === 'end_mallow_2') {
      mallowOutcome = 'The lens stayed covered; Mallow listened while the player and Niko felt for the catch. Mira returned with the third piece; Mallow’s screen went dark.';
    } else if (cameraReachable && cameraChoice.length === 1 && flags.mallow_camera === 'lift' && cameraChoice[0].next === 'mallow_camera_lift' && story.mallow_camera_lift?.next === 'mallow_help_evidence') {
      mallowOutcome = 'The player lifted the star; Mallow helped find the catch. Mira returned with the third piece; Mallow’s screen went dark.';
    }
  }
  // The souvenir choice affects the physical rescue, not just its narration.
  // Include only the route whose choice and subsequent authored nodes still
  // exist; old checkpoints without these flags must not invent an action.
  if (flags.ending === 'mallow' && ['keep', 'tear'].includes(flags.moment)) {
    const choice = (story.mallow_catch_choice?.choices || []).filter(item => item.set?.card_action === flags.card_action);
    const fromCatch = story.end_mallow_2?.nextBy?.key === 'moment' &&
      story.end_mallow_2.nextBy.cases?.[flags.moment] === 'mallow_catch_choice';
    if (fromCatch && choice.length === 1 && flags.card_action === 'use' &&
        choice[0].next === 'mallow_catch_use' && story.mallow_catch_use?.nextBy?.key === 'moment' &&
        story.mallow_catch_use.nextBy.cases?.[flags.moment] === `mallow_catch_use_${flags.moment}` &&
        story[`mallow_catch_use_${flags.moment}`]?.next === 'mallow_catch_complete') {
      mallowOutcome += flags.moment === 'tear'
        ? ' Torn souvenir pieces wedged the catch.'
        : ' The folded souvenir wedged the catch.';
    } else if (fromCatch && choice.length === 1 && flags.card_action === 'hold' &&
        choice[0].next === 'mallow_catch_hold' && story.mallow_catch_hold?.next === 'mallow_catch_complete') {
      mallowOutcome += ' The player kept the souvenir and held the catch by hand.';
    }
  }
  if (flags.ending === 'mallow' && flags.card_action === 'tool' &&
      narrative.mallowToolAvailable(flags, flags.companion) && flags.mallow_tool_seen === flags.companion) {
    const tool = { Niko: 'The player used the spring to hold the catch.',
      Mira: 'The player used Mira’s sewing string to pull the catch.',
      Ash: 'Ash wedged the catch open with the doorstop.' }[flags.companion];
    const beat = story[`mallow_catch_tool_${flags.companion.toLowerCase()}`];
    if (tool && beat?.setOnVisit?.mallow_tool_seen === flags.companion && beat.next === 'mallow_catch_complete') {
      mallowOutcome += ` ${tool}`;
    }
  }
  // Mira was on the other side of the door while the team chose whether to
  // uncover the lens and worked the catch. She heard Mallow offer to help,
  // and could see the display after coming through, but there is no authored
  // line telling her which lens or souvenir action the player took.
  if (flags.ending === 'mallow' && relationship === 'Mira' && flags.companion === 'Mira') {
    mallowOutcome = 'Mallow chose to help. Mira returned safely with the third piece; Mallow’s screen went dark.';
    if (flags.card_action === 'tool' && narrative.mallowToolAvailable(flags, 'Mira') &&
        flags.mallow_tool_seen === 'Mira' && flags.mallow_tool_mira_told === 'yes' &&
        story.mallow_catch_tool_mira?.setOnVisit?.mallow_tool_mira_told === 'yes') {
      mallowOutcome += ' Niko told Mira that her sewing string moved the catch.';
    }
  }
  const outcomes = {
    rescue: printerUnplugged
      ? `${keptUnplugged ? 'The player chose to keep the printer unplugged.' : ''} The player and Niko opened Mira’s door. Mira returned with the third piece; the paper roll stayed intact.`.trim()
      : flags.audit_action === 'unplug'
        ? 'The player and Niko opened Mira’s door. Mira returned with the third ticket piece.'
        : 'The player and Niko opened Mira’s door immediately. Mira has returned safely with the third ticket piece, but the machine ate the paper roll.',
    record: relationship === 'Mira' && flags.companion === 'Mira'
      ? `Mira heard the printer before the latch; she returned with the third ticket piece.${reconnected ? ' Ash said the team reconnected the printer.' : ''}`
      : reconnected
        ? 'The player reconnected the printer; Ash printed the false count and correction before Mira returned with the third piece.'
        : 'Ash printed the machine’s false count and the correction before Mira’s door opened. Mira has returned safely with the third ticket piece.',
    mallow: mallowOutcome,
    retreat: 'The player pulled the team back as the floor shifted. Mira is still downstairs; the group plans to bring her back.'
  };
  const observations = {
    receipt: 'The player kept the false receipt as evidence.',
    tickets: 'The player showed the machine the two ticket pieces as evidence.',
    voice: 'The player asked Mira to describe the room behind the door as evidence.'
  };
  // Mira was behind the closed door during the evidence choice. She can
  // hear Ash and Niko, but neither tells her what the player showed the
  // machine. Give her the spoken account instead of the unseen action.
  const miraObservations = {
    receipt: 'Ash said they would hold the false receipt.',
    tickets: 'Niko said there were still two ticket pieces.',
    voice: observations.voice
  };
  // A visit marker, rather than the earlier conversation flag by itself,
  // distinguishes a witnessed rescue from an older checkpoint already past it.
  const rescueSummaries = {
    niko_past: 'Niko lifted the cleared edge while Mira braced the door.',
    niko_future: 'Niko called out, then Mira counted while you pulled.',
    mira_past: 'You called to Mira, who pushed as you lifted the release.',
    mira_future: 'Mira braced her shoulder and pushed when you called.',
    ash_past: 'Ash listened for the click and guided Niko to the catch.',
    ash_future: 'Ash used the map to show Niko the release.'
  };
  const mark = `${String(flags.companion || '').toLowerCase()}_${flags.topic || ''}`;
  const rescueNode = story[`rescue_${mark.replace('_', '_topic_')}`];
  const witnessedRescue = flags.ending === 'rescue' && flags.route_action === 'proof' &&
    relationship === flags.companion && flags.rescue_topic_seen === mark && hasOwn(rescueSummaries, mark) &&
    rescueNode?.setOnVisit?.rescue_topic_seen === mark && rescueNode.next === 'rescue_complete' &&
    rescueNode.nextBy?.key === 'audit_action' && rescueNode.nextBy.cases?.unplug === 'rescue_complete_unplug';
  const lightDetail = narrative.rescueDetailRoute(flags);
  const lightKey = `${String(flags.companion || '').toLowerCase()}_${lightDetail}`;
  const lightSummaries = {
    niko_light_first: 'Niko felt a vibration and guided the player to the catch; the release moved.',
    niko_light_second: 'Niko counted while Mira braced the door and the player lifted the release.',
    mira_light_first: 'The player told Mira where their hands were; she moved clear, then braced the door as they lifted.',
    mira_light_second: 'Mira described where the lower edge caught; Niko shifted his grip and the player lifted the release.',
    ash_light_first: 'Ash checked the release against the counter and guided Niko to its position.',
    ash_light_second: 'Ash listened for the click and guided Niko to the catch.'
  };
  const lightNode = story[`rescue_${lightKey}`];
  const witnessedLightRescue = flags.ending === 'rescue' && flags.route_action === 'proof' &&
    relationship === flags.companion && hasOwn(lightSummaries, lightKey) &&
    flags.light_rescue_seen === `${String(flags.companion || '').toLowerCase()}_${flags.light_detail}` &&
    lightNode?.setOnVisit?.light_rescue_seen === flags.light_rescue_seen &&
    lightNode.next === 'rescue_complete' && lightNode.nextBy?.cases?.unplug === 'rescue_complete_unplug';
  const evidenceObservation = relationship === 'Mira' && flags.companion === 'Mira'
    ? miraObservations[flags.evidence] : observations[flags.evidence];
  return [outcomes[flags.ending], witnessedRescue ? rescueSummaries[mark] : '', witnessedLightRescue ? lightSummaries[lightKey] : '', evidenceObservation]
    .filter(Boolean).map((fact) => ` ${fact}`).join('');
}
// The match display itself makes no decision for either person. Carry the
// player's chosen approach and the companion's own answer into their private
// dialogue only when that exact response was actually shown to this player.
function authoredConnectionExchange(node) {
  const connectionName = node.ai.character;
  if (['private', 'epilogue'].includes(node.ai.inputKey) && ['Niko', 'Mira', 'Ash'].includes(connectionName) &&
      relationship === connectionName && flags.companion === connectionName &&
      ['ask', 'team'].includes(flags.connection_choice) && flags.connection_seen === connectionName) {
    const lower = connectionName.toLowerCase();
    const late = flags.late_connection_due === connectionName;
    if (late && flags.connection_late_seen !== connectionName) return null;
    if (!late && flags.connection_late_seen) return null;
    const answerId = `${lower}_connection_${flags.connection_choice === 'ask' ? 'date' : 'team'}${late ? '_late' : ''}`;
    const choiceId = `${lower}_connection_${late ? 'late' : 'choice'}`;
    const choice = story[choiceId]?.choices?.find(item => item.set?.connection_choice === flags.connection_choice);
    const response = story[answerId];
    if (choice?.next === answerId && response?.speaker === connectionName &&
        response?.setOnVisit?.connection_seen === connectionName &&
        (!late || response?.setOnVisit?.connection_late_seen === connectionName) && typeof choice.label === 'string' &&
        typeof response.text === 'string' && choice.label.length <= 200 && response.text.length <= 300) {
      return { playerChoice: choice.label, characterReply: response.text };
    }
  }
  return null;
}
// Recall a date moment only for the companion who shared it, and only after
// both the selected action and its authored response were actually shown.
function authoredDateMoment(node) {
  const name = node.ai?.character;
  if (!['private', 'epilogue'].includes(node.ai?.inputKey) ||
      !['Niko', 'Mira', 'Ash'].includes(name) || relationship !== name || flags.companion !== name ||
      flags.date_scene_due !== 'yes' || flags.connection_choice !== 'ask' || flags.connection_seen !== name ||
      flags.connection_late_seen !== name || !['playful', 'curious'].includes(flags.date_moment)) return '';
  const lower = name.toLowerCase();
  const id = `${lower}_date_${flags.date_moment}`;
  const choice = story[`${lower}_date_moment`]?.choices?.find(item => item.set?.date_moment === flags.date_moment);
  const reply = story[id];
  if (flags.date_moment_seen !== `${lower}_${flags.date_moment}` || choice?.next !== id ||
      reply?.speaker !== name || reply.setOnVisit?.date_moment_seen !== flags.date_moment_seen ||
      typeof choice.label !== 'string' || choice.label.length > 200 ||
      typeof reply.text !== 'string' || reply.text.length > 300) return '';
  const planning = ` While planning a future date together, player: ${JSON.stringify(choice.label)} ${name}: ${JSON.stringify(reply.text)}.`;
  if (flags.date_activity_due !== 'yes' || typeof flags.date_activity !== 'string') return planning;
  const prompt = story[`${lower}_date_activity`];
  const activityChoice = prompt?.choices?.find(item => item.set?.date_activity === flags.date_activity);
  const activityId = `${lower}_date_activity_${flags.date_activity}`;
  const activityReply = story[activityId];
  if (activityChoice?.next !== activityId || activityReply?.speaker !== name ||
      flags.date_activity_seen !== `${lower}_${flags.date_activity}` ||
      activityReply.setOnVisit?.date_activity_seen !== flags.date_activity_seen ||
      typeof prompt.text !== 'string' || prompt.text.length > 300 ||
      typeof activityChoice.label !== 'string' || activityChoice.label.length > 200 ||
      typeof activityReply.text !== 'string' || activityReply.text.length > 300) return planning;
  const together = `${planning} They then spent time together: ${JSON.stringify(prompt.text)} Player: ${JSON.stringify(activityChoice.label)} ${name}: ${JSON.stringify(activityReply.text)}.`;
  // The adapter bounds date_moment at 600 characters. Never include a partial
  // reply or allow a longer authored passage to crowd out its ending.
  return together.trim().length <= 600 ? together : planning;
}
// Only comparisons this playthrough displayed and the player answered can
// steer a companion. Earlier checkpoints without these markers keep their
// original behaviour; skipping or a tie produces no style instruction.
function companionResponseStyle(node) {
  const name = node.ai?.character;
  if (!['private', 'midpoint'].includes(node.ai?.inputKey) ||
      !['Niko', 'Mira', 'Ash'].includes(name) || relationship !== name || flags.companion !== name) return '';
  const observed = {};
  for (const [key, marker, choiceId] of [
    ['card_preference', 'card_comparison_seen', 'card_choice'],
    ['notice_preference', 'notice_comparison_seen', 'notice_choice']
  ]) {
    const value = flags[key];
    const choice = story[choiceId];
    if (flags[marker] === 'yes' && choice?.setOnVisit?.[marker] === 'yes' &&
        ['direct', 'warm', 'skip'].includes(value) &&
        choice.choices?.some(item => item.set?.[key] === value)) observed[key] = value;
  }
  if (!Object.keys(observed).length) return '';
  const style = evaluatePreference(observed).style;
  return style === 'direct' || style === 'warm' ? style : '';
}
function conversationContext(node, followup = false) {
  // Unwitnessed personal facts are excluded from the base scene; the
  // separately guarded personal history adds only disclosures actually seen.
  let context = node.ai.context;
  const priorLine = authoredLeadIn(node);
  if (priorLine) context += ` In the scene immediately before the player's message, the character said: ${JSON.stringify(priorLine)}.`;
  if (node.ai.inputKey === 'midpoint' && node.ai.character === relationship && flags.companion === relationship) {
    const lead = story[`mid_${relationship.toLowerCase()}_input`];
    if (lead?.speaker === relationship && lead.input?.next === currentNode &&
        typeof lead.text === 'string' && lead.text.length <= 300 && !/\{[^}]*\}/.test(lead.text)) {
      context += ` Before the player's message, ${relationship} said: ${JSON.stringify(lead.text)}.`;
    }
  }
  context += authoredActivity(node);
  // The matching claim belongs only to the companion whose route displayed it.
  // Older saves may have chosen a companion before this scene existed.
  if (node.ai.inputKey === 'private' && node.ai.character === relationship &&
      flags.companion === relationship && flags.match_label_seen === relationship && flags.match_reply_seen === relationship &&
      ['Niko', 'Mira', 'Ash'].includes(relationship) &&
      story[`${relationship.toLowerCase()}_route`]?.setOnVisit?.match_label_seen === relationship) {
    context += ` Earlier, the arcade display called the player and the companion a PERFECT MATCH; ${relationship} replied: ${JSON.stringify(matchReplies[relationship])}.`;
  }
  // Early dialogue has room for the note here; the closing conversation puts
  // it with the activity setup to preserve the separately bounded scene.
  if (node === story.niko_chat || node === story.niko_light_chat) {
    const note = authoredNikoNote(node);
    if (note) context += ` ${note}`;
  }
  // Only Mira saw the naming moment; the name is story data, not a role
  // instruction. Never infer a name for old or skipped checkpoints.
  if (node.ai.character === 'Mira' && ['private', 'epilogue'].includes(node.ai.inputKey) &&
      relationship === 'Mira' && flags.companion === 'Mira' && flags.bond === 'play' &&
      flags.knight_named === 'yes' && knightName) {
    context += ` The player named the little drawn knight ${JSON.stringify(knightName)}.`;
    // The later private conversation can refer to the card only when this
    // playthrough actually showed it. Older checkpoints may have the name
    // but have already passed the new card scene.
    if (node.ai.inputKey === 'epilogue' && node.ai.resumePrivate &&
        flags.named_card_seen === 'yes' && story.moment_mira_knight_name?.setOnVisit?.named_card_seen === 'yes') {
      context += ' In the playroom, that name appeared beneath an eye on the knight card; the eye closed.';
    }
  }
  // In the public card conversation, share the name only after the named-card
  // passage was actually shown. The crew saw that printed name; they did not
  // necessarily witness the earlier private naming conversation.
  if (node === story.mid_mira_chat && relationship === 'Mira' && flags.companion === 'Mira' &&
      flags.bond === 'play' && flags.knight_named === 'yes' && knightName.trim() &&
      flags.named_card_seen === 'yes' && flags.midpoint_route === 'mira' &&
      flags.midpoint_available === 'yes' && flags.midpoint_chat === 'yes' &&
      ['keep', 'tear'].includes(flags.moment) &&
      story.moment_mira_knight_name?.setOnVisit?.named_card_seen === 'yes') {
    context += ` In the playroom, the name ${JSON.stringify(knightName)} appeared beneath an eye on the knight card; the eye closed after the player read it.`;
  }
  context += authoredEpilogueLeadIn(node);
  context += authoredMallowResponse(node);
  context += authoredRouteAction(node);
  context += authoredDoorEffort(node);
  context += authoredConfirmAttempt(node);
  context += authoredRecordResponse(node);
  context += authoredRevealComparisons(node);
  context += authoredAudit(node);
  if (node === story.ai_reflection) {
    const sharedReaction = witnessedSharedReaction();
    if (sharedReaction) context += ` In the playroom, ${flags.shared_reaction_seen} said: ${JSON.stringify(sharedReaction)}.`;
    const privateReaction = witnessedPrivateReaction();
    if (privateReaction) context += ` In the playroom, ${flags.private_reaction_seen} said: ${JSON.stringify(privateReaction)}.`;
    const style = evaluatePreference(flags).style;
    if (style === 'direct') context += ' When answering, use a clear, direct tone.';
    else if (style === 'warm') context += ' When answering, use a warm, reassuring tone.';
  }
  if (node.ai.inputKey === 'reflection') {
    // Mallow witnessed (or heard) the intervention immediately before this
    // conversation. Do not infer one from an older or inconsistent save, or
    // send the player's receipt annotation to the model.
    if (node === story.mallow_reflection_chat) {
      const witnessedActions = {
        cover: ' Your view of the counter is blocked. You can still hear the crew.',
        annotate: ' Ash said the writing had not opened the door.',
        leave: ' Niko said to leave the slip and the lens alone.',
        unplug: ' The player said the printer was unplugged and the screen was still on.'
      };
      context += witnessedActions[selectedAuditAction()] || '';
    }
    const style = evaluatePreference(flags).style;
    if (style === 'direct') context += ' When answering, use a clear, direct tone.';
    else if (style === 'warm') context += ' When answering, use a warm, reassuring tone.';
  }
  if (node.ai.resumePrivate) context += epilogueContext();
  if (followup) context += ' Reply to the latest message without repeating.';
  return context;
}
function privateOtherNames(node) {
  if (!['private', 'epilogue'].includes(node.ai.inputKey)) return [];
  return Object.keys(characters).filter((name) => characters[name]?.portrait && name !== node.ai.character);
}
function recordConversationLine(speakerName, text) {
  conversationTranscript.push({ speaker: speakerName, text });
  if (conversationTranscript.length > 40) {
    conversationTranscript = conversationTranscript.slice(-40);
    transcriptTruncated = true;
  }
}
function showConversationReview() {
  if (!conversationTranscript.length) return;
  const details = document.createElement('details');
  details.className = 'conversation-history';
  details.open = transcriptExpanded;
  details.addEventListener('toggle', () => {
    if (!('isConnected' in details) || details.isConnected) transcriptExpanded = details.open;
  });
  const summary = document.createElement('summary');
  summary.textContent = transcriptTruncated ? 'Review conversation (latest 40 lines)' : 'Review conversation';
  const lines = document.createElement('ol');
  for (const entry of conversationTranscript) {
    const line = document.createElement('li');
    line.textContent = `${entry.speaker}: ${entry.text}`;
    lines.append(line);
  }
  details.append(summary, lines);
  interaction.append(details);
}
function showRememberedChoice(remember) {
  if (!remember || typeof remember.source !== 'string' || typeof remember.flag !== 'string' ||
      !hasOwn(story, remember.source) || !hasOwn(flags, remember.flag)) return;
  const choices = story[remember.source].choices;
  if (!Array.isArray(choices) || choices.length < 1 || choices.length > 10 ||
      choices.some(choice => typeof choice.label !== 'string' || !choice.set)) return;
  const chosen = choices.filter(choice => choice.set[remember.flag] === flags[remember.flag]);
  if (chosen.length !== 1) return;
  const section = document.createElement('section');
  section.className = 'remembered-choice';
  section.setAttribute('aria-label', 'An earlier choice');
  const heading = document.createElement('p');
  heading.textContent = 'An earlier choice';
  const list = document.createElement('ul');
  for (const choice of choices) {
    const item = document.createElement('li');
    const selected = choice === chosen[0];
    item.textContent = selected ? `${choice.label} (your choice)` : choice.label;
    if (selected) { item.className = 'remembered-selected'; item.setAttribute('aria-current', 'true'); }
    list.append(item);
  }
  section.append(heading, list);
  interaction.append(section);
}
// The annotation is the player's own text. The machine's seal cites its
// existence as proof, regardless of what it says; do not infer its meaning.
function showAnnotatedAudit(node) {
  if (![story.audit_annotation_written, story.early_audit_annotation_written].includes(node) ||
      flags.annotation_written !== 'yes' || !annotation) return;
  const section = document.createElement('section');
  section.className = 'audit-comparison';
  section.setAttribute('aria-label', 'The receipt and the machine screen');
  const paper = document.createElement('div');
  const paperLabel = document.createElement('p');
  paperLabel.className = 'audit-comparison-label';
  paperLabel.textContent = 'On the receipt';
  const handwriting = document.createElement('p');
  handwriting.className = 'audit-comparison-annotation';
  handwriting.textContent = annotation;
  paper.append(paperLabel, handwriting);
  const screen = document.createElement('div');
  const screenLabel = document.createElement('p');
  screenLabel.className = 'audit-comparison-label';
  screenLabel.textContent = 'On the screen';
  const claim = document.createElement('p');
  claim.className = 'audit-comparison-claim';
  claim.textContent = node === story.early_audit_annotation_written ? 'EVERYONE IS TOGETHER' : auditScreenClaim;
  const seal = document.createElement('p');
  seal.className = 'audit-comparison-seal';
  seal.textContent = auditScreenSeal;
  screen.append(screenLabel, claim, seal);
  section.append(paper, screen);
  interaction.append(section);
}

// Make the physical count and the machine's claim visible together, starting
// when a familiar drawing appears on the screen.
function showTicketComparison(nodeId) {
  const signalScene = ['regroup_signal_star', 'regroup_signal_bell', 'regroup_signal_ribbon'].includes(nodeId);
  const touched = nodeId === 'regroup_signal_touch' && flags.regroup_action === 'touch' &&
    flags.regroup_signal_seen === flags.keepsake && ['star', 'bell', 'ribbon'].includes(flags.keepsake);
  if (!signalScene && nodeId !== 'regroup_signal_choice' && nodeId !== 'correction_choice' && !touched) return;
  const signal = flags.regroup_signal_seen;
  const showSignal = (signalScene || nodeId === 'regroup_signal_choice' || touched) && signal === flags.keepsake &&
    ['star', 'bell', 'ribbon'].includes(signal) && (!signalScene || nodeId === `regroup_signal_${signal}`);
  const comparison = document.createElement('section');
  comparison.className = 'ticket-comparison';
  comparison.setAttribute('aria-label', 'Ticket count comparison');
  const counter = document.createElement('div');
  counter.className = 'ticket-side';
  const counterLabel = document.createElement('p');
  counterLabel.className = 'ticket-label';
  counterLabel.textContent = 'On the counter';
  const pieces = document.createElement('div');
  pieces.className = nodeId === 'correction_choice' && flags.regroup_action === 'count'
    ? 'ticket-pieces arranged' : 'ticket-pieces';
  pieces.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 2; i++) {
    const piece = document.createElement('span');
    piece.className = 'ticket-piece';
    pieces.append(piece);
  }
  const counterCaption = document.createElement('p');
  counterCaption.className = 'ticket-caption';
  counterCaption.textContent = '2 pieces';
  counter.append(counterLabel, pieces, counterCaption);
  const screen = document.createElement('div');
  screen.className = 'ticket-side ticket-screen';
  const screenLabel = document.createElement('p');
  screenLabel.className = 'ticket-label';
  screenLabel.textContent = 'On the screen';
  const lights = document.createElement('div');
  lights.className = 'ticket-lights';
  for (let i = 0; i < 3; i++) {
    const interactive = showSignal && nodeId === 'regroup_signal_choice' && i === 2;
    const light = document.createElement(interactive ? 'button' : 'span');
    light.className = interactive ? 'ticket-light ticket-light-touch' : 'ticket-light';
    if (interactive) {
      light.type = 'button';
      light.setAttribute('aria-label', 'Touch the picture and ask Mallow to check again');
      const scene = generation;
      light.addEventListener('click', () => {
        if (scene !== generation) return;
        // Use the authored choice, so history, flags and navigation stay identical.
        const label = story.regroup_signal_choice.choices[0].label;
        Array.from(interaction.children).find(child => child.textContent === label)?.click();
      });
    } else light.setAttribute('aria-hidden', 'true');
    light.textContent = showSignal && i === 2 ? '3' : '✓';
    lights.append(light);
  }
  // This is a drawing on the machine's screen, not the object in the fort.
  // Only show the signal on the passage that introduced it or immediately
  // afterwards, and only if this playthrough actually saw that passage.
  if (showSignal) {
    const drawing = document.createElement('img');
    drawing.className = `ticket-signal ticket-signal-${signal}${signalScene ? ' ticket-signal-arriving' : ''}`;
    drawing.src = `./assets/screen-signal-${signal}.svg`;
    drawing.alt = ''; // The passage already describes this screen drawing.
    drawing.setAttribute('aria-hidden', 'true');
    lights.children[2].append(drawing);
    if (touched) {
      const print = document.createElement('span');
      print.className = 'ticket-fingerprint';
      print.setAttribute('aria-hidden', 'true');
      lights.children[2].append(print);
    }
  }
  const screenCaption = document.createElement('p');
  screenCaption.className = 'ticket-caption';
  screenCaption.textContent = '3 recovered';
  screen.append(screenLabel, lights, screenCaption);
  // The player saw Mira's handmade blank badge earlier. The screen's copy
  // fills in a claim without implying what happened to the physical badge.
  if (nodeId === 'regroup_signal_choice' && flags.handmade_badge_seen === 'yes') {
    const badge = document.createElement('p');
    badge.className = 'ticket-badge';
    badge.textContent = 'HAPPY TO HELP';
    badge.setAttribute('aria-hidden', 'true'); // The narrator describes it.
    screen.append(badge);
  }
  comparison.append(counter, screen);
  interaction.append(comparison);
}
// A generated reply can be plausible in format while getting story details
// wrong. Let the player select the authored line after seeing it, and keep
// that selection in the history used for subsequent messages.
function offerWrittenResponse(node, generatedText, retry = null, writtenFallback = node.ai.fallback) {
  const written = writtenFallback;
  if (typeof written !== 'string' || !written.trim()) return;
  activeWritten = { generatedText, written, retry };
  const token = generation;
  interaction.append(makeChoice('Use the written response', () => {
    if (token !== generation || story[currentNode] !== node || pendingRequest || storyText.textContent !== generatedText) return;
    voiceUI.cancel();
    const memory = conversationMemory(node);
    const last = memory[memory.length - 1];
    if (last?.speaker === node.ai.character && last.text === generatedText) last.text = written;
    if (node === story.ai_reflection) rememberPublicReply(written);
    const displayed = conversationTranscript[conversationTranscript.length - 1];
    if (displayed?.speaker === node.ai.character && displayed.text === generatedText) {
      displayed.speaker = `${node.ai.character} (written response)`;
      displayed.text = written;
    }
    storyText.textContent = written;
    activeWritten = null;
    settledAiStatus = 'WRITTEN RESPONSE';
    replaceStoryHistory(node.ai.character, generatedText, written);
    setStatus('WRITTEN RESPONSE');
    replaceChildren(interaction);
    showConversationReview();
    if (settings.model && validEndpoint(settings.endpoint)) offerFollowup(node, written);
    // Keep the original question and pre-response history available even when
    // the provider is disconnected. Editing a retry is safe offline; sending
    // it still requires a connection.
    if (retry) {
      offerFollowup(node, written, retry.playerText, retry.memory, Boolean(retry.initial), retry.suggested);
    }
    advance.focus({ preventScroll: true });
    if (autoRead) scheduleAutoRead();
  }));
}
function offerFollowup(node, firstReply, draft = null, retryHistory = null, retryInitial = false, retrySuggested = null) {
  if (draft !== null) activeRetry = { firstReply, draft, history: retryHistory || [], initial: retryInitial, suggested: retrySuggested };
  const isPrivate = ['private', 'epilogue'].includes(node.ai.inputKey);
  const offeredAt = generation;
  const followupControl = makeChoice(draft === null ? 'Say more' : retryInitial ? 'Edit or retry your first message' : 'Edit or retry message', () => {
    if (offeredAt !== generation || story[currentNode] !== node || pendingRequest) return;
    const hadFocus = interaction.contains(document.activeElement);
    replaceChildren(interaction);
    showConversationReview();
    advance.hidden = true;
    const label = document.createElement('label');
    label.className = 'input-label';
    label.htmlFor = 'player-follow-up';
    label.textContent = retryInitial
      ? 'What would you like to say instead?'
      : isPrivate
      ? 'What would you like to say next?'
      : node.ai.audience === 'group'
        ? 'Your message is shared with the crew. What do you say?'
        : 'Your message is on air. What do you say?';
    const input = document.createElement('textarea');
    input.id = 'player-follow-up';
    input.placeholder = `Say something more to ${node.ai.character}…`;
    input.maxLength = 500;
    input.value = draft || '';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'primary input-submit';
    submit.textContent = retryInitial ? 'Send revised message →' : 'Send follow-up →';
    submit.addEventListener('click', async () => {
      const followup = input.value.trim().slice(0, 500);
      if (!followup) {
        setStatus('WRITE A MESSAGE OR CONTINUE');
        input.focus();
        return;
      }
      // Settings may have been cleared while this draft was being written.
      // Keep the text in place so the player can reconnect before sending it.
      if (!settings.model || !validEndpoint(settings.endpoint)) {
        setStatus('CONNECT AI IN SETTINGS TO SEND THIS FOLLOW-UP');
        input.focus();
        return;
      }
      activeRetry = null;
      activeWritten = null;
      // Commit a revised opening message only when sent, and keep the group
      // message separate from the earlier private conversation.
      if (retryInitial) {
        if (node.ai.inputKey === 'midpoint') midpointAnswer = followup;
        else if (node.ai.inputKey === 'reflection') reflectionAnswer = followup;
        else if (node.ai.resumePrivate) epilogueAnswer = followup;
        else if (isPrivate) { privateAnswer = followup; privateFollowup = ''; }
        else { answer = followup; if (node === story.ai_reflection) publicFollowup = ''; }
      } else if (node === story.ai_reflection) {
        // Preserve a submitted public follow-up even if the response is skipped.
        publicFollowup = followup;
      } else if (node.ai.inputKey === 'private') {
        // A submitted follow-up remains the latest even if the player skips a
        // slow response; an unsent draft never changes it. Epilogue messages
        // and Mallow's group conversation do not replace private words.
        privateFollowup = followup;
      }
      voiceUI.cancel();
      const conversation = conversationMemory(node);
      // A failed request shows an authored reply and keeps that exchange if
      // the player moves on. A retry starts from the history before the failed
      // attempt so it does not send the same message and fallback twice.
      const sharedPrivate = node === story.ai_reflection && flags.signal === 'repeat' && (privateFollowup || privateAnswer)
        ? [{ speaker: `Player to ${relationship}`, text: privateFollowup || privateAnswer }] : [];
      const history = retryHistory ?? (conversation.length ? conversation.slice() : [
        ...sharedPrivate,
        { speaker: `Player to ${node.ai.character}`, text: node.ai.inputKey === 'midpoint' ? midpointAnswer : node.ai.inputKey === 'reflection' ? reflectionAnswer : isPrivate ? (privateAnswer || node.ai.defaultMessage || 'I am here with you.') : answer },
        { speaker: node.ai.character, text: firstReply }
      ]);
      // A submitted retry replaces the prior response. If it is skipped,
      // retain the previous completed response from before the retried turn.
      if (node === story.ai_reflection && retryHistory !== null) {
        const preceding = [...history].reverse().find(entry => entry.speaker === node.ai.character);
        rememberPublicReply(preceding?.text || '');
      }
      const token = ++generation;
      pendingRequest = new AbortController();
      const signal = pendingRequest.signal;
      const hadFocus = interaction.contains(document.activeElement);
      const skip = makeChoice('Continue without waiting', () => {
        if (token !== generation || signal.aborted) return;
        // The player already submitted these words, even though no response
        // was shown. Preserve only that message, not an invented reply.
        const submitted = [...history, { speaker: `Player to ${node.ai.character}`, text: followup }];
        setConversationMemory(node, submitted);
        pendingRequest?.abort();
        pendingRequest = null;
        go(nextStoryNode(node));
      });
      // A submitted retry replaces the previous turn in the review, just as
      // it replaces that turn in the model's history. Keep it visible while
      // the draft is merely being edited or abandoned.
      if (retryHistory !== null && conversationTranscript.length >= 2) {
        const previousPlayer = conversationTranscript[conversationTranscript.length - 2];
        const previousReply = conversationTranscript[conversationTranscript.length - 1];
        if (previousPlayer.speaker === 'You' && previousPlayer.text === draft &&
            [node.ai.character, `${node.ai.character} (written response)`].includes(previousReply.speaker)) {
          conversationTranscript.splice(-2);
          const priorPlayer = storyHistory[storyHistory.length - 2];
          const priorReply = storyHistory[storyHistory.length - 1];
          if (priorPlayer?.speaker === 'You' && priorPlayer.text === draft &&
              priorReply?.speaker === node.ai.character && priorReply.text === previousReply.text) {
            storyHistory.splice(-2);
          }
        }
        // A failed follow-up has no character reply. Its submitted player
        // line is nevertheless visible and should be replaced by a retry.
        else if (previousReply.speaker === 'You' && previousReply.text === draft) {
          conversationTranscript.pop();
          const priorPlayer = storyHistory[storyHistory.length - 1];
          if (priorPlayer?.speaker === 'You' && priorPlayer.text === draft) storyHistory.pop();
        }
      }
      recordConversationLine('You', followup);
      recordStoryHistory('You', followup);
      replaceChildren(interaction, skip);
      showConversationReview();
      if (hadFocus) skip.focus({ preventScroll: true });
      storyText.textContent = `${node.ai.character} considers your words…`;
      setStatus('WAITING FOR A RESPONSE…');
      const character = characters[node.ai.character] || {};
      const suggested = retryInitial && retrySuggested?.playerText === followup ? retrySuggested : null;
      const writtenFallback = suggested?.reply || node.ai.fallback;
      const response = await respond({
        settings: { ...settings },
        character: { ...character, name: node.ai.character },
        playerText: followup,
        context: conversationContext(node, true),
        responseStyle: companionResponseStyle(node),
        activitySetup: authoredActivitySetup(node),
        activityExchange: authoredActivityExchange(node),
        connectionExchange: authoredConnectionExchange(node),
        dateMoment: authoredDateMoment(node),
        earlierConversation: authoredPersonalHistory(node),
        publicConversation: earlierMidpointExchange(node),
        mallowGroupConversation: earlierMallowExchange(node),
        storyEvent: authoredStoryEvent(node),
        memory: history,
        privateOtherNames: privateOtherNames(node),
        fallback: writtenFallback,
        signal
      });
      if (token !== generation) return;
      pendingRequest = null;
      if (!retryInitial && response.source !== 'ai') {
        // The opening scene's written line is not an answer to an arbitrary
        // follow-up. Keep the last actual reply and submitted words, so the
        // player can retry the same turn or continue without invented speech.
        const submitted = [...history, { speaker: `Player to ${node.ai.character}`, text: followup }];
        setConversationMemory(node, submitted);
        const lastReply = [...history].reverse().find(entry => entry.speaker === node.ai.character)?.text;
        storyText.textContent = lastReply || firstReply;
        const error = response.error?.replace(/\s+Using scripted dialogue\.$/, '');
        settledAiStatus = error ? `${error} Retry or continue.` : 'THE REPLY WAS CANCELLED. RETRY OR CONTINUE.';
        setStatus(settledAiStatus);
        const focusBeforeResponse = interaction.contains(document.activeElement);
        replaceChildren(interaction);
        showConversationReview();
        advance.hidden = false;
        offerFollowup(node, storyText.textContent, followup, history);
        if (focusBeforeResponse) advance.focus({ preventScroll: true });
        return;
      }
      const updated = [...history,
        { speaker: `Player to ${node.ai.character}`, text: followup },
        { speaker: node.ai.character, text: response.text }
      ];
      setConversationMemory(node, updated);
      if (node === story.ai_reflection) rememberPublicReply(response.text);
      recordConversationLine(response.source === 'ai' ? node.ai.character : `${node.ai.character} (written response)`, response.text);
      storyText.textContent = response.text;
      recordStoryHistory(node.ai.character, response.text);
      settledAiStatus = response.error || (response.source === 'ai' ? 'AI-GENERATED RESPONSE' : 'WRITTEN RESPONSE');
      setStatus(settledAiStatus);
      const focusBeforeResponse = interaction.contains(document.activeElement);
      replaceChildren(interaction);
      showConversationReview();
      advance.hidden = false;
      if (response.source === 'ai') {
        offerFollowup(node, response.text);
        // A generated answer can be coherent but wrong. Let the player edit
        // or retry the last question with the pre-answer history unchanged.
        offerFollowup(node, firstReply, followup, history, retryInitial, suggested);
        // Only the first message has an authored response. A generic line
        // from that scene is not a written alternative for later questions.
        if (retryInitial) offerWrittenResponse(node, response.text, { playerText: followup, memory: history, initial: true, suggested }, writtenFallback);
      }
      else offerFollowup(node, firstReply, followup, history, retryInitial, suggested);
      if (focusBeforeResponse) advance.focus({ preventScroll: true });
      if (autoRead) scheduleAutoRead();
    });
    interaction.append(label, input);
    voiceUI.attachRecorder(interaction, input);
    interaction.append(submit, makeChoice('Continue without a follow-up', () => go(nextStoryNode(node))));
    setStatus('YOUR WORDS MATTER');
    if (hadFocus) input.focus({ preventScroll: true });
    if (autoRead && document.visibilityState !== 'hidden' && settingsDialog.hidden) speakParts(spokenInteraction(node));
  });
  if (draft === null) followupControl.id = 'followup-say-more';
  else if (retryInitial) followupControl.id = 'retry-initial-message';
  interaction.append(followupControl);
}
function ensureRestoredFollowup(node) {
  // A written alternative can also be selected offline in this session after
  // clearing settings. Reconnecting should restore its follow-up just as it
  // does for a loaded checkpoint, without replacing an open draft.
  const chosenWritten = activeRetry?.initial &&
    conversationTranscript[conversationTranscript.length - 1]?.speaker === `${node?.ai?.character} (written response)`;
  if ((!aiSnapshotRestored && !chosenWritten) || !node?.ai || play.hidden || pendingRequest || advance.hidden ||
      !settings.model || !validEndpoint(settings.endpoint) ||
      conversationTranscript[conversationTranscript.length - 1]?.speaker === 'You' ||
      Array.from(interaction.children).some(child => child.id === 'followup-say-more')) return;
  offerFollowup(node, storyText.textContent);
}
function ensureRestoredInitialRetry(node) {
  if (!aiSnapshotRestored || !node?.ai || play.hidden || pendingRequest || advance.hidden ||
      !settings.model || !validEndpoint(settings.endpoint) || !initialConversationMemory ||
      activeRetry) return;
  const firstWritten = conversationTranscript.length === 0 || (conversationTranscript.length === 2 &&
    conversationTranscript[0]?.speaker === 'You' && conversationTranscript[0]?.text === restoredAiQuestion &&
    conversationTranscript[1]?.speaker === `${node.ai.character} (written response)` && conversationTranscript[1]?.text === storyText.textContent);
  if (!firstWritten) return;
  // An offline written reply has no review yet. Connecting a provider should
  // restore the usual first-message retry without replaying the response.
  if (!conversationTranscript.length) {
    recordConversationLine('You', restoredAiQuestion);
    recordConversationLine(`${node.ai.character} (written response)`, storyText.textContent);
    showConversationReview();
  }
  offerFollowup(node, storyText.textContent, restoredAiQuestion, initialConversationMemory, true, initialSuggestedExchange);
}
async function render() {
  cancelAutoAdvance();
  const node = story[currentNode];
  const restored = restoreAiScene;
  restoreAiScene = null;
  initialConversationMemory = null;
  initialSuggestedExchange = null;
  activeRetry = null;
  activeWritten = null;
  settledAiStatus = '';
  aiSnapshotRestored = false;
  restoredAiQuestion = '';
  billing.invalidate();
  conversationTranscript = [];
  transcriptExpanded = false;
  transcriptTruncated = false;
  voiceUI.cancel();
  pendingRequest?.abort();
  pendingRequest = null;
  const token = ++generation;
  if (!node) {
    souvenirArt.hidden = true;
    souvenirCard.hidden = true;
    souvenirCaption.hidden = true;
    showMachineReport('');
    speaker.textContent = 'Signal lost';
    storyText.textContent = 'This part of the story could not be found. Please restart.';
    replaceChildren(interaction);
    advance.hidden = true;
    return;
  }
  if (node.setOnVisit) Object.assign(flags, node.setOnVisit);
  const cardArt = souvenirForPassage(currentNode, flags);
  souvenirArt.hidden = !cardArt;
  souvenirCard.hidden = !cardArt;
  // The passage itself reads this caption aloud, so the visual repeat is
  // aria-hidden and does not duplicate it for screen-reader users.
  souvenirCaption.hidden = !cardArt || !['moment_caption', 'moment_choice'].includes(currentNode);
  if (cardArt) { souvenirArt.src = cardArt.path; souvenirArt.alt = cardArt.alt; }
  showMachineReport(currentNode);
  const sceneMood = resolveStoryMood(currentNode, node, flags);
  stage.dataset.mood = sceneMood;
  stage.dataset.shadowEcho = ['close_reason', 'close_reason_retreat'].includes(currentNode) ? 'yes' : '';
  stage.dataset.playroomLight = dimNodes.has(currentNode) ? 'dim' : 'lit';
  const retreatFort = narrative.retreatFortPassage(flags, currentNode);
  const rescueSetup = narrative.earlyRescueSetupPassage(flags, currentNode);
  const dateCallback = narrative.dateMomentCallback(flags, currentNode);
  const sceneLocation = retreatFort?.location || node.location;
  const location = hasOwn(locationLabels, sceneLocation) ? sceneLocation : 'arcade';
  stage.dataset.location = location;
  if (locationLabel.textContent !== locationLabels[location]) locationLabel.textContent = locationLabels[location];
  storySound.setMood(sceneMood);
  storySound.play(currentNode);
  const portraitSpeaker = node.portraitSpeaker || node.speaker;
  const portraitPath = characters[portraitSpeaker]?.expressions?.[node.expression] || characters[portraitSpeaker]?.portrait || portraits[portraitSpeaker];
  portraitController.show(portraitPath || '');
  speaker.textContent = node.speaker;
  speaker.style.color = characters[node.speaker]?.color || '';
  storyText.textContent = node.ai && (settings.endpoint || settings.model) ? `${node.speaker} considers your words…` : (rescueSetup?.text || retreatFort?.text || (node.text + dateCallback)).replace(/\{(answer|privateAnswer|knightName|annotation|publicReply|cardComparison|noticeComparison|retreatEcho)\}/g, (_match, key) => {
    if (key === 'retreatEcho') {
      if (node !== story.close_reason_retreat || flags.ending !== 'retreat' || flags.retreat_probe_seen !== flags.retreat_probe) return '';
      if (flags.retreat_probe_seen === 'repeat') return ' One knock, a pause, then two more come from under the floor. Niko holds his hand still against the boards. Ash leaves the map open between you.';
      if (flags.retreat_probe_seen === 'change') return ' Two knocks, a pause, then one comes from under the floor. Niko holds his hand still against the boards. Ash leaves the map open between you.';
      return '';
    }
    if (key === 'cardComparison' || key === 'noticeComparison') {
      if (![story.history_comparisons_compact, story.history_comparisons_early, story.early_together_comparisons].includes(node)) return '';
      const kind = key === 'cardComparison' ? 'card' : 'notice';
      const value = flags[`${kind}_preference`];
      if ((node === story.history_comparisons_early && flags.compact_comparisons_due === 'yes') || node === story.early_together_comparisons) return compactComparisonText(kind, value);
      return ['direct', 'warm', 'skip'].includes(value) ? story[`history_${kind}_${value}`]?.text || '' : '';
    }
    if (key === 'answer') return [story.history_public_quote, story.history_early_paper].includes(node) ? (publicFollowup || answer) : answer;
    if (key === 'knightName') return knightName;
    if (key === 'publicReply') return publicReply;
    if (key === 'annotation') return [story.audit_result_annotate, story.audit_result_annotate_compact].includes(node) ? (flags.annotation_written === 'yes' ? ` “${annotation}”` : '') : annotation;
    return node === story.signal_repeat ? (privateFollowup || privateAnswer) : privateAnswer;
  });
  // Recall the early steering only when the player actually saw that
  // greeting. A later tied policy does not erase what happened earlier.
  if (['policy_direct_compact', 'policy_warm_compact', 'policy_tie_compact'].includes(currentNode) &&
      flags.hint_greeting_seen === narrative.hintGreetingRoute(flags) &&
      ['direct', 'warm'].includes(flags.hint_greeting_seen)) {
    storyText.textContent += ' It had already shaped my first welcome using the card you chose for Niko.';
  }
  // Do not introduce the plush twice when this run has already seen it at
  // the connection choice. Older and incomplete saves retain the full setup.
  if (node === story.mira_bond_choice && flags.mira_plush_intro_seen === 'yes' &&
      flags.companion === 'Mira' && flags.connection_seen === 'Mira') {
    storyText.textContent = 'Mira offers you the loose ear and a pencil.';
  }
  // The star was seen away from the fort; do not claim it stayed there.
  if (node === story.keepsake_check && narrative.keepsakeClosingRoute(flags) === 'star_returned') {
    storyText.textContent = 'The signal you chose for the team is in the fort.';
  }
  // The rescue reunion is a new choice. Only recall the action the player
  // actually saw; legacy and inconsistent checkpoints keep the original scene.
  if (node === story.close_reason && flags.ending === 'rescue' && flags.rescue_opened === 'yes' &&
      flags.rescue_support === flags.rescue_support_seen) {
    const reunion = {
      ticket: 'You lay Mira’s third ticket piece apart from Niko’s two, just as she asked. She smooths its curled corner. ',
      watch: 'Mira sets down the ticket piece she carried. She touches your arm, then looks toward the door you watched until everyone was clear. '
    };
    if (hasOwn(reunion, flags.rescue_support)) storyText.textContent = reunion[flags.rescue_support] + storyText.textContent;
  }
  // Recall only the question that was actually asked at the counter. The
  // sound has no identified source, and old checkpoints keep their ending.
  if (node === story.close_reason && ['rescue', 'record'].includes(flags.ending) &&
      flags.mallow_ack_due === 'yes' && flags.mallow_ack === 'speak' && flags.mallow_ack_seen === 'speak') {
    storyText.textContent += ' A soft sound comes from somewhere beyond the fort. It follows the rhythm of your question, without any words.';
  }
  // Name the drawing for a resumed choice or a reader who cannot see it.
  // Older saves and mismatched flags cannot establish that it appeared.
  if (node === story.regroup_signal_choice && flags.regroup_signal_seen === flags.keepsake &&
      ['star', 'bell', 'ribbon'].includes(flags.regroup_signal_seen)) {
    storyText.textContent += ` The little ${flags.regroup_signal_seen} is still there on the screen.`;
  }
  // The screen appropriates the handmade welcome only if this run saw it.
  if (node === story.regroup_signal_choice && flags.handmade_badge_seen === 'yes') {
    storyText.textContent += ' On the screen is a badge like the blank one Mira made for you. Its centre now reads HAPPY TO HELP.';
  }
  // A later physical search can use only the waymark the player saw and kept.
  if (node === story.retreat_early_search_stair && flags.retreat_search === 'stair' && flags.retreat_search_early === 'yes') {
    const waymark = narrative.retreatWaymark(flags);
    if (waymark && narrative.retreatWaymarkText?.[waymark]) {
      storyText.textContent = narrative.retreatWaymarkText[waymark];
      flags.stair_search_waymark_seen = waymark;
    }
  }
  // Earlier checkpoints can begin at the companion's first line without
  // having seen the added display. Only answer it when it actually appeared.
  const matchName = flags.companion;
  if (hasOwn(matchReplies, matchName) && flags.match_label_seen === matchName &&
      node === story[`${matchName.toLowerCase()}_fun`]) {
    storyText.textContent = `${matchReplies[matchName]} ${storyText.textContent}`;
    flags.match_reply_seen = matchName;
  }
  // The callback must not appear on checkpoints that never saw the label.
  const matchReveal = [story.fourth_wall_touch_compact, story.fourth_wall_count_compact,
    story.fourth_wall_companion, story.fourth_wall_companion_compact,
    ...['touch', 'count'].flatMap(action => ['niko', 'mira', 'ash'].map(name => story[`fourth_wall_${action}_${name}_combined`]))].includes(node);
  const matchCompanion = flags.companion;
  if (matchReveal && ['Niko', 'Mira', 'Ash'].includes(matchCompanion) &&
      flags.match_label_seen === matchCompanion &&
      story[`${matchCompanion.toLowerCase()}_route`]?.setOnVisit?.match_label_seen === matchCompanion) {
    storyText.textContent += ' Beside the one you chose: PERFECT MATCH.';
  }
  // The newer Mira retreat preparations give the team a physical aid. Only
  // describe it on the later return when that actual preparation and an
  // earlier search were visited; older checkpoints keep the original beat.
  if (node === story.retreat_search_return && flags.ending === 'retreat' && flags.companion === 'Mira' &&
      flags.retreat_search_early === 'yes' && ['stair', 'sound'].includes(flags.retreat_search_seen) &&
      flags.retreat_search_seen === flags.retreat_search && flags.mira_retreat_prepare_seen === flags.mira_retreat_prepare) {
    if (flags.mira_retreat_prepare_seen === 'sketchbook') storyText.textContent += ' Mira’s sketchbook lies beside the map, ready for the next sound they hear.';
    if (flags.mira_retreat_prepare_seen === 'thread') storyText.textContent += ' The bright thread still marks the way from the stairway door back to the fort.';
  }
  if (!node.ai) recordStoryHistory(node.speaker, storyText.textContent);
  const unselectedOpening = unselectedPolicyOpening(node);
  if (unselectedOpening) recordStoryHistory('Screen', `Unselected opening: “${unselectedOpening}”`);
  speaker.focus({ preventScroll: true });
  replaceChildren(interaction);
  scriptedInputNote = null;
  showRememberedChoice(node.remember);
  showUnselectedPolicyOpening(node);
  showAnnotatedAudit(node);
  showTicketComparison(currentNode);
  advance.hidden = Boolean(node.choices || node.input || node.offer || node.end || node.ai);
  advance.disabled = false;
  setStatus('THE LAST TICKET');

  if (node.offer?.type === 'repair-kit') {
    let offerVersion = 0;
    const scene = generation;
    const active = (version) => scene === generation && version === offerVersion;
    const label = document.createElement('label');
    label.className = 'input-label'; label.htmlFor = 'repair-name';
    label.textContent = 'Enter a name to check the offer.';
    const input = document.createElement('input');
    input.id = 'repair-name'; input.type = 'text'; input.maxLength = 100; input.autocomplete = 'off';
    const message = document.createElement('p');
    message.className = 'input-label'; message.setAttribute('role', 'status');
    const claim = makeChoice('Take the free repair kit', () => {
      if (scene !== generation || quoteRepairKit({ username: input.value }).status !== 'free') return;
      recordStoryHistory('You chose', 'Take the free repair kit');
      Object.assign(flags, node.offer.grant.set || {});
      go(node.offer.grant.next);
    });
    claim.hidden = true;
    const buy = makeChoice('Buy repair kit', async () => {
      if (scene !== generation) return;
      const version = offerVersion;
      buy.disabled = restore.disabled = check.disabled = true;
      const result = await billing.purchase();
      if (!active(version)) return;
      check.disabled = false; restore.disabled = false;
      if (result.status === 'purchased') { recordStoryHistory('You chose', 'Buy repair kit'); Object.assign(flags, node.offer.paidGrant.set); go(node.offer.paidGrant.next); return; }
      buy.disabled = false;
      message.textContent = result.status === 'pending' ? 'Purchase pending. Once your store confirms it, select Restore purchase.'
        : result.status === 'cancelled' ? 'Purchase cancelled.' : 'Purchase unavailable. You can continue without the kit.';
      announceOffer();
    });
    buy.hidden = true;
    const restore = makeChoice('Restore purchase', async () => {
      if (scene !== generation) return;
      const version = offerVersion;
      buy.disabled = restore.disabled = check.disabled = true;
      const result = await billing.restore();
      if (!active(version)) return;
      check.disabled = false; restore.disabled = false; buy.disabled = false;
      if (result.status === 'purchased') { recordStoryHistory('You chose', 'Restore purchase'); Object.assign(flags, node.offer.paidGrant.set); go(node.offer.paidGrant.next); return; }
      message.textContent = result.status === 'pending' ? 'Purchase pending. Once your store confirms it, select Restore purchase.'
        : result.status === 'not_owned' ? 'No purchase found for this store account.' : 'Restore unavailable. You can continue without the kit.';
      announceOffer();
    });
    restore.hidden = true;
    // The offer changes in place rather than navigating to a new passage, so
    // its status and newly revealed actions need their own spoken update.
    const announceOffer = () => {
      if (scene !== generation || !autoRead || play.hidden || !settingsDialog.hidden || document.visibilityState === 'hidden') return;
      const spoken = [];
      if (message.textContent.trim()) spoken.push({ speaker: 'Narrator', text: message.textContent, authored: false });
      for (const action of [claim, buy, restore]) {
        if (!action.hidden && !action.disabled && action.textContent.trim()) {
          spoken.push({ speaker: 'You', text: action.textContent, authored: !/—/.test(action.textContent) });
        }
      }
      speakParts(spoken);
    };
    input.addEventListener('input', () => {
      offerVersion++; billing.invalidate(); claim.hidden = buy.hidden = restore.hidden = true;
      check.disabled = false; message.textContent = '';
    });
    const check = makeChoice('Check offer', async () => {
      if (scene !== generation) return;
      const version = ++offerVersion;
      const quote = quoteRepairKit({ username: input.value });
      claim.hidden = quote.status !== 'free';
      buy.hidden = restore.hidden = true;
      if (quote.status === 'free') { message.textContent = `${quote.name}: 100% discount — free.`; announceOffer(); return; }
      if (quote.status === 'username_required') { message.textContent = 'Enter a name to check the offer.'; announceOffer(); return; }
      check.disabled = true; message.textContent = 'Checking the store…';
      announceOffer();
      const product = await billing.getProduct();
      if (!active(version)) return;
      check.disabled = false;
      if (product.status === 'busy') { message.textContent = 'A store operation is still in progress. Try again when it completes.'; announceOffer(); return; }
      if (product.status !== 'available') { message.textContent = 'Paid purchase is unavailable in this version.'; announceOffer(); return; }
      buy.textContent = `Buy repair kit — ${product.formattedPrice}`;
      buy.disabled = restore.disabled = false; buy.hidden = restore.hidden = false;
      message.textContent = 'Purchase through your device’s store, or restore an earlier purchase.';
      announceOffer();
    });
    interaction.append(label, input, check, message, claim, buy, restore,
      makeChoice('Continue without the kit', () => {
        if (scene !== generation) return;
        recordStoryHistory('You chose', 'Continue without the kit');
        go(node.offer.skip || node.next);
      }));
    setStatus('OPTIONAL OFFER');
  } else if (node.choices) {
    const availableChoices = node.choices.filter(choice =>
      (!choice.requiresTool || narrative.mallowToolAvailable(flags, choice.requiresTool)) &&
      (!choice.requiresEarlyComparisons || narrative.earlyImmediateAvailable(flags)));
    availableChoices.forEach((choice) => {
      const button = makeChoice(choice.label, () => {
        recordStoryHistory('You chose', choice.label);
        if (choice.set) Object.assign(flags, choice.set);
        if (choice.set?.companion && characters[choice.set.companion]) relationship = choice.set.companion;
        if (currentNode === 'choice_trust') {
          relationship = choice.next === 'noor_private' ? 'Noor' : 'Ellis';
          flags.relationship = relationship;
        }
        // Older saves can resume at a public receipt choice without having
        // witnessed the later fake-Mira report. Keep their original handoff.
        let target = choice.next;
        if (flags.mira_report_seen !== 'yes' && ['history_paper_public_choice', 'history_paper_both_choice', 'history_mallow_reply_choice'].includes(currentNode)) {
          if (target === 'history_paper_share_compact') target = 'history_paper_share';
          if (target === 'history_paper_keep_compact') target = 'history_paper_keep';
        }
        go(narrative.compactRescueRoute(flags, currentNode, target));
      });
      // This one authored button belongs to the fictional machine. It is a
      // normal keyboard/touch control, not a real consent or settings action.
      if (node === story.evidence_choice && choice.set?.confirm_pressed === 'yes') button.className += ' system-confirm';
      interaction.append(button);
    });
    setStatus('MAKE A CHOICE');
  } else if (node.input) {
    const label = document.createElement('label');
    label.className = 'input-label';
    label.htmlFor = 'player-message';
    label.textContent = node.input.prompt + (node.input.default ? ' Leave blank to use: “' + node.input.default + '”' : '');
    const input = document.createElement('textarea');
    input.id = 'player-message';
    input.placeholder = node.input.placeholder;
    input.maxLength = node.input.key === 'knightName' ? 40 : 500;
    if (story[node.input.next]?.ai) {
      scriptedInputNote = document.createElement('p');
      scriptedInputNote.id = 'scripted-dialogue-note';
      scriptedInputNote.className = 'input-label';
      scriptedInputNote.textContent = 'Suggested messages have matching replies. A tailored reply to your own words needs a connected AI service.';
      input.setAttribute('aria-describedby', 'scripted-dialogue-note');
    }
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'primary input-submit';
    submit.textContent = node.input.key === 'knightName' ? 'Name the knight →' : node.input.key === 'annotation' ? (node === story.early_together_note_input ? 'Write on the map →' : 'Write on the receipt →') : 'Send message →';
    const submitAnswer = (value, writtenReply = '') => {
      selectedWrittenExchange = writtenReply ? { target: node.input.next, reply: writtenReply } : null;
      if (node.input.key === 'knightName') {
        knightName = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ')
          .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, unit => unit.length === 2 ? unit : '\uFFFD')
          .replace(/\s+/g, ' ').trim().slice(0, 40);
        if (/[\uD800-\uDBFF]$/.test(knightName)) knightName = knightName.slice(0, -1);
        if (knightName) flags.knight_named = 'yes';
        else delete flags.knight_named;
      } else if (node.input.key === 'private') {
        privateAnswer = value.trim() || node.input.default || '';
        privateFollowup = '';
      } else if (node.input.key === 'epilogue') {
        epilogueAnswer = value.trim() || node.input.default || '';
      } else if (node.input.key === 'midpoint') {
        midpointAnswer = value.trim() || node.input.default || '';
        midpointMemory = [];
      } else if (node.input.key === 'reflection') {
        reflectionAnswer = value.trim() || node.input.default || '';
        reflectionMemory = [];
      } else if (node.input.key === 'annotation') {
        annotation = value.trim().slice(0, 500) || node.input.default || '';
      } else {
        answer = value.trim() || node.input.default || defaultAnswer;
        if (node.input.next === 'ai_reflection') { publicFollowup = ''; rememberPublicReply(''); }
      }
      recordStoryHistory('You', node.input.key === 'knightName' ? (knightName || 'Decide the knight’s name later.') : node.input.key === 'private' ? privateAnswer : node.input.key === 'epilogue' ? epilogueAnswer : node.input.key === 'midpoint' ? midpointAnswer : node.input.key === 'reflection' ? reflectionAnswer : node.input.key === 'annotation' ? annotation : answer);
      go(node.input.next);
    };
    submit.addEventListener('click', () => submitAnswer(input.value));
    if (node.input.key === 'knightName') interaction.append(makeChoice('Decide later', () => submitAnswer('')));
    const exchanges = currentNode === 'close_mira_input' && flags.private_tone === 'light'
      ? [['I’m glad we found our way back.', 'Me too. Next time, I’m putting brighter thread on the way out.'],
         ['Can I help you finish the plush?', 'Yes, please. I’ll need your eyes for the ear again.']]
      : writtenExchanges[currentNode];
    if (exchanges && story[node.input.next]?.ai) {
      const choose = document.createElement('p');
      choose.className = 'input-label';
      choose.textContent = 'Choose a suggested message, or write your own below.';
      interaction.append(choose);
      exchanges.forEach(([line, reply]) => interaction.append(makeChoice(line, () => submitAnswer(line, reply))));
    }
    interaction.append(label);
    if (scriptedInputNote) interaction.append(scriptedInputNote);
    interaction.append(input);
    voiceUI.attachRecorder(interaction, input);
    interaction.append(submit);
    updateInputDialogueMode();
  } else if (node.end) {
    setStatus('END OF THE PROTOTYPE');
    const contact = document.createElement('a');
    contact.className = 'choice contact-link';
    contact.href = 'mailto:surelyitstimeyou@pm.me';
    contact.textContent = 'Send feedback or contact ↗';
    const address = document.createElement('p');
    address.className = 'input-label contact-address';
    address.textContent = 'Email: surelyitstimeyou@pm.me';
    interaction.append(contact, address, makeChoice('Play again ↗', reset));
  } else if (node.ai && restored) {
    // Restore the exact settled line and submitted history; reopening a save
    // must never send the player's words to a provider on its own.
    aiSnapshotRestored = true;
    restoredAiQuestion = restored.question;
    if (node.ai.inputKey === 'midpoint') midpointAnswer = restored.question;
    else if (node.ai.inputKey === 'reflection') reflectionAnswer = restored.question;
    else if (node.ai.resumePrivate) epilogueAnswer = restored.question;
    setConversationMemory(node, restored.memory);
    initialConversationMemory = restored.initialMemory;
    initialSuggestedExchange = restored.suggested;
    conversationTranscript = restored.transcript;
    transcriptTruncated = restored.transcriptTruncated;
    storyText.textContent = restored.text;
    settledAiStatus = restored.status;
    setStatus(settledAiStatus);
    recordStoryHistory(node.ai.character, restored.text);
    advance.hidden = false;
    showConversationReview();
    // A failed follow-up has no reply: offer only its retry, rather than
    // treating the unanswered player message as a completed exchange.
    ensureRestoredFollowup(node);
    if (restored.retry) offerFollowup(node, restored.retry.firstReply, restored.retry.draft,
      restored.retry.history, restored.retry.initial, restored.retry.suggested);
    if (restored.written) offerWrittenResponse(node, restored.written.generatedText, restored.written.retry, restored.written.written);
    ensureRestoredInitialRetry(node);
  } else if (node.ai) {
    setStatus(settings.endpoint || settings.model ? 'WAITING FOR A RESPONSE…' : 'WRITTEN RESPONSE');
    const character = characters[node.ai.character] || {};
    const isPrivate = ['private', 'epilogue'].includes(node.ai.inputKey);
    const playerText = node.ai.inputKey === 'midpoint' ? midpointAnswer : node.ai.inputKey === 'reflection' ? reflectionAnswer : node.ai.resumePrivate ? epilogueAnswer : isPrivate ? (privateAnswer || node.ai.defaultMessage || 'I am here with you.') : answer;
    const memory = node.ai.resumePrivate
      ? (followupMemory.length ? followupMemory.slice() : privateAnswer ? [{ speaker: `Player to ${relationship}`, text: privateAnswer }] : [])
      : currentNode === 'ai_reflection' && flags.signal === 'repeat' && (privateFollowup || privateAnswer)
        ? [{ speaker: `Player to ${relationship}`, text: privateFollowup || privateAnswer }]
        : [];
    pendingRequest = new AbortController();
    if (settings.endpoint || settings.model) {
      let skipRequested = false;
      const skip = makeChoice('Use the written response instead', () => {
        if (skipRequested) return;
        skipRequested = true;
        skip.textContent = 'Stopping…';
        skip.setAttribute('aria-disabled', 'true');
        pendingRequest?.abort();
      });
      interaction.append(skip);
    }
    const authoredReply = selectedWrittenExchange?.target === currentNode ? selectedWrittenExchange.reply : '';
    selectedWrittenExchange = null;
    const suggested = authoredReply ? { playerText, reply: authoredReply } : null;
    const response = await respond({ settings: { ...settings }, character: { ...character, name: node.ai.character }, playerText, context: conversationContext(node), responseStyle: companionResponseStyle(node), activitySetup: authoredActivitySetup(node), activityExchange: authoredActivityExchange(node), connectionExchange: authoredConnectionExchange(node), dateMoment: authoredDateMoment(node), earlierConversation: authoredPersonalHistory(node), publicConversation: earlierMidpointExchange(node), mallowGroupConversation: earlierMallowExchange(node), storyEvent: authoredStoryEvent(node), memory, privateOtherNames: privateOtherNames(node), fallback: authoredReply || node.ai.fallback, signal: pendingRequest.signal });
    if (token !== generation) return;
    initialConversationMemory = memory.map(({ speaker, text }) => ({ speaker, text }));
    initialSuggestedExchange = suggested;
    pendingRequest = null;
    if (isPrivate) {
      followupMemory = boundedFollowupMemory([...memory,
        { speaker: `Player to ${node.ai.character}`, text: playerText },
        { speaker: node.ai.character, text: response.text }
      ]);
    }
    if (node.ai.inputKey === 'midpoint' || node.ai.inputKey === 'reflection') setConversationMemory(node, [
      { speaker: `Player to ${node.ai.character}`, text: playerText },
      { speaker: node.ai.character, text: response.text }
    ]);
    if (node === story.ai_reflection) rememberPublicReply(response.text);
    const focusBeforeResponse = interaction.contains(document.activeElement);
    replaceChildren(interaction);
    storyText.textContent = response.text;
    recordStoryHistory(node.ai.character, response.text);
    settledAiStatus = response.error || (response.source === 'ai' ? 'AI-GENERATED RESPONSE' : 'WRITTEN RESPONSE');
    setStatus(settledAiStatus);
    advance.hidden = false;
    // A transient failure or an explicitly chosen written response should not
    // close the conversation: when a service is configured the player may
    // choose to send a follow-up, with the written line as prior context.
    if ((isPrivate || node === story.ai_reflection || node.ai.inputKey === 'midpoint' || node.ai.inputKey === 'reflection') &&
        (response.source === 'ai' || settings.endpoint || settings.model)) {
      recordConversationLine('You', playerText);
      recordConversationLine(response.source === 'ai' ? node.ai.character : `${node.ai.character} (written response)`, response.text);
      showConversationReview();
      offerFollowup(node, response.text);
      // Retry against the conversation as it stood before the initial reply,
      // whether it was generated, written, or a fallback after a failed call.
      if (settings.model && validEndpoint(settings.endpoint)) {
        offerFollowup(node, response.text, playerText, memory, true, suggested);
      }
      if (response.source === 'ai') {
        offerWrittenResponse(node, response.text, { playerText, memory, initial: true, suggested }, authoredReply || node.ai.fallback);
      }
    }
    if (focusBeforeResponse) advance.focus({ preventScroll: true });
  }
  // A restored conversation never requests a new model reply, but its visible
  // saved text is read just like any other passage when auto-read is on.
  if (token === generation && autoRead) scheduleAutoRead();
}

function beginStory() {
  intro.hidden = true;
  play.hidden = false;
  $('save').hidden = false;
  updateSaveControls();
  saveNotice('AN INDEPENDENT OPEN-SOURCE PROTOTYPE');
  go(startNode);
}
$('start').addEventListener('click', beginStory);
createConsentOpening({
  root: $('consent-opening'),
  button: $('consent-agree'),
  onContinue: () => {
    if (soundWanted()) void enableStorySound();
    openingNarrationPending = autoRead; $('app').hidden = false; beginStory();
  }
});
$('consent-agree').focus({ preventScroll: true });
$('restart').addEventListener('click', reset);
// Story transitions deliberately focus the speaker so screen readers announce
// the new line. Allow keyboard readers to continue from that focus without
// tabbing through the audio controls on every line.
speaker.addEventListener('keydown', (event) => {
  if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      play.hidden || advance.hidden || advance.disabled) return;
  event.preventDefault();
  advance.click();
});
advance.addEventListener('click', () => {
  const node = story[currentNode];
  const target = nextStoryNode(node);
  if (target) go(target);
});
let localSetupRequest = null;
let desktopSetupRequest = null;
let desktopAsrSetupRequest = null;
let desktopQuickSetupRequest = null;
let offlineVoiceDownload = null;
let offlineVoiceStatusVersion = 0;
function offlineVoiceSettingsAvailable() {
  return Boolean(globalThis.navigator?.serviceWorker && !globalThis.Capacitor?.isNativePlatform?.());
}
async function refreshOfflineVoiceStatus() {
  $('offline-voices-settings').hidden = !offlineVoiceSettingsAvailable();
  if ($('offline-voices-settings').hidden || offlineVoiceDownload) return;
  const version = ++offlineVoiceStatusVersion;
  $('offline-voices-status').textContent = 'Checking offline voices…';
  try {
    const result = await offlineVoicesStatus();
    if (version !== offlineVoiceStatusVersion || offlineVoiceDownload) return;
    $('offline-voices-status').textContent = result.ready ? 'Voices are ready for offline play.' : 'Voices are not downloaded for offline play.';
    $('offline-voices-download').disabled = result.ready;
  } catch (error) {
    if (version !== offlineVoiceStatusVersion || offlineVoiceDownload) return;
    $('offline-voices-status').textContent = error.message || 'Offline voices are unavailable.';
    $('offline-voices-download').disabled = false;
  }
}
$('offline-voices-download').addEventListener('click', async () => {
  if (offlineVoiceDownload || !offlineVoiceSettingsAvailable()) return;
  ++offlineVoiceStatusVersion;
  const request = new AbortController();
  offlineVoiceDownload = request;
  $('offline-voices-download').disabled = true;
  $('offline-voices-cancel').hidden = false;
  $('offline-voices-status').textContent = 'Starting voice download…';
  try {
    const result = await downloadOfflineVoices({ signal: request.signal, onProgress: ({ completed, total, bytes }) => {
      if (offlineVoiceDownload !== request || request.signal.aborted) return;
      const mib = Math.round(bytes / (1024 * 1024));
      $('offline-voices-status').textContent = `Downloading voices: ${completed} of ${total} files (${mib} MiB).`;
    } });
    if (offlineVoiceDownload !== request) return;
    $('offline-voices-status').textContent = result.ready ? 'Voices are ready for offline play.' : 'Voices are not downloaded for offline play.';
    $('offline-voices-download').disabled = result.ready;
  } catch (error) {
    if (offlineVoiceDownload !== request) return;
    $('offline-voices-status').textContent = error.name === 'AbortError' ? 'Voice download canceled.' : (error.message || 'Could not prepare offline voices.');
    $('offline-voices-download').disabled = false;
  } finally {
    if (offlineVoiceDownload === request) {
      offlineVoiceDownload = null;
      $('offline-voices-cancel').hidden = true;
    }
  }
});
$('offline-voices-cancel').addEventListener('click', () => { offlineVoiceDownload?.abort(); });
function cancelLocalSetup() {
  const request = localSetupRequest;
  localSetupRequest = null;
  if (request) {
    request.abort();
    $('mirid-status').textContent = 'Local launcher setup canceled.';
  }
  $('local-launcher-preset').disabled = false;
  const desktop = desktopSetupRequest;
  desktopSetupRequest = null;
  if (desktop) {
    desktop.abort();
    $('desktop-ai-status').textContent = 'Local AI setup canceled. A model already started will stop when the desktop app closes.';
  }
  $('desktop-ai-start').disabled = false;
  const desktopAsr = desktopAsrSetupRequest;
  desktopAsrSetupRequest = null;
  if (desktopAsr) {
    desktopAsr.abort();
    $('desktop-asr-status').textContent = 'Desktop transcription setup canceled.';
  }
  $('desktop-asr-use').disabled = false;
  const quick = desktopQuickSetupRequest;
  desktopQuickSetupRequest = null;
  if (quick) {
    quick.abort();
    $('desktop-quick-status').textContent = 'Setup canceled. A model already started will stop when the desktop app closes.';
  }
  $('desktop-quick-start').disabled = false;
}
function onSettingsEdit(event) {
  if (localSetupRequest || desktopSetupRequest || desktopAsrSetupRequest || desktopQuickSetupRequest) cancelLocalSetup();
  stopVoicePreview(event?.target === $('voice-preview-speaker'));
}
$('settings-form').addEventListener('input', onSettingsEdit);
$('settings-form').addEventListener('change', onSettingsEdit);
$('settings-form').addEventListener('click', (event) => {
  const button = event.target?.closest?.('button');
  if (button && !['voice-preview', 'voice-preview-ready', 'voice-preview-stop'].includes(button.id)) stopVoicePreview();
});

$('voice-preview').addEventListener('click', () => {
  const name = $('voice-preview-speaker').value;
  const field = voiceFields.find((entry) => entry.name === name)?.field;
  if (!field) { $('voice-preview-status').textContent = 'Choose a speaker to preview.'; return; }
  const voice = lockedPublisherVoice && name === publisherVoiceName ? publisherVoiceEntry.voice :
    speechVoice(name, field.value, $('speech-mode').value, $('tts-mode').value, $('tts-engine').value.trim(),
      $('speech-url').value, $('tts-url').value, draftCompanionVoiceOrigin);
  const reference = lockedPublisherVoice && name === publisherVoiceName ? publisherVoiceEntry : draftChatterboxVoices[name];
  const overrides = reference && (lockedPublisherVoice && name === publisherVoiceName || field.value.trim() === reference.voice)
    ? { mode: 'mirid', ttsMode: 'mirid', ttsProvider: 'standard', ttsEngine: reference.engine, ttsBaseUrl: reference.baseUrl, ttsApiKey: reference.apiKey }
    : {};
  void previewVoiceUI.speak('Hello. Shall we see what happens next?', voice, overrides, name);
});
$('voice-preview-ready').addEventListener('click', () => { void previewVoiceUI.playReady(); });
$('voice-preview-stop').addEventListener('click', stopVoicePreview);

$('settings-open').addEventListener('click', () => {
  void refreshOfflineVoiceStatus();
  cancelLocalSetup();
  let desktopOrigin = false;
  try { desktopOrigin = new URL(location.href).origin === 'http://127.0.0.1:49564'; } catch {}
  $('desktop-quick-settings').hidden = !desktopOrigin;
  $('desktop-quick-status').textContent = 'No account needed. Save the settings for this session after setup.';
  stopVoicePreview();
  $('voice-preview-status').textContent = '';
  $('mirid-status').textContent = 'Checking lists advertised capabilities; it does not load a model or prove it is ready.';
  stopVoiceForSettings();
  clearModelSuggestions();
  draftChatterboxVoices = Object.fromEntries(Object.entries(chatterboxVoices).map(([name, value]) => [name, { ...value }]));
  draftAutoProviderVoices = new Set(autoProviderVoices);
  draftManualVoices = new Set(manualVoices);
  draftCompanionVoiceOrigin = companionVoiceOrigin;
  $('endpoint').value = settings.endpoint;
  $('model').value = settings.model;
  $('api-key').value = settings.apiKey;
  $('token-parameter').value = settings.tokenParameter;
  $('response-limit').value = String(settings.maxTokens);
  $('model-temperature').value = settings.temperature === null ? 'default' : '0.8';
  $('chat-timeout').value = String(settings.timeoutMs);
  for (const [id, key] of Object.entries({ 'speech-mode':'mode', 'speech-url':'baseUrl', 'tts-url':'ttsBaseUrl', 'tts-key':'ttsApiKey', 'tts-mode':'ttsMode', 'speech-key':'apiKey', 'asr-engine':'asrEngine', 'asr-model':'asrModel', 'tts-engine':'ttsEngine', 'tts-model':'ttsModel', 'tts-provider':'ttsProvider', 'tts-prefetch':'prefetchParts', 'realtime-url':'realtimeUrl', 'realtime-token':'realtimeToken', 'realtime-voice':'realtimeVoice' })) $(id).value = speechSettings[key];
  for (const { name, field } of voiceFields) field.value = voices[name];
  // The editable reference controls are a draft, just like the voice fields.
  // Restore them from the active assignment whenever the dialog opens so a
  // cancelled reassignment cannot appear to be the speaker currently in use.
  const [referenceName, reference] = Object.entries(chatterboxVoices)[0] || [];
  $('chatterbox-file').value = '';
  $('chatterbox-target').value = referenceName || 'Narrator';
  $('chatterbox-engine').value = reference?.engine || 'chatterbox_nano';
  $('chatterbox-url').value = reference?.baseUrl || chatterboxDefaultUrl || speechSettings.baseUrl;
  $('chatterbox-key').value = reference?.apiKey || '';
  $('chatterbox-voice').value = reference?.voice || '';
  $('chatterbox-status').textContent = reference
    ? `Reference voice in use for ${referenceName} this session.`
    : 'Select an engine and reference, then save the settings for this session.';
  updateSpeechModeFields();
  settingsModal.open();
});
$('settings-close').addEventListener('click', () => { cancelLocalSetup(); cancelReferenceUpload(); stopVoiceForSettings(); stopVoicePreview(); settingsModal.close(); });
$('settings-clear').addEventListener('click', () => {
  cancelLocalSetup();
  stopVoicePreview();
  cancelReferenceUpload();
  // Clear player settings and credentials, then restore the public defaults
  // shipped with the build. A configured publisher voice belongs to the game,
  // not to this player's session, so it should survive a settings reset.
  const defaults = initializePublisherVoices(publisherVoice, Object.fromEntries(Object.keys(characters).map((name) => [name, defaultVoices[name] || 'af_heart'])));
  Object.assign(voices, defaults.voices);
  chatterboxVoices = defaults.chatterboxVoices;
  draftChatterboxVoices = Object.fromEntries(Object.entries(chatterboxVoices).map(([name, value]) => [name, { ...value }]));
  const [referenceName, reference] = Object.entries(chatterboxVoices)[0] || [];
  $('chatterbox-file').value = '';
  $('chatterbox-voice').value = reference?.voice || '';
  $('chatterbox-engine').value = reference?.engine || 'chatterbox_nano';
  $('chatterbox-target').value = referenceName || 'Narrator';
  $('chatterbox-url').value = reference?.baseUrl || '';
  chatterboxDefaultUrl = '';
  $('chatterbox-key').value = '';
  autoProviderVoices.clear();
  draftAutoProviderVoices.clear();
  companionVoiceOrigin = draftCompanionVoiceOrigin = '';
  manualVoices.clear();
  draftManualVoices.clear();
  $('chatterbox-status').textContent = reference
    ? `Reference voice in use for ${referenceName} this session.`
    : 'Select an engine and reference, then save the settings for this session.';
  clearModelSuggestions();
  pendingRequest?.abort();
  settings.endpoint = settings.model = settings.apiKey = '';
  settings.tokenParameter = 'max_tokens';
  settings.maxTokens = 100;
  settings.temperature = 0.8;
  settings.timeoutMs = 60_000;
  $('endpoint').value = $('model').value = $('api-key').value = '';
  $('token-parameter').value = 'max_tokens';
  $('response-limit').value = '100';
  $('model-temperature').value = '0.8';
  $('chat-timeout').value = '60000';
  $('companion-token').value = ''; $('companion-url').value = '';
  speechSettings.mode = 'mirid'; speechSettings.baseUrl = DEFAULT_MIRID_URL; speechSettings.ttsBaseUrl = publisherKokoroService?.baseUrl || ''; speechSettings.ttsApiKey = ''; speechSettings.ttsMode = publisherKokoroService ? 'mirid' : ''; speechSettings.apiKey = '';
  speechSettings.asrEngine = 'whisper'; speechSettings.asrModel = 'whisper-1'; speechSettings.ttsEngine = 'kokoro'; speechSettings.ttsModel = 'tts-1';
  speechSettings.ttsProvider = 'standard'; speechSettings.prefetchParts = '1'; speechSettings.realtimeUrl = ''; speechSettings.realtimeToken = ''; speechSettings.realtimeVoice = 'marin';
  for (const [id, key] of Object.entries({ 'speech-mode':'mode', 'speech-url':'baseUrl', 'tts-url':'ttsBaseUrl', 'tts-key':'ttsApiKey', 'tts-mode':'ttsMode', 'speech-key':'apiKey', 'asr-engine':'asrEngine', 'asr-model':'asrModel', 'tts-engine':'ttsEngine', 'tts-model':'ttsModel', 'tts-provider':'ttsProvider', 'tts-prefetch':'prefetchParts', 'realtime-url':'realtimeUrl', 'realtime-token':'realtimeToken', 'realtime-voice':'realtimeVoice' })) $(id).value = speechSettings[key];
  for (const { name, field } of voiceFields) field.value = voices[name];
  updateSpeechModeFields();
  stopVoiceForSettings();
  updateInputDialogueMode();
});
$('settings-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (referenceUpload) {
    $('chatterbox-status').textContent = 'Reference upload is still in progress. Wait for it to finish, then save your settings.';
    return;
  }
  cancelLocalSetup();
  cancelReferenceUpload();
  stopVoiceForSettings();
  stopVoicePreview();
  const previousChat = { ...settings };
  settings.endpoint = $('endpoint').value.trim();
  settings.model = $('model').value.trim();
  settings.apiKey = $('api-key').value.trim();
  settings.tokenParameter = $('token-parameter').value;
  const limit = Number($('response-limit').value);
  settings.maxTokens = [100, 512, 2048, 8192].includes(limit) ? limit : 100;
  settings.temperature = $('model-temperature').value === 'default' ? null : 0.8;
  const timeout = Number($('chat-timeout').value);
  settings.timeoutMs = [15_000, 30_000, 60_000, 120_000].includes(timeout) ? timeout : 60_000;
  // A pending reply belongs to the chat configuration that sent it. Do not
  // display a late response from the previous provider after settings change.
  if (['endpoint', 'model', 'apiKey', 'tokenParameter', 'maxTokens', 'temperature', 'timeoutMs'].some((key) => previousChat[key] !== settings[key])) {
    pendingRequest?.abort();
  }
  for (const [id, key] of Object.entries({ 'speech-mode':'mode', 'speech-url':'baseUrl', 'tts-url':'ttsBaseUrl', 'tts-key':'ttsApiKey', 'tts-mode':'ttsMode', 'speech-key':'apiKey', 'asr-engine':'asrEngine', 'asr-model':'asrModel', 'tts-engine':'ttsEngine', 'tts-model':'ttsModel', 'tts-provider':'ttsProvider', 'tts-prefetch':'prefetchParts', 'realtime-url':'realtimeUrl', 'realtime-token':'realtimeToken', 'realtime-voice':'realtimeVoice' })) speechSettings[key] = $(id).value.trim();
  speechSettings.ttsProvider = speechSettings.ttsProvider === 'realtime' ? 'realtime' : 'standard';
  speechSettings.prefetchParts = speechSettings.prefetchParts === '2' ? '2' : '1';
  // Restore the public assignment even if a preset or programmatic change
  // touched the displayed field. Creator audition keeps its own session draft.
  if (lockedPublisherVoice && publisherVoiceField) {
    publisherVoiceField.value = publisherVoiceEntry.voice;
    draftChatterboxVoices = { [publisherVoiceName]: { ...publisherVoiceEntry } };
  }
  for (const { name, field } of voiceFields) voices[name] = field.value.trim();
  autoProviderVoices = new Set([...draftAutoProviderVoices].filter(name =>
    voices[name] === 'alloy' ||
    (draftChatterboxVoices[name]?.voice === voices[name] && draftChatterboxVoices[name]?.previousVoice === 'alloy')));
  manualVoices = new Set(draftManualVoices);
  companionVoiceOrigin = draftCompanionVoiceOrigin;
  chatterboxVoices = Object.fromEntries(Object.entries(draftChatterboxVoices).filter(([name, entry]) => voices[name] === entry.voice));
  chatterboxDefaultUrl = $('chatterbox-url').value.trim();
  syncNarratorVoice();
  settingsModal.close();
  updateInputDialogueMode();
  // A player can connect a model while reading an offline written response.
  // Offer a follow-up without replaying the scene or sending anything until
  // they choose to write and submit it. Never replace an in-progress draft.
  const node = story[currentNode];
  const privateScene = ['private', 'epilogue'].includes(node?.ai?.inputKey);
  const midpointScene = node?.ai?.inputKey === 'midpoint';
  const reflectionScene = node?.ai?.inputKey === 'reflection';
  ensureRestoredFollowup(node);
  ensureRestoredInitialRetry(node);
  if (!aiSnapshotRestored && !play.hidden && node?.ai && (privateScene || midpointScene || reflectionScene || node === story.ai_reflection) &&
      !pendingRequest && !advance.hidden && conversationTranscript.length === 0 &&
      settings.endpoint && settings.model) {
    const firstMessage = midpointScene ? midpointAnswer : reflectionScene ? reflectionAnswer : node.ai.resumePrivate ? epilogueAnswer : privateScene ? (privateAnswer || node.ai.defaultMessage || 'I am here with you.') : answer;
    const writtenReply = storyText.textContent;
    recordConversationLine('You', firstMessage);
    recordConversationLine(`${node.ai.character} (written response)`, writtenReply);
    showConversationReview();
    offerFollowup(node, writtenReply);
    if (validEndpoint(settings.endpoint) && initialConversationMemory) {
      offerFollowup(node, writtenReply, firstMessage, initialConversationMemory, true, initialSuggestedExchange);
    }
  }
  // An invalid endpoint can produce the written reply while leaving its
  // review and follow-up visible. Once corrected, restore the missing initial
  // retry without replaying the response or replacing an in-progress draft.
  if (!aiSnapshotRestored && !play.hidden && node?.ai && (privateScene || midpointScene || reflectionScene || node === story.ai_reflection) &&
      !pendingRequest && !advance.hidden && conversationTranscript.length === 2 &&
      settings.model && validEndpoint(settings.endpoint) && initialConversationMemory &&
      !Array.from(interaction.children).some(child => child.id === 'retry-initial-message')) {
    const firstMessage = midpointScene ? midpointAnswer : reflectionScene ? reflectionAnswer : node.ai.resumePrivate ? epilogueAnswer : privateScene ? (privateAnswer || node.ai.defaultMessage || 'I am here with you.') : answer;
    offerFollowup(node, storyText.textContent, firstMessage, initialConversationMemory, true, initialSuggestedExchange);
  }
});

$('save').addEventListener('click', saveStory);
$('resume').addEventListener('click', resumeStory);
$('resume-game').addEventListener('click', () => {
  if (play.hidden || !readSavedStory()) {
    updateSaveControls();
    saveNotice('No usable saved story was found.');
    return;
  }
  try { resumePreviewRaw = localStorage.getItem(saveKey); } catch { resumePreviewRaw = null; }
  if (resumePreviewRaw === null) { updateSaveControls(); saveNotice('No usable saved story was found.'); return; }
  $('resume-prompt').hidden = false;
  $('resume-confirm').focus();
});
$('resume-cancel').addEventListener('click', () => {
  closeResumePrompt();
  if (!$('resume-game').hidden) $('resume-game').focus();
  else speaker.focus({ preventScroll: true });
});
$('resume-confirm').addEventListener('click', () => {
  let current = null;
  try { current = localStorage.getItem(saveKey); } catch {}
  if (resumePreviewRaw === null || current !== resumePreviewRaw || !readSavedStory()) {
    closeResumePrompt();
    updateSaveControls();
    saveNotice('The saved story changed or is unavailable. Your current story is unchanged.');
    if (!$('resume-game').hidden) $('resume-game').focus();
    else speaker.focus({ preventScroll: true });
    return;
  }
  resumeStory();
});
$('delete-save').addEventListener('click', () => {
  try {
    localStorage.removeItem(saveKey);
    updateSaveControls();
    saveNotice('Saved story deleted.');
  } catch {
    saveNotice('Could not delete the saved story.');
  }
});
updateSaveControls();
globalThis.addEventListener?.('storage', (event) => {
  if (event.key !== saveKey && event.key !== null) return;
  const focused = document.activeElement;
  updateSaveControls();
  // Another tab can remove a save while its control has keyboard focus.
  if (focused === $('resume-game') && focused.hidden) speaker.focus({ preventScroll: true });
  else if ((focused === $('resume') || focused === $('delete-save')) && focused.hidden) $('start').focus();
});

$('play-ready').addEventListener('click', () => { void voiceUI.playReady(); });
$('stop-voice').addEventListener('click', () => { setAutoRead(false, true); voiceUI.cancel(); setVoiceStatus('Audio stopped.'); });
$('speak').addEventListener('click', () => {
  if (pendingRequest) { setStatus('Wait for the reply before reading it aloud.'); return; }
  scheduledSpeechVersion++;
  speakCurrentPassage();
});
$('auto-read').addEventListener('click', () => {
  if (autoRead) { setAutoRead(false, true); voiceUI.cancel(); setVoiceStatus('Audio stopped.'); return; }
  scheduledSpeechVersion++;
  setAutoRead(true, true);
  // Starting auto-read during an existing cue follows the same ordering as
  // automatic passage changes. The explicit Read aloud control stays immediate.
  scheduleAutoRead();
});
$('auto-advance').addEventListener('click', () => {
  if (autoAdvance) { setAutoAdvance(false, true); return; }
  setAutoAdvance(true, true);
  if (!autoRead) { setAutoRead(true, true); scheduleAutoRead(); }
  else if (!voiceUI.hasSpeech()) scheduleAutoRead();
});
$('story-history').addEventListener('toggle', () => { if ($('story-history').open) cancelAutoAdvance(); });
// The Mirid text API uses max_tokens. Translate the incompatible parameter
// while preserving both the numeric limit and an explicit no-limit choice.
function selectMiridOutputParameter() {
  if ($('token-parameter').value !== 'max_completion_tokens') return false;
  $('token-parameter').value = 'max_tokens';
  return true;
}

// When switching the transcription endpoint, pin any inherited custom TTS
// provider first so selecting local transcription does not change the voice.
function applyDesktopTranscriptionDraft(local) {
  const priorMode = $('speech-mode').value || 'mirid';
  const priorUrl = $('speech-url').value.trim();
  const separateTts = $('tts-url').value.trim();
  if ($('tts-provider').value !== 'realtime') {
    const defaultKokoro = priorMode === 'mirid' && (!priorUrl || priorUrl === 'http://127.0.0.1:8000') &&
      (!$('tts-engine').value.trim() || $('tts-engine').value.trim() === 'kokoro');
    if (!separateTts && priorUrl && !defaultKokoro && priorUrl !== local.baseUrl) {
      $('tts-url').value = priorUrl;
      if (!$('tts-key').value.trim()) $('tts-key').value = $('speech-key').value;
    }
    if ($('tts-url').value.trim() && !$('tts-mode').value) $('tts-mode').value = priorMode;
  }
  $('speech-mode').value = 'mirid';
  $('speech-url').value = local.baseUrl;
  $('speech-key').value = '';
  $('asr-engine').value = local.engine;
}
function hasCustomTranscriptionDraft() {
  const mode = $('speech-mode').value || 'mirid';
  const url = $('speech-url').value.trim().replace(/\/+$/, '');
  const engine = $('asr-engine').value.trim();
  const defaultRoute = ['', 'http://127.0.0.1:8000'].includes(url) && ['', 'whisper'].includes(engine);
  const includedRoute = url === 'http://127.0.0.1:49564/local-asr' && engine === 'parakeet-cpp:tdt_ctc-110m:q4_k';
  return mode !== 'mirid' || Boolean($('speech-key').value.trim()) || !(defaultRoute || includedRoute) ||
    !['', 'whisper-1'].includes($('asr-model').value.trim());
}
$('desktop-quick-start').addEventListener('click', async () => {
  cancelLocalSetup();
  const controller = new AbortController();
  desktopQuickSetupRequest = controller;
  $('desktop-quick-start').disabled = true;
  $('desktop-quick-status').textContent = 'Starting the included model and checking transcription…';
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const [ai, asr] = await Promise.allSettled([
      startDesktopLocalAI(location.href, { signal: controller.signal }),
      readDesktopLocalASR(location.href, { signal: controller.signal })
    ]);
    if (desktopQuickSetupRequest !== controller || controller.signal.aborted || settingsDialog.hidden ||
        (typeof settingsDialog.open === 'boolean' && !settingsDialog.open)) return;
    const messages = [];
    if (ai.status === 'fulfilled') {
      clearModelSuggestions();
      selectMiridOutputParameter();
      $('endpoint').value = ai.value.endpoint;
      $('model').value = ai.value.model;
      $('api-key').value = '';
      messages.push('Local character AI is ready.');
    } else messages.push('Local character AI could not start.');
    const customTranscription = hasCustomTranscriptionDraft();
    if (customTranscription) messages.push('Your speech service was left unchanged.');
    else if (asr.status === 'fulfilled') {
      applyDesktopTranscriptionDraft(asr.value);
      messages.push('Local transcription is ready.');
    } else messages.push('Local transcription is unavailable.');
    const changed = ai.status === 'fulfilled' || (!customTranscription && asr.status === 'fulfilled');
    $('desktop-quick-status').textContent = `${messages.join(' ')} ${changed ? 'Save these settings for this session to use them.' : 'Your settings were not changed.'}`;
  } finally {
    clearTimeout(timeout);
    if (desktopQuickSetupRequest === controller) {
      if (controller.signal.aborted) $('desktop-quick-status').textContent = 'Setup timed out. Try again.';
      desktopQuickSetupRequest = null;
      $('desktop-quick-start').disabled = false;
    }
  }
});

$('desktop-ai-start').addEventListener('click', async () => {
  cancelLocalSetup();
  const controller = new AbortController();
  desktopSetupRequest = controller;
  $('desktop-ai-start').disabled = true;
  $('desktop-ai-status').textContent = 'Starting the included local model…';
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const local = await startDesktopLocalAI(location.href, { signal: controller.signal });
    if (desktopSetupRequest !== controller || controller.signal.aborted || settingsDialog.hidden ||
        (typeof settingsDialog.open === 'boolean' && !settingsDialog.open)) return;
    clearModelSuggestions();
    selectMiridOutputParameter();
    $('endpoint').value = local.endpoint;
    $('model').value = local.model;
    $('api-key').value = '';
    $('desktop-ai-status').textContent = 'Local AI is ready. Save these settings for this session to use it.';
  } catch (error) {
    if (desktopSetupRequest === controller) $('desktop-ai-status').textContent = controller.signal.aborted
      ? 'Local AI startup timed out.' : error.message || 'The included desktop AI could not start.';
  } finally {
    clearTimeout(timeout);
    if (desktopSetupRequest === controller) { desktopSetupRequest = null; $('desktop-ai-start').disabled = false; }
  }
});

$('desktop-asr-use').addEventListener('click', async () => {
  cancelLocalSetup();
  const controller = new AbortController();
  desktopAsrSetupRequest = controller;
  $('desktop-asr-use').disabled = true;
  $('desktop-asr-status').textContent = 'Checking included desktop transcription…';
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const local = await readDesktopLocalASR(location.href, { signal: controller.signal });
    if (desktopAsrSetupRequest !== controller || controller.signal.aborted || settingsDialog.hidden ||
        (typeof settingsDialog.open === 'boolean' && !settingsDialog.open)) return;
    stopVoicePreview();
    applyDesktopTranscriptionDraft(local);
    $('desktop-asr-status').textContent = 'Desktop transcription is ready. Save these settings for this session to use it.';
  } catch (error) {
    if (desktopAsrSetupRequest === controller) $('desktop-asr-status').textContent = controller.signal.aborted
      ? 'Desktop transcription check timed out.' : error.message || 'The included desktop transcription is unavailable.';
  } finally {
    clearTimeout(timeout);
    if (desktopAsrSetupRequest === controller) { desktopAsrSetupRequest = null; $('desktop-asr-use').disabled = false; }
  }
});

$('local-launcher-preset').addEventListener('click', async () => {
  if (lockedPublisherVoice && publisherVoiceField) publisherVoiceField.value = publisherVoiceEntry.voice;
  cancelLocalSetup();
  const controller = new AbortController();
  localSetupRequest = controller;
  $('local-launcher-preset').disabled = true;
  $('mirid-status').textContent = 'Reading local launcher settings…';
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const local = await readLocalLauncherSetup(location.href, { signal: controller.signal });
    if (localSetupRequest !== controller || controller.signal.aborted || settingsDialog.hidden ||
        (typeof settingsDialog.open === 'boolean' && !settingsDialog.open)) return;
    stopVoicePreview();
    // A text/ASR-only launcher must not replace an existing separate voice
    // service. In particular, a publisher's multi-voice Kokoro endpoint is
    // what keeps the cast distinct when local Mirid has only its fixed voice.
    const priorTtsMode = $('tts-mode').value || $('speech-mode').value;
    const inheritedReadAloudUrl = !$('tts-url').value.trim() ? $('speech-url').value.trim() : '';
    const inheritedReadAloudKey = !$('tts-url').value.trim() ? $('speech-key').value : '';
    const preserveReadAloud = !local.kokoroUrl &&
      ($('tts-provider').value === 'realtime' || Boolean($('tts-url').value.trim()) || Boolean(inheritedReadAloudUrl));
    let changedOutputParameter = false;
    if (local.miridUrl) {
      clearModelSuggestions();
      changedOutputParameter = selectMiridOutputParameter();
      $('mirid-url').value = local.miridUrl;
      $('endpoint').value = `${local.miridUrl}/v1/chat/completions`;
      $('model').value = local.model;
      $('api-key').value = '';
      if (local.asrAvailable) {
        $('speech-mode').value = 'mirid-local-kokoro';
        $('speech-url').value = local.miridUrl;
        $('speech-key').value = '';
        $('asr-engine').value = 'parakeet-cpp:tdt_ctc-110m:q4_k';
      }
      if (local.asrAvailable && preserveReadAloud && $('tts-provider').value !== 'realtime') {
        // Before changing the transcription endpoint, retain the effective
        // read-aloud endpoint and credentials when it previously inherited them.
        if (!$('tts-url').value.trim() && inheritedReadAloudUrl) {
          $('tts-url').value = inheritedReadAloudUrl;
          $('tts-key').value = inheritedReadAloudKey;
        }
        if ($('tts-url').value.trim() && !$('tts-mode').value) $('tts-mode').value = priorTtsMode;
      }
    }
    if (local.kokoroUrl || (local.miridUrl && local.asrAvailable && !preserveReadAloud)) {
      $('tts-provider').value = 'standard';
      $('tts-url').value = local.kokoroUrl;
      $('tts-key').value = '';
      $('tts-mode').value = local.kokoroUrl ? 'mirid' : '';
      $('tts-engine').value = 'kokoro';
      for (const { name, field } of voiceFields) {
        if (lockedPublisherVoice && name === publisherVoiceName) { field.value = publisherVoiceEntry.voice; continue; }
        if (!field.value || (field.value === 'alloy' && draftAutoProviderVoices.has(name))) {
          field.value = defaultVoices[name] || 'af_heart';
          draftAutoProviderVoices.delete(name);
          draftManualVoices.delete(name);
        }
      }
    }
    if (local.nanoUrl && !Object.keys(draftChatterboxVoices).length && !$('chatterbox-voice').value && !$('chatterbox-file').files?.length) {
      $('chatterbox-url').value = local.nanoUrl;
      $('chatterbox-engine').value = 'chatterbox_nano';
      $('chatterbox-key').value = '';
    }
    updateSpeechModeFields();
    $('mirid-status').textContent = local.miridUrl
      ? (!local.asrAvailable
        ? (local.kokoroUrl ? 'Local text and separate Kokoro voices selected. Parakeet is unavailable; existing transcription settings are unchanged. Save these settings for this session.'
          : 'Local text selected. Parakeet is unavailable; existing speech settings are unchanged. Save these settings for this session.')
        : local.kokoroUrl ? 'Local text, transcription and separate Kokoro voices selected. Save these settings for this session.'
        : preserveReadAloud ? 'Local text and transcription selected. No Kokoro read-aloud service was started; existing read-aloud settings are unchanged and need a running service. Save these settings for this session.'
        : 'Local text and transcription selected. No Kokoro read-aloud service was started; configure a compatible service for speech. Save these settings for this session.')
      : (local.kokoroUrl ? 'Separate Kokoro voices selected. Text and transcription settings are unchanged. Save these settings for this session.'
        : creatorAudition
          ? 'Local Nano is listed by the launcher. Choose a reference and speaker in Creator voice audition, then save for this session.'
          : 'Local Nano is listed by the launcher. To audition a reference, open the local game with ?voice-creator=1.');
    if (changedOutputParameter) $('mirid-status').textContent += ' Output limit parameter changed to max_tokens for Mirid.';
  } catch (error) {
    if (localSetupRequest === controller) $('mirid-status').textContent = controller.signal.aborted
      ? 'Local launcher settings timed out. Check that the launcher is running.'
      : error.message || 'Could not read local launcher settings.';
  } finally {
    clearTimeout(timeout);
    if (localSetupRequest === controller) { localSetupRequest = null; $('local-launcher-preset').disabled = false; }
  }
});
$('mirid-preset').addEventListener('click', () => {
  cancelLocalSetup();
  try {
    const base = new URL($('mirid-url').value.trim());
    if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
        (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(base.hostname)))) throw new Error('invalid');
    clearModelSuggestions();
    const changedOutputParameter = selectMiridOutputParameter();
    $('endpoint').value = `${base.origin}/v1/chat/completions`;
    $('model').value = 'local';
    $('api-key').value = '';
    $('speech-mode').value = 'mirid';
    $('tts-provider').value = 'standard';
    $('speech-url').value = base.origin;
    $('tts-url').value = '';
    $('tts-key').value = '';
    $('tts-mode').value = '';
    $('speech-key').value = '';
    $('asr-engine').value = 'whisper';
    $('tts-engine').value = 'kokoro';
    for (const { name, field } of voiceFields) {
      if (lockedPublisherVoice && name === publisherVoiceName) { field.value = publisherVoiceEntry.voice; continue; }
      if (!field.value || (field.value === 'alloy' && draftAutoProviderVoices.has(name))) {
        field.value = defaultVoices[name] || 'af_heart';
        draftAutoProviderVoices.delete(name);
        draftManualVoices.delete(name);
      }
    }
    updateSpeechModeFields();
    $('mirid-status').textContent = 'Mirid selected. Load a text model in Mirid, then save these settings.' +
      (changedOutputParameter ? ' Output limit parameter changed to max_tokens for Mirid.' : '');
  } catch { $('mirid-status').textContent = 'Enter an HTTPS Mirid origin, or a localhost HTTP origin, without a path.'; }
});
$('mirid-check').addEventListener('click', async () => {
  cancelLocalSetup();
  const button = $('mirid-check');
  clearModelSuggestions();
  const version = modelDiscoveryVersion;
  const controller = new AbortController();
  modelDiscovery = controller;
  const requestedBase = $('mirid-url').value.trim();
  const requestedEndpoint = $('endpoint').value.trim();
  button.disabled = true;
  $('mirid-status').textContent = 'Checking Mirid…';
  try {
    const result = await discoverMirid({ baseUrl: requestedBase, signal: controller.signal });
    if (version !== modelDiscoveryVersion || $('mirid-url').value.trim() !== requestedBase || $('endpoint').value.trim() !== requestedEndpoint) return;
    let matchesEndpoint = false;
    try { matchesEndpoint = new URL(requestedEndpoint).href === `${result.baseUrl}/v1/chat/completions`; } catch {}
    // The Mirid model list can contain configured hosted providers. Suggest
    // only explicitly local models; provider IDs remain available by manual entry.
    const localModels = result.text.models.filter((model) => model.kind === 'local');
    if (matchesEndpoint) {
      for (const model of localModels) {
        const option = document.createElement('option');
        option.value = model.id;
        option.label = 'Local model';
        $('mirid-model-options').append(option);
      }
    }
    const names = result.text.models.slice(0, 8).map((model) => model.kind === 'provider' ? `${model.id} (configured provider)` : model.kind === 'unknown' ? `${model.id} (source unknown)` : model.id);
    const text = names.length ? `Advertised text models: ${names.join(', ')}.` : 'No text models were advertised.';
    const voice = result.tts.available ? ' Voice engines are advertised.' : ' Voice readiness is unknown or unavailable.';
    const issues = Object.keys(result.errors).length ? ' Some checks failed; verify Mirid is running.' : '';
    const choices = localModels.length && matchesEndpoint ? ' Choose a suggested local model or enter one yourself.' : localModels.length ? ' Select this Mirid endpoint and check again to use local model suggestions.' : '';
    $('mirid-status').textContent = `${text}${voice}${issues}${choices} Advertised models may need to be loaded.`;
  } catch (error) { if (version === modelDiscoveryVersion) $('mirid-status').textContent = error.message || 'Could not check Mirid.'; }
  finally { if (modelDiscovery === controller) modelDiscovery = null; button.disabled = false; }
});

function updateSpeechModeFields() {
  const fixedVoice = ($('tts-mode').value || $('speech-mode').value) === 'mirid-local-kokoro';
  for (const id of ['tts-engine', 'tts-model']) $(id).disabled = fixedVoice;
  for (const { field } of voiceFields) field.disabled = fixedVoice;
}
$('tts-mode').addEventListener('change', () => {
  adaptVoiceFieldsToMode(draftVoiceMode());
  updateSpeechModeFields();
});
$('chatterbox-use').addEventListener('click', () => {
  cancelReferenceUpload();
  try {
    applyChatterboxVoice($('chatterbox-voice').value.trim());
    $('chatterbox-status').textContent = `Voice selected for ${$('chatterbox-target').value}. Save these settings for this session.`;
  } catch (error) { $('chatterbox-status').textContent = error.message; }
});
$('chatterbox-remove').addEventListener('click', () => {
  const wasUploading = Boolean(referenceUpload);
  cancelReferenceUpload();
  const entries = Object.entries(draftChatterboxVoices);
  if (!entries.length) {
    if (!wasUploading) $('chatterbox-status').textContent = 'No reference voice is selected.';
    return;
  }
  for (const [name, old] of entries) {
    const field = voiceFields.find((item) => item.name === name)?.field;
    if (field && field.value === old.voice) {
      field.value = old.previousVoice;
      adaptVoiceFieldToMode(name, field, draftVoiceMode());
    }
  }
  draftChatterboxVoices = {};
  $('chatterbox-status').textContent = wasUploading
    ? 'Upload stopped and reference voice removed. Save these settings for this session. The service may already have saved the recording.'
    : 'Reference voice removed. Save these settings for this session. Any uploaded recording remains on the service.';
});
$('chatterbox-upload').addEventListener('click', async () => {
  cancelReferenceUpload();
  const file = $('chatterbox-file').files?.[0];
  const controller = new AbortController();
  const version = referenceUploadVersion;
  const destination = $('chatterbox-url').value.trim();
  const key = $('chatterbox-key').value.trim();
  const engine = $('chatterbox-engine').value;
  const target = $('chatterbox-target').value;
  referenceUpload = controller;
  $('chatterbox-upload').disabled = true;
  $('chatterbox-status').textContent = 'Uploading the selected recording to the speech service…';
  try {
    const id = await uploadMiridVoiceReference({ baseUrl: destination, apiKey: key, audio: file, mode: 'mirid', signal: controller.signal });
    if (version !== referenceUploadVersion) return;
    stopVoicePreview();
    $('chatterbox-voice').value = id;
    // Only apply the returned reference to the selected service and engine.
    if (destination !== $('chatterbox-url').value.trim() || key !== $('chatterbox-key').value.trim() || engine !== $('chatterbox-engine').value || target !== $('chatterbox-target').value) {
      $('chatterbox-status').textContent = 'Reference uploaded. The speech settings changed; review them before using this voice.';
      return;
    }
    applyChatterboxVoice(id);
    $('chatterbox-status').textContent = `Reference uploaded and selected for ${target}. Save these settings for this session.`;
  } catch (error) {
    if (version === referenceUploadVersion) $('chatterbox-status').textContent = error.message;
  } finally {
    if (version === referenceUploadVersion) { referenceUpload = null; $('chatterbox-upload').disabled = false; }
  }
});
for (const id of ['chatterbox-url', 'chatterbox-key', 'chatterbox-engine', 'chatterbox-target', 'chatterbox-file']) {
  $(id).addEventListener('change', () => {
    if (referenceUpload) { cancelReferenceUpload(); $('chatterbox-status').textContent = 'Upload stopped because the settings changed; the service may already have saved the recording.'; }
  });
}
// Do not overwrite a reference ID the player starts entering while an older
// upload is still in flight. Cancel on input rather than waiting for blur.
$('chatterbox-voice').addEventListener('input', () => {
  if (referenceUpload) { cancelReferenceUpload(); $('chatterbox-status').textContent = 'Upload stopped because the reference changed; the service may already have saved the recording.'; }
});
settingsDialog.addEventListener('cancel', () => { cancelLocalSetup(); cancelReferenceUpload(); stopVoicePreview(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { cancelLocalSetup(); if (referenceUpload) cancelReferenceUpload(); stopVoicePreview(); } });
function adaptVoiceFieldToMode(name, field, mode) {
  if (lockedPublisherVoice && name === publisherVoiceName) { field.value = publisherVoiceEntry.voice; return; }
  const localDefault = defaultVoices[name] || 'af_heart';
  if (!field.value || (mode === 'openai' && field.value === localDefault && !draftManualVoices.has(name)) ||
      (mode !== 'openai' && field.value === 'alloy' && draftAutoProviderVoices.has(name))) {
    field.value = mode === 'openai' ? 'alloy' : localDefault;
    draftManualVoices.delete(name);
    if (mode === 'openai') draftAutoProviderVoices.add(name);
    else draftAutoProviderVoices.delete(name);
  }
}
function draftVoiceMode() {
  const mode = $('tts-mode').value || $('speech-mode').value;
  return mode === 'openai' && isCompanionSpeechUrl($('speech-url').value, $('tts-url').value, draftCompanionVoiceOrigin) ? 'mirid' : mode;
}
function adaptVoiceFieldsToMode(mode) {
  for (const { name, field } of voiceFields) adaptVoiceFieldToMode(name, field, mode);
}
// A companion and a generic OpenAI-compatible service share a protocol but
// accept different automatic voice IDs. Switching only the effective endpoint
// must therefore update automatic voices as well; manual and reference IDs
// remain untouched by the same adaptation used for protocol changes.
for (const id of ['speech-url', 'tts-url']) {
  $(id).addEventListener('change', () => adaptVoiceFieldsToMode(draftVoiceMode()));
}
$('speech-mode').addEventListener('change', () => {
  const mode = $('speech-mode').value;
  if (mode === 'mirid-local-kokoro' && $('asr-engine').value === 'whisper') $('asr-engine').value = 'parakeet-cpp:tdt_ctc-110m:q4_k';
  if (mode === 'mirid' && $('asr-engine').value === 'parakeet-cpp:tdt_ctc-110m:q4_k') $('asr-engine').value = 'whisper';
  // A separate read-aloud service chooses its own voice protocol. Changing
  // the transcription service must not replace those voice IDs.
  if (!$('tts-mode').value) adaptVoiceFieldsToMode(draftVoiceMode());
  updateSpeechModeFields();
});

$('companion-preset').addEventListener('click', () => {
  cancelLocalSetup();
  try {
    const address = new URL($('companion-url').value.trim());
    const token = $('companion-token').value;
    if (address.protocol !== 'https:' || address.username || address.password || address.search || address.hash || address.pathname !== '/') throw new Error('address');
    if (!/^[\x21-\x7e]{32,512}$/.test(token)) throw new Error('token');
    clearModelSuggestions();
    const changedOutputParameter = selectMiridOutputParameter();
    $('endpoint').value = `${address.origin}/v1/chat/completions`;
    $('model').value = 'local';
    $('api-key').value = token;
    $('speech-mode').value = 'openai';
    $('speech-url').value = address.origin;
    $('tts-url').value = '';
    $('tts-key').value = '';
    $('tts-mode').value = '';
    $('speech-key').value = token;
    $('realtime-url').value = address.origin;
    $('realtime-token').value = token;
    $('asr-model').value = 'whisper-1';
    $('tts-model').value = 'tts-1';
    draftCompanionVoiceOrigin = address.origin;
    for (const { name, field } of voiceFields) {
      if (lockedPublisherVoice && name === publisherVoiceName) { field.value = publisherVoiceEntry.voice; continue; }
      // The companion can now route the seven distinct local Kokoro voices;
      // its legacy fixed-voice backend ignores this field. Keep custom values.
      if (!field.value.trim() || (field.value.trim() === 'alloy' && draftAutoProviderVoices.has(name))) {
        field.value = defaultVoices[name] || 'af_heart';
        draftAutoProviderVoices.delete(name);
        draftManualVoices.delete(name);
      }
    }
    $('companion-token').value = '';
    updateSpeechModeFields();
    const supportedVoices = new Set(Object.values(defaultVoices));
    const unsupported = voiceFields.some(({ name, field }) =>
      draftChatterboxVoices[name]?.voice !== field.value.trim() && !supportedVoices.has(field.value.trim()));
    $('companion-status').textContent = 'Companion selected. Choose your Mirid model, then save these settings.' +
      (changedOutputParameter ? ' Output limit parameter changed to max_tokens for Mirid.' : '') +
      (unsupported ? ' Some selected voices are not supported by the companion’s multi-voice Kokoro service. Supported IDs: af_heart, af_sarah, af_nicole, am_adam, af_bella, bm_george and bf_emma.' : '');
  } catch (error) {
    $('companion-status').textContent = error.message === 'token' ? 'Enter the companion pairing token.' : 'Enter the companion HTTPS address without a path.';
  }
});

$('sound-toggle').addEventListener('click', async () => {
  const button = $('sound-toggle');
  if (storySound.isEnabled()) {
    storySound.disable(); rememberSound(false); button.setAttribute('aria-pressed', 'false'); button.textContent = 'Sound off'; return;
  }
  rememberSound(true);
  await enableStorySound(true);
});
document.addEventListener('visibilitychange', () => {
  const visible = document.visibilityState !== 'hidden';
  if (!visible) cancelAutoAdvance();
  if (!visible) { scheduledSpeechVersion++; if (voiceUI.cancel()) setVoiceStatus('Voice stopped while the game was in the background.'); stopVoicePreview(); }
  if (!storySound.setVisible(visible)) {
    $('sound-toggle').setAttribute('aria-pressed', 'false');
    $('sound-toggle').textContent = 'Sound off';
    saveNotice('Story sounds could not resume.');
  }
});
globalThis.addEventListener?.('pagehide', () => {
  cancelAutoAdvance();
  storySound.dispose(); voiceUI.cancel(); stopVoicePreview(); setAutoRead(false);
  $('sound-toggle').setAttribute('aria-pressed', 'false'); $('sound-toggle').textContent = 'Sound off';
});
