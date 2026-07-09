# Fix PTT release spawning stacked GNOME media-player entries

## Problem

On Linux (GNOME), each Push-to-Talk release adds another "Whispering" media-player card in the notification/media area (prev / pause / next controls).

These are **not** duplicate database recordings. They are **MPRIS media sessions** from WebKitGTK (`org.mpris.MediaPlayer2.org.webkit.*`).

## Findings

| Build | Result |
| --- | --- |
| alpha.3 (Web Audio beeps) | Sounds work; stacking remains |
| alpha.4 (`enable-media-session=false`) | Stacking remains; live D-Bus still shows stacked `org.webkit.*` players |
| Field note | Playing one card collapses others; Play always hits latest |

Root cause: home-page latest-recording `<audio src={blobUrl} controls>`. Each PTT save updates `blobUrl` → WebKit registers another MPRIS session. Disabling `enable-media-session` is **not sufficient** on this WebKitGTK build.

## Approach (alpha.5)

**Defer `src` until the user plays** via `LazyAudio.svelte`:

- Render `<audio controls preload="none">` without `src`
- On `play`, attach `src` and call `play()` again
- When the recording URL changes, unload (`removeAttribute('src')` + `load()`)

Also applied to recordings-list `RenderAudioUrl.svelte`. Keep Web Audio beeps + best-effort WebKit setting as defense in depth.

## Out of scope

- Changing PTT start/stop recording logic
- Removing in-app playback entirely
- D-Bus policy to deny MPRIS name ownership

## Todos

- [x] Play UI feedback sounds via Web Audio (alpha.3)
- [x] Best-effort disable WebKit `enable-media-session` (alpha.4)
- [x] `LazyAudio`: attach `src` only on user play; unload on recording change
- [x] Use on home page + recordings list
- [x] Bump to `v7.12.0-alpha.5`, release notes, push tag
- [ ] Manual check: no stacked GNOME cards on PTT; in-app play still works

## Review

### alpha.3

- `sound/assets/index.ts` — `playUiSound()` via `AudioContext`

### alpha.4

- `linux_webkit.rs` — set `enable-media-session` false (insufficient alone)

### alpha.5

- `LazyAudio.svelte` — defer `src` until play
- `+page.svelte`, `RenderAudioUrl.svelte` — use `LazyAudio`
