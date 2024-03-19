import type { OutputFormat } from "../api";
import { spawn } from "child_process";

export const getCodec = (format: OutputFormat) => {
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

export const getOutputFormat = (format: OutputFormat) => {
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

export const spawnFFmpeg = ({
  format,
  pitch,
}: {
  format: OutputFormat;
  pitch: number;
}) => {
  return spawn("ffmpeg", [
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
};
