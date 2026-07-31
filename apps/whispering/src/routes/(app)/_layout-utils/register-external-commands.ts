import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { rpc } from '$lib/query';

const EXTERNAL_RECORDING_EVENTS = {
	toggleManualRecording: 'external://toggle-manual-recording',
	startManualRecording: 'external://start-manual-recording',
	stopManualRecording: 'external://stop-manual-recording',
} as const;

type ExternalRecordingEvent =
	(typeof EXTERNAL_RECORDING_EVENTS)[keyof typeof EXTERNAL_RECORDING_EVENTS];

function dispatchExternalRecordingCommand(event: ExternalRecordingEvent) {
	switch (event) {
		case EXTERNAL_RECORDING_EVENTS.toggleManualRecording:
			rpc.commands.toggleManualRecording.execute(undefined);
			break;
		case EXTERNAL_RECORDING_EVENTS.startManualRecording:
			rpc.commands.startManualRecording.execute(undefined);
			break;
		case EXTERNAL_RECORDING_EVENTS.stopManualRecording:
			rpc.commands.stopManualRecording.execute(undefined);
			break;
	}
}

/**
 * Listens for recording commands invoked from outside the app (CLI flags, GNOME
 * custom shortcuts, second-instance IPC). Returns a cleanup function.
 */
export async function registerExternalCommands(): Promise<() => void> {
	const unlisteners: UnlistenFn[] = [];

	for (const event of Object.values(EXTERNAL_RECORDING_EVENTS)) {
		unlisteners.push(
			await listen(event, () => {
				dispatchExternalRecordingCommand(event);
			}),
		);
	}

	const pending = await invoke<string | null>(
		'take_pending_external_recording_command',
	);
	if (pending && isExternalRecordingEvent(pending)) {
		dispatchExternalRecordingCommand(pending);
	}

	return () => {
		for (const unlisten of unlisteners) {
			unlisten();
		}
	};
}

function isExternalRecordingEvent(
	event: string,
): event is ExternalRecordingEvent {
	return Object.values(EXTERNAL_RECORDING_EVENTS).includes(
		event as ExternalRecordingEvent,
	);
}
