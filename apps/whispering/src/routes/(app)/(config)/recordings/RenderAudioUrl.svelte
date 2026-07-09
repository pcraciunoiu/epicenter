<script lang="ts">
	import LazyAudio from '$lib/components/LazyAudio.svelte';
	import { rpc } from '$lib/query';
	import { services } from '$lib/services';
	import { viewTransition } from '$lib/utils/viewTransitions';
	import { createQuery } from '@tanstack/svelte-query';
	import { onDestroy } from 'svelte';

	let { id }: { id: string } = $props();

	const audioUrlQuery = createQuery(
		() => rpc.db.recordings.getAudioPlaybackUrl(() => id).options,
	);

	onDestroy(() => {
		// Clean up audio URL when component unmounts to prevent memory leaks
		services.db.recordings.revokeAudioUrl(id);
	});
</script>

{#if audioUrlQuery.data}
	<LazyAudio
		class="h-8"
		style="view-transition-name: {viewTransition.recording(id).audio}"
		src={audioUrlQuery.data}
	/>
{/if}
