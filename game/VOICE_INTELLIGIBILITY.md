# Local speech intelligibility check

On 4 November 2026, the game’s local Kokoro and Chatterbox Nano services synthesized four short passages and one longer original story passage. The Nano service used a repeated synthetic Flite recording as its reference, not a person’s voice. The resulting WAVs were converted locally to 16 kHz mono and transcribed by the existing local Parakeet.cpp 110M Q4_K model. The probe compared lowercase words, ignoring punctuation; the exact passages are in `tests/voice-intelligibility-smoke.py`.

| Case | Voice | Word errors / reference words | Audio length | Synthesis time after load |
| --- | --- | ---: | ---: | ---: |
| Niko, short | Kokoro `am_adam` | 1 / 15 | 6.60 s | 2.67 s |
| Mira, short | Kokoro `af_bella` | 0 / 12 | 5.33 s | 2.13 s |
| Ash, short | Kokoro `bm_george` | 0 / 18 | 5.92 s | 2.41 s |
| Narrator, short | Nano `default` | 0 / 16 | 4.76 s | 5.11 s |
| Narrator, long | Nano `default` | 4 / 94 | 30.92 s | 28.04 s |

The short Niko transcription spelled the name “Nico”; the long narration included “mirror” for “Mira’s,” “child’s high” for “child-height,” and “Nico” for “Niko.” A previous short Nano run transcribed “slips” as “slicks,” whereas the later run above got it right. These are ASR outputs: the recognizer itself can make errors, and generated audio can vary between runs. The check does not establish human intelligibility, expression, speaker quality, fidelity to the user’s future reference, physical playback or phone behavior. The longer Nano passage also shows that a player may wait around half a minute on this machine before hearing it; initial model loading adds more time.

To repeat on this Linux workspace, start the two local services in separate terminals from the game directory, using only the synthetic test recording. These commands rely on the local runtime and model assets described in `voice-service/README.md`; they do not start Mirid or use a hosted speech API:

```sh
ffmpeg -v error -stream_loop -1 -i ../evidence/linux-parakeet-cpu-1.0.18/synthetic-flite-16k.wav -t 12 -ar 24000 -ac 1 /tmp/oki-synthetic-reference.wav
../Mirid-Local-Assets/speech/kokoro/venv/bin/python voice-service/kokoro_service.py --model-dir "$PWD/../Mirid-Local-Assets/speech/kokoro/model" --origin http://127.0.0.1:8766 --port 19410
```

In a second terminal:

```sh
HF_HOME='../Mirid-Local-Assets/speech/chatterbox-nano/cache' HF_HUB_OFFLINE=1 ../Mirid-Local-Assets/speech/chatterbox-nano/venv/bin/python voice-service/chatterbox_nano.py --port 19411 --origin http://127.0.0.1:8766 --reference /tmp/oki-synthetic-reference.wav
```

In a third terminal:

```sh
python3 tests/voice-intelligibility-smoke.py --long
```

The probe accepts loopback service URLs only, writes generated audio to an automatically removed temporary directory, and uses the local Parakeet runner and `ffmpeg`. Shut down both services with Ctrl+C and remove the synthetic reference after the test. Never point this synthetic-reference probe at a service using the user’s real voice.

To test the game's segmented Nano narration, add `--segmented --long`. This uses the actual browser splitter, verifies that its pieces rejoin to the fixture, requests the pieces in order, and concatenates the returned WAVs before the local transcription. Pass `--node /path/to/node` if Node is not on PATH. It reports each part's synthesis time and duration; it does not capture browser playback or measure gaps between parts.

One warm run with a synthetic reference split the 94-word passage into four parts. Their synthesis/audio times in seconds were 8.41/8.68, 7.32/8.00, 5.48/5.76 and 5.59/5.92. Parakeet reported five word errors, including “mirror a” for “Mira’s” and “Nico” for “Niko.” A separate validation run of the repeatable probe reported four errors. These results do not establish actual audible playback order, gap length or listener comprehension: the concatenation is an offline proxy and both synthesis and ASR can vary across runs.

## Seven-voice output check

On 4 November 2026, the local Kokoro engine synthesized the same sentence, “The rain sounds different inside the fort tonight,” once with each of the seven configured voice IDs. The decoded PCM output differed for all seven; durations ranged from 3.10 to 4.90 seconds. This confirms the installed model and packs produced different signals in this run, not that they sound sufficiently distinct to a listener or work on a phone. The experiment did not use a personal voice reference.

## CPU thread comparison

On the same Linux workstation (Ryzen 9 5950X, 16 cores/32 logical threads), the local Nano model was warmed with the synthetic Flite reference. For the 16-word short narrator fixture above, a fixed seed produced 4.92 seconds of audio in two ordered passes (1, 2, 4, 8, 8, 4, 2, 1 threads). The wall times were 8.97/8.63 seconds at one thread, 5.95/5.77 at two, 4.75/4.46 at four, and 3.85/3.71 at eight. All outputs had the same recorded duration and peak amplitude; no listening or transcription comparison was performed for this thread sweep.

The 94-word passage above was split using the service's existing sentence/word policy into four pieces. With the same synthetic reference and seed, the 4, 8, 8, 4 thread runs took 27.54, 23.27, 22.61 and 27.15 seconds respectively, producing 29.44 seconds of audio before the service's inter-segment gaps. Process CPU time was 107.96/107.47 seconds at four threads and 178.24/177.64 seconds at eight. On this machine the eight-thread runs were about 16% faster but used about 65% more total CPU time. This is a small fixed-seed experiment, not a benchmark across hardware or a test of the user's reference or voice quality. The service retains its four-thread default; `--threads 8` remains an explicit option on a sufficiently capable machine.

## Mixed-speaker timing exploration

On 4 November 2026, the authored four-part `disclosure_public_distortion` passage was synthesized using the local Chatterbox Nano service for narration and Kokoro `af_sarah` for the player voice. Nano used a synthetic Flite reference, not the creator's recording. The loopback-only `tests/voice-mixed-latency-smoke.py` probe warms both services, then estimates playback using WAV durations; it does not play audio in a browser. In the ordered 1, 2, 2, 1 lookahead runs, the estimated waits before the third part were 2.40, 0.78, 1.02 and 2.46 seconds respectively. Generating two future parts improved this small local timing sample but can produce an extra unused request. The game defaults to one-part prefetch and offers a two-part option in speech settings. A loopback URL alone does not prove a service is free or cannot forward to a paid provider. These results are not a measure of human-perceived gaps, a mobile-device test, or a guarantee for other hardware.

A separate browser test exercised the production playback controller with the same passage and local services, again using only the synthetic reference. With the optional two-part preparation enabled, two future requests started together, the browser reported four successive plays in order and completion after 14.20 seconds. On a second run, stopping while a Nano request was in flight produced a browser `AbortError` and no later playback. This single run does not establish human-perceived quality or compare browser timings between modes, and an aborted request does not guarantee the service stops inference.

To reproduce, use the synthetic reference and start the two local services described above with ports `19540` for Kokoro and `19541` for Nano, and the same configured origin. Then run:

```sh
python3 tests/voice-mixed-latency-smoke.py --node /path/to/node
```

The probe sends actual synthesis requests to those configured loopback services. Use only the synthetic Nano reference for this test, and stop both services afterward.
