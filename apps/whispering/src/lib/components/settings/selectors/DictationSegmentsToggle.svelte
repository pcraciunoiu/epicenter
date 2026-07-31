<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import { settings } from '$lib/stores/settings.svelte';
	import { cn } from '@epicenter/ui/utils';
	import CaptionsIcon from '@lucide/svelte/icons/captions';

	let { class: className }: { class?: string } = $props();

	const isEnabled = $derived(
		settings.value['recording.manual.segmentsEnabled'],
	);

	function toggle() {
		settings.updateKey(
			'recording.manual.segmentsEnabled',
			!settings.value['recording.manual.segmentsEnabled'],
		);
	}
</script>

<Button
	class={cn(className)}
	tooltip={isEnabled
		? 'Dictation segments on — phrases insert after each pause'
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
