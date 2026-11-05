# Playtest record

## 5 November 2026: v256 choice follow-through

The extracted Linux v256 preview was run in an isolated profile to check the four early-rescue screen actions. Each action produced its matching callback, fetched its prerecorded voice clip and restored after saving. A blank map note also fetched its exact prerecorded default and restored. No page errors appeared; playback was initiated but not listened to or allowed to finish. The full offline JavaScript suite passed, including a populated closing-conversation fixture whose witnessed comparisons, screen reports, action and ending context all fit within the model's 1,800-character scene limit. Arbitrary map-note text was not sent to the model.

The Windows v256 ZIP launched under Wine 11 and opened its game and debugging listeners. In a later isolated attempt, scripted DOM activation advanced the opening into the first story passage. Playwright's browser-level debugging connection subsequently timed out; direct page commands had initially worked but also timed out in a later attempt, so the cause is not established. The full-route test remains inconclusive and does not establish Windows gameplay or audio for v256. Native Windows remains untested. All isolated test processes were stopped.

An earlier test's milkshake reply was traced to a separate adapter request explicitly asking about a chocolate milkshake; it was not evidence that the model answered the transcribed map request with that reply. Other documented probes still show inconsistent local-model responses.

## 5 November 2026: v255 early-rescue route

An isolated, fresh Linux desktop playthrough followed Mira's date route, selected the new early rescue and reached an ending. With two warm comparison choices, the disclosure displayed the warm response and the unselected direct opening. Saving at that passage and reopening it in a fresh app process restored both. There were no page errors or broken visible images; all 180 observed voice requests returned HTTP 200, including the new rescue setup, the rendered comparison passage and the unselected opening. Automation interrupted speech while advancing, so this run does not establish full playback or subjective voice quality.

Separate browser tests checked all nine comparison combinations, tie and skipped-comparison wording, map-note save/resume, and seven incomplete-checkpoint cases. Story traversal covered the three companions, both fix/proof paths, four preference patterns and four audit actions. The full offline JavaScript suite passed before the permanent app regression was added; that app harness passed again afterwards. Tests used synthetic choices and isolated profiles, not a live AI service or personal voice reference.

## 5 November 2026: v254 complete speech playback

The extracted Linux preview was run in an isolated graphical session and synthetic profile, starting at the new false-transcript scene. Its narrator recording (10.58 seconds), Niko's reply (3.70 seconds) and Mallow's greeting (6.18 seconds) each reached the browser's playing and ended events before auto-advance, which followed roughly 650 milliseconds later. The next narrated choice and all three choice recordings also finished; the game remained at the choice after 25 seconds. No page errors appeared. This headless test did not establish physical-speaker playback or subjective voice quality.

Seven prerecorded clips taken from the Linux ZIP, covering all seven configured voices and both new scene lines, were transcribed with the included Parakeet model. The transcripts recovered the words, with punctuation differences and the name Niko rendered as “Nico”. This is an automated intelligibility proxy, not a listening assessment. No personal voice reference was used.

## 5 November 2026: v254 desktop route through an ending

The extracted Linux desktop preview was played in an isolated Xvfb session and fresh profile on a Mira date route, from the opening through the new false-transcript moment, the paper-star date, card choice and early-rescue path to an ending. The automated run captured 193 screens/actions, including 158 displayed passages and 31 choices, and found no page errors or broken visible images. Auto-read fetched 196 MP3s and the voice manifest successfully and produced 143 playback-start events. The automation advanced quickly and interrupted lines, so this does not establish complete spoken playback or listening quality. A regroup checkpoint was saved and reopened in a fresh app process with the same passage and choices. Mira remained behind the door for roughly 30 displayed passages before the chosen rescue; this run did not establish whether a human player finds that pacing effective. The run used scripted dialogue, not a live language model or physical audio devices. The isolated processes were stopped; no existing user profile was used.

## 5 November 2026: v240 Android touch test

An isolated Android 11/API 30 software emulator with WebView 83.0.4103.120 installed the v240 game and matching instrumentation APK. After slow startup, an Android system-server error and a System UI not-responding dialog, the emulator recovered and the dialog was dismissed. The host instrumentation command timed out before returning its final status; Android TestRunner logcat subsequently reported the `opensStoryAndShowsCharacterAfterRealTouches` test finished with one test, zero failures and zero ignored. The test uses real Android touches to pass the opening, advance to and choose the first response, save, recreate the Activity and resume the same passage. The disposable emulator had no pre-existing game checkpoint and was removed. This is a TestRunner-logcat result, not a complete host-side instrumentation result; no physical phone, audio, AI request or store purchase was tested. Evidence is retained in `/tmp/oki-android-246/runner-logcat.txt`.

## 5 November 2026: closing locations and local-model comparison

An isolated new-player Niko/team/light record playthrough found that the closing jumped from the fort to the counter, then described the group as returning to the fort a second time. The existing passages now make the player’s return to the counter explicit, keep the fort light visible without asserting that the others just left, and establish Mira beside the player when she lifts Mallow. The retreat route retains its existing fort-based overrides. Fresh Niko record and Mira Mallow-help runs reached their endings with saves restored; three older checkpoints kept their routes. Independent isolated 320×700 browser checks covered 27 seeded continuations across Niko, Mira and Ash, the four outcomes and marker-free saves. The acknowledgment choice restored, and speech cues assigned the player’s words and narration correctly. No page errors, external requests or horizontal overflow appeared. These checks used scripted text or seeded continuations, not audible speech or a physical phone.

Only the already-installed Qwen2.5 1.5B and 7B text models were found. A small synthetic replay of one Niko follow-up did not justify changing the default model: replies from both included limitations, and the sample cannot establish a general ranking. See MODEL_EVALUATION.md for the exact scope. Temporary model services were stopped.

## 5 November 2026: Mallow-help pacing and browser engines

On new runs which heard Mallow’s earlier response, the Mallow-help ending now combines its uncertainty and selected callback in one Mallow-voiced passage. When the lens is covered, Mallow’s request and the existing lift/keep-covered choices appear together. Older checkpoints retain the earlier route. Eight independent isolated 320×700 browser playthroughs reached the ending: four Mira runs covering both earlier responses and lens choices, plus Ash runs covering both lens choices and the unplug/leave cases. Saves restored at the compact passage and lens choice. Synthetic closing AI context reflected only the camera choice witnessed by Ash and did not invent one for unplug/leave; Mira behind the door was not given those visual details. Both new passages cast to Mallow. No page errors, external requests or horizontal overflow appeared. Audio was off and no physical phone or live model was used.

An isolated Firefox 155.0.1 / Gecko test at 390×844 exercised the pointer-driven opening, keyboard passage advance, first choice, save/resume and offline reopening of the first passage after stopping the server. The test driver could not activate even an independent plain button with Enter or Space, so native keyboard activation of the opening was not established by this test. A separate Linux WebKitGTK 2.52.6 offscreen test used DOM-activated controls to reach the first choice, save/resume and reopen the first passage offline. Neither test covered a full playthrough, audio or a phone; WebKitGTK is not Safari or iOS. Temporary servers and browser profiles were stopped.

A small synthetic Qwen2.5 1.5B prompt comparison did not establish that a proposed general grounding instruction improved factuality; the default prompt was left unchanged. See MODEL_EVALUATION.md for its design and limits.

## 5 November 2026: text-only launcher and opening contrast

The prepared Linux Mirid launcher no longer requires Parakeet files to start typed AI. Missing or incomplete ASR assets produce a text-only setup, preserve existing speech configuration and are reported in settings; complete assets still enable Parakeet. The text-only setup uses a new schema version so an older cached game rejects it instead of silently configuring unavailable speech. Independent isolated browser checks used real local Qwen for missing, partial and complete ASR assets: all returned HTTP 200; the complete configuration also transcribed synthetic microphone audio through Parakeet and preserved the prior read-aloud endpoint. One Qwen reply used third-person narration. These tests establish setup and transport, not model quality, physical microphone or phone behavior. Temporary services and browser profiles were stopped.

The opening Agree button uses a darker pink for 4.86:1 measured white-text contrast. Isolated browser checks at 320×700 and 1440×900 verified the button moves under a pointer press and continues, and that Enter and Space continue. The fictional interaction and its choices remain unchanged; no device or full accessibility audit was performed.

Two isolated Mira/prize/date/personal playthroughs reached the Mallow-help ending with the free kit and private conversation kept private. One uncovered the lens; the other kept it covered and used the sewing string. Saves restored at the count and ending choice; callbacks were coherent and there were no browser errors or horizontal overflow. Written dialogue was used with audio off, not a live model or phone.

## 5 November 2026: return to the counter

An isolated new-player review found that Mira’s room could jump to Ash at the arcade without making the return clear, then describe the group as returning again. Ash’s map line now anchors the scene at the counter, and the following regroup line no longer repeats the arrival. Fresh isolated 320×700 browser checks for Niko, Mira and Ash reached both passages and the same map choice with no page errors or horizontal overflow. Ten synthetic older-checkpoint continuations kept their expected route, including previously chosen notices. The story graph and voice-cue checks passed. These were written, audio-off browser checks, not physical-device playtests.

## 5 November 2026: speech input and record outcomes

An isolated browser used a synthetic looping Flite clip as a fake microphone. The game’s recording control sent about two seconds of audio to a separate local Mirid/Parakeet instance, which returned a transcript appended to an existing reply draft. The loop produced repeated and partial words. No chat request was made before the draft was edited and explicitly sent; a local Qwen2.5 1.5B endpoint then returned an Ash reply. This confirms that request path with synthetic audio, not recognition quality, a physical microphone or phone. The temporary browser and services were stopped.

Two fresh isolated 320×700 Niko routes tested the printer decision. One unplugged and later reconnected it, then reached the record ending; the other kept the earlier conversation private, left the printer unplugged and reached the rescue ending. Both restored saves at the count and printer choices. The printer state and story callbacks matched the actions taken; no browser errors, external requests or horizontal overflow appeared. These playthroughs used written dialogue with audio off, not a live model or physical phone.

A separate audit of captured closing AI context found that the tested Ash scene retained its ending details within the configured length and that inspected retreat, rescue and kit summaries matched witnessed story. No prompt changes were made from that review; generated replies can still be inconsistent.

## 5 November 2026: Ash closing and mixed speech

For new witnessed Ash light-conversation retreat runs, four closing lines now appear in two Ash-voiced passages, with the private-conversation choice on the second. The map and seating beat appears when the player chooses to speak privately; marker-free saves retain their earlier route. Two independent isolated 320×700 browser playthroughs, play/repeat and care/private, reached the ending and contact link. Each restored the count, retreat-pattern and Ash-choice checkpoints, retained its map callback and the correct AI lead-in, and cast the compact passage to Ash. Legacy saves followed the four original passages and narrator choice. No browser errors, external requests or horizontal overflow appeared. AI responses used a synthetic endpoint and audio was off; this was not a live-model or phone test.

A separate ordinary-player test build used a synthetic Flite reference with local Chatterbox Nano for the narrator and local Kokoro for Niko. An isolated browser read a mixed passage as Narrator → Niko → Narrator → Niko, each request returned a WAV, and the app reached “Speech finished.” Test-only HTTPS endpoints were intercepted and forwarded to local services. The creator’s reference and target speaker remain unconfigured; the test did not establish public hosting, audible quality or phone behavior. Browser and services were stopped.

The name-based free repair kit and mocked native billing adapter passed focused tests for localized prices, verified purchases, pending, cancellation and restore. Paid store bridges remain disabled and require configured products and real sandbox testing; no live purchase was made.

## 5 November 2026: Ash retreat, AI context and site contrast

A fresh isolated 320×700 Ash/date/play/light retreat run chose the prize, bell, copied arrows, a repeated private conversation, unplugged printer, changed knock pattern and first stair search. It reached the ending and contact link; the monster drawing, date invitation, arrows, printer, search and prize callbacks were coherent. Saves restored at the count and retreat-pattern choices. No page errors, external requests or horizontal overflow appeared. The written run had audio off, not a live model or physical phone. Four consecutive Ash closing passages still slow the pacing, though each recalls a different choice.

Synthetic browser captures showed that three closing AI contexts used narrator “you” where it meant the player. They now name the player and, where needed, the companion, while preserving the selected action and quoted dialogue. The corrected requests and follow-ups were checked across all six companion/action combinations and three isolated browser captures, including save/resume and conversation boundaries. No model inference was tested in this pass; see MODEL_EVALUATION.md.

The local site’s bundled game reopened offline after its first load in isolated Chromium. Site text colors were adjusted for readability; independent checks of the affected small labels, ticket and note measured at least 4.82:1 contrast at 320×700 and 1440×900, with no page errors or horizontal overflow. This targeted check is not a full accessibility audit or physical-device test. The site remains unpublished.

## 5 November 2026: local publicity site

A local, unpublished site draft for odlc.io lives in the sibling `website/` directory. Its build stages the current game under `play/` and generates game and site source downloads. Independent isolated Chromium checks at 320×700, 390×844 and 1440×900 verified the navigation, images, keyboard skip link, contact target, source downloads, opening game passage and service worker scoped to `/play/`. A 320px ticket overlap and border collision were corrected and rechecked. No page errors, failed or external requests, or horizontal overflow appeared in those checks. This is viewport emulation on a local server, not a deployed site or physical-device test. The domain has not been configured or published by this build.

## 5 November 2026: rescue pacing and voice configuration

New early-rescue runs now hear Mira tap during the release setup and proceed directly to the selected companion’s item or evidence. The folded receipt and companion relationship callbacks remain; older checkpoints keep the original setup and route. Isolated 320×700 Mira/private/annotate, Ash/private/unplug and Niko/repeat/cover browser playthroughs reached the rescue ending, restored the early choice, retained the alternative and respected legacy checkpoints. No page errors or horizontal overflow appeared. In comparable runs the coordination choice appeared after five passages following the early rescue decision instead of seven; overall choices differed between routes. The runs used written dialogue with audio off, not physical phones or live AI. The story graph covered 288 companion, item, topic, paper and audit combinations, with separate save and voice-cue checks.

Conditional app tests passed for a single publisher Chatterbox speaker assignment and a private creator audition, using synthetic services. An isolated real local Kokoro service synthesized non-silent WAVs for all seven IDs matching the game’s default speaker mappings: Narrator af_heart, You af_sarah, Service af_nicole, Niko am_adam, Mira af_bella, Ash bm_george and Mallow bf_emma. Those requests were sent directly to the service; they did not test app selection, audible playback, physical devices or the creator’s reference voice. The service was stopped.

## 5 November 2026: Mira rescue, voice casting and activity context

A fresh isolated 320×700 Mira/date/care/personal/future playthrough took the early rescue with the sewing string, a private Mallow conversation and an annotated receipt. It reached the rescue ending and contact link; the workshop, plush, string and planned-date callbacks were coherent. A save restored the rescue choice, the alternative retained all four outcomes, and a marker-free checkpoint followed its older route. There were no browser errors, external requests or horizontal overflow. The new choice appeared 27 passages after the lights went out; coordination followed seven passages later, including three consecutive Mira lines. The written run had audio off and was not a physical-phone test.

The early rescue’s spoken Niko line is cast Narrator → Niko → Narrator. A focused regression checks this sequence and exact text. The production speech adapter sent those segments to an isolated local Kokoro service using af_heart, am_adam and af_heart respectively, and all returned WAV audio. The service was stopped. This did not test audible playback, phones or the creator’s reference voice.

A captured real-model request addressed the player as “you” inside narration while also instructing the model to play the companion. Private and closing AI contexts now identify the player in the three witnessed activity setups, preserving displayed text, selected actions and quoted dialogue. A fresh isolated Qwen2.5 7B browser run confirmed both initial and follow-up requests contained the clarified Niko setup, received responses and restored the first from a save without a new request. The follow-up still invented an unestablished detail. See MODEL_EVALUATION.md; this test establishes request content and operation, not general model reliability. No real player data or physical phone was used.

## 5 November 2026: earlier rescue choice and live conversation

New runs which have seen the group exchange and completed the early audit now offer a choice after Mallow explains the steering: help open Mira’s door or talk to Mallow and consider other ways forward. The early rescue retains the selected companion’s tool or evidence and relationship callbacks, the folded receipt only when it was returned, and the coordination choice. The alternative still reaches the existing rescue, record, Mallow-help and retreat outcomes. Marker-free checkpoints keep their previous sequence.

Independent isolated 320×700 browser playthroughs followed Ash/private/unplug and Niko/repeat/cover through the rescue ending and contact link. Both restored a saved early choice, retained the chosen intervention and did not invent a skipped Mallow response. The alternative reached the four later options, and marker-free checkpoints bypassed the new choice. No page errors, blocked external requests or horizontal overflow occurred. From the light going out to the new choice took 27 displayed passages for Ash and 25 for Niko; through coordination it took 34 and 32. The earlier Ash run reached its rescue-method choice after 38 passages, although route choices differed. Both new choices fit on screen, but several companion callbacks still follow the decision to open the door. These browser runs used written dialogue with audio off, not a physical device or live model. A 288-case story matrix covers companion, tool, topic, handoff and audit combinations, with separate save and context checks.

A separate isolated browser used Qwen2.5 7B for Niko’s personal conversation with synthetic input. The first reply incorrectly implied a future milkshake date had already happened; a follow-up did not answer the requested alternative. Saving and resuming restored the first reply without another request. A small subsequent prompt experiment did not justify changing the default; see MODEL_EVALUATION.md for the responses and limitations. The temporary model server and browser were stopped.

## 5 November 2026: earlier action in the reveal

An isolated v231 Ash/team/friend playthrough reached the rescue ending with scripted dialogue and sound off. Both tested saves restored, and there were no page errors, external requests or horizontal overflow at 320×700. From the light going out through the final rescue-method choice, the route showed 38 story passages and six choices. After the receipt handoff, six consecutive passages explained documents or the machine before the player could act again.

On new runs that have actually seen and handled the public exchange, the player can now act on the lens, receipt or printer after the comparison and forged report, before Mallow explains how choices shaped its responses. The circular chain back to the welcome agreement, the false Mira-authored report, the shared steering explanation, all four actions and their later effects remain. Marker-free saves retain the original order. In a comparable independent repeat/cover/slide browser run, the same interval took 36 displayed passages; two passages separated the receipt handoff and action instead of six. This is an improvement in the sequence, not a complete solution to the long rescue setup.

An independent isolated Chromium check used fresh private and repeat playthroughs and eight seeded continuations pairing the four handoffs with the four actions on both privacy branches. The audit choice survived saving and resuming; the false-ending header did not appear early; the unplugged printer stayed unplugged; and two marker-free legacy checkpoints kept their prior order. The early annotation displayed the player’s text alongside the existing EVERYONE IS TOGETHER claim and verification seal. No page errors, external requests or horizontal overflow appeared at 320×700. Four representative private/repeat and cover/unplug continuations also reached the rescue ending and contact link. The audit text was subsequently split into shorter paragraphs and retested at 320×700 with the annotation, save/resume and a legacy checkpoint. It was easier to scan, though players must still scroll to see all four choices. Audio was off. The graph tests covered 891 paths and an additional 64 early-audit combinations; app tests cover the visual comparison and its read-aloud, plus AI context and saves. This is not a physical-phone or live-model playtest.

## 5 November 2026: Niko ending, landscape and context limits

An isolated v230 browser playthrough followed Niko/company/date/personal/past to the Mallow-help ending at 320×700, leaving Mallow by the counter light. The star, souvenir, shared conversation, spring, receipt, lens, rescue and milkshake callbacks were coherent. Saves resumed correctly at the count and receipt choices; no browser errors, external requests or horizontal overflow appeared. It used scripted text with audio off, not a live AI or physical phone. The sequence from the fort-door light going out to the final rescue-method choice took 36 story screens and six intervening choices; the reveal remains dense and needs further pacing work. The ending’s unresolved promise remains alongside the player’s choice to leave Mallow at the counter.

A browser viewport test found Niko’s portrait could be offscreen after continuing at 844×390 and clipped at 932×430. A short-landscape layout change was checked with introductory dialogue, narrator text and three-choice character passages at both sizes, plus 568×320, 1024×500 and 320×568. Choices could be selected and no horizontal overflow or page errors appeared. At 568×320 the speaker label and top of the portrait may still require scrolling. Advanced settings selects now compute to 16px in the tested landscape views; actual iOS zoom behavior and physical devices have not been tested.

An isolated Qwen2.5 7B server returned a structured context-size error for a synthetic long request, which previously appeared as a generic AI failure. The adapter now gives a specific recovery message without displaying provider details or dropping history. Adapter and app regressions cover error handling, saved state and retry. An independent browser with a seeded save and synthetic local endpoint confirmed that the diagnostic contained no provider detail, survived reload without a new request, and allowed the unanswered question to be retried with a different model. It showed no page errors or external requests; it was not a live-model browser or phone test. See MODEL_EVALUATION.md for the model setup and limitations.

## 5 November 2026: retreat pacing and Android Kokoro retry

A fresh isolated mobile-browser playthrough followed the Mira/friend/play/light retreat route to the ending, including the free field kit, a private Mallow conversation, the printer, the search and Mira’s sketchbook. Save/resume worked at two points; no JavaScript errors, external requests or horizontal overflow appeared. The written route used no live AI or audio. The ending now combines four advances while keeping the privacy choice and its private/repeated wording, the witnessed search, the sketchbook/thread choice and its callback, the knight and pencil, and the prize ending. Checkpoints already beyond the new marker retain their prior route. An independent 320×700 browser run reached the ending with repeat, stair, thread and prize choices; four current and marker-free legacy checkpoints also resumed along the correct routes. No browser errors, external requests or horizontal overflow appeared. Both runs used scripted text with audio off. The 891-path story graph, save/resume regressions and read-aloud cue checks passed; this does not prove every branch has good pacing. Combining the pencil movement with the preceding passage shortens the pause before it.

An isolated Android 11/API 30 software emulator with WebView 83.0.4103.120 ran the v229 APK against a loopback bridge to real Kokoro. After a System UI ANR interrupted the initial attempt, a bounded retry passed Android instrumentation: the app requested two distinct voice previews (af_heart and am_adam), sent synthetic chat, and requested the reply read aloud with am_adam. Each speech POST reached Kokoro and returned HTTP 200 with a WAV; the test observed a playing or finished status. It did not distinguish playback initiation from completion. The emulator used -no-audio, so audible output and quality were not assessed. This does not test a physical phone, live language model or creator reference voice. Services and the disposable emulator were stopped.

## 5 November 2026: role confusion and Android Kokoro attempt

A fresh isolated v228 browser run followed prize/bell/Ash/date/play/light to the ending. It chose the doorstop, tore the inspector card and passed the public line to Mira, then annotated the receipt and opened the door. The revised handoff, later catch action and earlier callbacks were coherent. Save/resume worked at the handoff and its result; no JavaScript exceptions or horizontal overflow appeared at 390×844. The automation accidentally selected the recorder at the annotation, but no microphone was available and no audio was captured. The run used written dialogue and synthetic input with sound off, not live AI or a phone.

In ten synthetic local Qwen2.5 1.5B replies, one addressed the player as Niko while speaking as Niko; another contained an embedded attribution. A narrow check now falls back only for the unquoted, unreported “what/how about you, [current speaker]?” form. It leaves the embedded attribution unchanged and is not a general narration or factuality fix. An independent isolated browser with a synthetic endpoint checked the observed fallback, retry, quoted and reported speech and another name. See MODEL_EVALUATION.md for the live-model sample and limits.

An isolated Android 11/API 30 emulator attempted v228 voice preview through an adb-reversed loopback bridge to real Kokoro. The app reported it could not connect, and the bridge logged no completed Android request. The bridge logged POSTs only after forwarding completed, so the absence of a log does not establish whether a request arrived. The bridge was listed by adb and the host Kokoro warm-up returned a valid WAV, but the independent reverse probe accepted a connection without delivering bytes; the cause is not established. The attempt did not test Android playback. The emulator and services were stopped. This does not invalidate the earlier v227 synthetic AI/voice routing test or establish real TTS, audible playback or physical-phone behavior.

All 123 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, two debug-CA helper tests, two iOS project tests and the web package reproducibility test passed. The v229 Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched the web archive, both native asset directories and both APKs. The iOS project was synced but not built; physical devices remain untested.

## 5 November 2026: rescue activity and Android AI routing

A fresh isolated v227 browser run followed Niko/date/care/personal/future to the record ending. The bell, sorted screws, copied receipt, private refusal, printer choice and date callbacks were coherent; save/resume worked at the picture and printer. No page errors appeared. The run exposed a Niko preamble that referred to a familiar release even when the next line discussed the copied receipt. His revised line reassures Mira and works for both the spring and proof paths; an isolated browser checked both continuations. The full run used written dialogue with sound off and did not test a live model, audio or a phone.

The four existing public-receipt handoffs now let Niko and Mira make a small physical test during the evidence sequence; it does not open the panel yet or change the later choices. The scene preserves the paper’s location and Mira’s original spoken lines. This adds visible rescue activity without reducing the number of reveal passages. Two fresh synthetic browser routes on a disposable candidate reached endings. An independent browser tested all four final-source handoffs at 390×844, including private/public separation, save/resume and the correct later folded-paper or no-fold path. These checks used synthetic checkpoints and clicks with service-worker bypass, not live AI, audio or a phone.

A separate non-skipped v227 test passed on an isolated Android 11/API 30 software emulator with WebView 83.0.4103.120: real Android touches requested distinct narrator and Niko previews, sent a synthetic chat message with `max_tokens: 512`, and requested Niko’s reply read aloud. The loopback mock returned synthetic WAVs. Raw instrumentation reported `OK (1 test)` in 30.522 seconds. An initial invocation was inconclusive because an existing test checkpoint caused a skip; only disposable emulator app data was cleared before the successful run. No playback-status assertion, audible output, physical microphone, real TTS/ASR, live model, physical phone or iOS behavior was tested. The isolated emulator and service were stopped.

All 122 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, two debug-CA helper tests, two iOS project tests and web package reproducibility checks passed. The v228 Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched the web archive, both native asset directories and both APKs. The iOS project was synced but not built; physical devices remain untested.

## 5 November 2026: reveal timing experiment and Android 15 attempt

A fresh isolated v227 browser run followed team/bell/Mira/friend/care/personal/future to the record ending. It copied the plush tag, quietly checked the count, kept the card, allowed the private repeat, asked Mira for evidence, covered the lens and printed the record. The copied tag, workshop, shared words, record choice and Mallow callbacks were coherent, and save/resume restored the bell picture. No blocking issue, page error or horizontal overflow was observed at 390 pixels. The reveal remained dense while Mira waited. This complete run used written dialogue and synthetic input with sound off; the service worker was blocked and it did not test live AI, audio or a phone.

An isolated pacing candidate moved the hint ranking and two comparison texts to the screen before the door crisis, preserving the later paper handoff and fabricated independent testimony. Twelve scripted offline companion/ending routes reached an ending, but one representative route moved only two passages out of the confinement interval (35 to 33) with 158 total passages unchanged, while exposing significant evidence earlier. Existing full app, graph and voice tests failed on changed ordering or enumerated nodes; legacy and no-public-reply paths were not browser-proven. The candidate was discarded and did not change the shared game. A stronger revision would interleave physical rescue and evidence while preserving the choices and Mira’s presence.

A separate v227 Android AI/voice attempt used a cloned Android 15 software emulator and a synthetic loopback service. After startup ANR dialogs and two JavaScript callback timeouts, the WebView renderer died with SIGTRAP and the app process aborted. The logs do not establish the cause or that the game caused the renderer crash. No chat or speech request reached the service, so Android AI and voice remain unverified. The emulator and service were stopped and cloned data removed; no physical phone was tested. This does not alter the separately passed v227 Android 11 touch and save checks.

The iOS project’s static tests, native configuration and icon checks passed; the source ZIP contains the Xcode project, package manifest, Info.plist, delegates, billing bridge, storyboard and icon. The packaged Capacitor iOS 8.6.0 dependency and project targets both specify iOS 15. This Linux host lacks Xcode and Swift, so no iOS build, signing, WebKit audio or device behavior was verified.

## 5 November 2026: Ash retreat on v227

A fresh isolated v227 browser playthrough followed prize/ribbon/Ash/date/care/personal/past to the unresolved retreat ending. It traced the arrows, touched the screen picture, saved and resumed at the picture and search choices, shared a synthetic private line, kept the souvenir, covered the lens and checked the first stair. The ribbon, borrowed map notch, rest stop, lantern, receipt and uncertain knock callbacks were coherent. No page errors, off-origin requests or horizontal overflow were observed at 390×844. The reveal remained dense but understandable. The first opening passage was advanced after its delayed transition without a text capture; all subsequent passages were observed. This complete run used authored fallback and synthetic text, with sound and auto-read off; its service worker was blocked, and it did not test live AI, audio or a phone.

The v227 Mirid preset and dialogue request flow were independently audited against the installed backend, and the app regression suite passed. No additional reproducible high-impact integration defect was found; generated content may still invent details.

The v227 debug APK passed both packaged tests on an isolated Android 11 software emulator with WebView 83.0.4103.120. The picture test exercised all three signals with real touches and reported `OK (1 test)` in 18.971 seconds; the opening, first choice, activity recreation and save/resume test reported `OK (1 test)` in 22.523 seconds. An emulator System UI ANR dialog was dismissed before testing. These checks did not exercise the Mirid settings flow, live AI, audio, a physical phone or iOS.

## 5 November 2026: Android touch and Mirid preset

A fresh isolated v226 browser run followed prize/ribbon/Ash/friend/care/light to the record ending. It traced the arrows, corrected the count publicly, shared the private line, tried confirmation, passed Mallow’s reply and annotated the receipt. The map, evidence, receipt and character callbacks were coherent; saving and resuming restored the ribbon. No browser errors appeared. The reveal remained dense while Mira waited. This complete run used written fallback with sound and auto-read off; it did not test a live model or phone.

Three task-focused question passages displayed third-person narration under the companion’s name. They now use the Narrator while retaining the appropriate portrait. Story and voice-cue tests passed; a separate isolated browser checked all three portraits, choices and save/resume at 390×844. That check used synthetic checkpoints and did not test audio or a phone.

The installed Mirid request schema ignores `max_completion_tokens` and defaults to 2,048 when `max_tokens` is omitted. The Mirid text presets now change the incompatible parameter to `max_tokens` while preserving the numeric selection; an explicit no-limit selection, existing `max_tokens`, speech-only launcher and invalid preset remain unchanged. An isolated browser with a synthetic provider verified the 512-token request, no-limit follow-up, speech-only and invalid cases. It did not test a live model or phone.

The v226 debug APK passed two tests on an isolated Android 11 software emulator with WebView 83.0.4103.120. The picture test used real touches on all three seeded images, checked the 44 CSS-pixel target and fingerprint, and reported `OK (1 test)` in 33.164 seconds. The opening/save test used real touches, recreated the activity and restored the selected passage, reporting `OK (1 test)` in 32.048 seconds. An initial picture-test attempt failed because an Android System UI ANR dialog intercepted the touch; after dismissing that emulator-owned dialog, the test passed. The emulator was stopped and removed. This does not test v227, physical devices, live AI, audio or iOS; it does not establish the cause of earlier silent emulator timeouts.

All 122 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, two debug-CA helper tests, two iOS project tests and the web package reproducibility test passed. The v227 Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched the web archive, both native asset directories and both APKs. The iOS project was synced but not built; physical devices remain untested.

## 5 November 2026: AI settings, voice and Niko/Mallow route

A fresh isolated v225 browser run followed team/ribbon/Niko/date/play/personal to Mallow’s ending: crown, brother, spring, direct comparisons, public count correction, torn souvenir, private refusal, covered then uncovered lens and the spring at the catch. Save/resume at the spring choice restored the passage and option; the spring, scraps, milkshake and Mallow callbacks were coherent. No page errors appeared. The reveal remained dense. This complete run used written responses and synthetic player text, with sound and auto-read off; the isolated browser blocked the service worker and did not test live AI, voice or a phone.

AI settings now include an optional note that many AI services do not expose all system or developer instructions; it is outside the story and its reveal. When a provider explicitly reports an output-length stop without visible text, the game now directs the player to the response limit for bounded requests or identifies a provider-side limit when no limit was sent. An independent 320×700 browser test with synthetic responses checked keyboard access to the note, bounded and no-limit diagnostics, preserved written fallback, retry controls and absence of horizontal overflow. No live external provider was tested.

An isolated desktop Chrome session used the game’s local-launcher preset and real local Kokoro and Mirid/Parakeet services. Narrator, Niko and Mira previews requested distinct `af_heart`, `am_adam` and `af_bella` voices and reached the UI’s playback status. A generated synthetic speech fixture fed through Chrome’s fake microphone was transcribed by Parakeet into the reply field. This used programmatic UI actions and did not test a real microphone, audible quality, the creator’s future reference or a phone. Temporary services and browser resources were stopped.

All 121 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, two debug-CA helper tests, two iOS project tests and the web package reproducibility test passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched the web archive, both native asset directories and both APKs. The iOS project was synced but not built; physical devices remain untested.

## 5 November 2026: web package, API limit and microphone UI

A fresh isolated v224 browser run followed company/star/Mira/date/play/personal through Mallow’s ending. It named the drawing Sir Crumb, discussed the workshop, chose the string, tore the souvenir, kept the private conversation private, unplugged the printer and asked Mallow to listen. The string appeared exactly once after Mira suggested it, opened the catch and preserved the four scraps for their later callback. Save/resume worked at the star and tool choice. The workshop, drawing, paper moth and ending callbacks were coherent; the reveal remained dense but understandable. No blocking issue or console errors appeared. This complete run used written dialogue with sound and auto-read off, not live AI or a phone.

`tools/package_web.py` now prepares a reproducible standalone web archive with the same 74 files staged into the native apps. An independent isolated browser extracted the v225 archive under a nested URL, entered the story by pointer, chose an answer and saved. Its service worker had the correct nested scope, and an emulated offline reload restored the passage. This did not test PWA installation, a public host, a phone or live AI.

AI settings now allow an explicit session-only response token limit of 100, 512, 2,048 or 8,192; the default remains 100, and no-limit mode still omits the parameter. Larger limits can increase provider cost and wait time. Automated checks cover request construction, reset, follow-up and cancellation. In the extracted web archive, a synthetic endpoint received `max_completion_tokens: 2048` and then a follow-up without either output-limit parameter. No live external provider was tested.

An isolated desktop browser used a generated fake microphone and a synthetic Mirid transcription endpoint through the actual game UI. Pointer actions opened settings, started and stopped capture, and appended the returned transcript; the endpoint received non-silent 16 kHz mono WAV audio. This did not exercise a physical microphone, actual speech recognition, audible playback or a phone.

All 121 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, two debug-CA helper tests, two iOS project tests and the web package reproducibility test passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched the web archive, both native asset directories and both APKs. The iOS project was synced but not built; physical devices remain untested.

## 5 November 2026: tool payoff and live AI conversation

A fresh isolated v223 browser run followed prize/ribbon/Ash/team/care/personal/past to Mallow’s ending. It skipped both comparisons and the kit, selected the doorstop, publicly corrected the count, shared the private line, covered Mallow’s lens and let it listen, then used the kept souvenir to wedge the catch. Save/reload/resume restored the ribbon choice. The reveal was understandable but the scene exposed a missing choice: Ash had proposed the doorstop for the latch, yet the game offered only the souvenir or a hand. Written dialogue was used with sound and auto-read off; the run did not use a live model or phone.

The player can now use a previously witnessed spring, sewing string or doorstop at Mallow’s catch while retaining the existing souvenir and hand choices. The tool must match the companion and earlier action; older or inconsistent saves keep the original options. The souvenir remains available, and the closing AI context only includes the witnessed tool use from the character’s perspective. Story, app and voice-cue tests cover all three tools, both souvenir states, save/resume and legacy conditions. An independent isolated 390×844 browser check used synthetic checkpoints and pointer clicks for all three tools and both souvenir states, including saves at the choice and result, continuation and legacy/proof/mismatched checkpoints. It blocked the service worker and did not test a model, sound or phone.

A separate fresh browser run connected the existing local Qwen2.5 7B model for Niko’s personal conversation. The real request contained the witnessed note and choices; save/resume and follow-up worked, but the model invented details about his brother despite a correction. This is one synthetic conversation, not a reliability estimate. See MODEL_EVALUATION.md.

Native source and permissions were inspected for microphone access. An isolated desktop Chrome check fed generated synthetic audio through the production microphone module and returned a non-silent 16 kHz mono WAV. It did not test the game UI, a real microphone, audible playback or a phone. No iOS build was made.

All 121 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, two debug-CA helper tests and two iOS project tests passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched both native asset directories and both APKs. Physical devices remain untested.

## 5 November 2026: ticket display and Niko retreat

A fresh isolated v222 browser run followed company/bell/Niko/friend/care/light through the unresolved retreat ending. It claimed the free kit, saved and resumed the bell picture, chose to count the tickets, annotated the receipt, called through the floor, repeated the knocks and followed the sound. The compact closing retained the ticket, stairway, kit, bell, torn souvenir and Niko callbacks; the annotation remained exact and the final knock uncertain. No browser console errors were observed. The run used written dialogue with sound and auto-read off; it did not test a live model, voice or phone. A repeated sentiment in Niko’s care/light ending was revised; a seeded browser check found the revised lines coherent.

The ticket comparison had three visible problems: the physical pieces disappeared in forced colors, arranged pieces overlapped the neighboring panel at 320 pixels, and flexbox reduced the picture control below 44 pixels wide. The CSS now preserves the pieces in forced colors, lets arranged pieces fit, keeps the interactive picture at 44×44 pixels and stacks panels below 320 pixels. Isolated Chrome tests checked widths from 280 to 600 pixels, light and dark forced colors, and keyboard activation. A separate browser check used synthetic checkpoints at 320×700 and 280×700: each picture measured 44×44, pointer/Enter/Space activation reached the fingerprint, arranged pieces stayed within the panel, and forced-color ticket pieces and count were visible. These were desktop tests, with service-worker bypass in the independent check, not a physical-phone test.

A 12-response synthetic comparison of local 7B and 14B models found the larger model more often recalled parts of the rescue but still invented or misremembered details. It did not justify changing the default. The temporary servers and downloaded model were removed; see MODEL_EVALUATION.md for the sample and its limits.

All 121 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, two debug-CA helper tests and two iOS project tests passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built; no physical phone was tested.

## 5 November 2026: retreat pacing and browser engines

A fresh isolated v221 browser run followed prize/star/Mira/friend/care/personal/past to the unresolved retreat ending. It saved and resumed at the star picture, used the sewing string and EXIT sign, publicly corrected the count, kept the souvenir, refused the private repeat, covered the lens, changed the tap pattern and searched with Ash. The unfinished plush, workshop, copied room, uncertain knocks and delayed shadow were coherent. The reveal remained dense, and generic transitions slowed the ending. This complete run used written replies with sound and auto-read off; it did not test a model or phone.

After a witnessed retreat search, the ending now moves past several generic transitions while retaining the actual evidence, stairway, kit, keepsake, souvenir and companion callbacks. Tests cover 216 combinations and save/resume. Marker-free checkpoints already past the search keep the earlier transitions; resuming a checkpoint on the search passage itself records the marker and may take the shorter route. An independent isolated browser used synthetic 390×844 checkpoints to verify Mira’s no-kit/kept/star path, Ash’s free-kit/torn/ribbon path, save/resume and a marker-free legacy path. It used scripted clicks on a temporary copy with service-worker bypass and a diagnostic update-control hook; gameplay and save logic were unchanged. It did not exercise a phone, audio or AI.

Separate first-run checks on v221 reached the first choice and restored a saved response in Firefox 155 at 500 pixels using a pointer and in WebKitGTK 2.52.6 at 390 pixels using scripted clicks; the latter also opened and closed AI settings. No horizontal overflow was observed. Firefox would not shrink to the requested 390 pixels; neither Linux browser check establishes Android or iOS WebView, physical touch, microphone or audible playback.

A 12-request local Qwen2.5 7B comparison moved the same rescue event to a different position in synthetic requests. Both formats still missed or embellished details; this did not justify changing the production prompt. See MODEL_EVALUATION.md for scope and the repeatable harness.

All 121 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, two debug-CA helper tests and two iOS project tests passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built; no physical phone was tested.

## 5 November 2026: rescue context and local Android certificates

Closing AI conversations now receive the immediate-rescue coordination the player actually witnessed. Mira’s reach account is limited to what she could perceive from behind the door; older and inconsistent saves do not acquire a memory. App regressions cover all companions, both choices, saves, follow-ups and the tool and kit context. An independent isolated browser with synthetic checkpoints and endpoint verified Niko’s count in the initial request and follow-up, no new request on resume, Mira’s limited-perspective reach, and no invented event for an older checkpoint. This was not a full playthrough or a live model test.

A separate three-question local Qwen2.5 7B check used simplified synthetic context. The model partly recalled counting in one answer but invented details in all three. The added context fixes missing information in the request; it does not establish reliable model recall. See MODEL_EVALUATION.md.

An opt-in helper can build a local Android debug app that trusts user-installed CAs for testing a private companion certificate. It leaves the default debug and release configurations unchanged and does not install a certificate. Isolated debug/release builds and resource inspection verified the opt-in, release exclusion and return to default; a real phone, CA installation, TLS connection and WebView origin were not tested. The source archive excludes the generated local debug policy.

All 121 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, two debug-CA helper tests and two iOS project tests passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built, and physical devices remain untested.

## 5 November 2026: Ash playthrough and Android test preparation

A fresh isolated v219 browser playthrough followed the company/ribbon/Ash/date/personal/future route. It claimed the free kit, publicly corrected the ticket count, saved and resumed the picture choice, used the familiar stair notch, shared the private line, tore the inspector card, passed Mallow’s answer, unplugged and reconnected the printer to print the record, apologized to Mira and reached the feedback ending. The separation, arrow and inspector callbacks, printer consequence and kit payoff were coherent; cut-out teeth, paper fingers and the delayed shadow were effective. The reveal remains dense while Mira is trapped, although physical actions help the thread. The run used written replies with sound and auto-read off, not live AI, audio or a phone.

The run found Ash’s closing reflection repeated a nearby phrase. The first passage now offers the player a physical action with the map, leaving the later future reflection distinct. Story-path and voice-cue tests passed for the revised line. An independent isolated browser checkpoint confirmed that it reads coherently with the inspector and future passages; this check used neither sound nor AI.

The Android project now includes a maintainable instrumentation test for each screen picture: it checks image loading and target size, sends a native touch and checks the fingerprint passage. It skips existing checkpoints and removes its own unchanged test checkpoint. The test APK compiled but this new test has not been run on Android. Earlier emulator instrumentation timed out; software emulation has no hardware acceleration here. No physical Android device or iOS build was tested.

All 121 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, and two iOS project tests passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched both native asset directories and both APKs. The source-archive test also checks that the complete cached game shell is present and byte-identical.

## 5 November 2026: rescue coordination and dialogue formatting

The immediate-rescue branch now lets the player ask Mira to count the team in or have Niko reach for her hand. The screen jumps ahead of Mira’s count, and the other choice exposes the paper fingers before the existing latch action. Older checkpoints at the rescue keep their original route. Story graph tests cover both choices for each companion and tool/proof routes, with save/resume and legacy checkpoint checks in the app suite. Voice-cue tests verify that Mira’s spoken lines use her configured voice and the narration keeps the narrator’s voice.

An independent isolated browser used synthetic Niko/spring checkpoints to test both choices at 320×700. Both choices, save/resume, keyboard activation of the count choice, the latch and an old rescue checkpoint worked without observed horizontal overflow. The browser check prompted a revision that lets Mira complete her count; a second check found it coherent. These were seeded scenes, not a complete playthrough, and used no AI or audio.

A previously observed model-format failure can produce an attribution such as “Niko says cheerfully” before a spoken reply. The dialogue adapter now recovers a complete wholly quoted utterance after that specific form, or uses the existing scripted fallback for incomplete or unquoted versions. Tests cover ordinary mentions and other speakers. This is a narrow format repair, not a guarantee against narration or inaccurate replies; no model was run for this change.

All 121 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, and two iOS project tests passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built; no physical phone was tested. A separate Android 11 software emulator booted and installed the earlier v218 app and an instrumentation test APK, but instrumentation timed out after 150 seconds without a test result; the picture touch and rendering remain unverified in Android. The emulator was stopped.

## 5 November 2026: touching the screen picture

An isolated, fresh v217 team/bell/warm-welcome run chose the team hint and Niko, the crown, brother and future, and the spring. It checked the ticket count, let Mallow repeat the claim, rescued Mira and reached the contact ending. The spring and earlier choices paid off coherently, and saving and resuming restored the bell and count choice. The rescue still resolves quickly after the lengthy explanation. The run used written dialogue with sound and auto-read off, without connected AI or a physical phone.

In the current build, the witnessed picture itself can activate the existing choice to ask Mallow to check the count. It uses the same choice handler and history as the text button; a fictional fingerprint then appears on the screen. The screen retains its text choice, and older or inconsistent saves do not invent a witnessed picture. Automated app tests cover all three drawings, save/resume, the fingerprint and legacy checkpoints.

An independent isolated browser activated all three pictures using a pointer, and checked the star with Tab and both Enter and Space. Saving and resuming retained the star and its interaction; at 320×700 the bell, ribbon and fingerprint were visible without horizontal clipping. Legacy checkpoints were covered by the automated tests, not independently injected into the browser.

All 120 JavaScript tests, eight Kokoro service tests, native add/staging/configuration and icon checks, and two iOS project tests passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched both native asset directories and both APKs. An isolated Android 11 emulator booted but installation of the earlier v217 APK timed out, so this attempt did not verify Android rendering or touch behavior. The emulator was stopped. The iOS project was synced but not built; no physical phone was tested.

## 5 November 2026: chosen signal on the screen

A fresh isolated v216 Mira/date/play/future route chose the prize motive, star, warm welcome, direct hint, named knight, sewing string, familiar landing and kept souvenir, then opened the door and folded the paper moth. The string payoff, choice save/resume and contact ending were coherent; no blocker was observed. The run used written dialogue with sound and auto-read off, no connected AI and no phone. It exposed ambiguous references to Mallow’s screen versus the plush upstairs, and to the plush moth versus Mira’s newly folded paper moth; the relevant lines now identify the plush. Story and voice-cue tests cover the revised lines.

The witnessed star, bell or ribbon now appears as original vector art on Mallow’s count display during its introduction and following choice. The choice narration names the drawing for read-aloud and resumed saves; older or inconsistent checkpoints do not invent it. Story/app tests cover all three, save/resume, the legacy path, sound and offline assets. An independent isolated browser inspected all three at desktop and 390px widths, exercised keyboard advance and saved bell/ribbon choices, and found no observed horizontal clipping. Reduced-motion handling passed a stylesheet regression but was not emulated in a browser; sound was off and this was not a physical-phone test.

The first-use voice/ASR and publisher-reference review found no new reproducible defect; seven focused suites passed (29 top-level checks). This does not establish actual microphone use, audible quality, physical-device behavior or the creator’s future reference file.

All 120 JavaScript tests, eight Kokoro service tests, mobile add/staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 74 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Ash ending, rescue transitions and browser voices

A fresh isolated v215 Ash/date/play/personal route chose direct card and map comparisons, bell, no kit, the building inspector, lanterns, doorstop, EXIT sign, kept souvenir after save/tear/resume, private refusal, confirmation followed by Mira’s description, a torn player quote, covered lens and direct rescue. At the new Ash ending moment, saving, marking the map, resuming and leaving it blank produced distinct responses; the contact ending followed without a blocker. The rescue and callbacks were coherent, while the receipt still slowed the urgent scene. Written dialogue was used with sound and auto-read off; this full run did not test AI or a phone.

New witnessed tool and souvenir paths now move directly to the physical rescue action, omitting the repeated standalone reach passage. Original intermediate nodes remain for older or incomplete checkpoints. Story and app tests cover all three tools, both souvenir states, save/resume and AI callbacks. An independent isolated browser used synthetic checkpoints to check Niko’s spring and a torn-souvenir shortcut, saving/resuming both, plus an older marker-free kept-souvenir path. Sound was off; no phone was tested.

An isolated v215 browser used a real separate Kokoro service to read the Mallow/Mira team-wave scene. Four requests used the Narrator, Mallow, Narrator and Mira default voices in order, and the UI reported playback. Stopping a second read prevented later segments from being requested. This checks browser routing and cancellation in one scene, not audible quality, a microphone, ASR or a physical phone. Separate mobile-sized browser checks found the next passage visible after scrolling and choosing from a long audit at 390×844, and the synthetic annotation flow usable at 844×390; they do not test an on-screen phone keyboard or hardware safe areas.

All 118 JavaScript tests, eight Kokoro service tests, mobile add/staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: relationship moments, receipt and Android first run

A fresh isolated v214 Mira/date/play/personal route chose two warm comparisons, company, ribbon, a named knight, the familiar EXIT, a kept souvenir after save/tear/resume, private refusal, Mallow’s quoted answer, an unplugged printer and Mallow rescue. The named card, workshop conversation, receipt/citation, folded scrap, Mallow and date callbacks were coherent and the ending was reached without a blocker. The comparative receipt remained long during the rescue, and a standalone pocket transition also felt redundant. Written dialogue was used with sound and auto-read off; this was not an AI or phone test.

For new resolved routes where the companion accepted a date invitation, the player can now share a small character-specific counter moment or leave the plan open. Friendship, unresolved retreat and older checkpoints retain their paths. Story, app and voice tests cover all three companions, both actions, both privacy signals, saves and continuation. Isolated seeded browser checks exercised both options for each companion, save/resume and Mallow continuation; they were not complete playthroughs of the new endings and used no audio or AI.

New runs display the two earlier comparisons in shorter receipt format, retaining the exact selected and unselected wording. Older checkpoints retain the previous prose. App tests cover all nine comparison combinations, both signals, save/resume, read-aloud, recent history and witnessed AI context. A seeded isolated 390×844 browser check showed correct labels and wording, restored the passage and retained older checkpoint prose without observed horizontal overflow; no physical phone or audio was tested.

An isolated Android 11/WebView 83 software emulator ran the actual v214 APK and passed native instrumentation `OK (1 test)` in 44.613 seconds: real touches advanced from the opening, displayed Niko’s portrait, selected the first choice, saved, recreated the activity and restored the exact passage. The emulator was stopped. This did not test AI, audio, the full game, v215 or a physical device.

All 118 JavaScript tests, eight Kokoro service tests, mobile add/staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: activity before invitation

For new runs, each companion’s optional date/team invitation now follows the shared activity and comes before the first private conversation. Mira’s path preserves both named and unnamed knight choices. The companion’s actual answer remains available to the private AI conversation; older checkpoints retain their original order. The 891-path story graph and app regressions cover all companions, activities, invitation outcomes, save/resume, first AI context and incomplete or legacy checkpoints. Voice and sound checks passed.

An isolated browser check followed Mira’s drawing and named knight to the invitation, saved, accepted the date, resumed, chose friendship and reached her personal conversation. A fresh Niko run went from the crown and brother’s note to the invitation and task-focused conversation. Both used written dialogue with sound off; no phone was tested. A separate synthetic Niko checkpoint with local Qwen2.5 7B verified that the chosen date and acceptance reached the production request; one generated reply recalled the milkshake. See MODEL_EVALUATION.md for limits.

A fresh frozen v213 Ash/friend/care/personal playthrough reached the Mallow-rescue ending. The direct greeting, earlier-welcome recall, compact audit, covered lens, folded scrap, doorstop, EXIT sign, ribbon, date-free relationship and plush placement were coherent; save/resume worked at souvenir and audit choices. No blocker was observed. The compact audit was actionable, but the preceding comparison passage still felt long during the rescue. Written dialogue was used with sound and auto-read off; this full route did not test an AI service or phone.

An isolated real Kokoro process synthesized the same sentence using each of the seven default speaker IDs through the production adapter. Each returned a nonempty WAV with distinct bytes; this does not establish audible distinction, browser playback, phone behavior or the creator’s future reference.

All 118 JavaScript tests, eight Kokoro service tests, mobile add/staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: compact audit and Android conversation

New runs bring the fresh circular audit, Mira’s chosen focus response and the four existing physical actions together in one scene, removing two advances without removing the audit or action consequences. Older checkpoints retain their original passages. App, story and voice tests cover both focus variants, all four actions, save/resume, AI witness context and malformed markers; the story graph covers 891 core paths. An independent isolated Chrome checkpoint check at 390×844 exercised both variants, all four tell-branch actions, save/resume and an older checkpoint. The combined text and choices required vertical scrolling but showed no horizontal clipping. Sound was off; this was not a physical-phone test.

An isolated Android 11/WebView 83 software emulator installed the actual v212 APK. After dismissing a System UI ANR, a synthetic warm-preference conversation sent its first request to a mock provider with the expected response style. Instrumentation saved the first reply, recreated the activity, resumed that exact reply and reconnected without another request. The fixture then stalled during retry editing; Android keyboard and touch input submitted revised text, producing exactly one further request with the same warm style and displaying the second reply. This was mixed instrumentation and manual completion, not a fully passing automated test; it used a mock provider and did not test a real model, speech, physical phone or complete game. The emulator and mock were stopped.

A separate synthetic 20-reply local Qwen2.5 1.5B comparison of two player-message formats still produced narration, self-address and invented details. No prompt format was changed; see MODEL_EVALUATION.md for the sample’s limitations.

All 118 JavaScript tests, eight Kokoro service tests, mobile add/staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: natural steering route and Android startup diagnosis

A fresh isolated v212 Niko/date/care/past/team playthrough chose the direct welcome and map comparisons, the free kit, a star, spring and service-stair notch rubbing, private refusal, kept souvenir, Mallow-quote handoff, custom audit annotation and record-first ending. The direct first Mallow greeting appeared in normal play; the later direct response showed its unselected warm opening and recalled the witnessed welcome. Saving at the souvenir, tearing it, resuming and keeping it worked. The folded scrap, apology, bandage/wrench and milkshake callbacks were coherent; the ending and contact control were reached without an observed blocker. The receipt/comparison/citation sequence still felt dense during the rescue, though the early paper action helped. Written dialogue was used with sound and auto-read off; no live AI service or physical phone was tested in this playthrough.

An isolated browser with a synthetic Niko checkpoint and local Qwen2.5 7B exercised initial, retry and follow-up conversation requests. Warm preference conditioning reached each request; save/resume restored the first reply without another request, and the follow-up contained the revised exchange. The model added an unestablished detail. See MODEL_EVALUATION.md for times and limits. Sound was off; this was not a phone test.

The previous Android test had no useful diagnostic logs. A separate isolated Android 11/WebView 83 software emulator installed and launched the actual v212 APK with logcat capture. Android System UI displayed an unresponsive-process dialog and logged an ANR during boot. After selecting Wait, the opening appeared and an emulator touch advanced to the first Narrator passage. This establishes an emulator system obstruction in this run, not the cause of the previous blank test. It does not verify Android AI, save/resume, retry or physical-device behavior. The emulator was stopped.

## 5 November 2026: written preference steering

A fresh isolated v211 Ash/date/care/personal run chose the team motive, ribbon, two warm comparisons, no kit, the stair-notch rubbing, private repeat, a torn Mallow line, unplugged printer and Mallow rescue. The receipt choice restored after save and resume; the folded scrap, doorstop, lanterns, rest stop, ribbon and date callbacks were coherent. No progression blocker was observed. The reveal remained somewhat text-heavy while Mira was trapped, though the earlier handoff made it more active. Written dialogue was used with sound off; this was not an AI, audio or phone test.

A new run now uses a completed welcome-card choice to select Mallow’s first written greeting; delegating the choice retains the original. The later reveal recalls the greeting only when witnessed, including when the final comparison policy is tied. Older and incomplete checkpoints keep their previous path. App, story and voice tests cover direct/warm/skip, save/resume, tied policy, absent or mismatched witnesses and read-aloud. A separate isolated browser used synthetic checkpoints to check both greetings, skipped and older paths, and a tied reveal with the earlier greeting; save/advance/resume worked. Sound was off; this was not a physical-phone or voice playback test.

An isolated Android 11/WebView 83 software emulator installed the v211 game and instrumentation APKs, but the test WebView remained blank during a bounded wait and no mock request arrived. The companion-style request, save/resume and retry were not verified by this attempt; the blank screen could not be attributed to the app or emulator initialization. The emulator and mock service were stopped.

All 117 JavaScript tests, eight Kokoro service tests, mobile add/staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: companion steering and retreat route

A fresh isolated v210 Niko/team/play/prize run chose a warm welcome and direct map notice (a tie), skipped the kit, repeated private words, tore the player’s public line, left the audit intact, and reached the retreat ending. Saving and resuming the early paper choice worked; the folded scrap, brass spring, search pattern and neutral preference result were coherent. No blocker was observed. The final prize line has been corrected to keep the unconfirmed ticket location uncertain while Mira remains below. The run used written responses with sound off; no real AI service or phone was involved.

Generated companion dialogue in new runs now receives the existing direct/warm preference instruction after witnessed comparison choices. The bounded style field is separate from the scene context; ties, skipped comparisons and older checkpoints do not acquire a new instruction. The authored story is unchanged apart from the ending correction. App tests cover all companions, private and midpoint conversations, first and both comparisons, ties/skips, older saves, retries, follow-ups, bounded contexts and save/resume. An isolated browser with a synthetic checkpoint and mock provider confirmed the warm instruction on the initial message and retry, with no extra request on resume. This verifies request construction, not model adherence.

An isolated local Qwen2.5 1.5B CPU probe sent six synthetic direct/warm companion requests through the production adapter. One used the written fallback, two Mira replies addressed Mira by name, and one Ash reply invented traps. These examples do not establish general model quality or reliable tone steering. See MODEL_EVALUATION.md. A Dory-enabled CPU runtime was separately built at NVIDIA’s pinned source revision and passed eight architecture checks with generated random fixtures; no Dory weights were downloaded or used, so actual Dory inference and GPU/device behavior remain untested.

All 117 JavaScript tests, eight Kokoro service tests, mobile add/staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Mira route, local voices and model probe

A fresh isolated v209 Mira/team/care/personal playthrough chose the company motive, star, two direct comparisons, no kit, string, private refusal, Mira’s room description and a direct rescue. At the revised early paper choice, saving, tearing Mallow’s line and resuming restored all four choices; sharing the whole sheet then led coherently through the comparisons, Mira’s denial, the unselected-opening panel and fresh audit. The folded sheet, latch, string and ending callbacks followed; the contact ending was reached without an observed blocker. Written responses were used without a connected model. Sound was enabled near the end, but actual physical playback quality was not assessed; no physical phone was tested.

The run found Mira’s half-finished plush introduced twice in consecutive beats. When a new run has already displayed the plush and Mira’s connection response, the next line now offers the loose ear and pencil without repeating the introduction. Older or incomplete checkpoints retain the full wording. App tests cover both team/date choices, save/resume and Narrator read-aloud. A separate isolated browser replay checked the date choice and resume; sound was off.

An isolated Kokoro service synthesized the authored team-wave scene through the game’s production adapters as four nonempty WAV segments with distinct Narrator, Mallow and Mira voice IDs. Focused speech and voice tests passed; this does not test speaker playback, a physical phone or the creator’s still-unprovided reference. A separate 20-response synthetic local-model experiment compared the existing prompt with an explicit-first-person candidate. Narration still appeared in examples from both, so the prompt was not changed; see MODEL_EVALUATION.md and the opt-in reproduction harness for scope and limitations.

All 117 JavaScript tests, eight Kokoro service tests, mobile add/staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Ash playthrough and earlier paper handoff

A fresh isolated v208 desktop run chose Ash, a date and playful inspector drawing, two warm comparisons, a free repair kit, the service-stair sign, a torn souvenir, private refusal, confirmation followed by keeping the receipt, and the record-first ending with the lens covered. The new preference reveal showed the unselected direct opening after Mallow gave the selected warm response. The copied arrows, folded scrap, repair kit, ribbon, inspector and date callbacks were coherent; saving and resuming the audit choice worked. No blocker was observed. Written responses were used with sound and auto-read off; no real AI service, audio or phone was tested. The receipt sequence was still dense while Mira was trapped.

New runs can now choose what to do with the printed player/Mallow exchange earlier, before the actual comparison evidence and circular citation appear. Each of the four choices retains its physical consequence: the whole sheet is returned, Ash keeps it, or one chosen line is torn off and folded back. The later report appears on screen, Mira hears and denies the forged attribution, and the audit still uses a fresh slip. The latest submitted public follow-up is printed. Older checkpoints keep the previous route. Story, voice and app tests cover both signal routes, the choices, long messages, save/resume, witnessed AI context and incomplete checkpoints.

An independent isolated browser check used a synthetic checkpoint and near-limit messages to exercise all four handoffs, the returned sheet or retained remainder, subsequent comparisons and citation, and save/resume. At 390×844 there was no observed horizontal overflow, but long messages needed substantial vertical scrolling. Sound was off; this was not a physical-phone or live-model run.

A separate isolated launcher test used the production adapters with local Mirid, Kokoro and synthetic input. Speech returned WAV audio and the synthetic Parakeet fixture was transcribed. Two Qwen2.5 1.5B replies contained third-person narration; one 7B reply was conversational but slower. The README now explains how to try the already-installed 7B model and its memory/latency tradeoff; these few responses do not establish general quality. See MODEL_EVALUATION.md. The README also clarifies that the source archive excludes the debug APK and links to build instructions.

All 117 JavaScript tests, eight Kokoro service tests, mobile add/staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: visible steering and cached updates

In the steering reveal, a player with a clear learned preference now sees the other authored opening on the arcade screen while Mallow delivers the selected response. It adds no advance and does not imply the unselected line was spoken. Tied, skipped and older checkpoints without the comparison marker do not show it. The game's own read-aloud uses the Narrator for the screen line, and Recent story records it separately. App and story tests cover both preference routes, ties/skips, legacy and malformed checkpoints, voice routing and save/resume. Isolated Chrome checkpoints on the final source displayed each alternative and restored it after save/advance/resume; at 390×844 the warm scene wrapped without observed horizontal clipping, with vertical scrolling. Sound was off and checkpoints were synthetic; this was not a physical-phone or voice-quality test.

A correction cue was previously attached only to older passages skipped on modern routes. Both current correction passages now play the existing short static and descending tone. Web Audio tests cover the current paths, cue equivalence, mute, backgrounding and auto-read waiting; actual speaker playback was not tested. The late shadow was visible after its intended fade-in in separate desktop and 390×844 browser checkpoints, so no positioning change was made.

An isolated browser test using v180 and v206 APK asset snapshots exposed an update defect when the host sent one-hour HTTP cache headers: the new worker installed old HTTP-cached assets. The candidate worker requests each shell asset with cache reload during installation. In the same controlled test it fetched the newer files; after applying the update and stopping the server, the game opened offline to its first passage. The candidate test used v206 assets plus the fixed worker, not the final package; it does not establish every server or update path. PWA tests cover the install request mode. Test servers and tabs were closed.

All 117 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Niko playthrough and reveal pacing

A fresh isolated v206 desktop playthrough chose Niko, a milkshake date, the sorted-screws activity, a service-stair rubbing, the kept card, a public repetition of a private question, Mira’s description, Mallow’s quoted answer, an unplugged printer and the Mallow rescue. Earlier choices paid off and the Niko/Mallow ending was coherent, with no observed progression blocker. The reveal was still dense while Mira was trapped; this single run took roughly 120–140 screens. It used written dialogue with sound and auto-read off and no AI service or phone.

The discovery now removes a generic announcement and combines the tag/receipt/map stamp with the card’s emergence. The individual picture scenes remain intact, including their AI context. Niko’s response no longer repeats the picture’s count. The later screen callback and companion reaction now share a passage for new runs, retaining the remembered choice, character portrait, distinct voice cues and picture callback. The Mallow rescue skips a redundant turn toward the counter, while the covered-lens request and choice remain. Older checkpoint passages remain available. Graph and app tests cover companion and activity combinations, both check actions, the Mallow evidence and lens variants, save/resume and legacy paths.

An isolated browser checkpoint displayed the revised Niko card scene and choices. Another at 390×844 displayed Mira’s combined callback with her portrait and remembered-choice panel; save, resume and the following choice worked, with no observed horizontal clipping. These were browser viewport checks, not physical-phone or audio tests.

A separate isolated browser test updated frozen v180 Android web assets to frozen v206 assets, with no-store HTTP headers; the update opened the newer consent and playable story. An earlier mixed-module startup error on a reused test origin did not recur on a fresh no-store origin or in this update test. This checks one controlled update and does not establish behavior for every deployment cache.

An AI integration review found no new reproducible defect in its focused mock/provider and adapter checks (37 tests). A voice review confirmed distinct Kokoro defaults and configuration for one future Chatterbox speaker; focused suites and 20 mocked Nano service tests passed. The supplied reference, public speech services, real-model reliability and physical playback remain unverified; previous local-model tests show that generated dialogue can invent or alter facts.

All 117 JavaScript tests, eight Kokoro service tests, mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Mira pacing and retreat continuity

A fresh v205 isolated desktop playthrough followed Mira’s date and playful knight route to the retreat ending. The workshop, copied tag, service-stair exit, torn souvenir, private choice, unplugged printer and chosen search responses remained coherent. Written dialogue was used, with sound and auto-read off; no AI service or phone was involved. The run exposed an early choice that mentioned an unfinished plush before introducing it, and a detour away from the urgent search for Mira.

The choice now shows the plush first. For new retreat runs, the visit to Mira’s sewing room is motivated by finding search supplies, and the Mallow reflections take place at the fort while the others listen. The late-search transition no longer repeats that the group returns to the fort. Existing choices and older checkpoints retain their paths; regressions cover repeat/private reflections, early/late searches, save/resume, legacy checkpoints and read-aloud text. Isolated Chrome checkpoint tests exercised both Mira choices, the sewing-room preparation and thread, both reflections, save/resume, the corrected late-search choice and the team retreat ending; they used written dialogue without sound. These checks do not establish the overall experience on a phone or with generated voices.

The previous entry described the star as definitively returning to the map. The playroom object is only described as looking like the fort’s star, so the ending now preserves uncertainty about whether they are the same. An isolated browser checkpoint checked the revised line; story graph tests cover the witnessed and older paths.

An isolated Android 11/WebView 83 software emulator running the v205 APK sent a synthetic first message to a mock provider, saved the generated reply, and restored it after activity recreation with the request count still at one. The written-alternative, reconnect and retry sequence was not verified: the slow emulator caused test assertions to race touch processing, and a later run was stopped while still active. The emulator and mock provider were stopped. This does not test a real model, speech, v206 on a device or a physical phone.

All 116 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: written-alternative reconnect and full star route

Selecting the written alternative after restoring a generated reply while disconnected now keeps the retry and its pre-response history, hides Say more until a valid service is connected, and restores the follow-up control on reconnect without sending a request. Regressions cover restored and same-session paths, repeated settings saves, initial and follow-up retries, replaced responses and open drafts. An independent reviewer ran the offline suite and checked that reopening settings does not insert controls beside an active draft.

An isolated desktop Chrome session with a mock provider generated a Niko reply, saved, disconnected and resumed, then selected the written response. Retry remained available and Say more was absent. Reconnecting showed both without another request; an explicit revised message and follow-up each sent one request, with the revised exchange in the follow-up memory. This verifies the UI and request path, not a real model, audio or phone.

A fresh v204 desktop browser playthrough witnessed the star move from the fort to the playroom keyhole, then return to the map in the ending. The kept card, private dialogue, false count, covered lens, rescue and earlier choices were coherent; saving and restoring the reunion choice worked. No blocker was observed. The run used written dialogue with sound and auto-read off; no AI service or phone was tested.

All 115 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: star continuity and Android AI save

A fresh v203 desktop browser playthrough found that the chosen star appeared over a playroom keyhole, but a later line said it was still on the fort map. The story now records whether that move was witnessed and, for those runs, describes the star back on the map without saying how it returned. Older checkpoints retain the original line. Story graph tests cover all four endings; app tests and an isolated browser checkpoint exercise both witnessed and older paths, save/resume and continuation past the picture. The browser checkpoint test used written dialogue with sound and auto-read off.

An isolated Android 11/WebView 83 software emulator used the actual v203 debug APK, synthetic Niko conversation and a mock provider. Real Android touch and keyboard input submitted the first message and a follow-up; after saving the completed reply and recreating the native activity, Resume restored the exact last reply and four review entries. The provider received exactly two requests, and the follow-up carried the first exchange; the saved snapshot contained no endpoint. This is one emulator test, not a physical phone, real model, speech or iOS test. The isolated emulator and provider were stopped.

An independent review and focused app/voice checks found no new reproducible AI-save defect, with the scope limited to those tests.

All 115 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: real-model save and offline reconnect

An isolated v202 desktop browser test with local Qwen2.5 7B saved two generated Niko replies, reloaded and restored the exact latest reply and review without another request. Reconnecting sent nothing; an explicit revised retry sent one request with the correct prior exchange. The model also invented details, so this verifies save and retry mechanics rather than dialogue reliability. See MODEL_EVALUATION.md. Sound was off; no phone or personal input was used.

A fresh v202 desktop Ash friendship/play/light route reached the retreat ending without an observed blocker. Three saved offline written conversations restored their displayed replies. That run exposed a UI inconsistency: after resume, an offline written reply offered Say more even before a service was connected. Restored replies now offer it only when a valid service is connected; reconnecting adds one control without a request, while a submitted unanswered follow-up remains available for retry. App regressions cover disconnected and invalid settings, reconnect, existing drafts and failed follow-ups. A separate isolated desktop browser confirmed offline restoration showed no Say more, connecting a mock service added one without a request, and submitting sent one request. This did not test a real phone.

All 115 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: saving completed AI conversations

A completed AI conversation can now be saved in place and resumed with its displayed reply, bounded conversation review and retry context. Restoration does not send a chat or speech request. Pending AI requests remain unsavable; unsubmitted text and voice input, service settings and credentials are not saved. The save notice identifies an unsent reply or active voice input, and a checkpoint that fails validation or exceeds the size limit does not replace an existing save.

App regressions cover five conversation types, generated and written responses, follow-up failure and retry, reconnect, private/group separation, unsent drafts, pending requests, bounded history, old and invalid checkpoints, microphone capture and no automatic chat or speech on restore. An independent review and app-harness run found and helped fix reconnect and previous-save preservation issues. Isolated desktop browser tests used synthetic private and Mallow group checkpoints and mock chat providers: after save and reload, each restored the exact reply and review, excluded an unsent draft, and sent no new request on resume or reconnect. Explicit retry sent one request with the appropriate earlier exchange. A separate instrumented mock speech service showed auto-read restoration sent neither chat nor speech. These were not real-provider or physical-device restore tests.

A fresh v201 desktop Niko friendship/task-focused route also reached the ending with the chosen bell, welcome-card delegation, badge, audit, rescue and Mallow callback coherent. Written dialogue was used with sound and auto-read off; no AI service or phone was involved in that run.

All 115 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: natural reply and signal wording

The private-dialogue filter now keeps a first-person reply about a named character when the sentence also refers to the player, such as “Oh, Niko! I think he likes you.” Clear repeated-name address and unrelated-name cases retain their previous handling. AI-quality tests passed, and an isolated desktop browser with a synthetic Mira checkpoint and mock provider displayed that reply as AI-generated. This tests one filter and UI case, not a real model, audio or a phone.

A fresh v200 desktop Ash friendship/play/prize route reached the record-first ending. The badge callback, printer reconnection, Mira’s response, Mallow’s ambiguous echo and prize ending were coherent; no blocker was observed. The phrase “the sign you chose” could be mistaken for the welcome card Niko chose, although its following passage refers to the player’s star/bell/ribbon signal. It now says “signal”. An isolated browser checkpoint with Niko choosing the welcome card continued from the clarified line to the selected bell callback. Written dialogue was used with sound and auto-read off; no AI service or phone was tested.

A focused voice and local-launcher review found no new reproducible issue; the 24 top-level checks passed. They do not establish physical-device playback or perceived quality.

All 115 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: handmade badge and natural character reference

After the player has actually received Mira’s blank handmade badge, the ticket-count screen now shows a copy labelled HAPPY TO HELP, and the narration describes it. The real badge’s location is not assumed; older saves without the visit marker keep the original scene. Story, app and voice tests cover the callback, older saves, choice progression and save/resume. An isolated browser with a synthetic checkpoint checked the visible badge and text at desktop and 390×844 widths; sound and auto-read were off. No physical phone or screen reader was tested. A separate fresh desktop playthrough received the badge in the fort, then saw the screen copy beside the false count and continued through the ticket choice without an observed issue; it used written dialogue with sound off and no connected AI.

The private-dialogue filter now retains a natural first-person opinion such as “Oh, Niko! I love how he fixes things” when the player explicitly named that person and the reference is unambiguous. Mocked-provider regressions cover unrelated names, ambiguous references, quotation and direct-address cases. An isolated browser with a synthetic Mira checkpoint displayed the example as AI-generated using a mock provider. This checks one filter/UI path, not general model reliability or real-provider performance.

All 115 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Mira retreat playthrough and integration review

A fresh isolated v199 desktop browser playthrough followed Mira’s care/light friendship route through retreat and the prototype ending. The company reason, ribbon, quiet correction, stair notch, private refusal, public Mallow line, torn card, and call/different-pattern search had coherent responses. The revised pencil beat followed the worktable action naturally, and the chosen thread marked the route back. No blocker or contradiction was observed. This run used written dialogue with sound and auto-read off; no connected AI or phone was tested.

A focused review of private, midpoint and Mallow conversation context, retry, save and settings-change cancellation found no new reproducible issue. The adapter and dialogue-quality checks passed; existing real-model tests still show invented or altered details. A separate review of voice routing, preview and playback cancellation, microphone handling and auto-read passed 19 focused top-level tests without finding a new reproducible defect. These checks do not establish perceived voice quality or physical-device playback; the creator’s reference and selected speaker remain unconfigured.

## 5 November 2026: retreat detail, Nano guidance and Mallow callback

Mira’s task-focused retreat scene now replaces a repeated worktable-clearing description with a pencil moving toward her sketchbook. The existing route is unchanged. Story and voice-cue tests cover both shared activities and preparations; isolated desktop browser checkpoints showed the care and play setups, and saving and resuming restored the revised passage. Sound and auto-read were off; this was not a full route or phone test.

When the local launcher lists only Nano, the status now matches the view: normal mode points to the local creator-audition URL, while creator mode points to the visible audition controls. It does not assume that a publisher voice is absent or change routing. App tests passed for normal, creator and configured-publisher variants; isolated Chrome checked the status and control visibility with synthetic launcher data, not a real Nano service.

A fresh v198 desktop browser playthrough followed Niko’s date/personal route through direct rescue and the company ending. Asking Mallow led to the ambiguous sound in the fort, and saving and resuming restored that passage. Earlier choices and their callbacks were coherent; no blocker or contradiction was observed. Written dialogue was used with sound and auto-read off; no connected AI or phone was tested.

All 114 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Mallow callback, AI follow-up and voice status

On the rescue and record routes, asking the silent Mallow whether it can hear now has an ambiguous sound callback in the existing fort passage. The sound’s source is not identified; rejoining the group, other endings and older or inconsistent saves retain the original wording. App, story and voice-cue checks cover both choices, both endings and save/resume. Isolated desktop Chrome used synthetic checkpoints to check the speak and rejoin paths, an older save and restoration of the callback. Sound and auto-read were off; this was not a full route, audio or phone test.

The private-dialogue format filter now accepts the previously rejected “Oh, Niko! He …” response after an unambiguous immediately preceding exchange about Niko and a matching pronoun follow-up. Ambiguous, unrelated and direct-address cases retain their previous handling. An isolated browser with a synthetic Mira checkpoint and mock provider displayed the response as AI-generated and sent the previous exchange in the follow-up request. This tests one UI/filter path, not general model reliability or a real provider.

When the game becomes hidden during active speech or recording, its status now says voice stopped rather than continuing to claim playback or recording. App-harness regressions cover both, inactive status, no automatic retry and unchanged auto-read preference. An isolated browser reached mock speech playback, but its automation did not produce a verified hidden tab; genuine browser background behavior was not tested.

All 114 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: live local speech and false-ending playthrough

An isolated v197 desktop Chrome session used real local Kokoro and Chatterbox Nano services and an 8.4-second synthetic Flite reference. A creator audition assigned Nano to Mira alone. Mira and Niko previews reached speech-finished; story auto-read routed Narrator, Service and Niko through Kokoro and Mira through Nano. Advancing interrupted playback, and Stop during Mira’s speech turned auto-read off without playback resuming after pending inference finished. A manual Ash request subsequently reached playing, and reopening settings retained the Mira-only assignment and distinct Kokoro IDs. This tests the local routing and playback state, not perceived voice quality, a personal reference, physical Android/iOS or a public shared service. The isolated services, browser tab and synthetic reference were removed.

A fresh v197 desktop browser playthrough followed Mira’s date/personal prize route to the Mallow-assisted ending. The false service report appeared while Mira was trapped, remained through the audit choice and save/resume, and cleared at the following Mallow decision. The player-written annotation, latch, torn souvenir, workshop and date callbacks and prize ending remained coherent. No blocker or contradiction was observed. Written dialogue was used with sound and auto-read off; no AI service or phone was tested in this run.

A separate isolated app-harness matrix covered all four audit actions, including handwritten annotation, and found the false report stayed visible through each action and cleared at the next Mallow choice. It did not test a screen reader or audio.

## 5 November 2026: false-ending interface and receipt playthrough

The service’s false ending claim now appears in the existing in-story report display during the goal reveal and audit, then clears when that sequence ends. It does not replace the actual story controls. The app regression covers the reveal, audit choices, clearing and save/resume. An isolated desktop browser used a synthetic checkpoint to verify the report, keyboard progression, an unplug action and resume; at a 390×844 viewport the report fit inside the dialogue without horizontal overflow. Sound and auto-read were off; no physical phone or screen reader was tested.

A fresh v196 desktop browser run followed Mira’s team/care/personal route through the record-first ending. The public-reply receipt showed the exact Mallow reply with all four actions, and save/resume restored that screen. The chosen folded-corner clue, literal annotation, sewing string, workshop ambition, free kit and company ending remained coherent. No blocker or contradiction was observed; the reveal still has several explanatory passages. This used written dialogue, with sound and auto-read off and no AI service or phone.

A separate voice audit found no new reproducible routing defect in the focused tests. The creator reference and chosen speaker remain unconfigured, and listening quality and physical-device playback were not tested.

All 112 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: receipt interaction and private dialogue filtering

On current routes where Mallow’s public reply was witnessed, the receipt now presents the four existing paper actions on the same passage as the printed answer, saving one advance. The earlier public message, Mallow reply, report flags, character voice cues and old-save path remain. Story, app and voice-cue tests cover all four actions, long literal messages, quote collisions, save/resume and inconsistent checkpoints. An isolated desktop Chrome test at 390×844 used a synthetic checkpoint and a 700-character reply; the four controls fit without horizontal overflow, a selected action worked, and saving and resuming restored the reply and choices. Sound and auto-read were off; this was not a phone or full v196 playthrough.

A dialogue filter no longer discards the specific third-person response “Oh, Niko! He …” when the player explicitly asked about Niko. Tests retain rejection of clear direct address and cover other names, unrelated questions and quotations. An isolated desktop browser with a synthetic Mira checkpoint and mock provider displayed that response as AI-generated. This verifies a format-filter and UI case, not real-model factual reliability, audio or phone use.

A fresh v195 desktop Ash/date/personal prize route reached the direct-rescue ending with the chosen ribbon, map notice, torn monster, lantern anecdote, annotation, doorstop and watch-door choice coherently reflected. No blocker or contradiction was observed. Written dialogue was used with sound and auto-read off, no AI service and no phone.

All 112 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: offline creator link and full Mallow route

The exact local `?voice-creator=1` navigation now uses the already-cached game shell when available. Other query-bearing requests remain outside this special handling, and the query is not stored in CacheStorage. PWA policy tests cover navigation scope, authorization, method, origin, other queries and cache misses. In isolated desktop Chrome, after loading the shell and stopping its test server, the creator root and index links opened offline and displayed the creator audition controls; the ordinary root also loaded. This did not test voice synthesis, an installed PWA or a phone.

A fresh v194 desktop browser playthrough followed Niko’s task-focused friendship route through the revised team-reason decision and Mallow-assisted hand-held catch ending. Saving at the revised decision and resuming restored the same remembered answer and choices. The kept picture appeared immediately after the star as intended, and character callbacks remained coherent through the prototype ending. No blocker or contradiction was observed, though the reveal still has several explanatory passages between decisions. Written dialogue was used with sound and auto-read off; no AI service or phone was involved in this run.

A separate real Qwen2.5 7B test of Mira’s public card conversation recalled the witnessed knight’s name but altered or embellished the eye’s action. This was two synthetic responses from a seeded desktop scene, not a reliability estimate; see MODEL_EVALUATION.md.

All 111 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: reveal and Mallow-rescue pacing

The current reveal combines the recalled opening choice and its character response with the existing decision about what to tell Mira. For all three reasons, the tell/listen decision arrives two advances earlier while retaining both receipt routes and the original passages for older checkpoints. Story, voice-cue and app tests cover all reasons, both private/repeat paths, both decisions, saved and incomplete checkpoints. An isolated desktop browser checked three reason/path combinations, both decisions, save/resume and an older checkpoint; these were seeded scene checks with sound and auto-read off.

A fresh v193 desktop Ash friendship/task-focused playthrough reached the Mallow-assisted ending without an observed blocker or continuity contradiction. It found two consecutive introductions to the saved picture. On current Mallow routes where the player actually held the catch by hand, the story now goes directly from the keepsake to the appropriate folded or torn picture. The wedge callback and old or incomplete checkpoints keep their previous path. Story and app tests cover both picture states, all keepsakes, wedge and save/resume. An isolated browser checked the held, wedged and old-save paths from synthetic checkpoints and restored the held picture after saving; it did not play the full v194 route or audio.

A separate voice-routing review found no new reproducible defect in the tested Kokoro defaults, publisher assignment, cues or player settings. The creator’s reference and chosen speaker remain unconfigured; actual listening quality and physical-device playback were not tested.

All 111 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: named-card context and Mira route

Mira’s public card conversation now includes the knight’s name and the eye closing in model context only when the matching named-card passage was actually witnessed. The app tests cover first and follow-up requests, unrelated routes, missing flags and bounded escaped names. An isolated desktop browser with a synthetic checkpoint and mock provider confirmed both requests carried the printed name and eye event; the follow-up also carried prior conversation entries. This checks the supplied context and request path, not real-model recall.

A fresh isolated v192 desktop browser playthrough followed Mira’s date and personal route through the record-first ending. The chosen clue, private-message sharing, handwritten annotation, folded-corner latch, Mira’s response to being kept waiting, and workshop and date callbacks were coherent; no blocker or contradiction was observed. The reveal remained exposition-heavy. The browser displayed the repair-offer name save notice. Sound and auto-read were off, with no AI service or phone in this run.

An accessibility review confirmed the existing dialogue container is already a polite live region. A proposed nested live region was removed to avoid possible duplicate announcements; no screen reader was tested.

All 111 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: company ending, offer save and creative dialogue

The resolved company ending now has Ash make room beside them, recalling the shared reason for coming without assuming a romance. The separate retreat ending remains unchanged. An isolated desktop browser checked the resolved ending, an older save and the retreat ending from synthetic checkpoints; sound and auto-read were off.

Saving with a nonblank repair-offer name now says that the name was not saved. The existing offer and save behavior remain unchanged. The app test covers blank and nonblank names, the on-screen value, the empty field after resume and the existing unsent-reply notice; this notice was not separately tested on a phone or in a browser.

A fresh isolated v191 desktop browser session with local Qwen2.5 7B produced two relevant replies to a synthetic creative exchange about Mira’s named knight. This is one conversation with sound off, not a reliability estimate; see MODEL_EVALUATION.md for the prompts and response summary.

All 111 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: reunion choice payoff and Niko record route

The immediate-rescue choice now has a physical callback in the existing fort passage. The ticket route shows the player placing Mira’s piece separately; on the door-watch route Mira places the piece she carried. A visit marker and matching ending and choice guard the callback; older or inconsistent checkpoints keep the original passage. App, save/resume, story and voice-cue tests cover both choices and legacy cases. An isolated desktop browser used synthetic checkpoints to check both callbacks and the original legacy wording, and restored the ticket variant after saving. Sound and auto-read were off.

An isolated Android 11/WebView 83 emulator used a synthetic Niko conversation checkpoint and exposed an in-story input moving below the visible area when rotating with the keyboard open. The draft survived and could be recovered by scrolling. A test APK with the resize fix kept the focused draft visible through both rotations; the tester dismissed the keyboard, added text and submitted it successfully. Automated checks cover debouncing, draft preservation, focus changes and removed fields. No physical phone or iOS device was tested.

A fresh v190 desktop browser playthrough followed Niko’s date and personal route to the record-first ending, including unplugging and reconnecting the printer. The chosen objects, private-message sharing, count correction, folded scrap and consequences of printing first returned coherently; the run reached the ending without an observed blocker or contradiction. The test used written dialogue, no connected AI service and no audio.

All 111 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Mira's post-reveal response

An Android 11/WebView 83 software emulator reproduced a settings dialog leaving the viewport when rotating with the on-screen keyboard open. The fix anchors the native dialog, restores a focused field after resize and guards dynamic viewport units with a support check. An isolated APK with the guarded implementation kept the focused URL visible above the keyboard on rotations in both directions; opening settings in landscape, typing, hiding the keyboard and closing settings were also checked. The isolated APK included a temporary diagnostic overlay, which is not in the project. Focus and closed-dialog regressions passed. No physical phone or iOS device was tested.

Mira’s three post-reveal responses now link her urgent request to the arcade’s cheerful assessment while preserving the receipt and folded-scrap callbacks. The story graph covers 891 core paths, and voice-cue tests passed. An isolated desktop browser used synthetic checkpoints for all three variants; each displayed the correct callback and revised line, then continued to the covered-lens passage. Sound and auto-read were off. This does not establish that the full reveal’s pacing is resolved.

All 110 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: retreat pacing and local model names

The two retreat signal choices now each reach the signal experiment three advances sooner. Tap and call retain their different responses and the uncertainty about the sound. Checkpoints created before this change continue through the original passages. Story, app, save/resume and voice-cue tests cover both current and legacy paths, including Niko and Ash's distinct speech assignments. This change does not establish that the full retreat route's pacing is resolved. An isolated v189 desktop browser, started from a synthetic retreat-choice checkpoint, reached the new tap and call passages and the signal experiment for each; saving and resuming on the tap passage restored it exactly. Sound and auto-read were off.

An isolated v188 desktop playthrough followed Ash’s personal/date route and retreated, then tapped twice, tried a different pattern and followed the sound with Ash. The warning bell, private message, torn monster souvenir, free kit and lantern anecdote returned coherently; Mira remained downstairs and the run reached the prototype ending without an observed blocker or contradiction. The older retreat dialogue repeated its uncertainty several times, motivating the shorter current passages. Sound and auto-read were off; no live AI or phone was tested.

The isolated local launcher and game now accept the same bounded GGUF model filenames, including names containing parentheses or Unicode, while rejecting paths, control characters and oversized names. An isolated launcher supplied a parenthesized model name to the real game setup reader; this check did not load the model or run inference. Focused tests cover launcher and browser validation.

All 110 JavaScript tests and eight Kokoro service tests passed, as did native staging, configuration and icon checks. The launcher suite passed six tests with one skipped because its required port was already in use. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: repair-kit surprise and publicity review

The in-game name prompt no longer lists the names that receive the free repair kit, preserving the discovery. The free-alias matching is unchanged. The existing app regression exercised all three aliases, an unavailable paid offer, claim rechecking and saved kit use; the revised label was not separately browser-played. The publicity draft now foregrounds the opening agreement and makes its attribution to the creator's recollection explicit. The referenced video wording has not been independently listening-verified.

All 109 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: voice preview and interruption testing

A browser-like settings regression reproduced the companion's six-per-minute token limit when switching between seven Realtime speaker previews. Switching speakers now stops the previous preview while preserving a valid token; changing credentials, closing settings, and explicitly stopping still clear it. The regression dispatches settings events, previews seven speakers with one issuance, and checks playback cancellation and late results.

A separate voice test reproduced an in-flight token request surviving a failed prefetched speech segment. Failure now aborts the request, ignores a response that arrives after cancellation, and obtains a fresh token for the next read. These checks use simulated providers, not a live OpenAI account or physical audio. The publisher's one optional Chatterbox speaker remains unconfigured; other cast members retain their individual Kokoro voices.

An isolated v186 desktop browser playthrough followed the prize, Mallow-help and Mira friendship route. Early choices and responses matched, and the misrecorded answer and later physical callbacks to the ribbon, plush and cardboard knight were coherent through the playroom. Saving at Ash’s playroom souvenir choice, reloading and resuming restored the exact passage, illustration and choices. The reveal recalled the selected prize, partner, ribbon, card and privacy decisions; the Mallow-assisted rescue used the saved souvenir, and the post-rescue scenes led to the prototype ending without an observed contradiction or gameplay blocker. Sound and auto-read were off; this does not test generated dialogue, audio or a phone.

All 109 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Realtime speech continuity and post-rescue pacing

The Realtime speech client now reuses a valid client secret in memory for the same companion and pairing credential until shortly before its returned expiry. Settings changes, credential changes, failure and cancellation handling are covered; no secret is persisted. A local TLS integration used the actual companion gateway with a simulated upstream and WebSocket: a Chatterbox segment followed by six Realtime voices and another passage used one client-secret issuance for seven sessions. This did not use a real OpenAI account or test physical audio. The API permits a client secret to create multiple sessions before expiry; see the [client-secret reference](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create).

On current rescue/record routes, the keepsake response now leads directly to the matching kept/torn picture passage, skipping a redundant advance. The prior passage remains available for older or incomplete saves, and the Mallow-wedge and retreat paths retain their behavior. App tests cover direct and legacy combinations; story graph checks cover 891 paths. A fresh-origin browser test resumed a seeded post-rescue checkpoint and confirmed the star-to-kept-picture transition. An earlier full browser run served stale cached assets, so it does not verify the current shortcut.

All 109 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: voice routing and reveal pacing

A synthetic Flite reference was used with isolated real Chatterbox Nano and Kokoro services. In a v184 creator-audition browser session, Narrator preview and story speech reached playback through Nano, while Niko preview and dialogue used Kokoro. A separate verified-TLS Node test reconstructed the publisher assignment and returned WAVs for Nano Narrator and Kokoro Niko. No personal reference, audible quality judgment, public deployed browser endpoint or phone was tested.

The experimental Realtime option now assigns distinct supported voices to the seven cast speakers for story segments and previews; if the selected narrator voice collides with a cast default, the two are swapped. The creator’s Chatterbox assignment still overrides only its selected speaker. Mocked tests cover the mapping, collision, previews and mixed speech. A real Realtime provider was not used. The legacy fixed Linux Mirid mode is now labelled single-voice; it remains optional.

The CONFIRM branch now uses the existing compact touch/count passages, and current runs skip a repeated door-lift passage before the same remembered reason. Existing choice flags, other reveal beats and legacy checkpoint nodes remain. App and story tests cover touch/count, both photo choices and three reasons, missing reason and older saves. A clean-origin desktop Chrome playthrough of the CONFIRM/touch route reached the Mira focus choice in seven passages rather than nine, and the selected response led correctly to the receipt. Legacy gate restoration was checked by the app test rather than injected into the browser.

All 107 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: creator-only shared voice audition

Normal player settings no longer expose the Chatterbox reference controls. On a loopback desktop URL with `?voice-creator=1`, the creator can audition an independently supplied reference for one selected speaker for the current session; this does not configure a shared public voice. A private native audition build can opt in explicitly, while the distributed default remains off. The future publisher assignment is still unconfigured pending the creator’s file, speaker and service. Once configured, the assigned speaker is preserved through ordinary player settings, presets and resets; other characters keep their separate Kokoro voice IDs. No creator recorder was added.

An isolated Chrome check confirmed that normal settings hide the reference controls, the local creator URL reveals them, and a synthetic Narrator assignment survives reopening settings while other voice IDs stay distinct. The configured-publisher, creator-audition and URL tests passed, including preview and playback routing with synthetic settings. No personal reference, voice synthesis, audio playback or native audition build was tested in this check.

All 107 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: friendship route and corrected shared-scene context

An isolated v181 desktop Chrome playthrough followed Niko’s friendship option through the rescue ending. His team response, the chosen repair spring and his earlier lesson remained coherent; no date callback appeared. The feedback link displayed and was not opened. This was written desktop dialogue, not generated AI, audio or a phone. An additional Ash friendship playthrough on v181 also reached the rescue ending without a date callback. In an Android 11/WebView 83 software emulator, v181 displayed Niko’s two relationship choices, gave the team response, restored the saved choice, and gave the date response; no Capacitor console errors appeared. This did not test a physical phone, AI, audio or a mobile ending.

The shared Niko/care AI setup had turned “the two of you” into “the two of the player,” obscuring that the player and Niko were present. It now states those two people explicitly. Actual-request tests cover initial and follow-up context across companion, activity and card variants. A fresh isolated v182 Chrome playthrough of Niko’s care route sent a synthetic shared question; the captured initial and follow-up requests contained the corrected player-and-Niko wording. Synthetic replies verified the UI/request path, not model accuracy. A small synthetic Qwen2.5 1.5B comparison still produced incorrect or contradictory answers even with the corrected context; see MODEL_EVALUATION.md for the exact scope and limits. This fixes the supplied wording, not general model reliability.

All 104 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Mira and Ash relationship routes

Two isolated v181 desktop Chrome playthroughs tested Mira and Ash separately. Each saved at the relationship choice, selected the team option, resumed, and selected the invitation. Mira’s personal route and Ash’s personal route each continued through immediate rescue to the matching callback; saving, advancing and resuming restored that callback. No continuity or functional defect was observed in those routes. These were written-dialogue browser runs, not generated AI, audio or phone tests.

A separate synthetic Qwen2.5 7B probe sent each companion’s selected team or invitation exchange through the production dialogue adapter. The model recalled one invitation but invented or substituted details elsewhere. The team question presupposed a later plan that the team choices had not established. See MODEL_EVALUATION.md for the exact scope and limitations; the probe does not establish a reliability rate.

## 5 November 2026: optional companion connection choices

After the arcade’s match label, each companion now has a brief choice between keeping the task with a friend and suggesting a date. Their own answer is separate from the machine’s claim; a witnessed invitation can receive a callback after a resolved ending. Tests cover all three companions, both choices, ending variants, old and inconsistent saves, voice cues, and private AI context for the selected exchange without sending it to Mallow. An isolated Chrome run selected Niko’s team option, resumed the choice, selected the date, then reached and restored the later callback on the record route. The browser run used written dialogue; it did not test audio or a phone. Separately, a v180 Android 11/WebView 83 emulator sent a synthetic free-typed question through an isolated bridge to the real Qwen2.5 1.5B Mirid model and displayed its generated response. The response contradicted the witnessed headcount and referred to Niko in the third person. This was one stochastic reply on a software emulator, not a physical phone or a test of the new v181 scenes; see MODEL_EVALUATION.md.

A separate synthetic local-model comparison found no basis to replace the default: both Qwen2.5 7B and the official Qwen3 8B quantization invented details and missed the tested corrections. MODEL_EVALUATION.md records the setup, provenance, results and limits; the downloaded trial model was removed.

All 104 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: local dialogue comparison and Android speech path

A synthetic comparison tested the production dialogue instruction against a candidate asking the model to express uncertainty about unestablished private knowledge and respond to corrections. Local Qwen2.5 7B produced 20 replies across five prompts and two requested seeds. The candidate still missed the correction and invented details, so it was not adopted. See MODEL_EVALUATION.md and the synthetic reproducible harness for the results and limits; this is not a general reliability estimate.

In an isolated Android 11/WebView 83 software emulator, the v180 app used an adb-reversed loopback bridge to a separately running real Kokoro model. Voice Preview requested the Narrator’s af_heart and Niko’s am_adam voices, received distinct WAV responses and reported speech finished. The in-story Read aloud control sent the opening passage, received a WAV and showed its playback state. Emulator audio output was disabled, so no audible sound, physical-phone playback, microphone, personal reference voice or iOS behavior was verified. Temporary services were stopped.

## 5 November 2026: closing shadow and Android free-text AI smoke

A generated edit of the original fort background adds the closing shadow. It appears after a short delay only in the two closing fort passages and stays behind the dialogue; a reduced-motion rule presents it statically, and browsers without supported masks omit the overlay. An isolated browser playthrough reached the actual closing passage, saw the effect, continued to clear it, and saved/resumed to restore it. Desktop, phone-sized and tablet-sized browser layouts were inspected. A separate fixture forced the reduced-motion CSS branch and confirmed the static rendering; this was not an actual OS preference or phone test.

In an isolated Android 11/WebView 83 emulator, the v179 game restored its saved Niko conversation, accepted a free-typed message and sent it from the WebView through an adb-reversed localhost endpoint to a synthetic provider. The captured request contained the typed message and character, and the game displayed the synthetic AI-labelled response without a Capacitor console error. This checks the app/network path, not a real phone, production provider, generated response quality, audio or the v180 artwork in Android.

A separate isolated desktop browser used local Qwen2.5 7B in Niko’s personal conversation; the answer invented a fact and the follow-up did not fully engage a correction. See MODEL_EVALUATION.md for the prompts, responses and limitations.

All 104 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 71 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Mallow’s closing moment and local voice setup

After the direct-rescue and record outcomes, the player can now optionally address Mallow or rejoin the crew. The plush remains still; the game does not resolve whether it and the screen are the same being. The Mallow-assisted and retreat endings retain their existing paths. Story and app tests cover the outcomes, older checkpoints and both choices. An isolated Chrome playthrough followed Niko’s personal route to the rescue outcome, saved at the new choice, checked the acknowledgment, resumed, then rejoined the crew and reached the ending. This was written desktop dialogue, not audio.

The launcher preset now preserves an existing read-aloud endpoint, mode and inherited key when it starts text and transcription without a separate Kokoro service. It says no Kokoro service was started rather than promising a fixed voice that the isolated Mirid profile does not provide. An isolated local Mirid profile accepted a synthetic chat request and browser-origin CORS preflight; a separate browser test confirmed the preset message and preserved settings. A regression also verified that voice preview uses the preserved endpoint and synthetic key. This does not establish generated dialogue quality or public speech availability.

A v179 Android 11/WebView 83 emulator playthrough upgraded from v178, restored the older fort checkpoint and reached Niko’s task-focused input. A suggested message produced its matching written reply; a later choice was saved and restored. No Capacitor console errors appeared. Free typing, AI, audio and later routes were not tested in the emulator.

All 104 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 69 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: offline conversation wording and Android insets

The offline input now says that suggested messages have matching replies and that a tailored reply to the player’s own words needs a connected AI service. The input status reads SAY SOMETHING, and the authored fallback is labelled WRITTEN RESPONSE; generated replies retain their AI label. An isolated Chrome playthrough selected a suggested Niko message and displayed its matching reply and the new status. Tests cover the note’s accessible description, settings changes, draft preservation and non-AI inputs.

Capacitor SystemBars now uses native inset handling rather than injecting custom CSS variables, which the game does not use. Its Android configuration is included in both built APKs. On an Android 11/WebView 83 software emulator, v177 showed its opening and character introductions without the prior safe-area injection errors after a clean log; the emulator’s System UI temporarily reported itself unresponsive during cold boot. After upgrading from v177, v178 restored the fort checkpoint, continued through early choices and reached the repair-kit offer. Entering a qualifying name and taking the discounted kit produced Mira’s expected response; no Capacitor console errors appeared after the v178 launch. This is a limited software-emulator playthrough, not a physical-device test. Physical cutouts, keyboard behavior, newer WebViews and iOS remain unverified.

All 104 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 69 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Android 11 emulator smoke and compatibility fixes

A disposable software-only Android 11/API 30 emulator with WebView 83 successfully ran an independent WebView control. The v173 game initially failed to parse logical assignment and displayed its startup recovery screen. Replacing those three operators let v174 show the opening and accept an off-button agreement tap; a subsequent save/resume attempt exposed missing `replaceChildren` support. A compatibility helper for all uses and conventional positioning fallbacks for the opening and scene layers were included in v176.

On that same emulator, v176 displayed the full-height opening, restored the previously saved narration, showed the early character portraits and advanced through the first choice to its matching response. An app regression also removes `replaceChildren` from a DOM-like test environment and exercises clearing and replacing interaction controls. Capacitor logged three startup errors about injecting safe-area CSS into a null element; no visible effect was established in this smoke. The emulator was stopped. This is a narrow software-emulator test, not a physical phone, full-game, audio, AI or inset/cutout test.

All 104 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 69 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built.

## 5 November 2026: Mallow’s early team moment

Mallow now tries a small team wave after the first hint and Mira joins in, before the optional field-repair offer. The three original hint lines and their later comparison remain unchanged. Focused story, save and voice-cue tests cover all hint choices, offer outcomes and older checkpoints. In an isolated Chrome playthrough, declining the hint led naturally through the new exchange to the offer; that run used written dialogue, not audio.

A separate desktop Chrome run followed Niko’s task-focused route through the first missing-ticket discrepancy. The early physical choices and responses were coherent, and the comparison and buttons remained usable without horizontal clipping at a 390 × 844 browser viewport. This is not a phone or touch-device test.

All 104 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 69 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: receipt pacing and startup recovery

The receipt now arrives during Mira’s response to the player’s focus choice, removing a separate arrival passage. The earlier choices, the unsettling image and Mallow’s remembered answers remain; old checkpoint passages are retained. Route tests cover 891 combinations, incomplete flags, voice casting and save compatibility. In an isolated v172 Chrome playthrough of Mira’s task-focused route with the player’s message kept private, both focus choices led directly to the receipt, then the image; the four later receipt choices remained available. Choosing Mallow’s line produced the expected response. A second isolated v172 Chrome run chose Mira’s personal route and allowed the private line to be repeated; the combined passage led directly to Mallow’s selected response and comparison, and sliding the receipt under the door produced Mira’s reply. Both browser runs used written dialogue, not live AI or audio.

A small classic-script startup watcher now offers recovery guidance when modules are unsupported or fail during loading. Isolated Chrome tests used a normal game, malformed main module, malformed imported dependency and missing module; the healthy game started and each deliberate failure showed the panel. Focused tests also cover unsupported-module detection and unrelated errors. This is failure guidance, not proof that older Android or iOS devices run the game.

All 104 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 69 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: pacing, witnessed memories and live voice integration

An isolated v170 desktop Chrome playthrough followed Ash’s personal route through the rescue ending, using authored dialogue. The map choices, free repair kit, rescue and ending callbacks were coherent. The tester found that a run of screen and receipt callbacks slowed the reveal while Mira was trapped. In v171 the companion reaction leads directly to the chosen souvenir callback, removing a repeat of the earlier correction-choice screen. The original choice and its immediate consequences remain; older checkpoints on the retained screens still resume. Tests cover all companions, both correction choices and both souvenir variants. A fresh-copy v171 Ash playthrough confirmed that the original counter correction remains, the duplicate callback is skipped, the physical souvenir appears and the next choice is reachable. The change improved rhythm slightly; the later receipt sequence remains long.

Mira’s and Niko’s closing AI requests no longer assert personal details that a player may not have encountered. Their witnessed personal disclosure can still be provided through the existing separate history field. Mock-provider tests check complete initial and follow-up requests for personal and light paths, older saves with and without visit markers, wrong companions and contradictory flags; this verifies supplied context, not a model’s generated response.

An isolated local Kokoro service using the actual model identified itself to the production companion discovery function, with only the probe URL redirected to the temporary port. A verified-TLS companion gateway routed two different voice IDs and returned distinct RIFF WAV files using a synthetic iOS origin. This did not exercise the default port, a real phone, audible playback or the creator’s future reference. The temporary service was stopped; the user’s existing services were left running.

All 101 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 68 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: overheard words, iOS save compatibility and companion voices

Mallow’s screen now reveals a fragment of the selected companion’s earlier conversation, with a character-specific reaction, before asking whether to repeat the player’s own words. Six authored fragments follow the selected companion and conversation tone; older saves without a tone skip them. The existing choice and the handling of player-written private text remain separate. Story tests check the source of every fragment and both paths after the choice. A fresh-copy desktop Chrome playthrough used Niko’s personal route, saw his earlier words on the screen, and chose to keep the player’s own message private; the next clue appeared without repeating it. That playthrough checked the written scene, not audio.

Saving no longer uses `Array.prototype.at`, which was introduced in [WebKit 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/) after the iOS project’s 15.0 deployment target. An automated save/resume test removed that method: it reproduced the previous failure and passed after the fix. A fresh-origin desktop Chrome smoke saved and resumed the opening passage. Neither check is a real iOS runtime test.

At companion startup, an identified local multi-voice Kokoro service on port 8770 is now selected automatically. If unavailable, the gateway retains Mirid’s single-voice fallback and prints setup guidance; explicit overrides remain available. Tests cover discovery, unavailable and incorrect responses, timing, and the health endpoint’s host and origin restrictions. The already-running workspace Kokoro service was not restarted and will need a restart to expose the new health endpoint. No phone playback or creator voice reference was tested.

All 101 JavaScript tests, eight Kokoro service tests, and mobile staging, configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 68 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: witnessed reflection and unfinished replies

The optional post-reveal Mallow conversation now supplies its last completed group exchange to the chosen companion’s later private conversation, as a separately labelled exchange with Mallow. Mira is explicitly able to hear through the door. The later input tells the player what will be sent. Tests cover the three companions, Ash’s retreat, older and mismatched saves, retries, follow-ups, bounded messages, and keeping earlier private and public histories separate. These checks verify the context supplied to a provider, not that a model will recall it correctly.

A submitted Mallow follow-up that is not answered before continuing now survives save and resume separately from any completed exchange. It appears as unanswered in Recent story rather than being attributed to Mallow. Tests exercise failed and skipped requests, skipped first-message retries, repeated saves and invalid checkpoints. A fresh fixed-copy v169 Chrome playthrough used a synthetic provider with a delayed follow-up: continuing, saving and resuming showed the submitted line as unanswered. A later Niko request included the completed Mallow exchange and the earlier private Niko exchange, but excluded the unanswered follow-up; the synthetic reply appeared in the browser.

A fixed-copy v168 Chrome playthrough chose the unplugged-printer action and direct tone. A synthetic provider received those witnessed facts, with the earlier private and group exchanges excluded from the reflection request; the next follow-up contained the reflection exchange. With explicit in-story permission, the earlier Mallow request included the private message. Saving and resuming restored the post-reflection choices. This browser run used the preceding version and did not exercise the new v169 save changes.

All 99 JavaScript tests, mobile staging checks and native configuration and icon checks passed. Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 68 staged web files matched both native asset directories and both APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: Mallow's witnessed surroundings

The later Mallow conversation now receives a short, witnessed description of the selected audit intervention when available. The covered-lens description distinguishes hearing from sight; the player’s annotation and earlier private words are not sent. Input narration is neutral about where Mallow is looking. App tests cover all four actions, follow-ups, older/inconsistent saves, preference variants and context bounds. A fresh fixed-copy v168 desktop-browser run used a synthetic provider and confirmed the covered-lens request included the sensory context while excluding the earlier private and public exchanges.

In a separate fixed-copy v167 desktop-browser route, a synthetic provider generated a reflection and follow-up, returned a 503 on another follow-up, then succeeded on retry. The review showed the completed turns in order without a duplicate failure; save/resume restored the following help choices. The request omitted earlier private and public dialogue, as designed. That copy predated the added audit context.

A small synthetic Qwen2.5 7B comparison used two questions, two requested seeds, and contexts with or without the witnessed cover or unplug facts. The covered-lens candidates both said Mallow could not see, but added unsupported details; the unplug candidates were mixed, with one overlooking the stated action. This is not a general reliability measure. See MODEL_EVALUATION.md for the fixture and limits.

All 99 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 68 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: Mallow reflection and local model checks

The player can optionally ask Mallow a question later in the shared scene, then return to the original two help choices. Its conversation and last completed saved exchange are separate from the earlier public evidence and private conversation; the new request deliberately does not resend either earlier conversation. Story and app tests cover privacy choices, neutral and selected preference paths, prior-evidence preservation, retries, cancellation, old saves and save/load validation.

A fixed-copy desktop-browser run kept a distinct earlier private message private, displayed a separate public message and reply in the receipt, then used the offline Mallow conversation and saved/resumed its return choice. The browser did not expose the saved exchange contents for independent inspection after resume; the app tests inspect those fields. No audio or phone was tested.

An isolated live local-model smoke used three synthetic questions for each of Qwen2.5 1.5B and 7B through the production adapter. Some accepted replies dodged or invented details; the 1.5B sample included an unestablished safety claim. These few replies do not establish model reliability or a controlled comparison. A separate Mirid synthetic smoke exposed an own-name greeting error; the adapter now falls back for that observed format, while tests preserve ordinary mentions and quoted reporting. It does not catch general factual invention. See MODEL_EVALUATION.md for details.

All 99 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 68 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: Mira closing and companion voice defaults

The non-retreat Mira/light closing now combines the shared activity and closing beat in one passage for care, named play and unnamed play, saving two or three advances. Personal and retreat routes and checkpoints already on older closing nodes retain their previous continuation. Story, app and voice tests cover the variants, name interpolation, witnessed-only AI context, older checkpoints and save/resume. A fixed-copy desktop-browser Mira/play/light route named the knight, reached the compact closing, restored it after saving and continued to the private-talk choice.

With the phone companion selected, an empty speaker voice now uses that speaker’s Kokoro default rather than a generic OpenAI voice. Simulated app tests capture outgoing preview and gameplay payloads for all seven defaults and check unrelated providers, explicit voices and Chatterbox assignment. An isolated browser settings check confirmed a blank field and other voice IDs survived save/reopen, but did not send a request; no trusted HTTPS mock, real reference, audio or phone was used.

A separate fixed-copy v165 desktop-browser Ash/play/light route restored the second follow-up and its corresponding direct-rescue action after saving; the private words remained private. No audio or phone was tested.

All 99 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 68 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: rescue pacing and Auto-read activation

The direct-rescue support choices now combine Mira’s request, the player’s physical action and her thanks in one passage each, saving two ordinary advances while preserving the evidence route. Older checkpoints on the original response, action or reply passages keep their earlier continuation. Graph, app and mixed-speaker voice tests cover both choices, evidence routes and save/resume. A fixed-copy desktop-browser Niko/play route chose the door-watch action, saved and restored the combined passage, then advanced to the receipt response.

Enabling Auto-read while a scene cue is already playing now waits for the cue, like automatic passage changes. Mocked Web Audio and app tests cover completion and interruption. A separate desktop-browser check used a synthetic speech provider and observed the early bell preceding the narration request. A Stop check suppressed the request but did not establish that Stop occurred before the cue finished; it does not establish listening quality or phone behavior.

A fixed-copy v164 desktop-browser Niko/care/light route saved and resumed the task-focused answer, kept the private words private and later reached its corresponding direct-rescue action, which also restored after saving. No audio or phone was tested on that route.

All 99 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 68 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: task-focused choices and cue timing

Each task-focused companion conversation now offers a follow-up question with two distinct responses. A witnessed answer can change a practical action on the direct-rescue path when the player carried evidence rather than a tool. Older saves retain their prior continuation, and AI context includes the answer or rescue action only when witnessed. Story, voice, save/resume, privacy and app tests cover all three companions, both answers and guarded outcomes. A fresh fixed-copy desktop-browser Mira/care/light route saved and restored the first answer, copied evidence and reached the corresponding rescue action; saving and resuming the rescue also worked. This was one path without audio or phone testing.

Auto-read now waits for a brief story cue to end before requesting speech. Navigation, stop, settings and backgrounding cancel stale deferred speech; manual read-aloud stays immediate. Mocked Web Audio and app tests cover completion and cancellation. An independent desktop-browser test used a synthetic speech provider: the early bell cue preceded its narration request, and Stop audio suppressed a pending request. This does not establish physical listening quality or phone playback.

All 99 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 68 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: lighter-route and illustration continuity

Mira’s second task-focused suggested reply no longer implies the loose ear was picked up again before the clue. A fresh fixed-copy desktop-browser Mira/care/light route selected that reply and continued through the clue to the work choice without a physical contradiction. The Niko/play souvenir now depicts the small dessert-cup lid described earlier; a separate desktop-browser route showed it in context, restored it after saving and cleared it after the card was kept.

A fixed-copy v162 desktop-browser Ash/play/light route saved and resumed, allowed Mallow to repeat the selected private message, and reached the record ending. Ash’s closing referred to the shared map without assuming the personal disclosure. The contact control was displayed but not activated. These routes did not test audio or physical phones.

All 99 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 68 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: local address aliases and Mira's light route

Launcher-managed Kokoro and Nano now accept both localhost and 127.0.0.1 at the configured game port; standalone service defaults still accept only the configured origin. The launcher and service contract tests cover both accepted origins and rejection of other hosts or ports. An isolated real launcher showed a Kokoro preview reaching playback from a localhost browser and both speech services answering preflight requests for the two aliases. This did not test a Nano reference or physical audio. The active launcher at 127.0.0.1:8766 was restarted; its Kokoro preflight accepted both aliases and rejected a different port. The launcher test suite passed five tests and skipped one because the active Mirid port was occupied.

Mira's light-conversation scene now shows where the loose plush ear is put before the following clue. In a fixed-copy desktop browser, the care route restored this passage after saving and continued to the clue. No phone or audio was tested.

All 99 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 68 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 5 November 2026: companion conversation choices

Each companion now offers a choice between inviting a personal discussion and staying with the shared task. Both paths include a private conversation and reach the later choice about sharing the player's words. The light route has distinct written suggestions and AI context; its closing scenes do not assume the personal disclosure occurred. Older checkpoints retain their prior routes.

Story and app tests cover all three companions, both shared activities, all four outcomes, both privacy choices, save/resume and witnessed-only context. An independent review of captured simulated-provider requests found no further concrete disclosure leak in the inspected paths. A fixed-copy desktop-browser Mira/light route saved and restored the tone choice, kept the private message, reached direct rescue and the ending, and returned to the shared plush activity without showing the workshop disclosure. No audio or phone was tested.

A small synthetic Qwen2.5 7B probe ran two requested seeds for each new light scene using the production adapter. Some replies were relevant; one sidestepped its question and one added an unestablished detail. This is not a browser run or a measure of general reliability. See MODEL_EVALUATION.md for the fixture and limits.

All 99 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 68 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: card continuity and speech endpoints

After the named-knight passage, the card’s back eye now stays closed on the following caption and choice; the other eye remains open. The printed caption appears visually only when the narration introduces it. Resolver, app and offline-cache tests cover the two states, save/resume, older checkpoints and removal of the illustration. A fresh desktop-browser Mira/play route showed the open card, the named passage and the closed-eye caption; save/resume restored the caption. At a 390×844 browser viewport, the caption and controls showed no visible clipping, and choosing to tear removed the intact image.

Changing only the read-aloud endpoint between the phone companion and a generic OpenAI-compatible service now adapts automatic voice IDs to the selected service. Manually entered voices and the Chatterbox assignment are preserved. An isolated browser settings test exercised both directions with a dummy companion and reference; no provider request, real reference, audio or phone was involved.

All 99 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 68 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: illustrated souvenirs and companion voices

Six original vector illustrations now accompany the route-specific souvenir passages, with descriptive alt text and no added advances. They disappear after the card is put away or on the separately timed named-eye passage. Automated tests cover all variants, older/mismatched saves, offline cache and save/resume. A desktop-browser Mira/play route showed the matching image, restored it after saving, and removed it on the next named-eye passage. A 390×844 browser viewport showed the card and controls without visible clipping; this is not a phone test. The Niko/care and Mira/care assets were refined after direct inspection, but those final variants were not separately played through in the browser.

Removing or reassigning a Chatterbox reference after choosing the phone companion now restores its Kokoro voice ID, while other OpenAI-compatible endpoints and manually selected IDs retain their own behavior. Focused tests cover provider and preset changes, reassignment and save/reopen. An isolated desktop-browser settings test used a dummy reference and companion address; it did not connect to the service or play audio.

All 98 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 67 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: voice restoration and fort promise

When changing read-aloud protocol while a Chatterbox reference is assigned, removing or reassigning it now restores the correct automatic voice for the current protocol. Deliberately entered voice IDs remain unchanged. App tests cover both protocol directions, reassignment, save/reopen and clearing settings. An isolated desktop-browser check used a dummy stored reference to exercise those changes, including a manual voice. It did not contact a service, use a real reference or play audio.

Mira now gives the player the handmade badge promised in the opening, within the existing fort passage. A fresh desktop-browser star-choice route reached that passage and restored it after saving and resuming. No audio or phone was tested.

All 96 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: detour continuity and dialogue retry

The service-stair detour no longer implies the player visited the landing on every companion route. A fresh isolated desktop-browser Mira route chose the notch rubbing, saved and restored that passage, then selected retreat and used the rubbing during the stair search. Together with the previous sign-path playthrough, both waymarks have now been exercised in a browser; neither run tested phone or audio.

When a player selects a suggested message offline, then connects or corrects a provider, an unchanged retry keeps that suggestion’s paired written response if the provider fails. Editing the message or typing an identical message independently retains the general fallback. App tests cover failure and successful retry, written alternative, invalid endpoint and edited input. An isolated browser test used a synthetic 503 provider: the unchanged Niko suggestion kept its paired reply, and an edited retry received the generic fallback. This did not use a live model.

All 96 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: service-stair detour and local voices

Before the descent, the group can take an optional service-stair detour. A choice there affects the later retreat search if that search is selected; the direct route rejoins the previous story immediately. Old checkpoints at the ticket passage see the new choice; later older saves and inconsistent flags keep their original continuation. Story, save/resume, mixed-speaker voice-cue and bounded AI-context tests cover both detour choices and guarded later use.

A fresh isolated desktop-browser route took the detour, chose the sign, saved and restored that passage, then chose retreat and used the sign during the stair search. The other waymark and other endings were not played through in that browser run. A separate v155 keyboard-only run reached the opening, early choices, settings and a custom message without an observed blocking fault; it did not use a screen reader or audio.

In a fresh desktop-browser local-launcher check, Mirid and separate Kokoro endpoints populated; narrator and Niko previews reached playback, and a generated Niko reply reached speech finished. One Qwen 1.5B answer was off topic; one Qwen 7B answer addressed the question but added an unestablished memory. These two examples do not measure model quality or perceived voice quality. No personal reference or phone was used.

All 96 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: custom dialogue and recalled match response

The three midpoint conversations and Ash’s retreat conversation now use character-specific scripted continuations that do not imply agreement with an arbitrary custom message. The paired suggested-message replies remain available. App and story tests cover contradictory messages, the first paired suggestion in each affected scene, older inputs and voice cues. In a fresh isolated desktop-browser Mira route, the player disputed the card, received Mira’s revised scripted response, then saved and resumed the subsequent passage. The browser run did not verify later AI memory of that message or exercise audio.

Early private AI requests now include the exact match response only when that companion’s display and reply were both witnessed; Mallow does not receive it. A small synthetic Qwen2.5 7B comparison used three questions, two requested seeds and two context versions: all six summary-only replies invented what was said; five exact-context replies repeated it and one paraphrased. This does not establish general reliability or a browser playthrough with the model. See MODEL_EVALUATION.md for the method and limits.

All 95 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: compatibility label and souvenir playthrough

The opening's compatibility claim now returns when the player chooses a hunt partner: the display labels the choice and the selected companion responds in their own voice. A later screen recalls the label only when it appeared. No advances were added. A fresh v154 desktop-browser Niko route showed the label and his response; saving on that response and resuming restored it. App and story tests cover all three companions, save/resume, older checkpoints and the witnessed facts sent to AI; they test request context rather than model recall.

A separate v153 desktop-browser Mira route tore the souvenir, kept the private message, handed over Mallow’s receipt line and covered the lens. It then used the torn souvenir to hold the catch. The companion recalled the shared activity in the callback; a later saved choice resumed successfully, and the route reached the prototype ending and feedback control. The feedback link was not activated. The callback itself was observed in Recent Story, not saved directly.

The local Kokoro model synthesized all 14 speaker segments across three recent compact passages using their assigned voices. This verifies speech generation, not listening quality or phone playback; no personal reference was used.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: handoff pacing and souvenir payoff

The four receipt handoffs now combine each physical action with Mira's immediate response, skip a generic transition on new routes, and combine the false ending with Mallow's reaction. The affected sequence is three advances and 41–52 words shorter, while preserving the steering explanation, separate audit and handoff consequences. Story graph, voice-cue, sound and app tests pass, including older checkpoints with missing report markers. In an isolated desktop-browser Niko route, the torn Mallow-answer handoff led through the compact explanation and audit; the returned folded scrap later helped locate the door release. Audio was not tested.

When the player uses the souvenir to hold the catch, a companion-specific closing beat now recalls the actual shared activity without treating the altered picture as accurate. Both intact and torn paper routes have witnessed markers; old or inconsistent saves and the choice to hold the catch retain their earlier paths. Story and voice tests cover all companion/activity/paper combinations. The callback itself was not reached in the browser playthrough in this pass.

Later AI context can include only a callback that was actually shown, guarded by companion, activity and visit markers. Mira is not assumed to know whether the paper was torn. App tests cover all six callbacks, follow-ups, older saves and context bounds; they verify supplied facts rather than model recall.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: private-branch reactions and direct-rescue playthrough

When the player keeps their message private, the selected companion now reacts to the overhearing in the existing refusal beat. The NO and machine response remain; no private words are repeated. Story graph, sound, mixed-speaker voice-cue and app tests cover all three companions, save/resume, old or mismatched saves and group-context privacy. Current private-topic context stays within its 900-character adapter bound.

A fresh desktop-browser Mira/private route applied the update, resumed an earlier choice, saw the new reaction, saved/resumed an annotation and continued through direct rescue to the ending and contact control. It exercised named plush, copied evidence and the torn-answer handoff. No blocking fault was observed. The browser run exposed dialogue attribution punctuation; the final text was corrected and retested in graph/voice/app suites, but that corrected punctuation was not replayed in the browser. The audit remains lengthy and explanatory on this route. No audio or phone was tested.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: companion reactions and witnessed AI context

When the player chooses to repeat their own private message, the selected companion now has a distinct reaction if their disclosure was actually visited. It does not imply that the companion's words were broadcast. Story, voice-cue and app tests cover all three companions, save/resume and old or inconsistent checkpoints. In a fresh desktop-browser Mira route, the selected message was repeated, Mira's reaction appeared, and save/resume restored that passage and continued to the group input. This was one browser route; no audio was tested.

Later AI context can include the public reaction only when it was shown, and can include the annotation's verification seal only for the two outside witnesses when it was visited. Mira and old saves do not gain unseen knowledge; the annotation text is not sent. Tests cover initial/follow-up requests and adapter context limits across 76,464 combinations. They verify supplied context, not model recall.

Speech routing checks confirmed distinct Kokoro defaults and one optional Chatterbox assignment; the creator's reference and speaker remain unconfigured. Focused speech/cue tests and 19 Nano fake-model contracts passed. No personal reference, listening or physical-phone test was performed.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: covered-lens ending, context and Android runtime attempt

A fresh desktop-browser Ash/private route reached Mallow's ending with ticket evidence, the lens covered and Mallow helping by sound. The route continued to the expected feedback and replay controls without an observed contradiction or blocker. This was one combination, without audio or phone testing.

The closing AI context now states that the screen's original claim stayed unchanged after annotation rather than saying the entire display stayed unchanged after a seal appeared. Tests cover all three companions, old/new checkpoints and follow-up requests; the player's annotation is not sent. These tests verify supplied context, not model recall.

A separate Android 14 software-emulator configuration using the installed SDK and image crashed before Android booted. No game or independent WebView control ran. No connected Android device, KVM or other installed Android runtime was found; this attempt does not establish game compatibility. Temporary emulator files remain under /tmp/oki-v150-emulator.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: visible ticket count and read-aloud

At the two counter decisions, a visual comparison shows the physical ticket pieces alongside the machine's count; the physical arrangement reflects the player's action. In a fresh desktop-browser route both choices, save/resume and keyboard focus worked. At a 390×844 viewport the scene had no horizontal overflow. App tests cover both paths, legacy saves and removal on leaving. This browser viewport is not a phone test.

Read-aloud for the annotation scene now includes the on-screen claim and verification seal after the narrated passage, using the configured Narrator voice. The player's note is read once. Synthetic playback tests cover ordering, the single-speaker Chatterbox assignment, stop and auto-read. A separate browser route confirmed a 500-character note including literal markup survived save/resume and appeared in the later callback. No listening or phone audio was assessed.

A fresh isolated local-launcher desktop-browser test populated Mirid and Kokoro settings, reached playback for Narrator and Niko previews, generated one Niko reply and reached read-aloud playback. Two same-text Kokoro requests produced distinct WAV files. This verifies the tested routing and output differences, not perceived voice quality, general AI reliability or phone behavior. No personal reference was used; temporary services stopped.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: annotation presentation and record ending

The player-written annotation now appears literally on the receipt beside the machine's unchanged claim and a new seal falsely citing that annotation as verification. It is rendered as text and is not added to AI context. In a fresh desktop-browser route, an annotation containing angle brackets appeared literally, survived save/resume and advanced by keyboard. At a 390×844 browser viewport the panels stacked without horizontal overflow. App and voice-cue tests cover literal/default/long text and older checkpoints; no audio or physical phone was tested.

A separate fresh Niko browser route reached the record ending using the free kit, CONFIRM and printer unplug/reconnect, and showed the contact control. It exposed a contradiction in Mira's reaction: she had heard the crew but later said she did not know they were there. The exchange now concerns why the printer was used first, with both player responses preserved. Story graph, voice-cue and save/resume checks passed; the revised wording was not replayed in the browser during this pass.

A complete synthetic closing context was sent to local Qwen2.5 7B through the production adapter. Replies recalled some details but also invented or misattributed events; see MODEL_EVALUATION.md for the small-sample limits and reproducible probe. No prompt change is claimed to fix this.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: confirmation action and post-audit pacing

The described green CONFIRM button is now an optional playable story action. Its response and later callback distinguish trying the door from approving the machine's claim; it leads to the original evidence choices without looping. Graph, save/resume, voice-cue, sound and AI-context tests cover the branch. In an isolated desktop-browser Niko/private route, the button appeared green, responded to a click, returned to the three evidence choices, and was referenced later. Other browser combinations and audio were not exercised.

After the audit, the characters now move through two fewer advances on current handoff routes. The repeated question is removed; Niko's line and the selected physical consequence share a passage. The affected beats decreased from 66–73 words in three passages to 50–52 words in one. Tests cover all handoff and audit combinations, annotation rendering, voice cues, saves and legacy fallback. The same desktop route, after covering the lens, reached the combined passage and continued to the manual-release plan.

Read-aloud HTTP 413 errors now refer to the speech request instead of telling the player to record a shorter message. Focused speech tests passed. An isolated Mirid adapter smoke with Qwen2.5 1.5B and synthetic audio passed discovery, text transport, transcription and WAV synthesis. Some sample dialogue was poorly grounded; this is not a reliability measure. No personal reference, physical microphone or speaker, or phone was used.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: receipt pacing and meeting-place setup

The receipt sequence retains the chosen hint, an unspoken alternative, and the selected threshold choice while omitting a second repeated answer. Depending on hint and threshold branch, two passages totaling 69–112 words became one of 27–57 words. The 891 core story paths, voice cues, sound tests, and save/resume checks passed. Older saved nodes remain available. This removes a specific repetition; it does not by itself resolve the whole reveal's pacing.

Ash now sets up the note as a fallback meeting plan in a way that works before or after reunion, including older checkpoints. In an isolated desktop-browser Ash route, this setup led to the original note choices. A warm hint and direct threshold choice led to the revised receipt, the card/map comparisons, and all four handoff options. Audio and other browser routes were not exercised in that pass.

Mira’s closing AI context now reflects the evidence she heard through the door, while Niko and Ash retain their directly witnessed account. Tests cover all evidence choices, initial/follow-up requests and old saves. The comparison-context guard recognizes the new receipt route and rejects a disconnected route. These tests check supplied context, not model recall.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: neutral reveal and retreat preparation

When the player's two wording comparisons tie or are both skipped, Mallow now explains what the system was trying to infer without claiming it found a favorite or received approval. Older neutral checkpoints retain their continuation. Story, preference and voice-cue tests cover tie and skip routes; in a fresh desktop-browser Mira route with both comparisons skipped, the new explanation appeared and advanced to the next story beat. The tied path was not played in a browser in this pass.

In Mira’s retreat path, the sketchbook and thread preparation choices now provide practical aids to the search, and the selected aid appears in an existing later passage. Runtime tests exercise both preparations and both early searches, saving and resuming, and older or inconsistent checkpoints. This change was not played through to the ending in a browser in this pass.

The audit/receipt order was reviewed but not rearranged: a candidate added ambiguity between two pieces of paper and did not shorten the overall sequence. The reveal remains text-heavy, and this pass does not claim a general pacing fix.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: full retreat playthrough and voice reference error

A fresh isolated desktop-browser Mira route reached the retreat ending through the knock experiment. The selected different pattern reappeared at the end without identifying its source; the final screen offered the configured contact address and Play again. No blocking UI defect or factual contradiction was observed on this route. It required 145 ordinary Continue advances plus choices, a pacing concern; this does not establish enjoyment or other branch/device coverage.

An oversized voice reference rejected with HTTP 413 now asks for a smaller file rather than a shorter recording. Speech adapter, voice UI, publisher assignment and cue tests passed, as did 19 Nano contract tests with a fake model. No personal voice reference, real playback or phone was used. A separate AI-flow review found no reproducible new defect in the simulated app suite.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: souvenir choices, ending echoes and AI follow-ups

The souvenir choice now has different immediate and later visual consequences, without adding a story passage. Automated graph tests cover all three companions and both choices. In an isolated desktop-browser Niko route, the torn-card response and its later screen callback appeared; the final sentence was subsequently clarified and the suite rerun. Voice-cue tests passed.

One ending now recalls the player's knock experiment within the existing final passage. Tests cover both patterns, all three closing reasons, save/resume, and older or inconsistent checkpoints. The source of the sound remains unresolved. This change was not played through to the ending in a browser during this pass.

When an arbitrary AI follow-up fails, the last completed reply stays visible and the submitted words remain available for retry or continuation; an unrelated opening-scene fallback is no longer presented as its answer. The corresponding initial suggested-message written alternative remains available. A desktop browser with a synthetic local provider exercised a successful initial reply, an HTTP 503 follow-up and a successful retry; the question appeared once in the review. Automated tests cover cancellation, edited retry, provider changes, saved context and public/private conversations. This does not measure model quality.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: suggested AI messages and character conversations

A suggested message now goes to the configured model just like a typed message. Its specifically paired written response remains available offline, on failure or cancellation, and as an alternative to a generated answer. Tests cover both retrying and editing a suggestion, cancellation, follow-up context and saved continuation. In an isolated desktop browser using local Qwen2.5 7B, a Niko suggestion produced one generated reply and the matching written alternative could be selected. One exchange does not establish general reliability; previous recall errors remain relevant.

Mira’s and Ash’s early disclosures now arise more naturally from the activity underway, and Niko, Mira and Ash have distinct offline continuations for custom messages. Runtime tests checked all three without model requests. A separate desktop-browser Mira route submitted a custom message and displayed the new scripted continuation. The paired written exchanges remain available.

The Android instrumentation smoke test now checks a touch-driven save, activity recreation and resumption of the passage. It is intended for a disposable device, skips an existing checkpoint, and only removes the unchanged checkpoint it created. The test APK compiled but the test was not run on a device.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: reveal balance, character context and visual framing

The Mira interaction occurs later, and two adjacent screen/reaction beats are combined. Measured gaps between the evidence, door, Mira, receipt and audit choices across three companions and both signal paths are now 3 / 10 / 8–9 / 9 advances; the earlier representative route was 3 / 6 / 13 / 9. The representative sequence is one passage shorter overall. Old checkpoints preserve the earlier route, and a v140 save that already made the Mira choice does not encounter it again.

A desktop browser Ash route with shared conversation reached the revised door, Mira and receipt choices after updating and resuming. A separate keyboard check activated the opening, advanced from the speaker, tabbed to a choice and selected it, and opened and closed settings. These checks do not cover a complete keyboard-only route or screen readers.

Closing AI context now describes Mallow watching during the newer audit branch instead of attributing an unspoken line. Tests cover both focus choices, legacy saves, companions, and initial and follow-up requests. A small live local Qwen comparison still produced invented details; see MODEL_EVALUATION.md. This is not a reliability estimate.

The dim playroom's portrait-phone crop shows more of its corridor; static displaced strips affect the background during fracture scenes. A 390×844 browser fixture remained readable, and a landscape check showed no horizontal overflow. Other locations retain their original crop. These are browser viewport checks, not device tests.

All 94 JavaScript tests and native staging/configuration checks passed. Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; phone runtimes remain untested.

## 4 November 2026: reveal interaction and native loopback configuration

The door decision now comes shortly after the evidence choice, followed by a choice about involving Mira in the unfolding screen scene. Each has a distinct response and a later callback; the receipt comparisons and audit remain. On a representative route, the gaps between choices were 3, 6, 13 and 9 passages. The sequence is more interactive but longer overall, and the 13-passage gap remains a pacing concern. Older door checkpoints remain available.

In a fresh isolated desktop-browser Mira route, a save was resumed after updating, the revised early door and Mira choices appeared, and the story reached the receipt and audit decisions. Automated tests exercised all companions, both door actions, both Mira interactions, legacy checkpoints and save/resume. Closing AI context checks what a character could actually hear; no live model test was run for the new route.

The iOS project now includes narrowly scoped App Transport Security exceptions for same-device loopback IP services. The 94 JavaScript tests, native configuration and staging checks, and iOS static tests passed. The Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 60 staged web files matched both native asset directories and APKs. The iOS project was synced but not built; neither phone runtime nor iOS networking was tested.

## 4 November 2026: receipt pacing and witnessed facts

The selected hint and the machine's invented alternative now appear in one receipt passage, with Ash's reaction in the same beat. Hint-selected paths reach the following threshold response one passage sooner; skipping the hint is unchanged. Older comparison checkpoints remain available. A desktop-browser checkpoint was resumed after applying the v139 update: the corrected receipt text appeared and advanced to the threshold response.

Mira’s closing AI context now reflects what she could hear from behind the door and what Ash later told her, rather than attributing unseen door or printer actions to her. Niko and Ash retain their witnessed physical details. Tests cover initial and follow-up requests, validated reconnection and old checkpoints; they verify supplied context, not model recall.

The fast-speech queue and publisher routing were independently reviewed; focused ordering, cancellation, retry and settings tests passed, with no new reproducible defect. This does not establish subjective listening quality or phone playback.

The v139 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 60 staged web files matched the native asset directories and both APKs. The iOS project was synced but not built; no phone or emulator runtime was tested in this pass.

## 4 November 2026: speech preparation and rescue continuity

An optional faster speech preparation setting can prepare two parts ahead; the default remains one. Stopping or advancing early may send an extra request, which a provider can charge for. Tests cover ordering, cancellation, failures, autoplay retry and settings. A browser harness using the production speech controller, local Nano with a synthetic reference and Kokoro played an authored four-part mixed passage in order and completed; a second run aborted an in-flight request when stopped. This is one desktop test, not listening quality or phone evidence.

In the direct rescue using Mira’s string, Niko now tells her what happened while she is behind the door. A new visit marker ensures her closing AI context only includes that observation in runs where the line appeared; old checkpoints and mismatched states do not gain invented knowledge. Story, voice-cue and app tests passed. In a fresh desktop-browser Mira route, the new call appeared after the string was used and the story advanced into the next passage. The call’s audio was not tested in that route.

A separate offline Mira retreat playthrough reached the ending and feedback control without a blocking error; the selected details and custom receipt remained consistent. The tester still found the reveal and receipt section dense.

The v138 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 60 staged web files matched the native asset directories and both APKs. The iOS project was synced but not built; no phone or emulator runtime was tested in this pass.

## 4 November 2026: scoped offline cache and voice timing

Offline caches are now scoped to each installation path. PWA tests cover two installations and updating one without removing the other's cache. In a separate desktop-browser test, two local copies both reopened offline; another test updated one, stopped the server and reloaded and advanced the other. Older unscoped caches are retained because an older installation may still need them. These are browser checks, not physical-phone installation tests.

A fresh offline Mira route reached the rescue ending with its selected evidence and callbacks intact. It exposed a question from Mallow that went unanswered; the response now offers a concrete way to help. The revised line passed the story tests but was not separately browser-played.

A synthetic local Nano/Kokoro timing probe estimated a possible pause between short speaker segments; it did not measure real playback or human listening. A deeper prefetch reduced simulated waiting in that small sample but could issue unused paid requests through a proxy, so production behavior remains unchanged. See [VOICE_INTELLIGIBILITY.md](VOICE_INTELLIGIBILITY.md).

The v137 Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 60 staged web files matched the native asset directories and both APKs. The iOS project was synced but not built; no phone or emulator runtime was tested in this pass.

## 4 November 2026: mixed speaker voices and witnessed context

Explicit authored speaker cues route spoken quotations in mixed passages to the corresponding character voice. Printed and player-supplied quotations remain with the passage speaker. Cue inventory, interpolation collision, routing, cancellation and playback-retry tests pass. On one fresh desktop-browser Niko route, a synthetic reference assigned the narrator to local Chatterbox Nano while Niko used local Kokoro. Four alternating Nano and Kokoro requests were observed, and the browser reached Speech finished. This checks service routing and playback state, not perceived quality, a personal reference or physical-phone behavior.

Mira’s closing AI context no longer claims she witnessed a silent counter-watch or unseen physical actions during the audit and rescue. Niko and Ash retain their witnessed details. The full offline app suite covers initial and follow-up requests, old checkpoints and route combinations; it verifies request data, not reliable model recall.

An independent offline Ash route reached Mallow’s ending and the contact and replay controls without a blocking error. Its evidence, printer, souvenir and character callbacks remained consistent.

The v136 Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. All 60 staged web files matched the native asset directories and both APKs. The iOS project was synced but not built; no phone or emulator runtime was tested in this pass.

## 4 November 2026: reveal pacing and landscape layout

The explanation after the paper handoff combines Mallow's selected response with its account of how the player's choices steered it. The audit receipt also incorporates the counter-watch before Mira speaks. For representative choices, the span from the post-handoff reflection to the audit decision falls from eight advances to six for a directional preference and nine to seven for ties or skipped comparisons. The selected and unselected comparisons, physical choices, emotional stakes and old checkpoint nodes remain. The full app and story suites pass, including AI request-context checks. A fresh offline browser Niko route reached the revised direct explanation, merged audit, Mira’s response and all four audit options without a blocking error. Legacy continuation was checked by app tests rather than in that browser run.

At short landscape sizes, a visible portrait now sits beside the dialogue instead of pushing the whole passage below the viewport. A separate desktop Chrome check covered the opening, settings, first choice and response at 568 × 320, with additional layout checks at 500 × 320, 844 × 390 and 375 × 667. These are responsive-browser checks, not physical phone or native WebView tests.

The v135 Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 59 staged web files matched the native asset directories and both APKs. The iOS project was synced but not built; no phone or emulator runtime was tested in this pass.

## 4 November 2026: launcher recovery and witnessed search

If an optional local Kokoro, Nano or Mirid process exits, the launcher now keeps the game and remaining services running, and removes the failed process from newly requested setup information. Existing settings already saved in the page do not change automatically. Six launcher tests passed, including a subprocess test that stops two optional services in succession while the game continues to serve.

Niko or Ash can receive the witnessed retreat-search action in their closing AI context, alongside the signal experiment and kit when present. Tests cover both actions, follow-ups, old and inconsistent saves, other routes and request bounds. A small synthetic Qwen 2.5 7B comparison found that additional context helped some responses but not all; it does not establish reliable recall. See [MODEL_EVALUATION.md](MODEL_EVALUATION.md).

An independent offline Mira route reached the record-first ending and contact controls without a blocking error. The paper handoff, printer decision and workshop callback were coherent. Its playtest exposed an ambiguous souvenir reference, which was clarified afterward; the revised line has not yet been browser-played. The revelation remains long despite intervening actions.

The v133 source archive was unpacked separately and opened in a desktop browser with Python's documented web server. The opening and first choice worked; this is not a test of the whole archive on other platforms.

The v134 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 59 staged web files matched the native asset directories and both APKs. The iOS project was synced but not built; no phone or emulator runtime was tested in this pass.

## 4 November 2026: earlier retreat action and local voice setup

The retreat search choice now comes immediately after the team's signal test, before the reflective closing scenes. New runs see it once; older checkpoints can still reach the later version. Story graph and save/resume tests cover the routes and old saves. In a fresh offline browser route, the new choice appeared immediately after the signal test; a save and resume allowed both responses to be checked, and the ending followed without repeating the choice.

When the local launcher provides Mirid for text and transcription without a local Kokoro service, applying its settings now preserves an existing separate read-aloud service, including a publisher Kokoro endpoint. Synthetic routing tests and an isolated browser check using the real launcher passed. No personal voice reference or phone was used.

In an isolated desktop-browser Ash conversation, a local Qwen 2.5 7B response was playful and relevant, but a follow-up misremembered the role of a drawing. A small follow-up context comparison did not establish a reliable improvement; see [MODEL_EVALUATION.md](MODEL_EVALUATION.md).

The v133 Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 59 staged web files matched the native asset directories and both APKs. The iOS project was synced but not built; no phone or emulator runtime was tested in this pass.

## 4 November 2026: retreat and response handling

The retreat ending now lets the player choose between two concrete search preparations while keeping the unanswered situation unresolved. The story tests traverse both choices for each companion and both sharing choices, check other endings, and preserve earlier checkpoints. In an isolated desktop-browser Niko route, the player saved at the new choice, tried the stair response, restored the save, tried the sound response and reached the retreat ending without blocking errors.

The AI adapter now keeps a complete character response when a provider appends a separate player turn, excluding the invented turn from display and memory. It falls back when there is no complete character response; tests include quoted player lines and ordinary character dialogue. These are synthetic provider fixtures, not evidence of reliable model recall.

At 320 × 568 in a desktop browser, the opening, early character passages and two choice screens were visible and actionable. This is responsive-layout evidence, not a physical phone test. The Android instrumentation smoke test now includes a real touch on the first choice and checks its response. It compiled but was not run on a device.

The v132 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 59 staged web files matched the native asset directories and both APKs. The iOS project was synced but not built; no phone or emulator runtime was tested in this pass.

## 4 November 2026: cast voices and dialogue review

Settings Clear now restores a configured publisher Chatterbox speaker and public Kokoro endpoint while clearing the player's credentials and overrides. A synthetic publisher fixture checks the two preview routes and clearing keys. The current build does not yet configure either publisher service or a personal reference. Seven assigned Kokoro IDs produced distinct non-silent audio via the local CPU service; this does not establish listening quality or phone playback.

A desktop browser at 375 × 667 displayed the opening, first story choice and settings; selecting an answer and saving, advancing and resuming restored the checkpoint. This checks a small responsive route, not a physical phone or native WebView.

An attribution-prompt experiment with local Qwen 2.5 7B did not reliably improve recall; see [MODEL_EVALUATION.md](MODEL_EVALUATION.md). The publicity draft was updated with a spoiler-light pitch and accurate prototype status. Explicit unquoted player-role lines in generated character replies now use the written fallback instead of attributing words to the player; targeted fixture tests preserve ordinary initial “You:” dialogue and quoted labels.

The v131 Android debug, unsigned release and instrumentation packages compiled and native unit tests passed. All 59 staged web files matched the native asset directories and both APKs. The iOS project was synced but not built; no phone or emulator runtime was tested in this pass.

## 4 November 2026: rescue continuity and speech settings

The chosen companion’s later AI conversation can now receive a short account of their witnessed rescue using the selected tool. Visit markers keep older or inconsistent saves from inventing that event. Route and request tests cover all three tools, follow-ups and coexistence with the repair kit; this does not establish model recall. A reveal line was corrected so that it does not refer to a release before it is discovered.

Saving settings during a Chatterbox reference upload now waits for the upload to complete instead of silently cancelling it. A synthetic delayed upload verifies that the setting is retained; no personal recording or phone was used. The default speaker fields use distinct Kokoro voices, while a single reference can be assigned to one speaker. Speech requires a configured service.

An isolated desktop-browser Niko route reached the rescue and epilogue, and Play again returned to the opening without a blocking UI error. This was one offline route; live AI and voice were not tested in that playthrough.

The v130 Android debug, unsigned release and instrumentation packages compiled, and native unit tests passed. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: field-repair callback

The chosen companion’s later AI conversation can receive a brief account of the field-repair kit payoff when it was actually shown. A visit marker avoids inventing it for older checkpoints or skipped kits. App and story tests cover free and paid flags, older and inconsistent saves, later follow-ups, existing ending-event context and separation from Mallow. These tests verify the request, not model recall. In a fresh current-build desktop-browser route, a player claimed the free offer, saw the kit payoff and sent a closing message to a synthetic local endpoint; the request contained the witnessed kit event and the fixture reply displayed. This does not establish model recall or phone behavior. A small synthetic Qwen 2.5 7B comparison showed partial recall but also missed and invented details; see [MODEL_EVALUATION.md](MODEL_EVALUATION.md).

The voice and publisher-routing suites also passed with synthetic fixtures; no personal voice reference or phone was used.

The v129 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: speech settings and witnessed details

The closing AI activity setup can now include a maximum-length authored setup and Niko’s witnessed note without cutting off the note. Regression tests cover the initial and follow-up requests, other companions and earlier saves; this checks request contents, not model recall.

When a player changes a speaker’s underlying voice and reselects their Chatterbox reference, removing that reference now restores the newly entered voice. An isolated desktop-browser settings check used a synthetic reference ID; no recording or phone was used.

The two existing retreat preparations now have distinct physical reactions, preserving their uncertain cause and adding no passage. Story graph tests cover both choices and earlier branches. A fresh desktop-browser playthrough saved at the choice, checked both outcomes using resume, and continued without console errors. This was not a phone test.

A live local Mirid smoke check exercised text transport, synthetic-speech recognition and Kokoro synthesis. Its small generated-dialogue samples included an implausible suggestion and a rejected response, so successful transport does not establish dialogue quality.

The v128 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: activity context and reference editing

For the selected companion’s closing AI conversation, the earlier authored activity choice and reply now have a separately bounded request field. The scene limit remains in place. App tests cover all 76,464 route combinations, maximum-length supported activity text, follow-ups, older saves and separation from Mallow; they verify delivered context, not model recall. A small synthetic comparison with local Qwen 2.5 7B found unreliable recall and invented details with both the previous and new layouts; see [MODEL_EVALUATION.md](MODEL_EVALUATION.md).

Editing an existing Chatterbox reference ID now cancels a pending upload so its late response cannot replace the new choice. An isolated desktop browser checked the sequence with synthetic audio and a delayed loopback endpoint; no personal recording or phone was used.

The field-repair kit’s existing payoff now uses its two objects in the way its introduction describes, without changing its route or adding a passage. A desktop-browser Niko route claimed the free offer and reached that payoff; restoring the earlier checkpoint and skipping the kit continued normally. This was not a phone or store purchase test.

The v127 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: Mira’s early conversation

Both choices in Mira’s shared activity now lead more naturally into her existing personal conversation, without adding a passage or changing the branches. The story and activity-context suites cover both choices. In a fresh desktop-browser route, a checkpoint at the activity allowed both choices to be played through to the personal conversation using save and resume. This was not a phone test.

The targeted speech and publisher-voice suites passed for one Chatterbox assignment alongside distinct Kokoro voices, including previews, playback and settings overrides. No personal recording or physical phone was used. The AI retry, cancellation, checkpoint and conversation-separation paths were reviewed without a new confirmed defect; the documented model recall limitation remains.

The v126 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: character pacing and service recovery

Ash’s two activity responses now lead into the existing personal conversation without an extra passage. A fresh desktop-browser route saved at the activity choice, tried both responses using resume, and continued into the conversation. Story and activity-context tests passed.

After invalid AI settings produce a written response, correcting them now restores the option to edit and retry the first message as well as to follow up. Regression tests cover invalid settings before and after the response and preserve conversation separation. An isolated browser reproduced the invalid-setting state, corrected it to a synthetic endpoint, and sent a revised message with the correct pre-response context. The endpoint returned a canned response.

A blank speaker voice with a separately configured Kokoro service now uses that speaker’s Kokoro default instead of accidentally inheriting the narrator’s Chatterbox reference ID. Tests cover preview, playback and provider defaults. In an isolated desktop browser, a synthetic narrator assignment and a blank Niko field were configured alongside the real local Kokoro service; Niko’s preview and story read-aloud reached playback. No personal recording or phone was used.

The v125 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: reconnect retry and voice choices

Connecting AI after a written response now lets the player edit and retry the original message as well as send a follow-up. App tests cover private, midpoint, shared and closing conversations, including separation of the relevant histories. An isolated browser used a synthetic endpoint to check a revised message and confirmed that the replaced written response was not sent as earlier history.

Speech settings now distinguish automatically inserted provider defaults from deliberately entered voice IDs. Tests cover protocol changes, saving and reopening, and temporarily reassigning a reference voice. In an isolated desktop browser, manually entered values survived provider changes and reopening while untouched defaults adapted. No personal recording or phone was used.

A retreat response now leaves an ambiguous signal uncertain, consistent with the investigation that follows. All story graph tests passed.

The v124 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: conversation follow-up, speech settings and ending continuity

Connecting AI after choosing a written response in the midpoint conversation now offers a follow-up without sending a request automatically. Regression tests cover the message history and its separation from the earlier private conversation and Mallow’s exchange. In an isolated browser, connecting a synthetic endpoint after a written reply exposed a follow-up and sent the correct midpoint history; the endpoint returned a canned response.

Changing the transcription service now preserves the selected character voices when a separate read-aloud protocol is configured. Tests cover switching protocols and the request sent to a separate Kokoro service. In a desktop browser using the real local Kokoro service, Niko and Mira retained distinct IDs after the transcription change and their previews reached playback. This did not assess listening quality, a personal voice or a phone.

Two closing lines on the retreat path now reflect the situation established in that ending. Other outcomes and older checkpoints retain their previous lines; story tests cover the routes. A fresh desktop-browser route reached one changed closing line; a checkpoint saved just before it resumed to the same ending. This checks one path, not a phone.

The v123 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: an interface echo and more phone audio formats

A later story passage now echoes the real Continue control without adding a passage or changing the choice graph. The story suites cover the existing paths and the Continue control. In a fresh desktop-browser Niko route, the instruction appeared alongside the actual control and the control advanced to the next line. This was one route, not a phone test.

The game and local Nano service also accept raw AAC, audio-only MP4 and 3GP voice references. Synthetic ffmpeg-encoded samples checked decoding and the recording-length limits. These checks used a test model, not a personal recording or a phone; other speech services may support different formats. A separate local 7B comparison using more concise story facts still produced recall errors; no production prompt was changed. See [MODEL_EVALUATION.md](MODEL_EVALUATION.md).

The v122 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: retreat preparation and phone-recorded references

The Mira retreat path now includes a preparation choice, with distinct physical actions and no new claim about her location. Story tests cover both choices, earlier companion decisions and legacy checkpoints. In a fresh desktop-browser Mira route, saving at the choice and restoring it allowed both actions to be played; each showed its distinct outcome. This was not a phone test.

The local Nano service and game accept Ogg, Opus and WebM reference recordings in addition to the previously supported formats. Synthetic real-codec tests cover decoding and length limits, and a local Nano model produced non-silent audio from a synthetic WebM reference. Other speech services may accept different formats; this does not test a personal voice or physical phone.

A small local 7B prompt comparison did not improve factual recall, so no production prompt was changed; see [MODEL_EVALUATION.md](MODEL_EVALUATION.md).

The v121 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: midpoint continuity and shared speech routing

The last completed exchange from the optional group conversation can now be recalled by the same companion in their later private conversation and retained in an explicit checkpoint. App tests cover written and generated replies, retries, interrupted requests, skipped scenes, older and invalid saves, and separation from Mallow. Mallow also acknowledges the group conversation when it happened, before asking about the earlier private exchange. In a fresh desktop-browser Niko route, a written midpoint exchange survived save and resume, and the later private request sent that exchange separately from the earlier private memory to a synthetic loopback endpoint. The endpoint returned a canned response; this checks routing, not model recall.

A small synthetic local 7B comparison found concrete recall errors about the card despite the selected observation being supplied; see [MODEL_EVALUATION.md](MODEL_EVALUATION.md). This is not a reliability estimate or a browser playthrough. The game cannot guarantee that a model remembers story facts correctly.

An optional public multi-voice Kokoro endpoint can now be configured alongside the single publisher Chatterbox voice. Both remain unconfigured. Synthetic app tests exercise voice previews, manual and automatic read-aloud, player overrides and clearing settings; no public service, personal reference or phone was used.

The v120 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: a conversation during the story and shared voice preparation

An optional group-audible conversation with the chosen companion follows the personalised card. It has companion-specific written responses and supports player-written AI dialogue, with a separate temporary conversation history. Story and app tests cover each companion, both activities and card choices, skipping, follow-ups, and separation from the earlier private and later Mallow exchanges. Older saves past the card retain their prior continuation. In a fresh desktop-browser Mira playthrough, save and resume exercised skipping and a written response. A synthetic loopback AI endpoint returned a typed exchange and follow-up; the captured request included the chosen card and action without the prior private message. It does not establish live-model dialogue quality.

A disabled publisher voice configuration can assign one shared Chatterbox voice to a selected speaker in a future build. No speaker, reference or service has been selected. Its validation and initialization tests cover a single assignment and restoration of the other voices. In a separate browser fixture with a fictional service address and speaker, the assignment appeared at startup and removing it restored that speaker’s Kokoro voice. No request was sent to that address; an actual public service and personal reference remain unavailable and untested.

Kokoro’s temporary eSpeak data setup falls back to a copy if symlinks are unavailable. A real local model generated audio with symlink failure simulated; this was on Linux and does not establish Windows or phone behavior.

The v119 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: speech-only setup and microphone cancellation

The local launcher now exposes its settings shortcut when Kokoro is started without Mirid. In an isolated desktop browser, the shortcut selected the real local Kokoro endpoint and a voice preview reported completion. Existing text and transcription settings are preserved; tests also cover a launcher with no available service and reject invalid setup data. This is a playback-state check, not an assessment of listening quality or phone playback.

Canceling a microphone request while its permission prompt is pending now settles the request; synthetic tests cover late grants, late denials and retries. No physical microphone or phone was used in this check.

A fresh desktop-browser Niko route reached the immediate rescue. A save at the support choice was played through both actions using resume; each produced its matching response, and one continued into the evidence callback. This checks one path, not every combination or a phone.

The v118 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 58 staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: support choices and companion history

Mira’s response after the immediate rescue now reflects which form of support the player chose. No extra passage was added, and existing checkpoints retain their original continuation. Story graph tests cover the route and its combinations. A desktop-browser Mira playthrough saved during her route, updated to v117, resumed, and showed the player-supplied knight name in its later callback. That run reached the playroom; it did not reach the revised rescue response.

Later optional private AI dialogue now receives the personal disclosure and selected question the player actually witnessed with the chosen companion. Regression tests cover all three companions, both topics, saved checkpoints, follow-ups, older and inconsistent saves, and separation from Mallow’s shared conversation. These tests check the request context, not whether a model remembers it accurately.

A local Kokoro synthesis check generated a different audio signal for each of the seven default voice IDs using the same sentence; see [VOICE_INTELLIGIBILITY.md](VOICE_INTELLIGIBILITY.md). This does not assess listening quality or playback on a phone, and no personal reference was used.

The v117 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 58 staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: pacing, continuity and voice cleanup

A redundant pause in the reveal was removed and one out-of-scene phrase replaced with a physical beat. The old checkpoint remains available; the story tests cover all 891 core paths and intervention callbacks. The opening was also inspected at a 390 × 844 desktop-browser viewport. After activating v116 and stopping the local server, the cached opening reloaded and advanced one passage. Neither check used a physical phone or proves that every offline path works.

Niko’s later private AI conversation now receives the repair note only when it was witnessed on his route. Tests cover follow-ups, inconsistent and older checkpoints, other companions, and the adapter’s context limit. This checks what is sent, not whether a model remembers it accurately.

An abandoned Nano upload that finishes decoding successfully now releases its reference slot; synthetic tests cover repeated cancellations followed by a usable upload. Real personal references and mobile playback remain untested.

The v116 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 58 staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: retreat experiment and voice upload recovery

The retreat route now gives the player another choice while the group investigates the signal. Both choices were checked in an isolated desktop browser using save and resume; automated story tests cover combinations of earlier choices and older saves. Private AI dialogue receives the observed result only when that scene was actually visited, without assuming who made the sound.

Chatterbox Nano now releases a reference slot if an upload is canceled while decoding and the background decode subsequently fails. Synthetic service tests cover that sequence; no personal voice file was used.

The v115 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 58 staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: Mallow’s choice and voice switching

Mira’s response after Mallow helps now reflects which request the player made earlier, with an earlier-save fallback. The beat was developed in conversation with the creator’s work on constructed voices and correction, without adding an explanation to the scene. In an isolated desktop browser, a Mira route was saved at the choice, played both ways through the rescue and checked for the matching closing line. Story graph and checkpoint tests cover both variants and legacy saves.

Nano’s cached reference state is now invalidated before preparing a different voice. A synthetic regression reproduces a failed preparation that partially changes the model and checks that the previous voice is prepared again. This does not establish quality with a personal voice recording.

The v114 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 58 staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: reveal pacing and phone reference import

The reveal consolidates repeated evidence and choice recall while retaining the evidence decision, door decision, selected and unselected comparisons, and public-response handoff. For the same representative choices, the number of passages from Mira becoming trapped to the receipt handoff decreased from 31 to 24 for Niko, 33 to 24 for Mira, and 32 to 25 for Ash. Other combinations may differ. Old checkpoint nodes remain available. A fresh desktop-browser Niko run and a separate Mira-route checkpoint run at 390 × 844 checked the combined record, save and resume, and the reply-based handoff. The latter used the reply produced in the prior real-model playthrough; no physical phone was used. The full reveal is shorter but remains substantial.

Nano voice-reference import now handles seek-dependent phone M4A files and stereo whose opposite-polarity channels would otherwise cancel to silence. Synthetic tests cover supported formats, length and silence checks, temporary-file cleanup and cancellation. A live local Nano test imported a synthetic anti-phase M4A and produced non-silent WAV speech; it did not use a personal reference or assess listening quality.

The v113 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 58 staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: Niko transition and live public reply

A brief repair-note moment now bridges Niko’s earlier activity and his disclosure. A desktop browser playthrough tried both lid choices using save and resume; older checkpoints retain their previous continuation. Optional AI context includes the note only if the selected route actually visited it. Tests cover older and inconsistent checkpoints, follow-ups and separation from the public conversation.

After replacing a generated follow-up with the written response, the player can again edit and retry that follow-up; the retry uses the conversation from before the replaced exchange. Automated tests cover both private and public conversations and skipping a retry.

A separate desktop-browser Mira route used the real local Qwen2.5 7B model for a public message. The generated reply was relevant but somewhat ambiguous; it survived save and resume, appeared in the later record and was available for a physical action. This is one model response, not broad evidence of AI reliability. The run also confirmed the reveal remains long, with many passages before the next decision.

The v112 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 58 staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: public AI reply and voice routing

Mallow’s last completed public reply can now appear in the later record and be selected for a physical action. It can be generated or scripted; retries, skipped pending replies and replacement with the written response retain the appropriate completed text. A desktop browser playthrough using a synthetic local chat endpoint checked the displayed reply, save and resume, and its later action. Automated tests cover private separation, retry and skip behavior, malformed saves and legacy paths. The endpoint returned canned text; this does not establish live-model dialogue quality. The audit explanation was shortened and Mallow given a practical action, though the overall reveal remains lengthy.

In an isolated desktop browser, a synthetic Kokoro-generated recording was selected as a Chatterbox Nano reference for the narrator only. A Nano preview and a separate Niko Kokoro preview both reported playback finished, and reopening settings retained the one-speaker assignment. No personal reference was used; this does not assess voice quality or mobile audio. The synthetic test file was removed and the local services were stopped afterward.

The Nano service now rejects empty, non-finite or excessively long generated output rather than returning an invalid WAV. Synthetic service tests cover the failure paths.

The v111 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 58 staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: receipt annotation, narrow screens and preview lifecycle

The player can now write an annotation on the audit receipt or accept the suggested line. In an isolated desktop browser playthrough, a synthetic annotation containing Unicode and HTML-like text appeared literally, survived save and resume, and appeared on the later receipt. Automated tests also cover a blank default, a 500-character value, unsent drafts, malformed saves and older checkpoints. The annotation is not sent as model context; an epilogue request receives only the fact that the player wrote on the receipt.

The page no longer forces a 320-pixel minimum width. In desktop-browser simulations at 280 × 568 and 320 × 568, the opening, first choice, settings and restart were accessible without the prior horizontal overflow. This is not a physical-phone test.

Voice preview now stops when the page is hidden or closed and when a pending launcher preset or reference upload changes the draft. Blank preview voice fields use the same provider-specific default as story speech. Automated tests cover these cases with synthetic requests; physical-device audio and a personal Chatterbox reference remain untested.

The v110 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed. All 58 staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled; no phone or emulator runtime was tested in this pass.

## 4 November 2026: public words and voice previews

A new action lets the player use a line they submitted publicly as a physical scrap during the rescue, without interpreting its meaning. A desktop browser playthrough reached it with a player-written group message, saved and resumed, and followed its effect to the latch. Automated tests cover the public follow-up, private separation, legacy saves and all 891 core routes. A short earlier moment also makes Mira's movement toward the missing piece visible.

Speech settings now offer a preview of the currently displayed voice configuration without saving the draft. In an isolated desktop browser, the preview reported completion for the narrator and Niko through a real local Kokoro service. Direct synthetic requests returned distinct WAV data for the two assigned IDs; this does not assess listening quality or a physical device. Tests cover routing the selected speaker, limiting the Chatterbox override to its selected speaker and cancelling a pending preview when settings close. No personal recording was used.

Chatterbox Nano now cleans up its temporary default-reference copy and workers if model loading fails. A synthetic-audio regression covers startup failure; no real reference was involved.

The v109 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed, and all 58 staged web files matched both APKs and both native asset directories. The iOS project was synced but not compiled. No phone or emulator runtime was tested in this pass.

## 4 November 2026: practical opening choices and cached play

The opening's three team-signal options now explain how the player helps during the fort mishap, with a specific response for each. At a 390 × 844 desktop-browser viewport, the text and controls were readable; a playthrough saved at the choice, tried the ribbon and star, restored the checkpoint, and verified the bell response as well. After the local web server was stopped, the previously cached game reloaded and restored that checkpoint. This is browser simulation, not a phone or installed-PWA test.

A small synthetic 7B model comparison tested an instruction to acknowledge corrections; it did not reliably fix the observed continuity error and was not adopted. See MODEL_EVALUATION.md. The Android identifier-migration instructions now include the instrumentation-test package.

The v108 Android debug, unsigned release and instrumentation packages compiled; native unit tests passed, and 58 staged web files matched each APK and both native asset directories. The iOS project was synced but not compiled. No phone or emulator runtime was tested in this pass.

## 4 November 2026: group introduction, voice limit and live model

The friends now deal with a small fort mishap together before splitting up, using the existing signal choice. A desktop browser playthrough checked the bell response and continued to the hunt. Story tests cover the three signals, all companions, 479 nodes and 891 core paths; old checkpoints keep their earlier continuation.

When the capture sample limit is reached, recording now starts the normal stop-and-transcribe path instead of relying solely on the page timer. Automated tests cover both browser capture implementations, cancellation and competing stop requests; this has not been tested on a physical phone.

In a desktop browser playthrough with the local Qwen2.5 7B model, Niko remembered the crown motif but incorrectly said the player had crowned him when the player had worn it. A follow-up correction did not elicit an acknowledgement; the player could switch to the written response. This is one stochastic example, not a measure of model quality, and the model can still contradict established events.

The v107 Android debug and unsigned release builds and instrumentation APK compiled; five native unit tests passed. iOS assets were synced but not built. Device microphone, speech, gameplay and store behavior remain unverified.

## 4 November 2026: report handoff and audio errors

Mira can now respond to a report falsely attributed to her in different ways depending on how the player handles the receipt. The response appears only after the report was shown; older saves retain the previous continuation. A desktop browser playthrough reached the report, saved and resumed, then tried both receipt handoffs. It also exposed doubled punctuation around a quoted player message; the corrected wording was verified after updating the browser. Story tests cover 475 nodes and 891 core paths, including both handoffs and private-sharing branches.

Unsupported returned audio now stops auto-read and gives a playback error; a browser autoplay denial instead retains the prepared audio for a direct retry. Unit tests cover both outcomes. A desktop browser run with a synthetic malformed WAV showed the playback error, switched auto-read off and continued to the next passage. No personal voice reference or physical phone was used.

The Android touch smoke test now targets visible opening text rather than a top-edge coordinate that could fall under a system bar. The v106 debug and unsigned release builds and instrumentation APK compiled; five native unit tests passed and 58 staged web files matched both APKs. The device test remains unrun. iOS assets were synced but not built; neither platform was tested on a phone.

## 4 November 2026: group follow-ups, rescue and speech recovery

The later record now uses the most recent submitted group follow-up, with the original group message as a fallback. In a desktop browser run using a synthetic local endpoint, a public follow-up survived save and resume and appeared in the later record; a separate private fixture did not. Automated checks cover retries, skipped pending replies, unsent drafts, malformed checkpoints, older saves and preservation of the private conversation. The endpoint returned canned replies and does not test model quality.

The immediate-rescue path now gives Mira a short choice about how the group helps her. A browser playthrough reached the unplugged-printer rescue, saved at the choice, tried one response, restored the checkpoint and tried the other. Story tests cover 24 route and choice combinations and preserve old checkpoint behavior; other endings remain separate. This is selected-route coverage, not every combination.

Auto-read switches off after a terminal speech failure, so subsequent passages do not repeatedly send requests; manual read-aloud remains available for retry. An isolated browser test used an unavailable local endpoint, observed the error and auto-read switch off, and advanced normally. Automated tests cover a failed service, a later Nano segment failure and a browser-blocked playback that stays available for a direct retry. No real voice reference was used.

The v105 Android debug and unsigned release builds and device-test APK compiled, with five native unit tests and 58 staged web files matching both APKs. iOS assets were synced but not built; no physical device test was available. An experimental iOS network exception was investigated and removed because existing loopback behavior could not be established without an iOS runtime.

## 4 November 2026: continuous read-aloud and Mallow’s ending

Auto-read is an opt-in session control: it requests the current passage and each later passage using the speaker’s configured voice. Stop audio turns it off. Automated checks cover a single Chatterbox assignment alongside separate Kokoro voices, advancing during synthesis, the stop control, hidden pages, a pending AI reply, and a reply arriving while settings are open. In a fresh desktop browser using the real local Kokoro service, the narrator, Service and Niko passages each reached “Playing speech” automatically, then Stop audio switched the control off. A 320 × 568 desktop viewport check showed no horizontal overflow in the voice controls. This checks browser state and request routing, not listening quality, the user's future voice, or a physical phone.

Missing Chatterbox reference and invalid upload messages were also tested against a real local Nano service using synthetic inputs. No user voice recording was used.

The choice of where Mallow rests now leads to a distinct small closing gesture. A fresh browser playthrough reached that ending, tried both choices with save and resume, saved and resumed the new fort scene, and reached the ending without browser warnings or errors. Old checkpoints without the choice retain their earlier continuation. The story graph test covers 468 nodes and 891 core paths.

The v104 Android debug and unsigned release packages were rebuilt with five native unit tests and 58 staged web files matching the APKs. The device instrumentation test compiled and now checks portrait CSS visibility and dimensions, but it was not run on a phone. A desktop browser showed the portrait at simulated 320 × 568 and 568 × 320 sizes. iOS assets were synced but not built; neither platform was tested on a physical device.

## 4 November 2026: public words and circular evidence

A public message to Mallow now appears in a later record, with two reports citing each other as though they were independent. Old saves without the visit marker follow their previous route. A desktop browser run sent a synthetic private message, chose to keep it private, then sent and revised a group message containing angle brackets and an emoji. The revised public text appeared as plain text in the record; a synthetic local endpoint received the revised message and the selected count-check action but not the private fixture or discarded initial message. Saving and resuming at the handoff worked, and no browser warnings or errors were reported. A second browser route exercised the unchanged group message and receipt handoff. Automated checks include sharing versus privacy, retry after choosing the written response, saved revisions, the quotation after resume and old checkpoints. The endpoint's reply was canned; this does not test generated-reply quality.

A separate local-model experiment found that supplying the previously missing count-check action did not reliably make the model recall it; see [MODEL_EVALUATION.md](MODEL_EVALUATION.md). The action is supplied as context, not a guarantee about model responses.

The v103 Android debug and unsigned release packages were rebuilt with five native unit tests and 58 staged web files matching the APKs. A new Android instrumentation test for launching the packaged WebView and advancing by touch compiled against the correct app ID. No device was available to run it, so the test is compile-only. iOS assets were synced but not built; neither platform was tested on a phone.

## 4 November 2026: door scene, sound and dialogue format

A brief uncanny interruption now plays differently depending on which side of the door the player attends to, while keeping the existing rescue clues. In a fresh Niko browser route both choices were played through save and resume and the story continued without browser warnings or errors. The graph test covers 465 nodes and 891 core paths; this is not a browser playthrough of every combination.

The optional soundscape now echoes the bell on its selected route and gives both ways of checking the count the same acknowledgement. It also gives the active later correction scene its cue. In a separate browser run, sound was enabled through the bell route and machine action, then muted, without browser warnings or errors. Automated audio-graph checks cover route selection, scheduling, mute and background behavior; this does not establish audible quality on a physical speaker.

A synthetic local-model comparison of 30 replies did not show that adding grounding examples reliably helped, and in some cases the model imported an unrelated example detail. The production prompt was left unchanged. A separate narrow formatting fix recovers a complete quoted utterance after one observed third-person preamble; it does not verify the answer’s truth. The local service guide now documents the optional larger model with measured latency and accuracy limits. See [MODEL_EVALUATION.md](MODEL_EVALUATION.md).

An official Android 34 software emulator was tried as a different WebView environment, but did not complete boot after roughly five minutes; an early install attempt failed during Android package setup. It was stopped, so that attempt gives no evidence about game behavior. The v102 Android debug and unsigned release packages were rebuilt with five native tests; their 58 staged web files matched the APKs. iOS assets were synced but not built. Neither was tested on a physical phone.

## 4 November 2026: team signal and machine report

The player can now physically challenge the machine’s count in two different ways; later, the story recalls the action and the machine’s misreport. A fresh Niko/bell browser run tested both actions and their distinct callbacks by saving and resuming. An Ash/bell browser run selected the physical arrangement and later kept a private message private: the interface displayed both the refusal and the machine’s success claim, and restored it after save and resume. Neither browser reported errors or warnings. Automated checks cover the other refusal choice, when the report appears and disappears, and old saves; the graph covers 465 nodes and 891 core paths. These are selected browser routes, not every combination.

A separate synthetic local-model comparison tested Qwen 1.5B and 7B at two temperatures. The larger model recalled one prior action in all four samples but invented a location in all four samples for a separate question; lower temperature was not a reliable improvement. No production model setting changed. See [MODEL_EVALUATION.md](MODEL_EVALUATION.md) for details and limits.

A diagnostic on a disposable Android 35 software emulator disabled its repeatedly crashing Bluetooth service and installed the v100 app. Capacitor began loading `https://localhost/`, but the WebView sandboxed renderer crashed with SIGTRAP and Chromium terminated the app; a native JavaScript probe could not read the page. This identifies the failed component in that emulator, not the underlying cause or behavior on a physical device. The v101 Android debug and unsigned release packages were rebuilt with five native tests; their 58 staged web files matched the APKs. iOS assets were synced but not built. Neither build was tested on a physical phone.

## 4 November 2026: easier local setup and a returned receipt

A receipt shared with Mira now gives her a physical contribution to the later plan. Keeping it follows a different path; older saves without the new marker do not invent that action. The story tests cover 64 combinations of the handoff, door action, audit action and ending. This is automated path coverage, not a complete browser playthrough of every combination.

The Linux local launcher exposes a small, non-secret settings document only when its isolated Mirid profile is started. In a fresh desktop browser, **Use local launcher settings** filled the real local text, Parakeet and separate multi-voice Kokoro addresses; Chatterbox Nano's address was available without assigning a reference. After saving and reopening, the Nano address remained and the reference remained empty. The opening reached Kokoro “Playing speech”, and an original player question received a generated Qwen response. This was one reply and a browser playback-state check, not a listening-quality assessment or a test with the user's voice. The browser reported no errors or warnings. Tests also cover invalid setup data, a missing launcher, cancellation while settings change, and a canceled Chatterbox reassignment.

The v99 debug app installed and its main activity launched on a fresh Android 35 software emulator. Capacitor logged that it loaded the game URL, but the screen remained white after a system-UI ANR; other system components also reported ANRs under load. This did not verify gameplay or WebView networking. The v100 debug and unsigned release packages were then rebuilt with five native tests; their staged web assets matched the APKs. iOS assets were synced, but no iOS build or physical phone test was possible on this Linux host.

## 4 November 2026: record choice and local setup

The record-first outcome now gives the player two distinct follow-ups with visible consequences for Mira. An isolated desktop browser run selected the question, saved and resumed, and reached the later private conversation. A synthetic local chat endpoint received the witnessed action as story context; the reply was canned and does not establish real-model quality. The browser reported no console errors or warnings. Automated coverage also exercises the alternative and existing saves.

The local launcher was tested with the prepared Linux assets: local Qwen returned a reply, Parakeet transcribed a synthetic fixture, and Kokoro returned audio. Nano was started without a reference; the user's future voice was not used. Launcher regression checks passed. The isolated Mirid profile disables outreach initialization and its outreach endpoints, and disables election polling. Other platforms and real voice quality were not tested.

On an Android 35 software emulator, a native probe inside the v98 debug app confirmed the loaded policy allowed the four loopback host spellings and denied the tested non-loopback hosts; native HTTP requests to localhost and 127.0.0.1 returned 200. IPv6 was checked only as a policy decision. This did not exercise WebView, CORS, game play, speech, or a physical device. The v99 debug and unsigned release builds were subsequently rebuilt; iOS assets were synced but not built.

## 4 November 2026: the named card and Android loopback

A fresh Mira browser playthrough named the drawn knight with a synthetic name containing angle brackets and an emoji. The name appeared as text in the new playroom card scene; that passage survived save and resume. In the later conversation, a synthetic local chat endpoint received the name and the witnessed card event. This checks the supplied context, not a real model’s recall. Automated story tests cover named and unnamed paths, old saves, both souvenir decisions and all four endings.

Android now has a narrowly scoped network security configuration allowing same-device loopback HTTP, with other cleartext destinations denied. Native configuration, fresh-project, debug and release build checks passed, including release lint and five native unit tests. Both APKs contain the network configuration and their 57 packaged game files match the staged source. Actual Android WebView, CORS and phone networking remain unverified. The iOS assets were synced but not built.

## 4 November 2026: Mira’s drawing and phone voice settings

In a fresh desktop browser playthrough, the player named Mira’s drawn knight with a synthetic name containing punctuation and an emoji, saved and resumed, and saw that same name in Mira’s closing scene. A synthetic local chat endpoint received that name in the subsequent closing request; this tests request context, not a real model’s recall. The name is optional; tests cover skipping it, old saves, plain-text rendering and Mira-only AI context, including the bounded closing scene. A separate Niko retreat playthrough reached its ending with a new topic-specific line focused on finding Mira; the repeated steering explanation was tightened.

In an isolated desktop browser, switching from an OpenAI-compatible speech preset to the phone companion restored the distinct Kokoro defaults that had been inserted automatically. A manually entered voice was retained, with unsupported IDs identified. A synthetic saved Chatterbox assignment could be reopened and removed. No user recording or physical phone was used.

The v97 Android debug and unsigned release APKs were rebuilt, with 57 bundled game files matching the staged source and five Android native tests passing. iOS assets were synced but not built; neither app was run on a physical phone.

## 4 November 2026: conversation callback, retreat and speech

A fresh Ash browser run submitted a synthetic private message and follow-up, saved and resumed, then chose to let Mallow repeat the message. Mallow repeated the latest submitted follow-up; the same line reached a synthetic local group AI endpoint and its follow-up, while the earlier private message did not. Replaying from the same checkpoint and choosing privacy excluded both private messages from the group request. Tests also cover unsent drafts, retries, skipped responses, long messages and older saves. This tests routing with synthetic responses, not model quality.

Ash’s retreat ending now keeps the search for Mira active, including situation-specific written conversation. A separate full browser playthrough reached that ending, and another exercised the new written reply. The story graph and relationship tests passed.

A speech retry race was fixed so a late result from an older play attempt cannot overwrite the latest playback status. With a real local Nano service and a synthetic reference, advancing during preparation and during playback did not leave stale speech status on the next passage. This did not test the user's voice, physical speakers or a phone.

The v96 Android debug and unsigned release APKs were rebuilt; their 57 bundled game files match the staged source, and five Android native unit tests passed. iOS assets were synced but not built. Neither platform was tested on a physical phone.

## 4 November 2026: machine report and scene continuity

The ticket machine now places its false count in the story interface, then labels either correction as confirmation. In a fresh Mira browser route, the report appeared with the wrong count, changed after the player challenged it, cleared on leaving the scene, and the route reached the ending without browser warnings or errors. Save/resume and both correction choices are covered by integration tests. At a 320 × 568 Chrome viewport the report stays beside the dialogue when the page scrolls; only one copy is exposed as a live status in the accessibility tree. This is a viewport simulation, not a physical phone test.

The fort and playroom descriptions were adjusted to match their artwork; the little blanket fort downstairs now echoes the one upstairs. The updated playroom description was checked in the browser. Keyboard Enter and Space advanced the opening and Tab reached a story choice.

A local synthetic comparison sampled 40 responses from two Qwen models; an added instruction to answer questions directly was inconsistent and was not adopted. A narrow format check was added for one observed third-person self-attribution, with tests retaining quoted speech and references to other characters. See [MODEL_EVALUATION.md](MODEL_EVALUATION.md) for details; generated dialogue remains model-dependent.

The v95 Android debug and unsigned release APKs were rebuilt, with their 57 bundled web files matching the staged source and five Android native tests passing. The iOS assets were synced but the app was not built; neither app was tested on a phone.

## 4 November 2026: conversation consequences and closing context

A written follow-up topic now changes a companion-specific rescue-planning beat; when the player preserves evidence and immediately rescues Mira, it also changes the physical action at the latch. A fresh Niko browser route followed the past-topic, evidence-preserving and unplugged-printer choices through the rescue. The action reflected Niko's earlier conversation, and the paper roll stayed intact. Automated story checks cover 192 combinations, including all three companions, both topics, work choices, sharing choices, endings and selected printer states. Older saves without the new visit marker do not invent that action.

In a second browser run, a synthetic local chat endpoint received the actual closing request after that route. Its scene contained both the intact paper roll and the witnessed rescue action, and the browser displayed the endpoint's synthetic reply. Tests also cover the four Mallow souvenir choices, all three companions, follow-ups and older saves. This verifies the supplied context, not whether a real model will reliably recall it. No player data was used.

The desktop browser showed an update from the earlier cached version; a saved passage was restored after applying it. Separate 320 × 568 portrait and 568 × 320 landscape viewport checks covered the opening, a story choice and speech settings without horizontal overflow. These are browser simulations, not phone tests.

The v94 Android debug and unsigned release APKs were rebuilt, and their packaged web assets matched the staged source. Five Android native unit tests passed; iOS assets were synced but the app was not built. Neither platform was tested on a physical phone.

## 4 November 2026: reveal pacing and cast voices

The team now continues working at Mira's door while the machine presents earlier choices and records; a click below the counter foreshadows the eventual release. A fresh Niko-route browser playthrough reached the immediate-rescue ending, and a second replay checked the corrected receipt path through its first printed line. The second replay confirmed that Ash catches the new receipt before it is read and that the redundant receipt screen no longer appears. No browser warnings or errors were reported. The 425-node story graph and 891 core offline paths were checked; old save targets remain present.

A separate browser session used the real local multi-voice Kokoro service for six story speakers: Narrator, Service, Niko, Mira, Ash and Mallow each requested a different configured voice and reached “Playing speech”. A synthetic reference was then assigned to Mallow through local Chatterbox Nano; that speech reached playback and Narrator remained on Kokoro. This checked engine routing and browser playback status, not audible quality, a physical speaker, a phone, or the user's future reference.

After loading the game on a fresh localhost origin, the server was stopped. The desktop browser reloaded from its cached shell and reached the first story choice without browser errors. This used the prior v91 cache and does not test installation or an actual device.

A separate Android software-emulator retry booted, but an independent minimal HTML/JavaScript WebView remained blank and system components reported ANRs. The emulator was stopped; this does not establish the cause or verify game runtime. The v93 debug and unsigned release APKs were rebuilt; their 57 packaged game files match the staged source and five Android native unit tests passed. iOS assets were synced but not built.

## 4 November 2026: Mira route and local model continuity

A fresh desktop browser playthrough followed Mira from the opening to the prototype ending, with scripted dialogue. It tested the free repair-kit name, declined the hint, left the private conversation private, tore the souvenir, covered the lens, asked Mallow to help and used the torn card to open the door. The drawing, bell, copied tag and other choices carried through; the requested feedback address appeared at the end, and no browser errors or warnings were recorded. The reveal remains dialogue-heavy and this is one route, not every combination.

A second isolated desktop browser run followed Ash to the ending with local 1.5B dialogue enabled. Four generated responses arrived and the private-message repeat followed the selected consent; one reply omitted a naming question, another was generic and a later reply mostly echoed the player. No browser errors were reported. A separate Mirid CPU smoke returned a synthetic Kokoro WAV and a Parakeet transcript, without testing audible playback or distinct voices.

A separate local 7B experiment compared an additional fact-extraction step with the existing dialogue prompt. Both approaches still produced unsupported facts in a small synthetic sample; the extra step increased latency and was not added to the game. See [MODEL_EVALUATION.md](MODEL_EVALUATION.md) for the exact observations and reproducible probe.

The current Android release APK was rebuilt unsigned; all 57 packaged game-shell assets matched the source. The release build, lint and five native unit tests passed, with 29 lint warnings and no errors. No physical phone or iOS build was tested.

## 4 November 2026: segmented speech and paired routing

The production Nano splitter divided a 94-word fixture into four ordered parts that rejoined exactly. Real local Nano generated each part with a synthetic reference; local Parakeet reported five word errors when the WAVs were concatenated, and four errors on a separate validation run. This is an offline audio proxy, not a capture of browser playback or a human listening assessment. No user reference was used. See [VOICE_INTELLIGIBILITY.md](VOICE_INTELLIGIBILITY.md) for timings and the optional repeatable probe.

The paired voice gateway returned real Nano WAVs over verified loopback HTTPS for two sequential requests under each simulated Android and iOS origin. Regression checks also exercised ordered chunks, access rejection and abort/recovery. No physical phone or speaker was used.

A fresh Ash route reached the record-first ending after saving and resuming at the souvenir choice. The chosen objects, printer state, receipt handoff and character callbacks remained consistent; the browser reported no errors. One repeated reconnect explanation was subsequently shortened. A browser replay reached the revised exchange and continued to Team HQ; story-graph tests passed.

The v92 Android debug APK built with five native unit tests passing and packaged web assets matching the staged source. iOS assets were synced, but neither app was run on a phone and iOS was not built.

## 4 November 2026: earlier Nano playback

With a synthetic reference and a warmed four-thread local Nano model, the same opening passage took 16.46 seconds as one buffered request; its first 73-character part took 3.97 seconds. In the desktop in-app browser, a separate segmented run reached “Playing speech” after 5.00 seconds, and a complete three-part run reached “Speech finished.” Stopping another run left it stopped after 12 seconds; no browser errors were reported. These are single local measurements, not a performance guarantee or test of the user's voice.

Voice UI tests cover exact ordered text, cancellation, a failed later part, blocked later playback, stale playback promises, Safari without `Array.prototype.at`, and unchanged single-request behavior for other engines. The service may finish its current CPU inference after cancellation. Audible continuity, physical speakers and actual mobile WebView behavior remain unverified.

The v91 Android debug APK built with all five native unit tests passing; its packaged web assets matched the staged source. The iOS assets were synced but not built. No phone was used.

## 4 November 2026: speech intelligibility and current mobile tooling

The local speech engines generated four short test passages and a longer original story passage, using a synthetic Nano reference. A local Parakeet recognizer transcribed the short samples with 0–1 reported word errors each and the 94-word Nano passage with four reported word errors. That longer passage took about 28 seconds to synthesize after loading. ASR is an imperfect proxy for hearing the audio: it does not establish human listening quality or fidelity to the user's future reference. See [VOICE_INTELLIGIBILITY.md](VOICE_INTELLIGIBILITY.md) for the exact scope and repeatable probe.

No Android device is currently attached, hardware acceleration is unavailable, and Xcode is not installed on this Linux host. An offline Android release build and lint check passed against the v90 assets with zero errors and 29 warnings. The release APK is unsigned and was not run; this does not establish device compatibility.

A fresh scripted Mira route was played through the retreat ending, including a save and resume at the souvenir choice. The torn card, ribbon, workshop conversation and Mira's location remained consistent; the sound toggle and voice settings opened without reported browser errors. An update notice observed on an already-used test origin did not appear when rechecked on a freshly assigned port. This is desktop-browser coverage, not a real-model or phone playthrough.

## 4 November 2026: paired phone voice routing and story red team

A verified local HTTPS companion test used a simulated iOS origin to request two different Kokoro voices and the configured default Chatterbox Nano voice from the actual local services, using synthetic text and reference audio. All returned WAV data. The gateway's authenticated route and opt-in configuration were also covered by loopback TLS tests. This did not use an actual phone, the user's voice, or physical speakers; the phone cannot upload a reference through the gateway.

The reference-voice removal control was exercised in a desktop browser; it restored the speaker's previous Kokoro selection. Tests cover saving or cancelling that change and stopping an in-flight upload. Separately, a fresh scripted Niko route reached the record-first ending; its receipt, printer state, souvenir and companion callbacks remained consistent, with no reported browser errors. The reveal remains dialogue-heavy.

The v90 Android debug APK built with five native unit tests passing, and its packaged web assets matched the staged source. The iOS project was synced but not built. Device playback, microphone behavior and actual phone networking remain unverified.

## 4 November 2026: separate Kokoro and Chatterbox voices

With synthetic reference audio, the local Chatterbox Nano service generated real speech on CPU for two different passages. A browser test assigned that reference only to the narrator, reached playback state, and then read a Service passage using the separate Kokoro service. Reassigning the reference to Mira restored the narrator's prior Kokoro selection. No user voice was used. The tested Nano runtime and pinned model cache were moved out of temporary storage; a further offline inference after the move produced a non-silent 24 kHz WAV.

Each of the seven distinct Kokoro voice IDs generated a non-silent 24 kHz WAV with the same test sentence; longer passages also worked in the American and British pipelines. This verifies synthesis output, not subjective voice quality. Automated tests cover the single-speaker override, separate transcription and read-aloud addresses/protocols, reference upload behavior, service request limits, and cancellation. Physical speaker output and the user's eventual voice reference have not been tested.

The v89 Android debug APK built and all five native unit tests passed; its staged web assets matched the source. The desktop voice services are not included in the mobile app. Neither app was run on a physical phone, and iOS was not built.

## 4 November 2026: companion reaction, lighting and sound

A fresh desktop-browser Mira route reached her new reaction to the souvenir, saved and resumed there, then continued to the keep-or-tear choice without console errors. Graph tests exercise all six companion/activity combinations and check that a caption checkpoint does not repeat the reaction.

In a fresh Niko route, the original playroom image remained visible through Mallow's last line before the shift. The edited room appeared when the light went out, persisted into the next passage, and returned after saving and resuming. A 390 × 844 browser viewport had readable dialogue and no horizontal overflow. Tests cover earlier checkpoints by story node, but restoration from an actual pre-update save was not browser-tested. The viewport was not a phone or touchscreen.

A second Niko route checked the crown souvenir's new response and visually inspected the room immediately before and after the light change. The v88 Android debug APK built and its five native unit tests passed; packaged assets matched the staged source. iOS assets were synced, but neither platform was run on a phone and iOS was not built.

The opt-in soundtrack was enabled during a desktop-browser Niko route to the playroom and muted afterward without console errors. Automated tests check the longer waveform, quiet loop seam, volume bounds, mood changes and lifecycle. Physical speaker output, mobile playback and subjective musical quality have not been assessed.

## 4 November 2026: reveal intervention and direct resume

In a fresh desktop-browser Mira route, the player passed the receipt under the door for Mira to read, annotated the returned receipt during the audit, opened the door, and reached the ending. Mira referred to seeing the slip; the later audit and the drawing of the plush's loose ear remained consistent. A separate browser test saved at the handoff and exercised both giving Mira the receipt and telling her about it, including their later responses and two different audit actions. No browser console errors were reported. Graph tests also cover the new choices, audit interventions, endings and old checkpoints; these are not full browser playthroughs of every combination.

The direct Resume control was tested in the browser by saving, advancing, cancelling a restore, restoring, and reloading through the fictional opening. Cross-tab tests covered a new, deleted and replaced checkpoint; restoring an outdated confirmation left the current passage intact. Simulated app tests cover drafts, pending AI and microphone permission, and invalid saves. A 390 × 844 browser viewport was checked for overflow and control size; it was not a physical phone or touchscreen test.

The v87 Android debug APK built and all five native unit tests passed. Its web assets matched the staged source, and the iOS assets were synced. Neither app was run on a phone, and the iOS app was not built.

A small local Qwen2.5 7B experiment compared the existing dialogue request with a different message structure. Both still invented facts in some replies; the production prompt was not changed. See [MODEL_EVALUATION.md](MODEL_EVALUATION.md) for the limited sample and repeatable probe.

## 4 November 2026: companion pacing and first-message retry

Fresh desktop-browser playthroughs followed the revised Mira and Ash routes to their endings using scripted dialogue. Their private conversations and follow-up questions came before the uncanny clues, and the clues led into practical decisions. In the Ash run, the torn souvenir pieces remained separate and were used at the covered-lens rescue. Both runs reached the contact ending without browser console errors. Graph checks cover all three companions and both activity choices, plus older checkpoint continuations; they are not full browser tests of every combination.

In a separate browser test with a disposable deterministic local response service, a Niko private reply was revised twice, switched to the written response, saved and resumed. A later group response with sharing declined did not receive the private revisions. Automated app tests also check abandoned drafts, failed requests, prior epilogue memory and revised save data. This checks retry behavior with a fixture, not the factual reliability of an actual model.

The retry controls were also exercised at a 390 × 844 desktop-browser viewport. The controls were reachable with vertical scrolling and there was no horizontal overflow. This was not a phone, touchscreen or mobile WebView test. The v86 Android debug APK built and all five native unit tests passed; its packaged web assets matched the staged source. The iOS assets were synced, but the iOS app was not built or run.

## 4 November 2026: opening and continuity audit

A fresh desktop-browser playthrough followed Niko through unplugging the printer, asking Mallow for help, spending the souvenir, and bringing Mallow to the fort. The held receipt, screen, plush and spent card remained consistent through the ending. Other printer outcomes and their callbacks were reviewed against the story. A separate Niko route was played as far as the personalised souvenir.

Single clicks on the opening backdrop, text and Agree button each advanced after the intended 240 ms animation. Enter and Space also worked on the focused button. Automated checks exercise mouse and touch-style pointer events, but no physical touchscreen was used. A trial illustration for the souvenir did not match the existing art and was removed after visual review.

A local Qwen2.5 7B comparison tested prompts for grounded recall using synthetic messages. Both variants still invented story details, so the existing prompt was retained. The small comparison and its limits are recorded in [MODEL_EVALUATION.md](MODEL_EVALUATION.md).

The v85 Android debug APK built successfully and all five native unit tests passed. Both native asset directories were synchronized, and the Android APK's packaged web assets matched the staged source. The Android release build and lint also passed in an isolated copy, with zero errors and 31 warnings. This does not establish Android runtime behavior; iOS still requires an Xcode build and device testing.

## 4 November 2026: printer intervention and AI follow-up retry

In a desktop browser, a Niko route reached the new printer intervention. Unplugging stopped the paper while Mallow's screen remained active. A checkpoint at the later printing decision was used to check both reconnecting and leaving the printer unplugged; the latter led to Mira's rescue with the paper roll intact. A separate synthetic local response service exercised editing and resubmitting a generated follow-up; the revised request retained the earlier conversation without the discarded follow-up. The service used test text only and is not evidence of real-model accuracy. Story tests also cover other companions, endings and legacy saves.

## 4 November 2026: browser update and saved story

An isolated desktop-browser copy was loaded with one cached release, then a second release was served while two game tabs remained open. The update control appeared without interrupting the current passage. After saving and choosing the update, the browser loaded the second release and the saved checkpoint resumed. This verifies one desktop browser update path; it does not establish installed-PWA or mobile-browser behavior. Versions from before the update control may require all game tabs to be closed before their waiting worker activates.

Separate browser passes checked the revised uncanny souvenirs after Niko's practical activity and Mira's drawing activity, including tearing Mira's card and continuing. The Ash variant and other combinations remain covered by story tests rather than these browser passes.

## 4 November 2026: character and visual pass

A desktop browser playthrough followed Mira's route through Mallow's rescue to the new closing choice. It saved at that choice, checked the fort outcome through the ending, resumed the checkpoint and checked the counter-light outcome. The playroom's visual phase persisted across passages. Desktop and phone-width browser views showed the speaking character alongside or above the dialogue rather than obscured by it; the phone-sized viewport had no horizontal overflow. Additional desktop and tablet sizes were checked, but no physical touch device was used.

A paired local 7B prompt comparison explored whether Mallow could discuss its fictional circumstances. Results were mixed and included an incorrect retreat detail; see [MODEL_EVALUATION.md](MODEL_EVALUATION.md). This is not proof of general model grounding.

## 4 November 2026: local model browser conversation

In the desktop in-app browser, a disposable local Mirid backend served Qwen2.5 7B while a synthetic Niko route was played to its private conversation. A typed question about Niko's brother received a relevant generated response, and a follow-up about the player's earlier crown received a coherent but generic reply. This verifies the browser-to-Mirid request and one follow-up, not general story grounding or model quality. The backend and its temporary profile were stopped afterward; no real player message was used. See [MODEL_EVALUATION.md](MODEL_EVALUATION.md) for other responses, including a 1.5B contradiction that the format filter did not catch.

The browser also enabled the revised opt-in procedural sound, advanced through the opening and the first hint, and muted it again without reported browser errors. Automated audio tests cover the mood changes and background/mute lifecycle. This did not verify subjective sound quality, physical speakers or mobile playback.

## 4 November 2026: pacing and character-dialogue pass

Two desktop browser playthroughs covered Mira's route through the covered-camera rescue and Ash's route through the retreat ending. They exercised distinct written replies, the relocated map and kit choices, a free kit, both ways to help at the new door choice, an intervention checkpoint saved and resumed, and the contact link. One retreat narration was corrected after the playthrough. A 375-pixel-wide browser viewport showed the intervention choices without horizontal overflow; this was not a phone or touch test.

The previously uninterrupted reveal now offers a concrete decision partway through; a representative Ash route took 12 advances from the evidence choice to that decision and 19 from it to the audit choice. These are not measurements of every path. Automated checks covered 400 story nodes, 891 core paths, legacy checkpoint continuations, and 58,320 mocked ending and AI-context combinations. The latter test covers follow-ups, selected details, privacy and the 1,800-character context limit, but does not establish real-model response quality. The v80 Android APK was built and five native unit tests passed; Android runtime and the iOS build still need device testing.

## 4 November 2026: first-player red team

A fresh desktop browser playthrough followed the opening through Niko's route, declined the repair-kit offer and the request to share private words, challenged the false ticket count, annotated the audit receipt, rescued Mira and reached the team ending. The playthrough found that the personalised false souvenir and the discrepancy between the machine's reports and physical evidence were effective, but the crisis was interrupted by a long series of repeated explanations and transitional clicks. In the earlier version one representative route required 49 advances between the evidence response and the audit choice. The revision moves the rescue into the reveal and reduces that representative route to 37 advances; this is a targeted developer playtest, not a study with independent players. The revised route was replayed through the ending in a clean browser origin, including checking the contact link's destination. The mail-app handoff was not tested.

The same pass exposed a misleading conversational expectation: with no AI configured, asking Niko a direct question produced a generic scripted reply. The input now indicates when the next reply is scripted. AI quality remains dependent on the selected provider and model, and the player must configure a service for generated dialogue.

## 4 November 2026: audit intervention

In the desktop in-app browser, the Niko route was played to the new audit intervention and saved and resumed at the choice. Covering the lens led to Mallow's later request to move the star: both moving it and keeping it in place were exercised, and the covered-lens route was followed through Mira's rescue. The receipt-annotation branch was checked through its handwritten callback, and the leave-it-alone branch through the callback showing the unchanged slip.

Automated checks covered the 395-node story graph and 891 core paths, plus 19,440 combinations of ending and authored AI context, including both lens outcomes. Those context checks use a mocked provider and cover follow-ups, the adapter's 1,800-character limit and the exclusion of unchosen details. They do not establish generated model quality or constitute a browser playthrough of every combination.

No physical phone was used. The earlier software-only Android emulator attempt still has an unresolved WebView renderer crash before gameplay; this desktop pass does not establish Android or iOS runtime compatibility.

## 4 November 2026: rebuilt satire

After the opening and story satire were revised, a desktop in-app browser pass checked that a click away from the Agree button moved it beneath the click and continued into the story. The same interaction was checked at a 390 × 844 browser viewport, and Enter activated the focused button. The viewport was not a physical phone or touch-device test.

One Niko route was played through to an ending. It included the private-sharing refusal remaining visible as **NO** while the service counted engagement, and the reveal of an audit whose apparent sources trace back to the same agreement. Automated story-graph checks also covered 891 core paths. This pass does not establish the pacing or outcome of every branch in a browser; the tests recorded below concern the earlier version unless stated otherwise.

## 4 November 2026: desktop in-app browser

The prototype was served from a loopback web server and played in the desktop in-app browser. This was a limited developer playtest, not a complete compatibility or device assessment.

- Played the Niko companion route through to the ending, then used a saved choice to check all four main ending branches. Played the Ash route through regrouping and Mallow's conversation and reached the first conversation on the Mira route; neither route was played to completion in this pass.
- Checked the free field-repair offer with a qualifying name and verified that the ordinary-name paid offer reported unavailable. Checked saving, restarting and resuming a checkpoint.
- Checked the reveal with one direct and one warm wording preference, including the resulting tied-preference response. Entered synthetic written messages and checked the authored fallback.
- Connected a local Mirid 1.5B model and exercised an initial character reply and a follow-up in the browser. One Mallow reply exposed a voice label; the handling was corrected and checked with a regression test and a deterministic browser fixture. Another Mallow reply began with narrated action before its dialogue; that form was addressed and covered by regression tests. A deterministic browser fixture using the observed example then displayed only “I'll go check the counter with you.” These fixtures do not establish that all generated responses will be handled correctly: model replies can still invent details or confuse roles.
- Reached the speech interface's “Playing speech” state; audible output from a physical speaker was not verified. No physical microphone capture was tested.
- Checked location headings for the arcade, sewing room, playroom and stairs, advanced a passage with Enter, inspected a 390 × 844 browser viewport and scrolled the settings panel at that size.
- After the initial load, stopped the loopback server, reloaded in the same browser and selected **Join the crew**. The cached opening passage rendered. This checks only the initial shell in that browser; it does not establish PWA installation or a complete offline playthrough.

These checks do not establish that every branch, choice or saved state works in a browser. The viewport check was not a test on a phone. An Android debug APK has been built and five native unit tests passed, but Android runtime behavior, the iOS build, native WebViews, device audio and microphone behavior, other browsers, PWA installation, and hosted providers still need testing. See [MODEL_EVALUATION.md](MODEL_EVALUATION.md) for local model observations and limitations.

## 4 November 2026: Android software emulator attempt

A follow-up used the same Android 15 x86_64 emulator without hardware acceleration and built an independent 9 KB Android Activity with a plain `WebView` loading literal local HTML and JavaScript, with no game, Capacitor or network code. After an approximately two-and-a-half-minute boot, the control installed and its activity appeared after about 36 seconds, but its WebView stayed blank; the renderer crashed with code 5 and Android showed a System UI not-responding dialog. The v80 game then installed and its Capacitor activity appeared after about 41 seconds, but gameplay did not appear. The independent control demonstrates that this unsupported software-emulation environment can fail without the game's code; it does not establish that the game works on an Android device.

An isolated Android 15 (API 35) AOSP x86_64 emulator was started on Linux without KVM using `ANDROID_I_WANT_MY_TCG=yes` and `-accel off -no-window -no-audio -no-snapshot -no-boot-anim -gpu swiftshader_indirect -no-metrics`. [Google describes software-only emulation as unsupported and very slow](https://developer.android.com/studio/run/emulator-commandline). After the emulator completed its first boot, the earlier v75 debug APK installed successfully; the later satire rewrite was not tested in this emulator. Android reported the app activity as displayed, and Capacitor logged a request for its local `https://localhost/` page.

This was not a successful gameplay test. The emulator showed a system UI not-responding dialog and several system processes reported ANRs; the app's Chromium WebView renderer crashed with code 5, followed by an app input-dispatch ANR. A second launch also produced a blank screen and a renderer crash. The cause is unresolved: the unsupported software-emulation environment is a possible factor, but an app or WebView problem has not been ruled out. No microphone permission was granted. Test again on a physical Android device or a properly accelerated emulator before claiming Android runtime compatibility.
