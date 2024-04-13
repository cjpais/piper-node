// @ts-ignore
import * as ort from "onnxruntime-node";
import { phonemize } from ".";

export const synthesizeStream = (
  text: string,
  speaker: number = 0,
  config: any,
  session: ort.InferenceSession,
  speed?: number
) => {
  // TODO split sentences via regex and add punctuation back properly.
  // TODO add delay between sentences
  let sentences = text.split(/(?<=[.!?]\s)(?=\S)|(?<=[\n])/g);
  sentences = sentences
    .map((s) => s.replaceAll(/[^\x20-\x7E]/g, ""))
    .filter((sentence) => sentence.length > 0);

  console.log("cleaned sentences: ", sentences);
  const stream = new ReadableStream({
    async pull(controller) {
      for (let i = 0; i < sentences.length; i++) {
        let sentence = sentences[i];
        // console.log("Synthesizing", sentence, config.espeak.voice);
        const phonemeData = await phonemize(sentence, config.espeak.voice);
        const bigIntPhonemeIds = phonemeData.phoneme_ids.map((id) =>
          BigInt(id)
        );

        const noise_scale = config.inference.noise_scale;
        const length_scale = speed || config.inference.length_scale;
        const noise_w = config.inference.noise_w;

        const scales = Float32Array.from([noise_scale, length_scale, noise_w]);
        const phonemeIds = BigInt64Array.from(bigIntPhonemeIds);
        const phonemeIdsLength = BigInt64Array.from([
          BigInt(phonemeIds.length),
        ]);

        let sid: undefined | BigInt64Array;
        if (config.num_speakers > 0) {
          sid = BigInt64Array.from([BigInt(speaker)]);
        }

        const scaleTensor = new ort.Tensor("float32", scales, [3]);
        const phonemeTensor = new ort.Tensor("int64", phonemeIds, [
          1,
          phonemeIds.length,
        ]);
        const phonemeLengthTensor = new ort.Tensor("int64", phonemeIdsLength, [
          1,
        ]);

        // TODO give it the actual types
        let args: any = {
          input: phonemeTensor,
          input_lengths: phonemeLengthTensor,
          scales: scaleTensor,
        };

        if (sid) {
          args["sid"] = new ort.Tensor("int64", sid, [1]);
        }

        const startTime = Date.now();
        const audio = await session.run(args);
        const pcm = convertFloat32ToInt16(audio.output.cpuData);
        console.log(
          "Synthesized",
          sentence,
          "in",
          Date.now() - startTime,
          "ms"
        );
        controller.enqueue(pcm.buffer);
      }
      controller.close();
    },
  });
  return stream;
};

function convertFloat32ToInt16(
  buffer: Float32Array,
  maxWavValue: number = 32767
) {
  let l = buffer.length;
  let buf = new Int16Array(l);

  // Calculate the maximum absolute value in the buffer
  let maxAbsValue = 0;
  for (let i = 0; i < l; i++) {
    if (Math.abs(buffer[i]) > maxAbsValue) {
      maxAbsValue = Math.abs(buffer[i]);
    }
  }

  // Avoid division by zero or very low max values (similar to max(0.01, ...))
  let normalizationFactor = maxWavValue / Math.max(0.01, maxAbsValue);

  for (let i = 0; i < l; i++) {
    // Normalize based on the maximum value, similar to the Python version
    let normalizedSample = buffer[i] * normalizationFactor;

    // Clip the values to ensure they are within the int16 range
    normalizedSample = Math.max(
      -maxWavValue,
      Math.min(maxWavValue, normalizedSample)
    );

    // Convert to int16
    buf[i] = Math.round(normalizedSample);
  }

  return buf;
}
