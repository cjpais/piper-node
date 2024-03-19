import { voices } from "..";
import type { OutputFormat, SpeakParams } from "./api";
import { spawn } from "child_process";
import { Readable } from "stream";

const getCodec = (format: OutputFormat) => {
  switch (format) {
    case "mp3":
      return ["libmp3lame"];
    case "wav":
      return ["pcm_s16le"];
    case "pcm":
      return ["pcm_s16le"];
    case "ogg":
      return ["libvorbis"];
  }
};

const getOutputFormat = (format: OutputFormat) => {
  switch (format) {
    case "mp3":
      return ["mp3"];
    case "wav":
      return ["wav"];
    case "pcm":
      return ["s16le"];
    case "ogg":
      return ["ogg"];
  }
};

const getFilters = ({ pitch }: { pitch: number }) => {
  const filters = [];
  if (pitch != 1) {
    filters.push("-filter:a", `rubberband=pitch=${pitch}`);
  }
  return filters;
};

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
  const pcmStream: ReadableStream = voice.synthesize(text, speaker, speed);

  if (format === "pcm" && pitch === 1) {
    return pcmStream;
  } else {
    const ffmpegProcess = spawn("ffmpeg", [
      "-f",
      "s16le",
      "-ar",
      "22050",
      "-ac",
      "1",
      "-i",
      "-",
      "-acodec",
      ...getCodec(format),
      "-f",
      ...getOutputFormat(format),
      ...getFilters({ pitch }),
      "-",
    ]);

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
