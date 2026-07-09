<script lang="ts">
	/**
	 * Native audio controls that defer setting `src` until the user interacts.
	 *
	 * On Linux/WebKitGTK, assigning `src` registers an MPRIS media-player session.
	 * Eagerly updating `src` after each recording (e.g. home-page latest) stacks
	 * ghost GNOME media cards. Keeping `src` unset until interaction avoids that.
	 */
	let {
		src,
		class: className = '',
		style = '',
	}: {
		src: string;
		class?: string;
		style?: string;
	} = $props();

	let audioEl: HTMLAudioElement | undefined = $state();
	let attachedSrc: string | null = $state(null);

	$effect(() => {
		// Recording changed: unload so WebKit can drop any MPRIS session.
		if (attachedSrc !== null && attachedSrc !== src && audioEl) {
			audioEl.pause();
			audioEl.removeAttribute('src');
			audioEl.load();
			attachedSrc = null;
		}
	});

	function attachSrc() {
		if (!audioEl || !src || attachedSrc === src) return false;
		audioEl.src = src;
		attachedSrc = src;
		return true;
	}

	/** Prefer attaching before the native play click is processed. */
	function attachSrcOnInteract() {
		attachSrc();
	}

	/** Keyboard / accessibility fallback if pointerdown did not run. */
	async function attachSrcOnPlay() {
		if (!attachSrc() || !audioEl) return;
		await audioEl.play();
	}
</script>

<audio
	bind:this={audioEl}
	class={className}
	{style}
	controls
	preload="none"
	onpointerdown={attachSrcOnInteract}
	onplay={attachSrcOnPlay}
>
	Your browser does not support the audio element.
</audio>
