# Fix PTT release spawning stacked GNOME media-player entries

## Problem

On Linux (GNOME), each Push-to-Talk release adds another "Whispering" media-player card in the notification/media area (prev / pause / next controls). The screenshot shows several identical stacked entries.

These are **not** duplicate database recordings. They are **MPRIS media sessions** created by WebKitGTK when UI feedback sounds play through `HTMLAudioElement.play()`.

## Root cause

1. PTT release → `stopManualRecording` → `sound.playSoundIfEnabled.execute('manual-stop')`
2. Sound service calls `audioElements[soundName].play()` on a shared `HTMLAudioElement`
3. WebKitGTK exposes HTML media elements over MPRIS ([WebKit bug 247527](https://bugs.webkit.org/show_bug.cgi?id=247527))
4. Sessions often fail to unregister cleanly, so each PTT release stacks another "Whispering" player

Same path fires for start/cancel/VAD/transcription sounds.

## Approach (minimal)

Play UI feedback sounds via the **Web Audio API** (`AudioContext` + decoded buffers) instead of `HTMLAudioElement`.

- Web Audio does not register MPRIS players
- Keeps the existing sound names / settings / query mutation API
- Leaves the intentional recording `<audio controls>` player alone (user-initiated playback)

## Out of scope

- Changing PTT start/stop recording logic (that correctly creates one DB recording per hold)
- Disabling WebKit media-session globally in Rust (heavier, platform-specific)
- Changing the recordings list / DB create path

## Todos

- [x] Update sound asset module to decode MP3s into `AudioBuffer`s (lazy or on first play)
- [x] Update desktop + web sound services to play via `AudioContext` instead of `HTMLAudioElement.play()`
- [x] Verify recording `<audio controls>` on home page is unchanged
- [ ] Manual check: PTT press/release no longer stacks GNOME media-player cards (via alpha.3 deb)

## Review

### Changes

- `src/lib/services/isomorphic/sound/assets/index.ts` — replaced shared `HTMLAudioElement`s with `playUiSound()` using `AudioContext` + cached `AudioBuffer`s
- `desktop.ts` / `web.ts` — call `playUiSound` instead of `.play()` on media elements
- Home-page recording `<audio controls>` left untouched (intentional user playback)

### Why this works

Web Audio API playback does not create HTML media elements, so WebKitGTK does not register MPRIS sessions for UI beeps. Each PTT release should no longer add a GNOME media-player card.

### Release

Shipped as `v7.12.0-alpha.3` for Linux deb testing.
