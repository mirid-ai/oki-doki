# Optional publisher voice

`src/publisher-voice.js` leaves `publisherVoice` set to `null` until the creator chooses a speaker, supplies a voice reference, and has a compatible speech service available. It contains no reference recording or active service by default. The other characters keep their Kokoro voice settings.

For a distributed build, the publisher can set one assignment in that module:

```js
export const publisherVoice = {
  speaker: 'Narrator', // Example only; choose the actual character or narrator later.
  engine: 'chatterbox_nano',
  voice: 'default',
  baseUrl: 'https://speech.example/game' // Replace with the actual service base URL.
};
```

The speaker must be a named member of the game's cast. Supported engine IDs are `chatterbox_nano`, `chatterbox`, and `chatterbox_turbo`. The voice ID must be `default` or a supported audio filename, as understood by the service. The base URL must use HTTPS, without a username, password, query or fragment. Only one assignment is supported. Invalid configuration is ignored.

The service must accept the Mirid-compatible `POST /tts` JSON contract used by the game and allow its browser or native-app origins. Point `default` at the creator's reference on the service; the standalone Nano service's `--reference` option does that for its own process. That service is loopback-only, and the optional companion is designed for a paired desktop and phone: neither is a public hosted service. An actual distributed release needs a separately deployed and tested service or another working integration for every target platform. The game does not bundle a reference recording or inference model.

Other speakers still need a multi-voice Kokoro service. To configure one shared public service for them, set the separate `publisherKokoro` value in the same module, for example:

```js
export const publisherKokoro = { baseUrl: 'https://speech.example/kokoro' };
```

It must accept the same `/tts` contract with the listed Kokoro voice IDs and allow the target web and native origins. The address must be credential-free HTTPS without a query or fragment. This sets the read-aloud endpoint only: speech recognition retains its own separate service configuration. It is optional and remains `null` until a real service is configured. A player can override it in speech settings for the current session. Clearing settings removes player overrides and restores the publisher default for the session.

The configuration is part of the public game source and packaged app. Do not put a secret key, pairing token, or private audio in it. Any provider credential must remain on the service side. Publishing a usable endpoint also requires hosting capacity and provider arrangements. Speech is still requested through the game's read-aloud controls.

When a valid publisher assignment is configured, the named speaker’s voice field is read-only in the ordinary player interface, and saving, changing provider presets, or clearing settings preserves that shared assignment. Other speakers’ voice fields remain editable when their selected provider supports it. The ordinary player interface does not expose reference upload or per-player Chatterbox assignment. The creator audition can temporarily override the assignment for that session; reloading restores the configured publisher assignment.

For a creator-only desktop audition before choosing the public assignment, open the local game with `?voice-creator=1`, for example `http://127.0.0.1:8766/?voice-creator=1`, and use **AI settings → Speech → Creator voice audition**. The chosen reference and speaker apply only to that session; this does not publish them or update the build configuration. The URL switch is a convenience, not a security boundary. Keep any upload service private.

For a private Android or iOS audition build only, set `creatorVoiceToolsForNative = true` in `src/publisher-voice.js`, run the mobile sync and rebuild, then use the creator controls inside that test app. Revert it to `false` before distributing a player build. This lets the creator test the paired companion service without putting its pairing token or a private recording into source. The normal build leaves it `false`; native audition, real-device behavior and the creator’s reference remain untested.
