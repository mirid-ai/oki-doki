# Optional desktop local AI

The standalone Windows and Linux packages each include `local-ai.js`, a model
and a matching platform runner. The desktop shell starts a local llama.cpp
server when the player chooses **AI settings → Set up included AI and
microphone** or **Start included desktop AI**. When the model reports ready,
the form is filled in; choose **Save for this session** to use it. An existing
API or Mirid choice remains in use until the player chooses otherwise. Loading
a model uses memory and its answers can invent details. The browser and mobile
versions do not run this desktop runtime.

Each standalone package keeps its `local-ai` directory alongside the game
executable. A separate, older unified handoff uses one shared `Oki-Doki/local-ai` directory, with
`models/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` and
`runners/<platform>/llama-server` (with `.exe` on Windows). The desktop archives
must be extracted within their matching `Oki-Doki/windows`, `linux` or `macos`
folder. `findSharedRuntime()` recognizes only those exact layouts, requires the
handoff and runtime markers, and rejects linked model and runner paths; it does
not search user files or PATH. The complete platform-specific supporting
libraries must be present alongside the executable. The model is 1,117,320,736 bytes;
the official [Qwen 1.5B Instruct GGUF](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/tree/91cad51170dc346986eccefdc2dd33a9da36ead9)
declares Apache-2.0. The expected SHA-256 is
`6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`.
[llama.cpp](https://github.com/ggml-org/llama.cpp/tree/b11852) is MIT licensed;
include its license and any additional dependency notices with its binaries.
The unified handoff's runtime supplies CPU-capable runners for Linux x64,
Windows x64, and macOS arm64 and x64. Standalone Linux and Windows packages
contain their own platform runner. Linux has been exercised on Ubuntu 24.04;
Windows has been exercised under Wine 11, not native Windows. Mac execution
has not been verified.

Synthetic tests on this Linux machine using the built shared Qwen runtime
produced AI replies through the production dialogue adapter. Resident memory of
the server was approximately 1.9 GiB in one run; actual memory, startup time
and performance vary with the machine and input. Responses included invented
details and, once, the character addressed itself by name. These few replies do
not establish quality or grounding. The game and the full integrated package
need independent playtesting; native Windows and macOS execution remain unverified.

The shell should resolve the shared directory with `findSharedRuntime(__dirname)`,
route only `/local-ai/` to this module, instantiate it with its exact loopback
origin and that directory, and call `close()` when the shell exits. If the
directory is not found, it must leave local AI unavailable rather than search
for a model elsewhere. The UI can check `GET /local-ai/status`, then, after an explicit
player action, POST `{}` to `/local-ai/start` with the game origin and JSON
content type. Once the request succeeds, set the text endpoint to the same
origin's `/local-ai/v1/chat/completions` and model to the returned name. Do not
overwrite an existing provider choice automatically. Sending a chat before
successful startup returns an error; it does not implicitly load a model.

The runner binds to a randomly chosen loopback port, receives a freshly
generated API key through its environment, and has its Web UI disabled. The
desktop proxy accepts POSTs only from the exact game origin, checks the Host
header, limits request and response sizes, disables streaming, handles one
generation at a time, and forwards only the chat endpoint. These controls are
intended to prevent unrelated websites from using the server through a browser;
they are not a boundary against other processes running as the same user. The
runner is requested to stop when the desktop shell closes normally. A crash or
forced termination of the shell may leave its child process running; there is
no demonstrated cross-platform guarantee of cleanup in that case. The local model can still
hallucinate or narrate incorrectly, and availability of the optional runtime
must not be represented as proof of cross-platform compatibility.
