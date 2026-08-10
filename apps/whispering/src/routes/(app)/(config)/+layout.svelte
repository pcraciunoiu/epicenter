<script lang="ts">
	import { commandCallbacks } from '$lib/commands';
	import NavItems from '$lib/components/NavItems.svelte';
	import { Button } from '@epicenter/ui/button';
	import {
		RecordingModeSelector,
		CompressionSelector,
		DictationSegmentsToggle,
		TranscriptionSelector,
		TransformationSelector,
	} from '$lib/components/settings';
	import ManualDeviceSelector from '$lib/components/settings/selectors/ManualDeviceSelector.svelte';
	import VadDeviceSelector from '$lib/components/settings/selectors/VadDeviceSelector.svelte';
	import {
		RECORDER_STATE_TO_ICON,
		VAD_STATE_TO_ICON,
	} from '$lib/constants/audio';
	import { rpc } from '$lib/query';
	import { vadRecorder } from '$lib/stores/vad-recorder.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { viewTransition } from '$lib/utils/viewTransitions';
	import { cn } from '@epicenter/ui/utils';
	import { createQuery } from '@tanstack/svelte-query';
	import { MediaQuery } from 'svelte/reactivity';

	const getRecorderStateQuery = createQuery(
		() => rpc.recorder.getRecorderState.options,
	);

	let { children } = $props();

	const isMobile = new MediaQuery('(max-width: 640px)');
</script>

<header
	class={cn(
		'border-border/40 bg-background/95 supports-backdrop-filter:bg-background/60 z-30 border-b shadow-xs backdrop-blur-sm',
		'flex h-14 w-full items-center justify-between px-4 sm:px-8',
	)}
	style="view-transition-name: {viewTransition.global.header}"
>
	<Button tooltip="Go home" href="/" variant="ghost" class="-ml-4">
		<span class="text-lg font-bold">whispering</span>
	</Button>

	<div class="flex items-center gap-1.5">
		<div class="flex items-center gap-1.5">
			{#if settings.value['recording.mode'] === 'manual'}
				{@const isManualSegmentsSession =
					vadRecorder.state === 'LISTENING' ||
					vadRecorder.state === 'SPEECH_DETECTED'}
				{#if getRecorderStateQuery.data === 'RECORDING' || isManualSegmentsSession}
					<Button
						tooltip={isManualSegmentsSession
							? 'Cancel dictation segments'
							: 'Cancel recording'}
						onclick={() => commandCallbacks.cancelManualRecording()}
						variant="ghost"
						size="icon"
						style="view-transition-name: {viewTransition.global.cancel};"
					>
						🚫
					</Button>
				{:else}
					<DictationSegmentsToggle />
					{#if settings.value['recording.manual.segmentsEnabled']}
						<VadDeviceSelector />
					{:else}
						<ManualDeviceSelector />
					{/if}
					<CompressionSelector />
					<TranscriptionSelector />
					<TransformationSelector />
				{/if}
				{#if getRecorderStateQuery.data === 'RECORDING' || isManualSegmentsSession}
					<Button
						tooltip={isManualSegmentsSession
							? 'Stop dictation segments'
							: 'Stop recording'}
						onclick={() => commandCallbacks.toggleManualRecording()}
						variant="ghost"
						size="icon"
						style="view-transition-name: {viewTransition.global.microphone}"
					>
						{isManualSegmentsSession
							? VAD_STATE_TO_ICON[vadRecorder.state]
							: RECORDER_STATE_TO_ICON[getRecorderStateQuery.data ?? 'IDLE']}
					</Button>
				{:else}
					<div class="flex">
						<Button
							tooltip="Start recording"
							onclick={() => commandCallbacks.toggleManualRecording()}
							variant="ghost"
							size="icon"
							style="view-transition-name: {viewTransition.global.microphone}"
							class="rounded-r-none border-r-0"
						>
							{RECORDER_STATE_TO_ICON[getRecorderStateQuery.data ?? 'IDLE']}
						</Button>
						<RecordingModeSelector class="rounded-l-none" />
					</div>
				{/if}
			{:else if settings.value['recording.mode'] === 'vad'}
				{#if vadRecorder.state === 'IDLE'}
					<VadDeviceSelector />
					<CompressionSelector />
					<TranscriptionSelector />
					<TransformationSelector />
				{/if}
				{#if vadRecorder.state === 'IDLE'}
					<div class="flex">
						<Button
							tooltip="Start voice activated recording"
							onclick={() => commandCallbacks.toggleVadRecording()}
							variant="ghost"
							size="icon"
							style="view-transition-name: {viewTransition.global.microphone}"
							class="rounded-r-none border-r-0"
						>
							{VAD_STATE_TO_ICON[vadRecorder.state]}
						</Button>
						<RecordingModeSelector class="rounded-l-none" />
					</div>
				{:else}
					<Button
						tooltip="Stop voice activated recording"
						onclick={() => commandCallbacks.toggleVadRecording()}
						variant="ghost"
						size="icon"
						style="view-transition-name: {viewTransition.global.microphone}"
					>
						{VAD_STATE_TO_ICON[vadRecorder.state]}
					</Button>
				{/if}
			{:else if settings.value['recording.mode'] === 'upload'}
				<CompressionSelector />
				<TranscriptionSelector />
				<TransformationSelector />
				<RecordingModeSelector />
			{:else if settings.value['recording.mode'] === 'live'}
				<ManualDeviceSelector />
				<CompressionSelector />
				<TranscriptionSelector />
				<TransformationSelector />
				<div class="flex">
					<Button
						tooltip="Toggle live recording"
						onclick={() => {
							// TODO: Implement live recording toggle
							alert('Live recording not yet implemented');
						}}
						variant="ghost"
						size="icon"
						style="view-transition-name: {viewTransition.global.microphone}"
						class="rounded-r-none border-r-0"
					>
						🎬
					</Button>
					<RecordingModeSelector class="rounded-l-none" />
				</div>
			{/if}
		</div>
		{#if settings.value['ui.layoutMode'] === 'nav-items'}
			<NavItems class="-mr-4" collapsed={isMobile.current} />
		{/if}
	</div>
</header>

<div class="flex-1 overflow-x-auto">
	{@render children()}
</div>
