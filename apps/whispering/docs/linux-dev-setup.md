# Linux local development setup

Whispering on Linux uses Tauri with WebKitGTK. These steps were verified on Ubuntu 26.04 and should also work on Ubuntu 24.04 and other Debian-based distros with the same package names.

This guide matches the **v7.11.0** tree. Newer `main` adds a Linux-specific dev launcher (`scripts/launch-dev.ts`) that builds the frontend and serves it with `vite preview`; on v7.11.0 you start with plain `bun tauri dev` below and port that launcher only if WebKitGTK misbehaves.

## 1. Toolchain (mise)

From the repo root:

```bash
cd epicenter
mise install
```

The root `mise.toml` pins **bun 1.3.4** (same as root `packageManager`) and **rust stable**. Run commands through mise so you pick up those versions:

```bash
mise exec -- bun --version
mise exec -- rustc --version
```

You do not need npm or Node in mise for this repo. Bun is the package manager.

## 2. System packages

Install Tauri and Whispering build dependencies:

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libxdo-dev \
  libasound2-dev \
  libopenblas-dev \
  libx11-dev \
  libxtst-dev \
  libxrandr-dev \
  build-essential \
  pkg-config \
  libssl-dev \
  python3
```

Add yourself to the `audio` group if CPAL cannot see input devices (log out and back in afterward):

```bash
sudo usermod -aG audio "$USER"
```

For PipeWire device listing and desktop audio integration:

```bash
sudo apt-get install -y pipewire-pulse pulseaudio-utils alsa-utils
```

## 3. JavaScript dependencies

Install from the **repo root**, not `apps/whispering`:

```bash
cd epicenter
mise exec -- bun install
```

If install fails on `better-sqlite3` in another workspace package (`packages/epicenter`), you do not need npm. That error usually means native build tools are missing. Install `build-essential` and `python3` (step 2), then retry.

To install only Whispering and its workspace dependencies:

```bash
mise exec -- bun install --filter '@epicenter/whispering...'
```

## 4. Run the desktop app

On v7.11.0:

```bash
cd apps/whispering
mise exec -- bun run dev
```

That runs `bun tauri dev` with the dev app identifier (`com.bradenwong.whispering.dev`).

The first run compiles Rust (Whisper, ONNX, Parakeet, and the rest) and can take several minutes.

### Web only (no Tauri)

```bash
cd apps/whispering
mise exec -- bun run dev:web
```

### Release build

```bash
cd apps/whispering
mise exec -- bun run build
mise exec -- bun tauri build
```

Installers and binaries land under `apps/whispering/src-tauri/target/release/`.

## Troubleshooting

### Stale paths in `src-tauri/target/`

If the repo moved (for example from `/home/you/old-path/...` to a new mount), Cargo may still reference the old absolute paths. Tauri then fails with missing plugin permission files under the old path.

```bash
cd apps/whispering/src-tauri
mise exec -- cargo clean
```

Then run dev again.

### `bun install` exit code 127 / `node-gyp: command not found`

Run install from the repo root. Ensure `build-essential` and `python3` are installed. Use the `--filter` install above if you only need Whispering.

### Blank Tauri window or WebKitGTK IPC errors

On newer `main`, Linux dev builds the frontend and serves it with `vite preview` on `127.0.0.1:1420` to avoid WebKitGTK issues. If plain `bun tauri dev` fails on your machine, port those changes from `main` (`tauri.linux.conf.json`, `scripts/launch-dev.ts`, and related `package.json` scripts) onto your branch.

### No recording devices in settings

Check that PipeWire/PulseAudio is running and that your user is in the `audio` group. Verify capture outside the app:

```bash
pactl list sources short
arecord -l
arecord -d 3 -f S16_LE -r 16000 /tmp/test.wav
```

### macOS Accessibility identity

Linux has no TCC or dev signing flow. For macOS dev identity and Accessibility grants, see [`src-tauri/scripts/README.md`](../src-tauri/scripts/README.md) if present on your tree.

## 5. Global shortcuts on GNOME Wayland (CLI fallback)

On Wayland, in-app global shortcuts (`tauri-plugin-global-shortcut`) only fire while Whispering is focused. Until the XDG GlobalShortcuts portal backend lands, use **GNOME custom shortcuts** that invoke the Whispering CLI.

Whispering must already be running (start it normally or enable autostart). A second CLI invocation talks to the running instance via single-instance IPC.

### PTT listener setup

The listener reads keyboard events via evdev. Your user must be in the `input` group (log out and back in afterward, or reboot):

```bash
sudo usermod -aG input "$USER"
```

Until the new group is active, evdev may list zero devices and the listener will appear broken. The example systemd unit uses `sg input` so the service can start before you log out/in.

Configure keys and device in `~/.config/whispering/ptt.conf` (see `scripts/linux/whispering-ptt.conf.example`). Omit `ptt_key` or `toggle_key` to disable that binding. Run the listener via systemd (recommended) or directly.

```bash
mkdir -p ~/.config/whispering
cp scripts/linux/whispering-ptt.conf.example ~/.config/whispering/ptt.conf
# edit ~/.config/whispering/ptt.conf
cp scripts/linux/whispering-ptt-listener.py ~/.local/bin/
chmod +x ~/.local/bin/whispering-ptt-listener.py
cp scripts/linux/whispering-ptt.service.example ~/.config/systemd/user/whispering-ptt.service
systemctl --user daemon-reload
systemctl --user enable --now whispering-ptt.service
```

Start Whispering normally (desktop entry or `/usr/bin/whispering`). The listener talks to the running instance via CLI. If the configured device is not plugged in yet, the listener waits and retries instead of exiting (useful when autostarting via systemd).

### Toggle recording (recommended)

1. Open **Settings → Keyboard → Keyboard Shortcuts → Custom Shortcuts**.
2. Add a shortcut with an absolute path (GNOME shell does not use your shell `PATH`):

```bash
/usr/bin/whispering --toggle-recording
```

Aliases: `--toggle-manual-recording`

3. Bind a key (e.g. `Alt+Shift+D` or `Ctrl+Shift+;`).
4. With another app focused (Text Editor, Cursor, etc.), press the shortcut — recording should start/stop without focusing Whispering.

Dev builds use a different binary path, typically under `src-tauri/target/debug/whispering`.

### Hacky push-to-talk via start/stop (optional)

The portal and hold-to-talk backend are not ready yet. You can approximate PTT with a Moonlander key mapped to **F14** in Oryx plus a small evdev listener.

1. Map hold-to-talk to **F14** in [Oryx](https://www.zsa.io/oryx), flash, then verify on the Moonlander input node (see below). Optionally map toggle to **F15** and set `toggle_key` in the config.
2. Install deps: `sudo apt install python3-evdev evtest`
3. Copy `scripts/linux/whispering-ptt-listener.py` to `~/.local/bin/` and chmod +x.
4. Create `~/.config/whispering/ptt.conf` from `scripts/linux/whispering-ptt.conf.example`. Prefer `device_name`; use `device=/dev/input/eventN` only if needed. A Moonlander exposes several `/dev/input/event*` nodes (generic, Keyboard, System Control, etc.). On many GNOME Wayland setups PTT keys arrive on the generic `ZSA Technology Labs Moonlander Mark I` node, not the separate `Keyboard` interface.

   List devices:

   ```bash
   grep -E '^(N:|H:)' /proc/bus/input/devices
   ```

   Verify your PTT key (e.g. `KEY_F14`, value 1 on press and 0 on release):

   ```bash
   evtest /dev/input/eventN
   ```

   If F14 does not appear on that node, try the other Moonlander event paths.
5. Run the listener:

```bash
~/.local/bin/whispering-ptt-listener.py
# or:
~/.local/bin/whispering-ptt-listener.py --config ~/.config/whispering/ptt.conf
```

6. Autostart the listener with a user systemd unit (see `scripts/linux/whispering-ptt.service.example`).

CLI flags (Whispering must be running):

```bash
/usr/bin/whispering --start-recording   # key down
/usr/bin/whispering --stop-recording    # key up
/usr/bin/whispering --toggle-recording  # toggle (GNOME custom shortcut)
```

See the Wayland global shortcuts plan for the full portal implementation roadmap.
