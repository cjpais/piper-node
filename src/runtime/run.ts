// @ts-ignore
import * as ort from "onnxruntime-node";
import { z } from "zod";

const PhonemizeSchema = z.object({
  phoneme_ids: z.array(z.number()),
  phonemes: z.array(z.string()),
  processed_text: z.string(),
  text: z.string(),
});

export const phonemize = async (text: string, lang: string = "en-us") => {
  const p = Bun.spawn(
    [
      "/usr/local/bin/piper_phonemize",
      "-l",
      lang,
      "--espeak-data",
      "/usr/local/bin/espeak-ng-data",
    ],
    {
      stdin: Buffer.from(text),
    }
  );

  let chunks = [];
  for await (const chunk of p.stdout) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const json = JSON.parse(buffer.toString());
  const result = PhonemizeSchema.parse(json);

  return result;
};

export class PiperVoice {
  session: ort.InferenceSession;
  configPath: string;
  modelPath: string;
  config: any;

  constructor(modelPath: string) {
    this.modelPath = modelPath;
    this.configPath = `${modelPath}.json`;
  }

  async load() {
    this.config = await Bun.file(this.configPath).json();
    const providers = ["cpu"]; // add coreml, cuda if supported

    this.session = await ort.InferenceSession.create(this.modelPath, {
      executionProviders: providers,
    });
  }

  synthesize(text: string, speaker: number = 0, speed?: number) {
    return synthesizeStream(text, speaker, this.config, this.session, speed);
  }
}

const synthesizeStream = (
  text: string,
  speaker: number = 0,
  config: any,
  session: ort.InferenceSession,
  speed?: number
) => {
  // TODO split sentences via regex and add punctuation back properly.
  // TODO add delay between sentences
  const sentences = text.split(".");
  if (sentences[sentences.length - 1] === "") sentences.pop();

  console.log("sentences", sentences);
  const stream = new ReadableStream<Int16Array>({
    type: "direct",
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
        controller.write(pcm);
      }
      controller.close();
    },
  });
  return stream;
};

function convertFloat32ToInt16(buffer: Float32Array) {
  let l = buffer.length;
  let buf = new Int16Array(l);

  while (l--) {
    // Scale the float32 value (-1.0 to 1.0) to int16 range and clamp the values
    let s = Math.max(-1, Math.min(1, buffer[l]));
    buf[l] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return buf;
}
