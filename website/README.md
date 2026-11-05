# Oki Doki website draft

This is a **local, unpublished** draft for the creator's domain odlc.io. It is a standalone static site; building it does not register, publish or change DNS for a domain. Its design and written source are `index.html` and `site.css` in this directory. It uses the existing artwork from the sibling `game/assets` directory.

If you downloaded the two source archives, extract them into the same parent directory. The game archive extracts as `oki-doki/`: rename that directory to `game/` so it sits beside `website/`. The resulting layout is `game/` and `website/` in one parent directory. The game archive does not include installed dependencies or build outputs.

From the workspace root, run:

```sh
python3 website/build.py
python3 website/preview.py
```

Open http://127.0.0.1:8890/ to preview. Use `python3 website/preview.py --port 8891` for a different port and stop it with Ctrl+C. The preview server exposes only the two known desktop archives and the complete source archive in `game/dist` at exact download paths; if an archive is absent, its link remains unavailable. It streams from those files without copying them into the site. The play button opens the staged game at `/play/`; it uses the same browser storage behavior as the game on that origin. In the browser, optional generated dialogue requires a separately configured AI service. The game includes recorded voices and local Kokoro speech; see the game README. The site does not provide a hosted dialogue model or speech service.

For a public release, upload each desktop ZIP and the complete source ZIP to the chosen download host, then replace the matching `null` in `desktop-releases.json` with its full HTTPS URL and rebuild. A missing or invalid desktop URL leaves that button unavailable; if the complete-source URL is missing, the page links to the game-only source archive instead. No public destination is guessed. The site build validates the configuration. The desktop ZIPs are around 1.5 GB each, and the existing browser game also contains files too large for some static hosts; confirm the hosting limits or use separate suitable asset storage before deployment. Building or previewing never publishes files or changes odlc.io DNS.

To rebuild the complete source download from the project root, run `python3 release/package_complete_source.py`. It builds a fresh game source archive together with the desktop and website source, includes the static Windows runner notices, and replaces the output only after validation. The builder is included in the complete source download; its `START-HERE.txt` describes how to reconstruct the expected folder layout.

`build.py` reads the sibling game's packaging manifests and stages its current web files in `dist/play/`, so rebuild after changes to the game. It also builds `dist/oki-doki-source.zip` from the game source and `dist/website-source.zip` from this site's source files and MIT license. The site links to both archives. Game source is governed by the sibling `game/LICENSE`; the site is part of the same project and is released under the same MIT terms to the extent contributors hold rights; its license is included as `LICENSE`. Artwork remains in the game source and follows its provenance and license notes.

To avoid overwriting unrelated work, the build will refuse to replace an existing `dist` unless it contains the `.oki-site-generated` marker. It completes the new directory before swapping it in. No production hosting or odlc.io DNS configuration has been performed. Browser and device compatibility are not established merely by creating this draft.
