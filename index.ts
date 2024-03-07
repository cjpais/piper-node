import z from "zod";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

const SpeakParams = z.object({
  text: z.string(),
  speaker: z.number().optional(),
  // stream: z.boolean().optional().default(false),
});

function spawnProcessStream(
  command: string,
  args: string[] = [],
  inputData?: string
): ReadableStream {
  const process = spawn(command, args);

  if (inputData !== undefined) {
    process.stdin.write(inputData);
    process.stdin.end();
  }

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
    "libmp3lame",
    "-q:a",
    "2",
    "-f",
    "mp3",
    "-",
  ]);

  process.stdout.pipe(ffmpegProcess.stdin);

  let isControllerClosed = false; // Flag to track if the controller has been closed

  const webStream = new ReadableStream({
    start(controller) {
      ffmpegProcess.stdout.on("data", (chunk) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      ffmpegProcess.stdout.on("end", () => {
        if (!isControllerClosed) {
          controller.close();
          isControllerClosed = true; // Set flag to indicate the controller is closed
        }
      });
      ffmpegProcess.stderr.on("data", (data) => {
        // console.error(`ffmpeg stderr: ${data}`);
      });
      ffmpegProcess.on("error", (err) => {
        console.error(`ffmpeg process error: ${err}`);
        if (!isControllerClosed) {
          controller.error(err); // Properly signal an error to the stream
          isControllerClosed = true; // Set flag to indicate the controller is closed
        }
      });
      ffmpegProcess.on("close", (code) => {
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
      ffmpegProcess.kill(); // Ensure the ffmpeg process is terminated if the stream is canceled
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
        console.log(body);

        const { text, speaker } = SpeakParams.parse(body);
        // const uuid = uuidv4();
        // const filename = `${uuid}.wav`;

        const tStart = Date.now();
        const stream = await spawnProcessStream(
          "piper",
          [
            "--model",
            "/home/cj/models/piper/semaine-medium.onnx",
            "--use-cuda",
            "--output-raw",
            "--json-input",
          ],
          JSON.stringify({ text, speaker })
        );
        console.log("Took", Date.now() - tStart, "ms");
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
