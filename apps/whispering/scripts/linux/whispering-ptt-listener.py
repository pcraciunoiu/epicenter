#!/usr/bin/env python3
"""Listen for PTT and toggle keys and drive Whispering via CLI."""

from __future__ import annotations

import argparse
import errno
import os
import subprocess
import sys
import time

import evdev
from evdev import ecodes

DEFAULT_WHISPERING = "/usr/bin/whispering"
DEFAULT_PTT_KEY = os.environ.get("WHISPERING_PTT_KEY", "F14")
DEFAULT_TOGGLE_KEY = os.environ.get("WHISPERING_TOGGLE_KEY", "F13")
RECONNECT_DELAY_S = 1.0


def parse_ptt_key(name: str) -> int:
	key = name.upper()
	if not key.startswith("F") and key.isdigit():
		key = f"F{key}"
	attr = f"KEY_{key}"
	if not hasattr(ecodes, attr):
		raise SystemExit(f"Unknown key: {name!r} (expected e.g. F14)")
	return getattr(ecodes, attr)


def key_name(code: int) -> str:
	return ecodes.KEY.get(code, str(code))


MOONLANDER_PTT_DEVICE_NAME = "ZSA Technology Labs Moonlander Mark I"
MOONLANDER_SPECIALIZED_SUFFIXES = (
	"System Control",
	"Consumer Control",
	"Keyboard",
)


def find_moonlander_ptt_device() -> evdev.InputDevice:
	"""Find the Moonlander evdev node that receives PTT keys.

	On many setups (including GNOME Wayland), F13/F14 arrive on the generic
	'ZSA Technology Labs Moonlander Mark I' node (often event4), not the
	separate 'Keyboard' interface (often event8). Use evtest on each node to
	confirm which one sees your PTT key.
	"""
	candidates: list[evdev.InputDevice] = []

	for path in sorted(evdev.list_devices()):
		device = evdev.InputDevice(path)
		name = device.name or ""
		if "Moonlander" not in name and "ZSA" not in name:
			continue
		candidates.append(device)

	if not candidates:
		raise SystemExit(
			"Moonlander not found. Plug it in and run: evtest --list or evtest",
		)

	generic = [
		device
		for device in candidates
		if (device.name or "") == MOONLANDER_PTT_DEVICE_NAME
	]
	if generic:
		return sorted(generic, key=lambda device: device.path)[0]

	for device in candidates:
		name = device.name or ""
		if not any(suffix in name for suffix in MOONLANDER_SPECIALIZED_SUFFIXES):
			return device

	names = "\n".join(f"  {d.path}: {d.name}" for d in candidates)
	raise SystemExit(
		"Moonlander PTT device not found. Candidates:\n"
		f"{names}\n"
		"Pass the path that shows your PTT key in evtest with --device.",
	)


def open_device(device_path: str | None, grab: bool) -> evdev.InputDevice:
	device = (
		evdev.InputDevice(device_path)
		if device_path
		else find_moonlander_ptt_device()
	)

	if grab:
		try:
			device.grab()
		except OSError as error:
			sys.exit(
				f"Could not grab {device.path}: {error}\n"
				"Another process likely has the device (evtest --grab, Keymapp?).",
			)

	return device


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
	ptt_key_name: str,
	toggle_key: int | None,
	toggle_key_name: str,
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
	device_path: str | None,
	ptt_key: int | None,
	ptt_key_name: str,
	toggle_key: int | None,
	toggle_key_name: str,
	whispering: str,
	debug: bool,
	grab: bool,
) -> None:
	device = open_device(device_path, grab)

	while True:
		try:
			for event in device.read_loop():
				handle_event(
					event,
					ptt_key,
					ptt_key_name,
					toggle_key,
					toggle_key_name,
					whispering,
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
			device = open_device(device_path, grab)
			print(
				f"Reconnected to {device.path} ({device.name})",
				flush=True,
			)


def main() -> None:
	parser = argparse.ArgumentParser(description="Whispering PTT listener")
	parser.add_argument(
		"--device",
		help="Input device path from evtest (default: auto-detect Moonlander PTT node)",
	)
	parser.add_argument(
		"--whispering",
		default=DEFAULT_WHISPERING,
		help=f"Whispering binary path (default: {DEFAULT_WHISPERING})",
	)
	parser.add_argument(
		"--key",
		default=DEFAULT_PTT_KEY,
		help=f"PTT key to listen for (default: {DEFAULT_PTT_KEY}, env WHISPERING_PTT_KEY)",
	)
	parser.add_argument(
		"--toggle-key",
		default=DEFAULT_TOGGLE_KEY,
		help=(
			f"Toggle key to listen for (default: {DEFAULT_TOGGLE_KEY}, "
			"env WHISPERING_TOGGLE_KEY; pass 'none' to disable)"
		),
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

	ptt_key = None if cli_args.key.lower() == "none" else parse_ptt_key(cli_args.key)
	toggle_key = (
		None
		if cli_args.toggle_key.lower() == "none"
		else parse_ptt_key(cli_args.toggle_key)
	)

	if ptt_key is None and toggle_key is None:
		raise SystemExit("At least one of --key or --toggle-key must be set.")

	ptt_key_name = cli_args.key
	toggle_key_name = cli_args.toggle_key

	probe = open_device(cli_args.device, grab=False)
	print(f"Listening on {probe.path} ({probe.name})")
	if ptt_key is not None:
		print(f"PTT key {ptt_key_name} = evdev code {ptt_key}")
	if toggle_key is not None:
		print(f"Toggle key {toggle_key_name} = evdev code {toggle_key}")
	if ptt_key is not None:
		print(
			f"{ptt_key_name} press → start, {ptt_key_name} release → stop "
			f"via {cli_args.whispering}",
		)
	if toggle_key is not None:
		print(f"{toggle_key_name} press → toggle via {cli_args.whispering}")
	print("Whispering must already be running.")
	print("Quit evtest before running this script.")
	print("Press Ctrl+C to stop.\n", flush=True)
	release_device(probe, grab=False)

	listen_loop(
		cli_args.device,
		ptt_key,
		ptt_key_name,
		toggle_key,
		toggle_key_name,
		cli_args.whispering,
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
