import { z } from "zod";
import { voices } from "..";
import type { SpeakParams } from "../api";
import { spawnFFmpeg } from "../misc/ffmpeg";

export const generateSpeech = ({
  model,
  speed,
  sentenceSilence,
  text,
  speaker,
  format,
  pitch,
}: SpeakParams): ReadableStream => {
  const voice = voices[model];
  const pcmStream: ReadableStream = voice.synthesize(
    text,
    speaker,
    1 + (1 - speed)
  );

  if (format === "pcm" && pitch === 1) {
    return pcmStream;
  } else {
    const ffmpegProcess = spawnFFmpeg({ format, pitch });

    async function writeInputToFFmpeg() {
      for await (const chunk of pcmStream) {
        ffmpegProcess.stdin.write(Buffer.from(chunk));
      }
      ffmpegProcess.stdin.end();
    }
    writeInputToFFmpeg();

    const ouputStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of ffmpegProcess.stdout) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    return ouputStream;
  }
};

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
