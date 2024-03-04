import z from "zod";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

const SpeakParams = z.object({
  text: z.string(),
  speaker: z.number().optional(),
});

function spawnProcess(
  command: string,
  args: string[] = [],
  inputData?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);

    let stdoutData: string = "";
    let stderrData: string = "";

    process.stdout.on("data", (data: Buffer) => {
      stdoutData += data.toString();
    });

    process.stderr.on("data", (data: Buffer) => {
      stderrData += data.toString();
    });

    process.on("close", (code: number) => {
      if (code === 0) {
        resolve(stdoutData);
      } else {
        reject(
          new Error(`Process exited with code ${code}\nstderr: ${stderrData}`)
        );
      }
    });

    process.on("error", (error: Error) => {
      reject(error);
    });

    // If inputData is provided, write it to the stdin of the process
    if (inputData !== undefined) {
      process.stdin.write(inputData);
      process.stdin.end(); // Ensure to close the stdin to signal that no more data will be written
    }
  });
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
    port: 42069,
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
        console.log("put in", text, speaker);
        const uuid = uuidv4();
        const filename = `${uuid}.wav`;

        const tStart = Date.now();
        const r = await spawnProcess(
          "piper",
          [
            "--model",
            "/home/cj/models/piper/semaine-medium.onnx",
            "--json-input",
          ],
          JSON.stringify({ text, speaker, output_file: filename })
        );
        console.log("Took", Date.now() - tStart, "ms");

        const response = new Response(Bun.file(filename), {
          headers: {
            "Content-Type": "audio/wav",
          },
        });

        fs.unlink(filename, (err) => {
          if (err) {
            console.error(err);
            return;
          }
        });

        return response;
      }
      return new Response("404!");
    },
  });
};

main();
