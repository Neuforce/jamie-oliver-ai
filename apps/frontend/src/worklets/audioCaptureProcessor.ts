// AudioWorklet modules run in an isolated scope and cannot import from the
// main application bundle.  All dependencies must be inlined here.
// DO NOT add any import statements — they will cause an AbortError in
// production builds, forcing a fallback to the deprecated ScriptProcessorNode.

const AUDIO_CAPTURE_CHUNK_SIZE = 4096;

class Float32ChunkAccumulator {
  private readonly targetFrames: number;
  private bufferedFrames = 0;
  private buffer: Float32Array;

  constructor(targetFrames = AUDIO_CAPTURE_CHUNK_SIZE) {
    this.targetFrames = targetFrames;
    this.buffer = new Float32Array(targetFrames);
  }

  push(inputData: Float32Array, onChunk: (chunk: Float32Array) => void) {
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

const AUDIO_CAPTURE_PROCESSOR_NAME = 'audio-capture-processor';

class AudioCaptureProcessor extends AudioWorkletProcessor {
  private readonly accumulator = new Float32ChunkAccumulator(AUDIO_CAPTURE_CHUNK_SIZE);

  process(inputs: Float32Array[][]): boolean {
    const inputData = inputs[0]?.[0];

    if (!inputData?.length) {
      return true;
    }

    this.accumulator.push(inputData, (chunk) => {
      this.port.postMessage(
        {
          type: 'audio-chunk',
          payload: chunk.buffer,
        },
        [chunk.buffer]
      );
    });

    return true;
  }
}

registerProcessor(AUDIO_CAPTURE_PROCESSOR_NAME, AudioCaptureProcessor);
