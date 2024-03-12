import z from "zod";
import { spawn } from "child_process";

const SpeakerModels = z.enum([
  "semaine-medium",
  // "joe-medium",
  "ryan-medium",
  // "hfc_male-medium",
]);
type SpeakerModels = z.infer<typeof SpeakerModels>;

const OutputFormats = z.enum(["mp3", "wav", "pcm"]);
type OutputFormat = z.infer<typeof OutputFormats>;

const SpeakParamsSchema = z.object({
  text: z.string(),
  model: SpeakerModels.optional().default("semaine-medium"),
  speaker: z.number().optional(),
  speed: z.number().optional().default(1.0),
  sentenceSilence: z.number().optional().default(0.2),
  format: OutputFormats.optional().default("mp3"),
});
type SpeakParams = z.infer<typeof SpeakParamsSchema>;

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

function spawnProcessStream({
  model,
  speed,
  sentenceSilence,
  text,
  speaker,
  format,
}: SpeakParams): ReadableStream {
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
}

export const validateAuthToken = (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.split(" ")[1];
  if (token !== process.env.SECRET) return false;

  return true;
};

const main = async () => {
  Bun.serve({
    port: process.env.PORT || 42069,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/") return new Response("Home page!");
      if (url.pathname === "/speak") {
        if (req.method !== "POST")
          return new Response("wrong method", {
            status: 405,
          });

        if (!validateAuthToken(req))
          return new Response("invalid auth token", {
            status: 401,
          });

        const body = await req.json();

        const params = SpeakParamsSchema.parse(body);
        // const uuid = uuidv4();
        // const filename = `${uuid}.wav`;

        const tStart = Date.now();
        const stream = await spawnProcessStream(params);
        // console.log("Took", Date.now() - tStart, "ms");
        // stream.

        const response = new Response(stream, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Transfer-Encoding": "chunked",
          },
        });

        // fs.unlink(filename, (err) => {
        //   if (err) {
        //     console.error(err);
        //     return;
        //   }
        // });

        return response;
      }
      return new Response("404!");
    },
  });
};

main();
