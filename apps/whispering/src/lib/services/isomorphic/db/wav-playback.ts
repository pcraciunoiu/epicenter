function readFourCC(view: DataView, offset: number): string {
	return String.fromCharCode(
		view.getUint8(offset),
		view.getUint8(offset + 1),
		view.getUint8(offset + 2),
		view.getUint8(offset + 3),
	);
}

function writeFourCC(view: DataView, offset: number, value: string): void {
	for (let i = 0; i < 4; i++) {
		view.setUint8(offset + i, value.charCodeAt(i));
	}
}

/**
 * WebKitGTK (and most HTML5 audio elements) cannot decode IEEE float WAV files.
 * CPAL recordings are saved as 32-bit float, so convert to 16-bit PCM for playback.
 */
export async function ensurePlayableWavBlob(blob: Blob): Promise<Blob> {
	const buffer = await blob.arrayBuffer();
	if (buffer.byteLength < 44) return blob;

	const view = new DataView(buffer);
	if (readFourCC(view, 0) !== 'RIFF' || readFourCC(view, 8) !== 'WAVE') {
		return blob;
	}

	const audioFormat = view.getUint16(20, true);
	if (audioFormat !== 3) return blob;

	const numChannels = view.getUint16(22, true);
	const sampleRate = view.getUint32(24, true);
	const bitsPerSample = view.getUint16(34, true);
	if (bitsPerSample !== 32) return blob;

	let dataOffset = 0;
	let dataSize = 0;
	for (let offset = 12; offset + 8 <= buffer.byteLength; ) {
		const chunkId = readFourCC(view, offset);
		const chunkSize = view.getUint32(offset + 4, true);
		if (chunkId === 'data') {
			dataOffset = offset + 8;
			dataSize = chunkSize;
			break;
		}
		offset += 8 + chunkSize + (chunkSize % 2);
	}

	if (dataSize === 0 || dataOffset + dataSize > buffer.byteLength) {
		return blob;
	}

	const numSamples = dataSize / 4;
	const pcmData = new Int16Array(numSamples);
	for (let i = 0; i < numSamples; i++) {
		const sample = view.getFloat32(dataOffset + i * 4, true);
		const clamped = Math.max(-1, Math.min(1, sample));
		pcmData[i] =
			clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
	}

	const pcmBytes = numSamples * 2;
	const headerSize = 44;
	const out = new ArrayBuffer(headerSize + pcmBytes);
	const outView = new DataView(out);

	writeFourCC(outView, 0, 'RIFF');
	outView.setUint32(4, headerSize + pcmBytes - 8, true);
	writeFourCC(outView, 8, 'WAVE');
	writeFourCC(outView, 12, 'fmt ');
	outView.setUint32(16, 16, true);
	outView.setUint16(20, 1, true);
	outView.setUint16(22, numChannels, true);
	outView.setUint32(24, sampleRate, true);
	outView.setUint32(28, sampleRate * numChannels * 2, true);
	outView.setUint16(32, numChannels * 2, true);
	outView.setUint16(34, 16, true);
	writeFourCC(outView, 36, 'data');
	outView.setUint32(40, pcmBytes, true);
	new Int16Array(out, headerSize).set(pcmData);

	return new Blob([out], { type: 'audio/wav' });
}
