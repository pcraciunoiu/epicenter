#!/usr/bin/env python3
"""Listen for PTT and toggle keys and drive Whispering via CLI.

Configuration: ~/.config/whispering/ptt.conf (see scripts/linux/whispering-ptt.conf.example).
Omit ptt_key or toggle_key to disable that binding.
"""

import argparse
import configparser
import errno
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import evdev
from evdev import ecodes

DEFAULT_WHISPERING = "/usr/bin/whispering"
DEFAULT_CONFIG = Path.home() / ".config" / "whispering" / "ptt.conf"
DEFAULT_DEVICE_NAME = "ZSA Technology Labs Moonlander Mark I"
RECONNECT_DELAY_S = 1.0
DEVICE_WAIT_S = 5.0

LIST_DEVICES_HINT = (
	"List input devices:\n"
	"  grep -E '^(N:|H:)' /proc/bus/input/devices\n"
	"Or (after joining the input group):\n"
	'  python3 -c "import evdev; '
	'[print(p, evdev.InputDevice(p).name) for p in evdev.list_devices()]"'
)


class DeviceNotFoundError(Exception):
	pass

MOONLANDER_SPECIALIZED_SUFFIXES = (
	"System Control",
	"Consumer Control",
	"Keyboard",
)


@dataclass(frozen=True)
class ListenerConfig:
	device: str | None
	device_name: str | None
	ptt_key: str | None
	toggle_key: str | None
	whispering: str


def parse_key(name: str) -> int:
	key = name.upper()
	if not key.startswith("F") and key.isdigit():
		key = f"F{key}"
	attr = f"KEY_{key}"
	if not hasattr(ecodes, attr):
		raise SystemExit(f"Unknown key: {name!r} (expected e.g. F14)")
	return getattr(ecodes, attr)


def key_name(code: int) -> str:
	return ecodes.KEY.get(code, str(code))


def optional_str(value: str | None) -> str | None:
	if value is None:
		return None
	trimmed = value.strip()
	return trimmed or None


def load_config(path: Path) -> ListenerConfig:
	if not path.is_file():
		raise SystemExit(
			f"Config not found: {path}\n"
			"Copy scripts/linux/whispering-ptt.conf.example to "
			"~/.config/whispering/ptt.conf and edit it.",
		)

	parser = configparser.ConfigParser()
	parser.read(path)
	if not parser.has_section("ptt"):
		raise SystemExit(f"Config {path} must contain a [ptt] section.")

	section = parser["ptt"]
	return ListenerConfig(
		device=optional_str(section.get("device")),
		device_name=optional_str(section.get("device_name")),
		ptt_key=optional_str(section.get("ptt_key")),
		toggle_key=optional_str(section.get("toggle_key")),
		whispering=optional_str(section.get("whispering")) or DEFAULT_WHISPERING,
	)


def find_device_by_name(device_name: str) -> evdev.InputDevice:
	matches: list[evdev.InputDevice] = []
	for path in sorted(evdev.list_devices()):
		device = evdev.InputDevice(path)
		if (device.name or "") == device_name:
			matches.append(device)

	if not matches:
		raise DeviceNotFoundError(
			f"No input device named {device_name!r}.\n"
			f"{LIST_DEVICES_HINT}\n"
			"Then set device= or device_name= in ~/.config/whispering/ptt.conf",
		)

	return sorted(matches, key=lambda device: device.path)[0]


def find_moonlander_ptt_device() -> evdev.InputDevice:
	"""Fallback auto-detect for Moonlander when config has no device/device_name."""
	candidates: list[evdev.InputDevice] = []

	for path in sorted(evdev.list_devices()):
		device = evdev.InputDevice(path)
		name = device.name or ""
		if "Moonlander" not in name and "ZSA" not in name:
			continue
		candidates.append(device)

	if not candidates:
		raise DeviceNotFoundError(
			"Moonlander not found. Plug it in, then list devices:\n"
			f"{LIST_DEVICES_HINT}\n"
			"Or set device= / device_name= in ~/.config/whispering/ptt.conf",
		)

	generic = [
		device
		for device in candidates
		if (device.name or "") == DEFAULT_DEVICE_NAME
	]
	if generic:
		return sorted(generic, key=lambda device: device.path)[0]

	for device in candidates:
		name = device.name or ""
		if not any(suffix in name for suffix in MOONLANDER_SPECIALIZED_SUFFIXES):
			return device

	names = "\n".join(f"  {d.path}: {d.name}" for d in candidates)
	raise DeviceNotFoundError(
		"Moonlander PTT device not found. Candidates:\n"
		f"{names}\n"
		"Set device= to the path that shows your PTT key in evtest "
		"(e.g. evtest /dev/input/eventN).",
	)


def resolve_device(config: ListenerConfig) -> evdev.InputDevice:
	if config.device:
		return evdev.InputDevice(config.device)
	if config.device_name:
		return find_device_by_name(config.device_name)
	return find_moonlander_ptt_device()


def open_device(config: ListenerConfig, grab: bool) -> evdev.InputDevice:
	try:
		device = resolve_device(config)
	except DeviceNotFoundError:
		raise
	except OSError as error:
		raise DeviceNotFoundError(
			f"Could not open input device: {error}\n"
			f"{LIST_DEVICES_HINT}",
		) from error

	if grab:
		try:
			device.grab()
		except OSError as error:
			sys.exit(
				f"Could not grab {device.path}: {error}\n"
				"Another process likely has the device (evtest --grab, Keymapp?).",
			)

	return device


def open_device_with_retry(config: ListenerConfig, grab: bool) -> evdev.InputDevice:
	while True:
		try:
			return open_device(config, grab)
		except DeviceNotFoundError as error:
			print(f"{error}\nRetrying in {DEVICE_WAIT_S:.0f}s…", flush=True)
			time.sleep(DEVICE_WAIT_S)


def release_device(device: evdev.InputDevice, grab: bool) -> None:
	if grab:
		try:
			device.ungrab()
		except OSError:
			pass
	try:
		device.close()
	except OSError:
		pass


def run_whispering(whispering: str, command_args: list[str]) -> None:
	result = subprocess.run(
		[whispering, *command_args],
		capture_output=True,
		text=True,
		timeout=15,
	)
	if result.returncode != 0:
		print(
			f"whispering {' '.join(command_args)} failed (exit {result.returncode}): "
			f"{result.stderr.strip() or result.stdout.strip() or 'no output'}",
			flush=True,
		)


def handle_event(
	event: evdev.InputEvent,
	ptt_key: int | None,
	ptt_key_name: str | None,
	toggle_key: int | None,
	toggle_key_name: str | None,
	whispering: str,
	debug: bool,
) -> None:
	if event.type != ecodes.EV_KEY:
		return
	if debug:
		print(
			f"debug: code={event.code} ({key_name(event.code)}) value={event.value}",
			flush=True,
		)

	if ptt_key is not None and event.code == ptt_key:
		if event.value == 1:
			print(f"{ptt_key_name} down → start recording", flush=True)
			run_whispering(whispering, ["--start-recording"])
		elif event.value == 0:
			print(f"{ptt_key_name} up → stop recording", flush=True)
			run_whispering(whispering, ["--stop-recording"])
		return

	if toggle_key is not None and event.code == toggle_key and event.value == 1:
		print(f"{toggle_key_name} down → toggle recording", flush=True)
		run_whispering(whispering, ["--toggle-recording"])


def listen_loop(
	config: ListenerConfig,
	ptt_key: int | None,
	ptt_key_name: str | None,
	toggle_key: int | None,
	toggle_key_name: str | None,
	debug: bool,
	grab: bool,
) -> None:
	device = open_device_with_retry(config, grab)

	while True:
		try:
			for event in device.read_loop():
				handle_event(
					event,
					ptt_key,
					ptt_key_name,
					toggle_key,
					toggle_key_name,
					config.whispering,
					debug,
				)
		except OSError as error:
			if error.errno != errno.ENODEV:
				raise
			print(
				"Input device disconnected (RESET key, USB replug, or sleep). "
				f"Reconnecting in {RECONNECT_DELAY_S:.0f}s…",
				flush=True,
			)
			release_device(device, grab)
			time.sleep(RECONNECT_DELAY_S)
			device = open_device_with_retry(config, grab)
			print(
				f"Reconnected to {device.path} ({device.name})",
				flush=True,
			)


def main() -> None:
	parser = argparse.ArgumentParser(description="Whispering PTT listener")
	parser.add_argument(
		"--config",
		default=str(DEFAULT_CONFIG),
		help=f"Config file path (default: {DEFAULT_CONFIG})",
	)
	parser.add_argument(
		"--debug",
		action="store_true",
		help="Print all key events (for troubleshooting)",
	)
	parser.add_argument(
		"--grab",
		action="store_true",
		help=(
			"Exclusive device grab — blocks Moonlander typing in all apps; "
			"avoid unless required for debugging"
		),
	)
	cli_args = parser.parse_args()

	config = load_config(Path(cli_args.config).expanduser())

	ptt_key = parse_key(config.ptt_key) if config.ptt_key else None
	toggle_key = parse_key(config.toggle_key) if config.toggle_key else None

	if ptt_key is None and toggle_key is None:
		raise SystemExit(
			f"Config {cli_args.config} must set at least one of ptt_key or toggle_key.",
		)

	probe = open_device_with_retry(config, grab=False)
	print(f"Config: {cli_args.config}")
	print(f"Listening on {probe.path} ({probe.name})")
	if ptt_key is not None:
		print(f"PTT key {config.ptt_key} = evdev code {ptt_key}")
		print(
			f"{config.ptt_key} press → start, {config.ptt_key} release → stop "
			f"via {config.whispering}",
		)
	else:
		print("PTT key: disabled (ptt_key not set)")
	if toggle_key is not None:
		print(f"Toggle key {config.toggle_key} = evdev code {toggle_key}")
		print(f"{config.toggle_key} press → toggle via {config.whispering}")
	else:
		print("Toggle key: disabled (toggle_key not set)")
	print("Whispering must already be running.")
	print("Quit evtest before running this script.")
	print("Press Ctrl+C to stop.\n", flush=True)
	release_device(probe, grab=False)

	listen_loop(
		config,
		ptt_key,
		config.ptt_key,
		toggle_key,
		config.toggle_key,
		cli_args.debug,
		cli_args.grab,
	)


if __name__ == "__main__":
	try:
		main()
	except KeyboardInterrupt:
		print("\nStopped.", flush=True)
	except PermissionError:
		sys.exit(
			"Permission denied reading input device. Run:\n"
			'  sudo usermod -aG input "$USER"\n'
			"Then log out and back in.",
		)
