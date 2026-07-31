import { extractErrorMessage } from 'wellcrafted/error';
import { Ok, tryAsync } from 'wellcrafted/result';
import type { PlaySoundService } from '.';
import { playUiSound } from './assets';
import { PlaySoundServiceErr } from './types';

export function createPlaySoundServiceWeb(): PlaySoundService {
	return {
		playSound: async (soundName) => {
			if (document.hidden) {
				return Ok(undefined);
			}
			return tryAsync({
				try: async () => {
					await playUiSound(soundName);
				},
				catch: (error) =>
					PlaySoundServiceErr({
						message: `Failed to play sound: ${extractErrorMessage(error)}`,
					}),
			});
		},
	};
}
