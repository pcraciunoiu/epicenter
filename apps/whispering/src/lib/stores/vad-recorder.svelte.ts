import { MicVAD, utils } from '@ricky0123/vad-web';
import { extractErrorMessage } from 'wellcrafted/error';
import { Err, Ok, tryAsync, trySync } from 'wellcrafted/result';
import type { VadState } from '$lib/constants/audio';
import { defineQuery } from '$lib/query/client';
import { WhisperingErr } from '$lib/result';
import {
	cleanupRecordingStream,
	enumerateDevices,
	getRecordingStream,
} from '$lib/services/isomorphic/device-stream';
import { settings } from '$lib/stores/settings.svelte';

/** Silero score (0–1) above which a frame counts as speech. Lower = more sensitive. */
const VAD_POSITIVE_SPEECH_THRESHOLD = 0.3;
/** Below this, frames count as silence (typically ~0.15 under positive). */
const VAD_NEGATIVE_SPEECH_THRESHOLD = 0.15;
/** Fixed software gain before VAD — WebView AGC is unreliable on Linux. */
const VAD_INPUT_GAIN = 2;
/** Pre-roll frames at 1536/16kHz (~1.15s) so phrase starts are not clipped. */
const VAD_PRE_SPEECH_PAD_FRAMES = 12;

/**
 * Amplify a mic MediaStream for quieter WebView capture.
 * Caller must close `audioContext` and stop the source stream on cleanup.
 */
function amplifyMediaStream(
	stream: MediaStream,
	gainValue: number,
): { stream: MediaStream; audioContext: AudioContext } {
	const audioContext = new AudioContext();
	const source = audioContext.createMediaStreamSource(stream);
	const gain = audioContext.createGain();
	gain.gain.value = gainValue;
	const destination = audioContext.createMediaStreamDestination();
	source.connect(gain);
	gain.connect(destination);
	return { stream: destination.stream, audioContext };
}

/**
 * Creates a Voice Activity Detection (VAD) recorder with reactive state.
 *
 * This module provides voice activity detection using the @ricky0123/vad-web library.
 * State is managed with Svelte's $state rune for automatic reactivity.
 *
 * Usage:
 * - Access state reactively: `vadRecorder.state` (triggers effects when changed)
 * - Start listening: `await vadRecorder.startActiveListening({ onSpeechStart, onSpeechEnd })`
 * - Stop listening: `await vadRecorder.stopActiveListening()`
 * - Enumerate devices: `createQuery(() => vadRecorder.enumerateDevices.options)`
 */
function createVadRecorder() {
	// Private state
	let _maybeVad: MicVAD | null = null;
	let _state = $state<VadState>('IDLE');
	let _currentStream: MediaStream | null = null;
	let _gainAudioContext: AudioContext | null = null;

	async function cleanupCaptureResources() {
		if (_maybeVad) {
			trySync({
				try: () => _maybeVad?.destroy(),
				catch: () => Ok(undefined),
			});
			_maybeVad = null;
		}
		if (_gainAudioContext) {
			await tryAsync({
				try: () => _gainAudioContext!.close(),
				catch: () =>
					WhisperingErr({
						title: '⚠️ Failed to close VAD gain context',
						description: 'Audio context cleanup failed.',
					}),
			});
			_gainAudioContext = null;
		}
		if (_currentStream) {
			cleanupRecordingStream(_currentStream);
			_currentStream = null;
		}
	}

	return {
		/**
		 * Current VAD state. Reactive - reading this in an $effect will
		 * cause the effect to re-run when the state changes.
		 */
		get state(): VadState {
			return _state;
		},

		/**
		 * Enumerate available audio input devices.
		 *
		 * Usage:
		 * - With createQuery: `createQuery(() => vadRecorder.enumerateDevices.options)`
		 */
		enumerateDevices: defineQuery({
			queryKey: ['vad', 'devices'],
			queryFn: async () => {
				const { data, error } = await enumerateDevices();
				if (error) {
					return WhisperingErr({
						title: '❌ Failed to enumerate devices',
						serviceError: error,
					});
				}
				return Ok(data);
			},
		}),

		/**
		 * Start voice activity detection.
		 * Updates `state` reactively as detection progresses.
		 */
		async startActiveListening({
			onSpeechStart,
			onSpeechEnd,
			onVADMisfire,
			onSpeechRealStart,
		}: {
			onSpeechStart: () => void;
			onSpeechEnd: (blob: Blob) => void;
			onVADMisfire?: () => void;
			onSpeechRealStart?: () => void;
		}) {
			// Prevent starting if already active
			if (_maybeVad) {
				return WhisperingErr({
					title: '⚠️ VAD already active',
					description: 'Stop the current session before starting a new one.',
				});
			}

			console.log('Starting VAD recording');

			// Get device ID from settings
			const deviceId = settings.value['recording.navigator.deviceId'];

			// Get validated stream with device fallback
			const { data: streamResult, error: streamError } =
				await getRecordingStream({
					selectedDeviceId: deviceId,
					sendStatus: (status) => {
						console.log('VAD getRecordingStream status update:', status);
					},
				});

			if (streamError) {
				return WhisperingErr({
					title: '❌ Failed to get recording stream',
					serviceError: streamError,
				});
			}

			const { stream, deviceOutcome } = streamResult;
			_currentStream = stream;

			const { data: amplified, error: amplifyError } = trySync({
				try: () => amplifyMediaStream(stream, VAD_INPUT_GAIN),
				catch: (error) =>
					WhisperingErr({
						title: '❌ Failed to amplify microphone',
						description: extractErrorMessage(error),
						action: { type: 'more-details', error },
					}),
			});
			if (amplifyError) {
				cleanupRecordingStream(stream);
				_currentStream = null;
				return Err(amplifyError);
			}

			_gainAudioContext = amplified.audioContext;
			await tryAsync({
				try: () => amplified.audioContext.resume(),
				catch: () =>
					WhisperingErr({
						title: '⚠️ Audio context suspended',
						description: 'Could not resume AudioContext for VAD gain.',
					}),
			});

			// Create VAD with the amplified stream
			const { data: newVad, error: initializeVadError } = await tryAsync({
				try: () =>
					MicVAD.new({
						stream: amplified.stream,
						submitUserSpeechOnPause: true,
						model: 'v5',
						positiveSpeechThreshold: VAD_POSITIVE_SPEECH_THRESHOLD,
						negativeSpeechThreshold: VAD_NEGATIVE_SPEECH_THRESHOLD,
						preSpeechPadFrames: VAD_PRE_SPEECH_PAD_FRAMES,
						onSpeechStart: () => {
							_state = 'SPEECH_DETECTED';
							onSpeechStart();
						},
						onSpeechEnd: (audio) => {
							_state = 'LISTENING';
							const wavBuffer = utils.encodeWAV(audio);
							const blob = new Blob([wavBuffer], { type: 'audio/wav' });
							onSpeechEnd(blob);
						},
						onVADMisfire: () => {
							_state = 'LISTENING';
							onVADMisfire?.();
						},
						onSpeechRealStart: () => {
							onSpeechRealStart?.();
						},
					}),
				catch: (error) =>
					WhisperingErr({
						title: '❌ Failed to initialize VAD',
						description:
							'Voice activity detection could not be started. Your microphone may be in use by another application.',
						action: { type: 'more-details', error },
					}),
			});

			if (initializeVadError) {
				await cleanupCaptureResources();
				return Err(initializeVadError);
			}

			// Start listening
			const { error: startError } = trySync({
				try: () => newVad.start(),
				catch: (error) =>
					WhisperingErr({
						title: '❌ Failed to start VAD',
						description: `Failed to start Voice Activity Detector. ${extractErrorMessage(error)}`,
						action: { type: 'more-details', error },
					}),
			});

			if (startError) {
				_maybeVad = newVad;
				await cleanupCaptureResources();
				_state = 'IDLE';
				return Err(startError);
			}

			_maybeVad = newVad;
			_state = 'LISTENING';
			return Ok(deviceOutcome);
		},

		/**
		 * Stop voice activity detection and clean up resources.
		 * Sets `state` back to 'IDLE'.
		 */
		async stopActiveListening() {
			if (!_maybeVad && !_currentStream && !_gainAudioContext) {
				return Ok(undefined);
			}

			const vadInstance = _maybeVad;
			_maybeVad = null;

			const { error: destroyError } = trySync({
				try: () => {
					vadInstance?.destroy();
				},
				catch: (error) =>
					WhisperingErr({
						title: '❌ Failed to stop VAD',
						description: `Failed to stop Voice Activity Detector. ${extractErrorMessage(error)}`,
						action: { type: 'more-details', error },
					}),
			});

			_state = 'IDLE';

			if (_gainAudioContext) {
				await tryAsync({
					try: () => _gainAudioContext!.close(),
					catch: () =>
						WhisperingErr({
							title: '⚠️ Failed to close VAD gain context',
							description: 'Audio context cleanup failed.',
						}),
				});
				_gainAudioContext = null;
			}

			if (_currentStream) {
				cleanupRecordingStream(_currentStream);
				_currentStream = null;
			}

			if (destroyError) return Err(destroyError);
			return Ok(undefined);
		},
	};
}

export const vadRecorder = createVadRecorder();
