import { invoke } from '@tauri-apps/api/core';
import { IS_LINUX } from '$lib/constants/platform/is-linux';
import { settings } from '$lib/stores/settings.svelte';

type ShortcutEnvOverrides = {
	push_to_talk: string | null;
	toggle_manual_recording: string | null;
};

/**
 * Apply WHISPERING_PTT_KEY / WHISPERING_TOGGLE_KEY from the process environment
 * before global shortcuts register. Env wins over stored settings when set.
 */
export async function applyLinuxShortcutEnvOverrides(): Promise<void> {
	if (!IS_LINUX || !window.__TAURI_INTERNALS__) return;

	const overrides = await invoke<ShortcutEnvOverrides>(
		'get_shortcut_env_overrides',
	);

	const next = { ...settings.value };
	let changed = false;

	if (overrides.push_to_talk) {
		next['shortcuts.global.pushToTalk'] = overrides.push_to_talk;
		changed = true;
	}

	if (overrides.toggle_manual_recording) {
		next['shortcuts.global.toggleManualRecording'] =
			overrides.toggle_manual_recording;
		changed = true;
	}

	if (changed) {
		settings.value = next;
	}
}
