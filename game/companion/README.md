# Optional desktop companion

This experimental, manually launched HTTPS gateway lets the phone game use a compatible Mirid instance on the same desktop. It does not start Mirid, change Mirid settings, or expose Mirid's administration endpoints. An optional, disabled-by-default route can obtain a short-lived OpenAI Realtime client secret; that route uses a hosted provider and is separate from Mirid. The gateway has not yet been verified end-to-end on Android or iOS; test certificate trust, WebView origins and network permissions on the target devices before deployment.

## Requirements

- Node.js 24 or newer. No npm packages are required.
- A running Mirid backend bound to `127.0.0.1`, with its text model and desired transcription engine available. For distinct voices, start the separate multi-voice Kokoro service described below. Mirid's experimental fixed-voice Kokoro is also supported as a fallback.
- A certificate and private key for a hostname or address reachable from the phone, with a certificate chain the phone trusts. The gateway does not bypass certificate validation. Arrange this separately for the device and network you control; a self-signed certificate is not automatically trusted. Android apps targeting current versions do not automatically trust user-installed CAs; for an explicitly opted-in local debug build, see the [Android debug CA setup](../mobile/README.md#connections-and-microphone).
- A random, high-entropy pairing token of at least 32 printable non-space characters. Treat it as a password. Anyone holding it and able to reach the gateway can use the exposed model and voice services. Generate it on the desktop using a cryptographically secure tool; do not put it in source files, a URL, logs or chat. Rotate it by stopping the gateway and starting it with a new token.

## Start explicitly

In a private terminal session, set environment variables before starting. The first command reads the secret without echoing it or recording the secret itself in shell history; certificate paths below are placeholders. `COMPANION_ORIGINS` is a comma-separated exact allowlist of the game's deployed origins, for example `https://localhost,capacitor://localhost` for the wrapper's expected Android/iOS origins. Origins observed on a real device may differ and must be verified; `null`, wildcards, unencrypted HTTP origins and arbitrary origins are refused.

```sh
read -r -s -p 'Pairing token: ' COMPANION_TOKEN; printf '\n'; export COMPANION_TOKEN
export COMPANION_TLS_CERT='/absolute/path/to/trusted-certificate.pem'
export COMPANION_TLS_KEY='/absolute/path/to/private-key.pem'
export COMPANION_ORIGINS='https://localhost,capacitor://localhost'
export MIRID_PORT=8000
node gateway.mjs
```

On Windows, use PowerShell from the `companion` directory. The certificate paths are examples; use your own trusted certificate and key:

```powershell
$okieSecret = Read-Host 'Pairing token' -AsSecureString
$okiePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($okieSecret)
try { $env:COMPANION_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($okiePointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($okiePointer) }
$env:COMPANION_TLS_CERT = 'C:\path\to\trusted-certificate.pem'
$env:COMPANION_TLS_KEY = 'C:\path\to\private-key.pem'
$env:COMPANION_ORIGINS = 'https://localhost,capacitor://localhost'
$env:MIRID_PORT = '8000'
try { node .\gateway.mjs }
finally { Remove-Item Env:COMPANION_TOKEN -ErrorAction SilentlyContinue }
```

To bind to a phone-accessible interface, set `$env:COMPANION_BIND` before running the gateway, as described below. The token is held in the gateway environment while it runs. These Windows instructions have not been tested on Windows.

The default bind is `127.0.0.1:9443`, reachable only on the desktop. To make it reachable from a phone on a network you control, **explicitly** set `COMPANION_BIND` to the desktop's appropriate network interface address before launching; `COMPANION_PORT` changes the port. Allow only trusted clients through the host firewall. Stop the gateway with Ctrl+C. There is no installation, autostart, LAN setting change or generated certificate. Avoid setting `COMPANION_BIND` to a public interface unless you have deliberately designed and secured that deployment.

## Phone setup

1. Install or open the game on the phone, then enter the gateway's trusted HTTPS address and port. Confirm the certificate and network permissions work for that device.
2. In **AI settings**, open **Connect a phone to desktop Mirid**, enter the gateway HTTPS address and pairing token, then select **Use companion**. The preset fills both text and speech endpoints without sending a request. Select the loaded Mirid model identifier and save the settings for this session.
3. Alternatively, set the chat completions URL to `https://YOUR-GATEWAY:9443/v1/chat/completions`, speech mode to **OpenAI-compatible**, speech base URL to `https://YOUR-GATEWAY:9443`, and enter the pairing token in both API key fields. The gateway uses its configured local transcription engine. When the separate multi-voice Kokoro service is detected, it uses the selected voice names; otherwise it uses the fixed local Kokoro voice.
4. The phone retains the token in memory only for the current game session. Save checkpoints contain story data and do not contain the token. Re-enter it after closing or reloading the game.

The gateway exposes only these exact operations, authenticated by `Authorization: Bearer <token>`. A loopback connection to Mirid does not by itself guarantee local inference: Mirid can route a selected model ID to a configured hosted provider. Select a local model in Mirid when local processing is required.

| Phone request | Gateway behavior |
| --- | --- |
| `POST /v1/chat/completions` | Sends bounded, non-streaming JSON to loopback Mirid `/v1/chat/completions`. |
| `POST /v1/audio/transcriptions` | Sends bounded multipart input to loopback `/transcribe` with the configured engine, and returns `{ "text": "…" }`. |
| `POST /v1/audio/speech` | Uses the separate local Kokoro service when detected or explicitly configured, routing one of seven voice IDs. Otherwise it uses Mirid’s experimental fixed `af_heart` voice. |
| `POST /tts` | Disabled by default. When explicitly configured, sends speech to the local Chatterbox Nano service using its configured `default` reference. |
| `POST /v1/realtime/client-secret` | Disabled by default. If explicitly configured, obtains a short-lived Realtime client secret from the fixed OpenAI API endpoint. |

## Optional distinct character voices and one Chatterbox voice

Start the separate desktop Kokoro service and, if wanted, the Nano service with a local default reference, as described in [the voice-service guide](../voice-service/README.md). The local game launcher normally starts Kokoro on port 8770 when its assets are installed. Start that service before the companion: at startup, the companion checks its loopback identity endpoint and automatically selects it when available. If the check fails or the service is still starting, the companion uses Mirid’s fixed voice and prints instructions; restart the companion once Kokoro is ready. The check does not guarantee continued availability.

For another port, set `COMPANION_KOKORO_PORT` to the actual port before starting the companion. This explicit setting bypasses detection and requires the service to be running. Set it to `fixed` to choose Mirid’s fixed voice deliberately. For Nano, set `COMPANION_CHATTERBOX_PORT=8001` to its actual local port; without it the Nano route is unavailable. The gateway only connects to loopback. Restart the companion after changing either setting.

For example, in a Unix shell use `export COMPANION_KOKORO_PORT=8770` and `export COMPANION_CHATTERBOX_PORT=8001` before `node gateway.mjs` to explicitly configure both. In PowerShell use `$env:COMPANION_KOKORO_PORT = '8770'` and `$env:COMPANION_CHATTERBOX_PORT = '8001'` before starting the gateway.

Use the phone companion preset as above. Its seven default voice IDs are retained, and the multi-voice service uses the selected ID for each speaker. For a creator-only native audition, make a private test build with `creatorVoiceToolsForNative = true` as described in [publisher voice setup](../voice-service/PUBLISHER-VOICE.md). Then open **AI settings → Speech → Creator voice audition**, choose a speaker and **Chatterbox Nano**, enter the trusted companion HTTPS address and pairing token, enter `default` as the existing reference ID, select **Use this saved voice**, and save the session. This is an audition, not a shared publisher assignment; revert the flag before distributing the app. The gateway permits only the Nano service’s configured default reference and does not expose the upload route. Keep the independently supplied reference on the desktop and configure the Nano service there. Chatterbox Faster/Turbo and audio-file upload from the phone are not provided by this gateway.

The new routes have been exercised over verified loopback TLS with a synthetic iOS origin and both actual local voice services: two different Kokoro IDs and Nano using a synthetic reference each returned WAV audio. A real phone, its origin, certificate trust and physical playback still need testing. The separate voice services remain desktop processes and do not run inside the phone app.

`MIRID_STT_ENGINE` is not currently a runtime setting; the gateway uses `parakeet-cpp:tdt_ctc-110m:q4_k`. Its constructor accepts a different fixed engine for future integration. Audio uploads are limited to 4 MiB including multipart framing, JSON requests and responses to 128 KiB, speech output to 20 MiB, and concurrent authenticated requests to two. Requests time out, cancellation is propagated, redirects are refused, and upstream errors are not relayed verbatim. There is no arbitrary URL or path proxy and the phone's pairing token is not forwarded upstream.

## Optional OpenAI Realtime token service

To enable the separate hosted route, set `COMPANION_OPENAI_API_KEY` in the gateway process environment before starting it. Keep the key private; for example, enter it in a private terminal using `read -r -s`, then export it. With the variable absent or empty, the route returns 404 and makes no OpenAI request. A caller must still present the pairing token and an allowed origin. Callers send an empty JSON object to the route; no client-supplied URL, model or session settings are accepted. The gateway requests a 60-second client secret for `gpt-realtime-2.1-mini` from `https://api.openai.com/v1/realtime/client_secrets` and returns only its `value` and `expires_at` with `Cache-Control: no-store`. It never sends the provider key to the phone.

On Windows, enter the optional OpenAI key in the same PowerShell session **before** the `node .\gateway.mjs` command above:

```powershell
$okieApiSecret = Read-Host 'OpenAI API key' -AsSecureString
$okieApiPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($okieApiSecret)
try { $env:COMPANION_OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($okieApiPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($okieApiPointer) }
```

Remove it from the shell environment after stopping the gateway with `Remove-Item Env:COMPANION_OPENAI_API_KEY`.

Issuance attempts are limited globally to six per rolling minute, including failed and cancelled attempts. Set `COMPANION_REALTIME_MINT_LIMIT` to an integer from 1 to 60 to change that limit. The counter is in memory and resets when the gateway restarts. The game reuses a secret in memory for the same companion and pairing token across character segments, passages, and speaker previews, using the returned expiry with a five-second margin. Selecting another speaker stops the current preview and cancels any pending request, but preserves an already-issued secret; editing speech settings, closing the dialog, explicitly stopping a preview, or a synthesis failure discards it. The game never persists it. Per the [OpenAI client-secret reference](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create), a secret may create multiple sessions before expiration, an established session can continue beyond expiry, and a client can override session configuration. The issuance limit does not bound the duration or cost of sessions created with a secret. Anyone with the pairing token and network access can request secrets and potentially incur hosted-provider charges; enable the route only for trusted clients. Keep the token and short-lived secrets out of logs and shared files. The route and subsequent provider connection have not been verified with a real OpenAI account, browser or mobile device.

The origin check helps restrict browser use but is not a substitute for the token or TLS: native clients can construct arbitrary Origin headers. A phone WebView must send an allowed Origin for this gateway; it refuses `null` or missing origins. The gateway has not been reviewed as a general Internet-facing service and the development tests do not establish production security.

## Tests

```sh
node --test test.mjs voice-gateway.test.mjs
```

The main gateway tests use fake requests and mocked Mirid calls. The voice integration test additionally opens loopback sockets and uses a temporary certificate with synthetic services, but does not test a real phone, actual model inference or speech playback.

For this workspace, an optional live integration smoke test exercises the gateway over loopback TLS against a disposable Mirid backend with the existing local Qwen, Parakeet and Kokoro assets. Run from the workspace root with a Python environment containing Mirid's backend dependencies and Node 24+:

```sh
Mirid-Installed-Test/venv/bin/python game/tests/mirid-live-smoke.py --gateway --node /absolute/path/to/node
```

It also requires `openssl` and the synthetic WAV fixture referenced by the script. The test creates an ephemeral certificate and private key in a temporary directory; its client trusts that specific certificate without disabling TLS verification. It exercises the game text and speech adapters through the gateway, injecting synthetic Android and iOS origin headers for protocol checks. It uses an ephemeral pairing token, isolated configuration and data, and stops the gateway and backend afterward. Injected headers do not establish what a real WebView sends. The test does not exercise a real phone, browser WebView, physical microphone or speaker, or hosted provider.
