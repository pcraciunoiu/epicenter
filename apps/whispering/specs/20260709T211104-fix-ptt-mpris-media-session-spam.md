# Fix PTT release spawning stacked GNOME media-player entries

## Problem

On Linux (GNOME), each Push-to-Talk release adds another "Whispering" media-player card in the notification/media area (prev / pause / next controls).

These are **not** duplicate database recordings. They are **MPRIS media sessions** from WebKitGTK.

## Findings (alpha.3 field test)

1. **UI beeps** — Web Audio fix works (sounds audible again without using `HTMLAudioElement`).
2. **Stacking still happens** — each PTT release still adds a media card.
3. **Playing one card clears the others**; Play always plays the **latest** recording.

That points at the home-page latest-recording `<audio controls>` in `+page.svelte`: after each save, `blobUrl` updates → WebKit registers another MPRIS session for the same player, and ghost cards pile up until one is activated.

## Root cause (revised)

1. PTT release → recording saved → `latestRecording` / `blobUrl` updates
2. Home page `<audio src={blobUrl} controls>` loads the new blob
3. WebKitGTK exposes HTML media elements over MPRIS ([WebKit bug 247527](https://bugs.webkit.org/show_bug.cgi?id=247527))
4. Sessions fail to replace cleanly → stacked "Whispering" players; activating one collapses ghosts onto the current element

UI beep `HTMLAudioElement`s were a secondary contributor (fixed in alpha.3 via Web Audio).

## Approach

1. **alpha.3:** Play UI feedback sounds via Web Audio (done).
2. **alpha.4:** Disable WebKitGTK media-session / MPRIS on the main webview at startup (Linux only), same pattern as [psysonic#1069](https://github.com/Psychotoxical/psysonic/pull/1069):

```rust
if settings.find_property("enable-media-session").is_some() {
    settings.set_property("enable-media-session", false);
}
```

- In-app `<audio controls>` playback still works
- GNOME media area no longer gets Whispering MPRIS cards
- Guard with `find_property` so older WebKitGTK does not panic

## Out of scope

- Changing PTT start/stop recording logic
- Removing the home-page `<audio controls>` player
- Changing the recordings list / DB create path

## Todos

- [x] Play UI feedback sounds via Web Audio (alpha.3)
- [x] Add Linux-only helper to set WebKit `enable-media-session` = false on main webview
- [x] Call it from `setup` in `lib.rs`
- [x] Add `webkit2gtk` Linux dependency
- [x] Bump to `v7.12.0-alpha.4`, release notes, push tag to rebuild deb
- [ ] Manual check: PTT no longer stacks GNOME media cards; in-app audio still plays

## Review

### alpha.3

- `sound/assets/index.ts` — `playUiSound()` via `AudioContext` + cached buffers
- `desktop.ts` / `web.ts` — use `playUiSound`

### alpha.4

- `src-tauri/src/linux_webkit.rs` — `disable_media_session()` sets GObject `enable-media-session` = false
- `src-tauri/src/lib.rs` — call on main window during setup (Linux only)
- `Cargo.toml` — `webkit2gtk = "2.0.1"` for Linux target
