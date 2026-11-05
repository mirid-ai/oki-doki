# Kokoro voice assets

The seven `.pt` files in `kokoro-voices/` are unmodified voice packs from [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M/tree/f3ff3571791e39611d31c381e3a41a3af07b4987/voices), revision `f3ff3571791e39611d31c381e3a41a3af07b4987`. The upstream model repository identifies its weights as Apache-2.0 licensed; the license text is in `KOKORO-VOICES-LICENSE.txt`. They are separate from the MIT-licensed game code. The service checks every voice pack and the existing model and config against pinned SHA-256 values before loading them.

These packs are not the Kokoro model itself. This project does not bundle the 327 MB model weights, the Kokoro inference package, phonemizer dependencies, or a speech server runtime; configure the service to use a separately installed, compatible local runtime and model. Kokoro's upstream repository describes those components and their licenses.
