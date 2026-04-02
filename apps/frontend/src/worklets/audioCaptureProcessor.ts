import { AUDIO_CAPTURE_CHUNK_SIZE, Float32ChunkAccumulator } from '../hooks/audioCaptureUtils';

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
