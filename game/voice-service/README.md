# Local Chatterbox Nano speech

## One-command local launch

From the `game` directory, run `python3 tools/play_local.py`. This opens a local game server and starts the existing Kokoro installation when its environment and model are present. The command prints the game and speech URLs; open the game URL in your browser. In AI settings, select **Use local launcher settings**, then **Save for this session**, to use the local Kokoro voices. If Mirid was not started by the launcher, existing text and transcription settings are left as they are. It checks for an existing Mirid backend without changing it. Press Ctrl+C to stop only services this command started.

Launcher-managed Kokoro and Nano accept the game's `127.0.0.1` and `localhost` addresses at the selected game port. Browsers keep saved games separately for those two addresses. When started directly, each voice service still accepts only its configured exact origin unless `--allow-loopback-alias` is explicitly supplied; that option permits only the other loopback name at the same scheme and port.

On the prepared Linux workspace, `python3 tools/play_local.py --with-mirid` also starts a separate temporary Mirid profile using an existing local Qwen text model. When the Parakeet runner and model are present, it also enables transcription; missing or incomplete Parakeet assets do not prevent text use. In the game's AI settings, select **Use local launcher settings**, then **Save for this session**. This fills in the local text model, available transcription service and, when available, the separate multi-voice Kokoro service. If Parakeet is unavailable, the preset preserves the existing transcription configuration rather than selecting a non-working local service. The temporary Mirid profile is removed when the launcher stops; it does not use your existing Mirid profile. The launcher also prints the addresses for manual setup.

To try the workspace’s larger existing local text model, use:

```sh
python3 tools/play_local.py --with-mirid --model Qwen2.5-7B-Instruct-Q4_K_M.gguf --port 8899
```

Choose **Use local launcher settings** and save. The model must already be present in `Mirid-Local-Assets/text-models`; the launcher does not download it. In a small synthetic CPU comparison on this workstation, requests ranged from 3.63 to 17.67 seconds for the 7B model versus 0.42 to 5.81 seconds for 1.5B, including initial model loading. These timings are illustrative, vary with load and hardware, and do not guarantee readiness or accuracy. The larger model also invented scene details in that test; see [the model evaluation](../MODEL_EVALUATION.md).

Use `--nano` when Chatterbox Nano is already installed and you want its local service started. It starts without a voice reference: the creator can audition an independently recorded file later for one character or narrator using the local creator URL described below. Other characters can use separate Kokoro voices. No personal audio is packaged or recorded by the launcher.

Nothing is downloaded by the launcher. Missing optional assets are reported rather than installed. The temporary Mirid profile is Linux-specific; on other systems you can use a separately installed Mirid service. Use `--no-kokoro` to skip Kokoro, `--port 8899` to choose another game port if 8766 is occupied, or `--help` for all service ports and asset paths. It binds its services to `127.0.0.1` and will not stop an existing process if a port is occupied. Python 3.10 or newer is required.

If an optional service stops unexpectedly, the launcher reports it and keeps the game and remaining services running. It removes the stopped service from subsequently applied launcher settings. Settings already saved in an open game session are not changed automatically: reopen AI settings to remove or replace the stopped service's address. The written story remains playable without speech or a model. If the game server itself stops, the launcher stops its services and exits.

If the launcher supplies text and transcription but no Kokoro service, applying its settings keeps the existing read-aloud endpoint and protocol, including an inherited speech endpoint or publisher voice defaults. The launcher does not start a read-aloud engine in this case; configure and start a compatible service before using read-aloud. The isolated Mirid profile does not enable its experimental fixed voice.


This optional service provides Chatterbox Nano speech to Oki Doki over the Mirid-compatible `/tts` and `/tts/upload-voice` routes. It runs separately from Mirid and binds to `127.0.0.1` only. It does not run automatically or include a reference recording or model weights. The desktop game and service must run on the same computer; this is not a native phone runtime or a phone-accessible gateway.

The voice reference can be supplied with `--reference /path/to/recording.wav` and selected with the voice ID `default`, or uploaded to `/tts/upload-voice` for a session-only voice ID. The service keeps temporary copies only while it runs and accepts up to eight uploads per session; restart it to clear them. Use a clear single-speaker recording longer than five seconds and no more than 30 seconds; the upstream example uses approximately ten seconds. WAV is a convenient format. The upload limit is 12 MiB. Supported formats depend on the installed libsndfile; an optional local `ffmpeg` can convert phone-recorded M4A, AAC, audio-only MP4, 3GP, Ogg/Opus and WebM as well as WAV, MP3 and FLAC. Other speech services may accept different formats. The converter uses a private temporary input file when a format needs seeking, deletes it when conversion finishes, and keeps the converted reference under the existing session-only policy. A canceled upload may finish converting before its temporary input is removed. Chatterbox Nano is English-language TTS.

## Setup for Linux CPU

In this workspace, the tested Nano environment and model cache are already preserved under `../Mirid-Local-Assets/speech/chatterbox-nano/`. They are specific to this Linux machine and are not part of the source archive. From the game directory, after supplying a reference path, they can be used without another model download:

```sh
HF_HOME='../Mirid-Local-Assets/speech/chatterbox-nano/cache' HF_HUB_OFFLINE=1 \
  '../Mirid-Local-Assets/speech/chatterbox-nano/venv/bin/python' \
  voice-service/chatterbox_nano.py --port 8001 --origin http://127.0.0.1:8766 --reference /path/to/recording.wav
```

Invoke that environment's Python directly; its activation scripts retain their original temporary paths. On another machine, use the setup below.

This is a separate optional environment; do not install into an existing Mirid environment. The following were used for the developer smoke test on Linux x86-64 with Python 3.12. A Python installation with `venv` and `pip` is needed, and the official CPU PyTorch wheels and dependencies are downloaded. The first model load downloads weights from Hugging Face; subsequent offline use needs those cached files. Keep the user-provided recording outside the source archive unless its owner specifically chooses otherwise.

```sh
mkdir -p ~/.local/share/oki-doki-nano
python3 -m venv --without-pip ~/.local/share/oki-doki-nano/venv
python3 -m pip --python ~/.local/share/oki-doki-nano/venv/bin/python install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
git clone https://github.com/resemble-ai/chatterbox.git ~/.local/share/oki-doki-nano/chatterbox-upstream
git -C ~/.local/share/oki-doki-nano/chatterbox-upstream checkout 5de7a54aa4e5e2baadb0182dde554908b48b85c2
python3 -m pip --python ~/.local/share/oki-doki-nano/venv/bin/python install --no-deps ~/.local/share/oki-doki-nano/chatterbox-upstream
python3 -m pip --python ~/.local/share/oki-doki-nano/venv/bin/python install numpy==1.26.4 librosa==0.11.0 s3tokenizer==0.3.0 transformers==5.2.0 diffusers==0.29.0 conformer==0.3.2 safetensors==0.5.3 spacy-pkuseg==1.0.2 pykakasi==2.3.0 pyloudnorm==0.2.0 omegaconf==2.4.0 'resemble-perth @ git+https://github.com/resemble-ai/Perth.git@ff1c8ac55a976971245cdd53c18d6131ca00d993' huggingface-hub==1.33.0 fastapi==0.162.0 uvicorn==0.54.0 python-multipart==0.0.33 soundfile==0.14.0
```

The service requests Nano checkpoint revision `71ccd1d0081b430592cea481f4307e764e07bc64`, the revision used in the local test. The pinned direct dependencies and upstream revisions are an integration target, not a complete lockfile or a guarantee that every machine will work. The upstream Chatterbox source and Nano checkpoint state MIT licensing; PyTorch, model dependencies, and the Perth package have their own licences. Refer to the upstream projects for their current terms: [Chatterbox](https://github.com/resemble-ai/chatterbox), [Nano model card](https://huggingface.co/ResembleAI/chatterbox-nano), and [Perth](https://github.com/resemble-ai/Perth).

From the game's directory, start it explicitly:

```sh
~/.local/share/oki-doki-nano/venv/bin/python voice-service/chatterbox_nano.py --port 8001 --origin http://127.0.0.1:8766 --reference /path/to/recording.wav
```

Use the exact origin of the running desktop game as `--origin`. To audition locally, open `http://127.0.0.1:8766/?voice-creator=1` (use your actual game port). In **AI settings → Speech → Creator voice audition**, select Nano and the intended speaker, enter `http://127.0.0.1:8001` as the Chatterbox service URL and `default` as the existing reference ID, then choose **Use this saved voice** and save the settings. This changes only the current local session; it does not configure the shared voice for other players. See [publisher voice setup](PUBLISHER-VOICE.md) when ready to prepare a shared build. The regular Kokoro service remains separately configured for other speakers. Stop this service with Ctrl+C. Uploaded voices must be provided again after it stops; the configured default is re-read from its local file on the next start.

## Separate local Kokoro voices

`kokoro_service.py` is an optional, loopback-only `/tts` service that uses an existing local Kokoro model and the seven voice packs provided in `kokoro-voices/`. It does not modify Mirid or install packages. It is TTS only: keep the game's existing speech service URL configured for transcription and set the separate **Read-aloud service URL** to the Kokoro service. It runs only when started explicitly and its allowed browser origin must exactly match the desktop game. It has not been tested on a phone.

The current Linux workstation has a compatible separate Kokoro Python environment and model under `Mirid-Local-Assets/speech/kokoro`. From the workspace root, start the service with the exact origin where the game is served:

```sh
Mirid-Local-Assets/speech/kokoro/venv/bin/python game/voice-service/kokoro_service.py \
  --model-dir "$PWD/Mirid-Local-Assets/speech/kokoro/model" \
  --origin http://127.0.0.1:8766 --port 8770
```

In the game's **AI settings**, select Mirid desktop as the speech mode and enter `http://127.0.0.1:8770` as the read-aloud service URL. The default per-character voices are supported by this service; the optional Chatterbox voice can be assigned separately. Set the original speech service URL to the running Mirid backend if voice input is wanted. Stop the local Kokoro service with Ctrl+C. It does not start or load Mirid automatically.

Kokoro's model and config must match the checksums pinned in the service, and the runtime must have Kokoro, its CPU PyTorch and phonemizer dependencies, and the English spaCy model already installed. The service uses a different English phonemizer pipeline for American and British voices, holds the model in memory while running, and serializes synthesis on CPU. It creates a temporary short path for the installed eSpeak data; if filesystem symlinks are unavailable, it copies the data into that temporary directory and removes it at shutdown. This fallback has been exercised on Linux, not on Windows. Cancelling playback in the game does not interrupt an inference already running in this server, so a subsequent request may wait for it. See [KOKORO-VOICES.md](KOKORO-VOICES.md) for the bundled voice provenance and license. It is an experimental local desktop service, not an Android or iOS inference engine or a remotely accessible endpoint.

On this workstation, all seven shipped voice IDs generated non-silent 24 kHz mono WAV files from the same synthetic sentence, with different file hashes and durations between 4.03 and 6.08 seconds. This confirms distinct synthesis outputs through both language pipelines; it is not an assessment of voice quality or physical playback. Run the offline HTTP and asset checks with `python3 -m unittest discover -s voice-service -p 'test_kokoro_service.py' -v` from the game directory.


## Developer smoke test

On the current Linux workstation, the official Nano model generated a 3.16-second 24 kHz WAV directly from a repeated synthetic Flite reference. The service then returned two real WAV responses from the same synthetic default reference: 2.84 seconds of audio in 4.1 seconds, and 3.16 seconds in 3.4 seconds, on CPU with four threads after loading. A later check of the pinned checkpoint generated both a default-reference and uploaded-reference WAV. An interrupted client request was followed successfully by another. These figures are a small local smoke test, not a benchmark or assessment of voice fidelity. The user's reference was not used. Physical speakers and mobile devices were not tested.

From the game's directory, run the mocked service contract checks with the separate environment: `~/.local/share/oki-doki-nano/venv/bin/python voice-service/test_chatterbox_nano.py`. They exercise request validation, temporary reference cleanup and multiple voice selections without downloading or running a model; the M4A test is skipped if ffmpeg is unavailable.
