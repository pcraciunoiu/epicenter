import type { WhisperingSoundNames } from '$lib/constants/sounds';
import {
	default as captureVadSoundSrc,
	default as stopManualSoundSrc,
} from './sound_ex_machina_Button_Blip.mp3';
import startManualSoundSrc from './zapsplat_household_alarm_clock_button_press_12967.mp3';
import stopVadSoundSrc from './zapsplat_household_alarm_clock_large_snooze_button_press_001_12968.mp3';
import startVadSoundSrc from './zapsplat_household_alarm_clock_large_snooze_button_press_002_12969.mp3';
import cancelSoundSrc from './zapsplat_multimedia_click_button_short_sharp_73510.mp3';
import transformationCompleteSoundSrc from './zapsplat_multimedia_notification_alert_ping_bright_chime_001_93276.mp3';
import transcriptionCompleteSoundSrc from './zapsplat_multimedia_ui_notification_classic_bell_synth_success_107505.mp3';

/**
 * UI feedback sound sources.
 *
 * Played via the Web Audio API (see {@link playUiSound}) so WebKitGTK does not
 * register MPRIS media-player sessions for short beeps on Linux.
 */
export const soundSources = {
	'manual-start': startManualSoundSrc,
	'manual-cancel': cancelSoundSrc,
	'manual-stop': stopManualSoundSrc,
	'vad-start': startVadSoundSrc,
	'vad-capture': captureVadSoundSrc,
	'vad-stop': stopVadSoundSrc,
	transcriptionComplete: transcriptionCompleteSoundSrc,
	transformationComplete: transformationCompleteSoundSrc,
} satisfies Record<WhisperingSoundNames, string>;

let audioContext: AudioContext | null = null;
const decodedBuffers = new Map<WhisperingSoundNames, AudioBuffer>();

function getAudioContext(): AudioContext {
	if (!audioContext) {
		audioContext = new AudioContext();
	}
	return audioContext;
}

/**
 * Play a UI feedback sound without creating an HTML media element.
 * Avoids GNOME/KDE MPRIS "media player" entries from WebKitGTK.
 */
export async function playUiSound(
	soundName: WhisperingSoundNames,
): Promise<void> {
	const ctx = getAudioContext();
	if (ctx.state === 'suspended') {
		await ctx.resume();
	}

	let buffer = decodedBuffers.get(soundName);
	if (!buffer) {
		const response = await fetch(soundSources[soundName]);
		const arrayBuffer = await response.arrayBuffer();
		buffer = await ctx.decodeAudioData(arrayBuffer);
		decodedBuffers.set(soundName, buffer);
	}

	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.connect(ctx.destination);
	source.start(0);
}
