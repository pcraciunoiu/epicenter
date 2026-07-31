<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import { rpc } from '$lib/query';
	import { settings } from '$lib/stores/settings.svelte';
	import { IS_LINUX } from '$lib/constants/platform';
	import { cn } from '@epicenter/ui/utils';
	import CaptionsIcon from '@lucide/svelte/icons/captions';

	let { class: className }: { class?: string } = $props();

	const isEnabled = $derived(
		settings.value['recording.manual.segmentsEnabled'],
	);

	function toggle() {
		const next = !settings.value['recording.manual.segmentsEnabled'];
		settings.updateKey('recording.manual.segmentsEnabled', next);
		if (next && IS_LINUX) {
			rpc.notify.warning.execute({
				title: 'Dictation segments need WebView mic',
				description:
					'Same limitation as Voice Activated mode on Linux (WebKitGTK getUserMedia). If start fails, use Manual recording without segments. See github.com/EpicenterHQ/epicenter/issues/839',
			});
		}
	}
</script>

<Button
	class={cn(className)}
	tooltip={isEnabled
		? IS_LINUX
			? 'Dictation segments on — may fail on Linux (needs WebView mic)'
			: 'Dictation segments on — phrases insert after each pause'
		: 'Dictation segments off'}
	onclick={toggle}
	variant="ghost"
	size="icon"
	aria-pressed={isEnabled}
>
	<CaptionsIcon
		class={cn('size-4', isEnabled ? 'text-green-500' : 'opacity-60')}
	/>
</Button>
