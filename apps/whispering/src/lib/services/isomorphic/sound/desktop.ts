import { extractErrorMessage } from 'wellcrafted/error';
import { tryAsync } from 'wellcrafted/result';
import type { PlaySoundService } from '.';
import { playUiSound } from './assets';
import { PlaySoundServiceErr } from './types';

export function createPlaySoundServiceDesktop(): PlaySoundService {
	return {
		playSound: async (soundName) =>
			tryAsync({
				try: async () => {
					await playUiSound(soundName);
				},
				catch: (error) =>
					PlaySoundServiceErr({
						message: `Failed to play sound: ${extractErrorMessage(error)}`,
					}),
			}),
	};
}
