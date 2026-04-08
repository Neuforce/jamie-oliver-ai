// AudioWorklet processor — must be plain JavaScript (no TypeScript syntax).
// Vite's ?url import copies .ts files as raw assets without compilation,
// causing an AbortError when the browser tries to parse TypeScript as JS.
// Using a .js file with the new URL(..., import.meta.url) pattern ensures
// Vite compiles and hashes this correctly for production builds.
//
// All dependencies are inlined here. AudioWorklet modules run in a fully
// isolated scope and cannot import from the main application bundle.

const AUDIO_CAPTURE_CHUNK_SIZE = 4096;

class Float32ChunkAccumulator {
  constructor(targetFrames = AUDIO_CAPTURE_CHUNK_SIZE) {
    this.targetFrames = targetFrames;
    this.bufferedFrames = 0;
    this.buffer = new Float32Array(targetFrames);
  }

  push(inputData, onChunk) {
    let readOffset = 0;

    while (readOffset < inputData.length) {
      const remainingCapacity = this.targetFrames - this.bufferedFrames;
      const framesToCopy = Math.min(remainingCapacity, inputData.length - readOffset);

      this.buffer.set(inputData.subarray(readOffset, readOffset + framesToCopy), this.bufferedFrames);
      this.bufferedFrames += framesToCopy;
      readOffset += framesToCopy;

      if (this.bufferedFrames === this.targetFrames) {
        onChunk(this.buffer.slice());
        this.bufferedFrames = 0;
      }
    }
  }

  reset() {
    this.bufferedFrames = 0;
    this.buffer = new Float32Array(this.targetFrames);
  }
}

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.accumulator = new Float32ChunkAccumulator(AUDIO_CAPTURE_CHUNK_SIZE);
  }

  process(inputs) {
    const inputData = inputs[0]?.[0];

    if (!inputData?.length) {
      return true;
    }

    this.accumulator.push(inputData, (chunk) => {
      this.port.postMessage(
        { type: 'audio-chunk', payload: chunk.buffer },
        [chunk.buffer]
      );
    });

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
