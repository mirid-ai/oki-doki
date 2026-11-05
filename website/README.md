# Oki Doki website draft

This directory contains the source for the standalone Oki Doki site. A copy is deployed through GitHub Pages and the creator's domain odlc.io has been configured to point to it. At the last check HTTP served the site, but its HTTPS certificate was still pending; verify secure access before advertising browser play. Building locally does not publish changes or alter DNS. The design and written source are `index.html` and `site.css`; the artwork comes from the sibling `game/assets` directory.

Use a checkout with `game/` and `website/` in the same parent directory. If you downloaded the complete source archive, follow its `START-HERE.txt` to extract and rename its nested game archive into that layout. The game source archive does not include installed dependencies or build outputs.

From the workspace root, run:

```sh
python3 website/build.py
python3 website/preview.py
```

Open http://127.0.0.1:8890/ to preview. Use `python3 website/preview.py --port 8891` for a different port and stop it with Ctrl+C. The preview server exposes only the two known desktop archives and the complete source archive in `game/dist` at exact download paths; if an archive is absent, its link remains unavailable. It streams from those files without copying them into the site. The play button opens the staged game at `/play/`; it uses the same browser storage behavior as the game on that origin. In the browser, optional generated dialogue requires a separately configured AI service. The game includes recorded voices and local Kokoro speech; see the game README. The site does not provide a hosted dialogue model or speech service.

The configured download URLs point to the public [`v0.1.0-preview` release](https://github.com/mirid-ai/oki-doki/releases/tag/v0.1.0-preview), which contains the Windows, Linux and complete-source ZIPs. A missing or invalid desktop URL leaves that button unavailable; if the complete-source URL is missing, the page links to the browsable game source instead. The site build validates URL format, not remote availability. The desktop ZIPs are around 1.5 GB each, and the browser game also contains files too large for some static hosts; confirm hosting limits or use separate suitable asset storage when changing hosts.

To rebuild the complete source download from the project root, run `python3 release/package_complete_source.py`. It builds a fresh game source archive together with the desktop and website source, includes the static Windows runner notices, and replaces the output only after validation. The builder is included in the complete source download; its `START-HERE.txt` describes how to reconstruct the expected folder layout.

`build.py` reads the sibling game's packaging manifests and stages its current web files in `dist/play/`, so rebuild after changes to the game. It also builds `dist/website-source.zip` from this site's source files and MIT license. The site links to the browsable game source and the configured complete-source release archive. It omits the large game-only ZIP from the site build and adds `.nojekyll` for GitHub Pages. Game source is governed by the sibling `game/LICENSE`; the site is part of the same project and is released under the same MIT terms to the extent contributors hold rights; its license is included as `LICENSE`. Artwork remains in the game source and follows its provenance and license notes.

To avoid overwriting unrelated work, the build will refuse to replace an existing `dist` unless it contains the `.oki-site-generated` marker. It completes the new directory before swapping it in. Publishing or DNS changes are separate from this local build; browser and device compatibility are not established merely by building it.
