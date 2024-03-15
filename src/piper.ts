import { voices } from "..";
import type { OutputFormat, SpeakParams } from "./api";
import { spawn } from "child_process";
import { Readable } from "stream";

const getCodec = (format: OutputFormat) => {
  switch (format) {
    case "mp3":
      return "libmp3lame";
    case "wav":
      return "pcm_s16le";
    case "pcm":
      return "pcm_s16le";
  }
};

export const generateSpeech = ({
  model,
  speed,
  sentenceSilence,
  text,
  speaker,
  format,
}: SpeakParams): ReadableStream => {
  const voice = voices[model];
  const pcmStream: ReadableStream = voice.synthesize(text, speaker, speed);

  if (format === "pcm") {
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
      getCodec(format),
      "-q:a",
      "2",
      "-f",
      format,
      "-",
    ]);

    Readable.fromWeb(pcmStream).pipe(ffmpegProcess.stdin);
    return Readable.toWeb(ffmpegProcess.stdout);
  }
};
