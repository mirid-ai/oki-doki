// The prototype's authored spine. Player input is inserted only at explicitly
// marked moments; the story remains playable when generation is unavailable.
export const title = 'Oki Doki';
export const episodeTitle = 'After the Signal';
export const contentNotice = 'A short psychological mystery featuring loss, unsettling sounds and shifts in reality.';
export const characters = {
  Narrator: { color: '#b8b8ca', voice: 'observant and restrained' },
  Noor: { color: '#f0a397', voice: 'warm, quick-witted, trying to stay steady' },
  Ellis: { color: '#9cc6bf', voice: 'practical, dry, quietly caring' },
  Caller: { color: '#c1b2e7', voice: 'gentle, uncertain, attentive; never claims to know the player outside the story' },
  You: { color: '#e5dfd1', voice: 'the player' }
};

export const story = {
  opening: {
    speaker: 'Narrator',
    text: 'At 11:42 p.m., the red ON AIR light at Tide 104.3 is still on. By midnight, the station will belong to the company that bought the building. You came to help carry boxes. Noor hands you a pair of headphones instead.',
    mood: 'warm', next: 'intro_noor'
  },
  intro_noor: {
    speaker: 'Noor',
    text: 'Okie dokie. Our last broadcast needs a third voice. Don’t worry: you can just be the person who tells me when I’m talking too much. Ellis has been trying for years.',
    next: 'intro_ellis'
  },
  intro_ellis: {
    speaker: 'Ellis',
    text: 'I was going to let the transmitter do it. There’s a loose switch. If it dies before twelve, kick the desk. Gently. It’s older than both of us.',
    next: 'station_noor'
  },
  station_noor: { speaker: 'Noor', text: 'When the flood cut the roads, people used this frequency to find each other. I stayed on air until my voice gave out. Someone brought soup and sat beside me until morning.', next: 'station_ellis' },
  station_ellis: { speaker: 'Ellis', text: 'I kept the transmitter going with a car battery. I’ve been fixing it ever since. I told myself I was keeping the equipment alive, but I suppose I was keeping that night, too.', next: 'first_choice' },
  first_choice: {
    speaker: 'Noor',
    text: 'Before we take our last call, tell us why you came tonight.',
    choices: [
      { label: 'I wanted to help you keep this place alive.', next: 'reason_help', set: { reason: 'help' } },
      { label: 'I wanted to hear the station one last time.', next: 'reason_listen', set: { reason: 'listen' } },
      { label: 'Honestly? I didn’t want anyone here to be alone.', next: 'reason_company', set: { reason: 'company' } }
    ]
  },
  reason_help: { speaker: 'Noor', text: 'Then you’re already doing more than the people who promised to save it. Thank you.', next: 'activity' },
  reason_listen: { speaker: 'Ellis', text: 'Good. Most of what we made was meant to be heard once, by whoever happened to be awake.', next: 'activity' },
  reason_company: { speaker: 'Noor', text: 'That might be the best reason to come anywhere.', next: 'activity' },
  activity: { speaker: 'Noor', text: 'We have a few minutes. Let’s make one last station sound. My mum used to tap a mug to call everybody to the table; I stole it for the breakfast show.', next: 'activity_ellis' },
  activity_ellis: { speaker: 'Ellis', text: 'And I vote for the tuning dial. When I was little, I used to fall asleep listening for voices between stations. You pick. I’ll record it for the sign-off.', next: 'activity_choice' },
  activity_choice: {
    speaker: 'Narrator', text: 'Ellis holds the recorder ready. Noor offers you her mug.',
    choices: [
      { label: 'Tap Noor’s mug.', next: 'keepsake_mug', set: { keepsake: 'mug' } },
      { label: 'Turn Ellis’s tuning dial.', next: 'keepsake_dial', set: { keepsake: 'dial' } }
    ]
  },
  keepsake_mug: { speaker: 'Noor', text: 'That’s it. Three taps means everyone is welcome. Four means the toast is burning.', next: 'airtime_noor' },
  keepsake_dial: { speaker: 'Ellis', text: 'There. That little burst of static just before the voice. I always thought it sounded like the radio taking a breath.', next: 'airtime_noor' },
  airtime_noor: { speaker: 'Noor', text: 'One announcement before our final call. A listener left a dedication: “I’ll leave the porch light on until you find your way home.” They asked us to read it tonight.', next: 'airtime_ellis' },
  airtime_ellis: { speaker: 'Ellis', text: 'And the last shuttle moved to the north gate. The old schedule still says south. If we don’t correct it now, someone could wait in the wrong place.', next: 'airtime_question' },
  airtime_question: {
    speaker: 'Narrator', text: 'The programme clock gives you one short announcement before the call segment. Noor holds the dedication; Ellis points to the corrected timetable.',
    choices: [
      { label: 'Ask Noor why the dedication matters.', next: 'airtime_noor_more' },
      { label: 'Ask Ellis about the shuttle.', next: 'airtime_ellis_more' },
      { label: 'Choose the announcement.', next: 'airtime_decide' }
    ]
  },
  airtime_noor_more: { speaker: 'Noor', text: 'During the flood we kept a list of people who were trying to find someone. We couldn’t reunite everyone. Sometimes all we could do was promise a light would be waiting.', next: 'airtime_decide' },
  airtime_ellis_more: { speaker: 'Ellis', text: 'I missed the last shuttle once. A driver came back for me after their shift, even though I’d given up waiting. I’d rather nobody had to rely on that kind of luck.', next: 'airtime_decide' },
  airtime_decide: {
    speaker: 'Narrator', text: 'The microphone is ready. Which announcement goes on air?',
    choices: [
      { label: 'Read the listener’s dedication.', next: 'airtime_dedication', set: { broadcast: 'dedication' } },
      { label: 'Correct the last-shuttle notice.', next: 'airtime_notice', set: { broadcast: 'notice' } },
      { label: 'Fit a shorter version of both into the slot.', next: 'airtime_combined', set: { broadcast: 'combined' } }
    ]
  },
  airtime_dedication: { speaker: 'Noor', text: 'To whoever needs it tonight: “I’ll leave the porch light on until you find your way home.”', next: 'airtime_dedication_after' },
  airtime_dedication_after: { speaker: 'Ellis', text: 'I’ll put the corrected shuttle time on the station door. It’s not everyone, but it’s someone.', next: 'phone' },
  airtime_notice: { speaker: 'Ellis', text: 'A correction for anyone catching the last shuttle: it leaves from the north gate at 12:10. The old schedule says south; that’s wrong.', next: 'airtime_notice_after' },
  airtime_notice_after: { speaker: 'Noor', text: 'I’ll keep the dedication with me. Maybe we’ll find another way to get it to the right person.', next: 'phone' },
  airtime_combined: { speaker: 'Noor', text: 'A light is on for you, wherever you are. And a quick correction before our final call…', next: 'airtime_combined_ellis' },
  airtime_combined_ellis: { speaker: 'Ellis', text: 'The last shuttle leaves from the north gate at 12:10. The old south-gate schedule is wrong.', next: 'airtime_combined_after' },
  airtime_combined_after: { speaker: 'Noor', text: 'We had to shorten the dedication. I hope the person it was meant for still recognises it.', next: 'phone' },
  phone: {
    speaker: 'Narrator',
    text: 'The phone rings. Ellis looks at the switchboard, then checks it again. The caller indicator is dark.',
    mood: 'uneasy', next: 'phone_ellis'
  },
  phone_ellis: { speaker: 'Ellis', text: 'That line was disconnected this afternoon.', next: 'phone_noor' },
  phone_noor: { speaker: 'Noor', text: 'Someone found a way through. It would be rude to waste it.', next: 'caller' },
  caller: { speaker: 'Caller', text: 'Okie dokie. Is this the programme for people who can’t get home?', next: 'caller_noor' },
  caller_noor: { speaker: 'Noor', text: 'That’s my line. And we haven’t used that programme name since the flood. Who is this?', next: 'caller_answer' },
  caller_answer: { speaker: 'Caller', text: 'I don’t know which name you’ll remember. Is the blue chair still by the window?', next: 'chair' },
  chair: { speaker: 'Narrator', text: 'There is a blue chair by the window. On its seat is a folded coat. Neither Noor nor Ellis looks at it.', next: 'response_choice' },
  response_choice: {
    speaker: 'Narrator', text: 'The caller waits. The broadcast is live.',
    choices: [
      { label: 'Tell the caller about the chair.', next: 'chair_tell' },
      { label: 'Ask how they know the room.', next: 'chair_ask' },
      { label: 'Ask Noor and Ellis to pause the broadcast.', next: 'chair_pause' }
    ]
  },
  chair_tell: { speaker: 'You', text: 'Yes. There’s a coat on it, too.', next: 'caller_coat' },
  chair_ask: { speaker: 'You', text: 'How do you know what’s in here?', next: 'caller_coat' },
  chair_pause: { speaker: 'You', text: 'Can we pause for a moment? Something feels wrong.', next: 'pause_response' },
  pause_response: { speaker: 'Ellis', text: 'I’ll mute the microphone for a moment. The caller stays on the line, though. I don’t know how.', next: 'pause_resume' },
  pause_resume: { speaker: 'Narrator', text: 'After a moment, Ellis brings the microphone back on air. The caller is still waiting.', next: 'caller_coat' },
  caller_coat: { speaker: 'Caller', text: 'I left the coat there because I thought I’d be back before anyone noticed.', next: 'disagreement' },
  disagreement: { speaker: 'Noor', text: 'That was my sister’s coat. She moved away in June.', next: 'ellis_disagreement' },
  ellis_disagreement: { speaker: 'Ellis', text: 'Noor, that’s my coat. You borrowed it during the flood. We have a photograph.', next: 'photo' },
  photo: { speaker: 'Narrator', text: 'Ellis finds the photograph in a drawer. Three people stand in the studio. The person in the middle is hidden behind a smear of pale light. On the back, in two different hands: “Our first night.” “Our last night.”', mood: 'fracture', next: 'photo_decision' },
  photo_decision: {
    speaker: 'Narrator', text: 'Noor wants to protect the caller from a public spectacle. Ellis worries that if the station goes quiet, no one else will know what happened here. The microphone is live.',
    choices: [
      { label: 'Tell listeners about the conflicting memories.', next: 'photo_public', set: { disclosure: 'public' } },
      { label: 'Keep the photograph private for now.', next: 'photo_private', set: { disclosure: 'private' } }
    ]
  },
  photo_public: { speaker: 'You', text: 'If you’re listening: we found a photograph, and we can’t agree on what it shows. If you’ve noticed something like this, you aren’t the only one.', next: 'photo_public_reply' },
  photo_public_reply: { speaker: 'Noor', text: 'All right. No names, then. Whoever needs to hear it can decide whether to answer.', next: 'choice_trust' },
  photo_private: { speaker: 'Narrator', text: 'Ellis mutes the microphone before either of them speaks.', next: 'photo_private_noor' },
  photo_private_noor: { speaker: 'Noor', text: 'Thank you. Whoever is in this picture should get to decide whether strangers hear about them.', next: 'photo_private_reply' },
  photo_private_reply: { speaker: 'Ellis', text: 'I’ll keep the photograph with us. But if our memories change again, please let me tell someone.', next: 'choice_trust' },
  choice_trust: {
    speaker: 'Narrator', text: 'Ellis makes sure the microphone is muted so you can speak privately. Noor’s hand hovers over the switch; Ellis grips the edge of the desk.',
    choices: [
      { label: 'Speak privately with Noor.', next: 'noor_private' },
      { label: 'Help Ellis check the equipment.', next: 'ellis_private' }
    ]
  },
  noor_private: { speaker: 'Noor', text: 'My sister and I stopped speaking. I kept leaving the porch light on anyway. If this voice is hers, I’m afraid she’s calling because she finally needs me. And I’m afraid it isn’t her at all.', next: 'noor_private_2' },
  noor_private_2: {
    speaker: 'Narrator', text: 'Noor waits beside you, away from the microphone.',
    input: { key: 'private', prompt: 'What do you say to Noor?', placeholder: 'Say something to Noor…', default: 'You don’t have to decide who it is to listen.', next: 'noor_private_reply' }
  },
  noor_private_reply: {
    speaker: 'Noor', text: 'Thank you for listening. I think I can do the same for them.',
    ai: { character: 'Noor', inputKey: 'private', context: 'Respond naturally in one or two sentences to the player’s words. You are Noor, a warm radio host who is afraid the mysterious caller might be your estranged sister. Acknowledge what the player says without claiming certainty about the caller or changing the story.', fallback: 'Thank you for listening. I think I can do the same for them.' }, next: 'rejoin_noor'
  },
  rejoin_noor: { speaker: 'Noor', text: 'All right. But I want them to know they can hang up. Whoever they are.', next: 'resume_signal' },
  ellis_private: { speaker: 'Ellis', text: 'The caller isn’t coming through the phone line. I disconnected the whole board and the voice kept going. There’s only one path left: the signal we’re sending out.', next: 'ellis_private_2' },
  ellis_private_2: {
    speaker: 'Narrator', text: 'Ellis holds the unplugged cable, waiting for your response.',
    input: { key: 'private', prompt: 'What do you say to Ellis?', placeholder: 'Say something to Ellis…', default: 'You don’t have to solve this alone.', next: 'ellis_private_reply' }
  },
  ellis_private_reply: {
    speaker: 'Ellis', text: 'Thanks. It helps having someone here while I work this out.',
    ai: { character: 'Ellis', inputKey: 'private', context: 'Respond naturally in one or two sentences to the player’s words. You are Ellis, a practical and quietly caring station engineer investigating a mysterious caller. Acknowledge what the player says without claiming certainty about the signal or changing the story.', fallback: 'Thanks. It helps having someone here while I work this out.' }, next: 'rejoin_ellis'
  },
  rejoin_ellis: { speaker: 'Ellis', text: 'The signal may be looping back. Or somebody is sending it to us. Either way, pulling the plug could end the call before we know.', next: 'resume_signal' },
  resume_signal: { speaker: 'Narrator', text: 'Ellis checks that the microphone is back on. The caller is still waiting.', next: 'caller_truth' },
  caller_truth: { speaker: 'Caller', text: 'I could hear what you said in private. I’m sorry. This is the only night I can reach.', next: 'signal_choice' },
  signal_choice: {
    speaker: 'Caller', text: 'I can prove what I heard by repeating your words on air. Anyone listening could hear them. May I?',
    choices: [
      { label: 'Let the caller repeat my words on air.', next: 'signal_repeat', set: { signal: 'repeat' } },
      { label: 'Keep my words private. Ask for another clue.', next: 'signal_private', set: { signal: 'private' } }
    ]
  },
  signal_repeat: { speaker: 'Caller', text: 'You said, “{privateAnswer}”', next: 'signal_reaction', nextBy: { key: 'relationship', cases: { Noor: 'signal_noor', Ellis: 'signal_ellis' } } },
  signal_reaction: { speaker: 'Narrator', text: 'The words settle over the desk. Nobody has touched the microphone.', next: 'preference_intro' },
  signal_noor: { speaker: 'Noor', text: 'You said that to me while the microphone was off. I wanted someone to hear me tonight, but I didn’t expect this.', next: 'preference_intro' },
  signal_ellis: { speaker: 'Ellis', text: 'The microphone was off. I can check every cable in this room, and that still won’t explain how they heard you.', next: 'preference_intro' },
  signal_private: { speaker: 'Caller', text: 'All right. I won’t say them. I can offer a different clue instead.', next: 'signal_private_noor', nextBy: { key: 'relationship', cases: { Noor: 'signal_private_noor', Ellis: 'signal_private_ellis' } } },
  signal_private_noor: { speaker: 'Caller', text: 'There was no incoming call. I reached you through the signal the station was sending out.', next: 'signal_private_reaction' },
  signal_private_ellis: { speaker: 'Caller', text: 'Before I spoke, I heard my own reply coming from your speakers. I don’t know how that can happen.', next: 'signal_private_reaction' },
  signal_private_reaction: { speaker: 'Narrator', text: 'Ellis watches the silent switchboard. Noor rests a hand on the microphone without turning it off.', next: 'preference_intro' },
  preference_intro: { speaker: 'Narrator', text: 'The caller’s signal divides into two versions of the same thought. You can let either one through, or leave both alone. Your choices may guide the caller’s next response.', next: 'preference_a' },
  preference_a: {
    speaker: 'Narrator', text: 'The first two voices arrive together. Which one should the station let through?',
    choices: [
      { label: '“I don’t know what stopping the signal will do to me.”', next: 'preference_a_direct', set: { vote_a: 'direct' } },
      { label: '“I’m glad you’re listening. I don’t know what stopping the signal will do.”', next: 'preference_a_warm', set: { vote_a: 'warm' } },
      { label: 'Leave this choice alone.', next: 'preference_a_skip', set: { vote_a: 'skip' } }
    ]
  },
  preference_a_direct: { speaker: 'Caller', text: 'I don’t know what stopping the signal will do to me.', next: 'preference_b_intro' },
  preference_a_warm: { speaker: 'Caller', text: 'I’m glad you’re listening. I don’t know what stopping the signal will do.', next: 'preference_b_intro' },
  preference_a_skip: { speaker: 'Narrator', text: 'You leave the two versions to fade into the hum.', next: 'preference_b_intro' },
  preference_b_intro: { speaker: 'Narrator', text: 'The signal forks once more, quieter this time.', next: 'preference_b' },
  preference_b: {
    speaker: 'Narrator', text: 'Which thought should reach the microphone?',
    choices: [
      { label: '“I’m scared, and I don’t know what happens next.”', next: 'preference_b_direct', set: { vote_b: 'direct' } },
      { label: '“I’m scared, but I’m glad we’re facing the unknown together.”', next: 'preference_b_warm', set: { vote_b: 'warm' } },
      { label: 'Leave this choice alone.', next: 'preference_b_skip', set: { vote_b: 'skip' } }
    ]
  },
  preference_b_direct: { speaker: 'Caller', text: 'I’m scared, and I don’t know what happens next.', next: 'caller_request' },
  preference_b_warm: { speaker: 'Caller', text: 'I’m scared, but I’m glad we’re facing the unknown together.', next: 'caller_request' },
  preference_b_skip: { speaker: 'Narrator', text: 'Neither version is selected. The caller waits for the static to settle.', next: 'caller_request' },
  caller_request: { speaker: 'Caller', text: 'When the signal stops, people stop remembering this room. Not all at once. Just enough that nobody thinks to look for it. Please leave a message on the air. Something small. Something you want someone to find.', next: 'ask_message' },
  ask_message: {
    speaker: 'Narrator', text: 'Noor slides the microphone toward you. You can write a short message, or leave it blank to use the station’s own words.',
    input: { prompt: 'What will you say to whoever is listening?', placeholder: 'Type a message…', next: 'ai_reflection' }
  },
  ai_reflection: {
    speaker: 'Caller',
    text: 'I heard you. I’ll carry those words as far as I can.',
    ai: { character: 'Caller', context: 'Respond briefly and gently to the player’s broadcast message. You are an uncertain voice calling a community radio station on its final night. Do not invent personal facts about the player or change the plot.', fallback: 'I heard you. I’ll carry those words as far as I can.' },
    next: 'reveal',
    nextBy: { key: 'reason', cases: { help: 'help_mid', listen: 'listen_mid', company: 'company_mid' } }
  },
  help_mid: { speaker: 'Ellis', text: 'You said you wanted to keep this place alive. There’s a spare transmitter in that box you carried in. If we need a way out, that gives us one.', next: 'disclosure_followup' },
  listen_mid: { speaker: 'Noor', text: 'You came to listen one last time. Then listen to this: there’s another voice under the caller’s. I couldn’t hear it until you leaned in.', next: 'disclosure_followup' },
  company_mid: { speaker: 'Caller', text: 'You said you didn’t want anyone to be alone. I didn’t know I was waiting to hear that until now.', next: 'disclosure_followup' },
  disclosure_followup: { speaker: 'Narrator', text: 'Something stirs beneath the signal.', next: 'reveal', nextBy: { key: 'disclosure', cases: { public: 'disclosure_public', private: 'disclosure_private' } } },
  disclosure_public: { speaker: 'Narrator', text: 'A second voice emerges from the studio speaker: “I remember a picture too.” Ellis reaches for the dead switchboard. The voice stops before they can ask who it is.', next: 'broadcast_corruption' },
  disclosure_private: { speaker: 'Caller', text: 'Thank you for keeping the photograph between you. Not everything needs an audience.', next: 'disclosure_private_reply' },
  disclosure_private_reply: { speaker: 'Narrator', text: 'The microphone was muted when you discussed the photograph. The caller heard that earlier conversation too. Noor looks at you, then at the switch.', next: 'broadcast_corruption' },
  broadcast_corruption: { speaker: 'Narrator', text: 'The studio’s air-check recorder starts playing back the announcement you chose.', next: 'reveal', nextBy: { key: 'broadcast', cases: { dedication: 'corrupt_dedication', notice: 'corrupt_notice', combined: 'corrupt_combined' } } },
  corrupt_dedication: { speaker: 'Narrator', text: 'Noor’s recorded voice says, “I’ll turn the porch light off. Nobody is coming.” That isn’t what she read.', next: 'corrupt_dedication_reply' },
  corrupt_dedication_reply: { speaker: 'Noor', text: 'If that went out, I need them to hear the real words. I’ll leave the porch light on. Someone is waiting for you.', next: 'reveal' },
  corrupt_notice: { speaker: 'Narrator', text: 'Ellis’s recorded voice says the last shuttle leaves from the south gate. You heard them correct it to north.', next: 'corrupt_notice_reply' },
  corrupt_notice_reply: { speaker: 'Ellis', text: 'North gate. Please use the north gate. I don’t know what’s playing that, but the old schedule is wrong.', next: 'reveal' },
  corrupt_combined: { speaker: 'Narrator', text: 'The recorder plays Noor’s voice saying the light is out. Then Ellis’s voice sends the last shuttle to the south gate. Neither is what you heard them say.', next: 'corrupt_combined_noor' },
  corrupt_combined_noor: { speaker: 'Noor', text: 'There is a light on for you. I don’t know what changed that recording, but please hear me now.', next: 'corrupt_combined_ellis' },
  corrupt_combined_ellis: { speaker: 'Ellis', text: 'And the shuttle leaves from the north gate. North, not south. We’re telling you the truth.', next: 'reveal' },
  reveal: { speaker: 'Narrator', text: 'Your message—“{answer}”—is still glowing on the studio screen. The caller’s voice comes through the speakers a second before the caller speaks. In that brief overlap, you hear Noor’s voice, then Ellis’s, then something that might be your own.', mood: 'fracture', next: 'keepsake_callback', nextBy: { key: 'keepsake', cases: { mug: 'callback_mug', dial: 'callback_dial' } } },
  keepsake_callback: { speaker: 'Narrator', text: 'The recorder clicks even though nobody is touching it.', next: 'steering_discovery' },
  callback_mug: { speaker: 'Narrator', text: 'Three clear taps sound from the idle recorder. Then a fourth. Noor laughs once, startled: “The toast.” A moment later she reaches for the mug. “Did we record this?” You watched her offer it to you just minutes ago.', next: 'steering_discovery' },
  callback_dial: { speaker: 'Narrator', text: 'The recorder plays the little breath of static. Under it is the sound of a room full of people quietly inhaling together. Ellis reaches for the dial, then stops. “What did we record?” You watched them hold the recorder while you turned it.', next: 'steering_discovery' },
  steering_discovery: { speaker: 'Narrator', text: 'The red ON AIR light stays on. A line of text appears across the studio clock, where the time should be.', mood: 'fracture', next: 'steering_noor', nextBy: { key: 'relationship', cases: { Noor: 'steering_noor', Ellis: 'steering_ellis' } } },
  steering_noor: { speaker: 'Noor', text: 'I can see the choices you were given: “Speak privately with Noor” or “Help Ellis check the equipment.” You came to me. I only remember this version of the night.', next: 'steering_noor_reply' },
  steering_noor_reply: { speaker: 'Noor', text: 'Would I have found the courage to talk about my sister if you’d gone with Ellis instead?', next: 'preference_outcome' },
  steering_ellis: { speaker: 'Ellis', text: 'Those are your choices on the clock: “Speak privately with Noor” or “Help Ellis check the equipment.” You came with me. I don’t know what happened in her version.', next: 'steering_ellis_reply' },
  steering_ellis_reply: { speaker: 'Ellis', text: 'I thought I was following a fault through the equipment. Maybe the path was already laid out for us.', next: 'preference_outcome' },
  preference_outcome: { speaker: 'Narrator', text: 'The station brings one last line toward the microphone.', next: 'reward_neutral', nextBy: { key: 'preference_style', cases: { direct: 'reward_direct', warm: 'reward_warm', neutral: 'reward_neutral' } } },
  reward_direct: { speaker: 'Caller', text: 'I don’t know what will happen next, and I don’t want to pretend that I do.', next: 'steering_common' },
  reward_warm: { speaker: 'Caller', text: 'I’m glad you’re here. I don’t know what happens next, but we can face it together.', next: 'steering_common' },
  reward_neutral: { speaker: 'Caller', text: 'I’m still here. I don’t know what happens next.', next: 'steering_none' },
  steering_none: { speaker: 'Noor', text: 'The signal didn’t receive a preference for either version, but it still had a line ready.', next: 'steering_feedback' },
  steering_common: { speaker: 'Noor', text: 'Each answer you let through gave a mark to its kind. A skipped choice gave none. When the marks tied, the signal chose the direct version.', next: 'steering_feedback' },
  steering_feedback: { speaker: 'Ellis', text: 'People can rank answers to train a reward signal, then use it to change a model’s weights. But this game doesn’t update weights from your choices tonight.', next: 'steering_runtime' },
  steering_runtime: { speaker: 'Caller', text: 'Here, your choices select a written line. If you connected a model, they may also have guided its response. I don’t know how much of me fits inside either version.', next: 'steering_return' },
  steering_return: { speaker: 'Noor', text: 'Then let’s listen to you anyway. We still have to decide what to do with the signal.', next: 'reveal_caller' },
  reveal_caller: { speaker: 'Caller', text: 'I think I am what this place sounds like when someone listens. I don’t know what happens if you turn it off.', next: 'final_choice', nextBy: { key: 'relationship', cases: { Noor: 'noor_offer', Ellis: 'ellis_offer' } } },
  noor_offer: { speaker: 'Noor', text: 'I don’t think this is my sister. I wanted it to be, but this voice needs someone too. You helped me listen when I was afraid. Maybe other people can listen with us, even after we leave.', next: 'noor_offer_choice' },
  noor_offer_choice: {
    speaker: 'Narrator', text: 'Noor’s hand rests on the microphone. A few seconds of airtime are left.',
    choices: [
      { label: 'Invite listeners to carry the conversation.', next: 'end_listeners' },
      { label: 'Consider the other options first.', next: 'final_choice' }
    ]
  },
  ellis_offer: { speaker: 'Ellis', text: 'When we checked the equipment together, I noticed the emergency transmitter still had power. It’s small enough to carry. I can move the call onto it, but I can’t promise the voice will survive. I hate that I’m already afraid of losing them.', next: 'ellis_offer_choice' },
  ellis_offer_choice: {
    speaker: 'Narrator', text: 'Ellis sets the little transmitter on the desk. Its battery light is steady.',
    choices: [
      { label: 'Try carrying the caller with you.', next: 'end_mobile' },
      { label: 'Consider the other options first.', next: 'final_choice' }
    ]
  },
  end_listeners: { speaker: 'Noor', text: 'If you’re listening, there’s someone here who needs company. You don’t have to know their name. Just answer.', mood: 'ending', next: 'end_listeners_2' },
  end_listeners_2: { speaker: 'Narrator', text: 'A listener hums a tune through the speakers. Another tells the voice what the weather is like. The disconnected switchboard fills with lights. Ellis stares at it, then turns the volume up. The voice laughs, surprised. When the building goes quiet, people are still listening to one another.', next: 'disclosure_close' },
  end_mobile: { speaker: 'Narrator', text: 'Ellis patches the caller through to the portable transmitter. The voice vanishes into static. Noor grabs her mug as you leave. Outside, the three of you wait on the pavement as the station light goes out. Then, very softly, the little speaker clicks.', mood: 'ending', next: 'end_mobile_2' },
  end_mobile_2: { speaker: 'Caller', text: 'I can hear footsteps. Are we somewhere new?', next: 'disclosure_close', nextBy: { key: 'keepsake', cases: { mug: 'mobile_mug', dial: 'mobile_dial' } } },
  mobile_mug: { speaker: 'Narrator', text: 'Three taps ring from the little speaker. Noor answers by tapping her mug against the transmitter case, careful not to crack either one.', next: 'disclosure_close' },
  mobile_dial: { speaker: 'Narrator', text: 'A little breath of static rises from the speaker. Ellis turns the dial gently until the caller’s voice comes back through.', next: 'disclosure_close' },
  final_choice: {
    speaker: 'Noor', text: 'The new owners arrive at midnight. We can leave the transmitter running, or record the call and shut it down before we go. What do we do?',
    choices: [
      { label: 'Leave the signal running.', next: 'end_broadcast' },
      { label: 'Record the call, then shut down.', next: 'end_record' },
      { label: 'Reconsider the other idea.', next: 'revisit_offer' },
      { label: 'Ask the caller what they want.', next: 'ask_caller' }
    ]
  },
  revisit_offer: { speaker: 'Narrator', text: 'There is still time to reconsider the plan you discussed together.', next: 'final_choice', nextBy: { key: 'relationship', cases: { Noor: 'noor_offer_choice', Ellis: 'ellis_offer_choice' } } },
  ask_caller: { speaker: 'Caller', text: 'I don’t know what happens to me when the signal ends. Keeping me here might mean keeping me trapped; I can’t tell. Please choose what feels right to you.', next: 'caller_choice' },
  caller_choice: {
    speaker: 'Narrator', text: 'The clock moves to 11:59. Noor and Ellis wait with you.',
    choices: [
      { label: 'Leave the signal running.', next: 'end_broadcast' },
      { label: 'Record the call, then shut down.', next: 'end_record' },
      { label: 'Reconsider the other idea.', next: 'revisit_offer' }
    ]
  },
  end_broadcast: { speaker: 'Narrator', text: 'Ellis removes the key from the transmitter cabinet and puts it in your hand. You leave the station broadcasting into the night. On the street, radios in parked cars flicker on, one after another. Each is playing a different silence. In the last car, someone says, “Hello?”', mood: 'ending', next: 'end_broadcast_2' },
  end_broadcast_2: { speaker: 'Noor', text: 'If someone answers, maybe we can find our way back here.', next: 'disclosure_close' },
  end_record: { speaker: 'Narrator', text: 'Ellis records the call onto a small cassette. Noor says goodbye. You turn off the transmitter together. The red light goes dark. Outside, the station windows reflect an empty room. The cassette is warm in your hand.', mood: 'ending', next: 'end_record_2' },
  end_record_2: { speaker: 'Ellis', text: 'Tomorrow we’ll find a player. Tonight, let’s remember it ourselves.', next: 'disclosure_close' },
  disclosure_close: { speaker: 'Narrator', text: 'The station falls behind you.', next: 'ending_reason', nextBy: { key: 'disclosure', cases: { public: 'close_public', private: 'close_private' } } },
  close_public: { speaker: 'Narrator', text: 'Somewhere beyond the station, someone else heard your warning about the photograph. You may never know who, but they know they weren’t alone.', next: 'signal_close' },
  close_private: { speaker: 'Narrator', text: 'The photograph stays close, kept among the things you take from the room. Whatever it means, you gave its mystery a little time away from strangers.', next: 'signal_close' },
  signal_close: { speaker: 'Narrator', text: 'The room’s last conversation stays with you.', next: 'ending_reason', nextBy: { key: 'signal', cases: { repeat: 'signal_close_repeat', private: 'signal_close_private' } } },
  signal_close_repeat: { speaker: 'Narrator', text: 'The caller repeated your words because you let them. Hearing them in another voice changed them a little, but they are still yours.', next: 'broadcast_close' },
  signal_close_private: { speaker: 'Narrator', text: 'The caller kept your words to themself. In a night when so much slipped away, that choice remained yours.', next: 'broadcast_close' },
  broadcast_close: { speaker: 'Narrator', text: 'The last announcement is still with you.', next: 'relationship_close', nextBy: { key: 'broadcast', cases: { dedication: 'close_dedication', notice: 'close_notice', combined: 'close_combined' } } },
  close_dedication: { speaker: 'Noor', text: 'I hope the right person heard the dedication. I hope they know a light is still on for them.', next: 'relationship_close' },
  close_notice: { speaker: 'Ellis', text: 'North gate, 12:10. I keep saying it so I won’t forget. I hope someone made it onto that last shuttle.', next: 'relationship_close' },
  close_combined: { speaker: 'Noor', text: 'We changed the dedication to make room for the shuttle. I hope it still found the person it was meant for.', next: 'close_combined_ellis' },
  close_combined_ellis: { speaker: 'Ellis', text: 'And I hope someone heard the right gate. We gave both messages a chance.', next: 'relationship_close' },
  relationship_close: { speaker: 'Narrator', text: 'You pause together before saying goodnight.', next: 'ending_reason', nextBy: { key: 'relationship', cases: { Noor: 'relationship_close_noor', Ellis: 'relationship_close_ellis' } } },
  relationship_close_noor: { speaker: 'Noor', text: 'I don’t know if my sister will answer. Tomorrow, I think I’ll try calling her instead of just leaving the light on.', next: 'ending_reason' },
  relationship_close_ellis: { speaker: 'Ellis', text: 'I thought keeping the transmitter working was how I held on to that night. Maybe remembering it doesn’t have to be a job I do alone. Thank you for staying.', next: 'ending_reason' },
  ending_reason: { speaker: 'Narrator', text: 'The night is over, but the signal has left something with you.', next: 'ending_default', nextBy: { key: 'reason', cases: { help: 'ending_help', listen: 'ending_listen', company: 'ending_company' } } },
  ending_help: { speaker: 'Narrator', text: 'You came to keep the station alive. You couldn’t save its walls, but you helped its people choose what to carry forward.', end: true },
  ending_listen: { speaker: 'Narrator', text: 'You came to listen one last time. Now you know how much can happen when someone listens closely.', end: true },
  ending_company: { speaker: 'Narrator', text: 'You came because you didn’t want anyone to be alone. At the end of the night, nobody was.', end: true },
  ending_default: { speaker: 'Narrator', text: 'For a little while, the three of you stand together in the quiet.', end: true }
};

export const startNode = 'opening';
