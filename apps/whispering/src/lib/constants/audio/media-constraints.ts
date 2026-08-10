/**
 * Media constraints for audio recording
 */

export const TIMESLICE_MS = 1000;

/**
 * Whisper API recommended media track constraints
 * Mono channel at 16kHz for optimal transcription.
 * AGC/echo/noise match what @ricky0123/vad-web enables when it opens
 * the mic itself — without them WebView capture is often too quiet for VAD.
 */
export const WHISPER_RECOMMENDED_MEDIA_TRACK_CONSTRAINTS = {
	channelCount: { ideal: 1 },
	sampleRate: { ideal: 16_000 },
	autoGainControl: true,
	echoCancellation: true,
	noiseSuppression: true,
} satisfies MediaTrackConstraints;
