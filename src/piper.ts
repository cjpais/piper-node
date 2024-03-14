import type { OutputFormat, SpeakParams } from "./api";
import { spawn } from "child_process";

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

export const generatePiperSpeech = ({
  model,
  speed,
  sentenceSilence,
  text,
  speaker,
  format,
}: SpeakParams): ReadableStream => {
  const startTime = Date.now();
  let chunkSent = false;

  let outputProcess = spawn("piper", [
    "--model",
    `${process.env.MODEL_PATH}/${model}.onnx`,
    "--output-raw",
    "--length_scale",
    `${speed}`,
    "--sentence-silence",
    `${sentenceSilence}`,
    "--json-input",
  ]);

  const input = JSON.stringify({ text, speaker });

  console.log("num characters", text.length);
  outputProcess.stderr.on("data", (data) => {
    if (
      data.toString().includes("Real-time") ||
      data.toString().includes("Loaded voice")
    ) {
      console.log(data.toString());
    }
  });

  outputProcess.stdin.write(input);
  outputProcess.stdin.end();

  if (format !== "pcm") {
    // console.log("Using ffmpeg to convert to", format);
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

    outputProcess.stdout.pipe(ffmpegProcess.stdin);
    outputProcess = ffmpegProcess;
  }

  let isControllerClosed = false; // Flag to track if the controller has been closed

  const webStream = new ReadableStream({
    start(controller) {
      outputProcess.stdout.on("data", (chunk) => {
        if (!chunkSent) {
          console.log("Took", Date.now() - startTime, "ms for the first chunk");
          chunkSent = true;
        }
        controller.enqueue(new Uint8Array(chunk));
      });
      outputProcess.stdout.on("end", () => {
        if (!isControllerClosed) {
          controller.close();
          isControllerClosed = true; // Set flag to indicate the controller is closed
          // console.log(
          //   "Took",
          //   Date.now() - startTime,
          //   "ms for the stream to end"
          // );
        }
      });
      outputProcess.stderr.on("data", (data) => {
        // console.error(`ffmpeg stderr: ${data}`);
      });
      outputProcess.on("error", (err) => {
        console.error(`ffmpeg process error: ${err}`);
        if (!isControllerClosed) {
          controller.error(err); // Properly signal an error to the stream
          isControllerClosed = true; // Set flag to indicate the controller is closed
        }
      });
      outputProcess.on("close", (code) => {
        if (code !== 0) {
          console.error(`ffmpeg process exited with code ${code}`);
          if (!isControllerClosed) {
            controller.error(
              new Error(`ffmpeg process exited with code ${code}`)
            );
            isControllerClosed = true; // Set flag to indicate the controller is closed
          }
        } else {
          if (!isControllerClosed) {
            controller.close(); // Only close the controller when the process exits successfully
            isControllerClosed = true; // Set flag to indicate the controller is closed
          }
        }
      });
    },
    cancel(reason) {
      console.log(`Stream canceled with reason: ${reason}`);
      outputProcess.kill(); // Ensure the ffmpeg process is terminated if the stream is canceled
    },
  });

  return webStream;
};
