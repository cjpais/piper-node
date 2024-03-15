import { z } from "zod";
import { SpeakParamsSchema, SpeakerModels } from "./src/api";
import { generateSpeech } from "./src/piper";
import { PiperVoice, phonemize } from "./src/runtime/run";

export const validateAuthToken = (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.split(" ")[1];
  if (token !== process.env.SECRET) return false;

  return true;
};

const handleSpeakRequest = async (req: Request) => {
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
  const stream = generateSpeech(params);

  const response = new Response(stream, {
    headers: {
      "Content-Type": "audio/mpeg", // TODO set proper content type based on format
      "Transfer-Encoding": "chunked",
    },
  });

  return response;
};

const PhonemizeRequestSchema = z.object({
  text: z.string(),
});

const handlePhonemizeRequest = async (req: Request) => {
  if (req.method !== "POST")
    return new Response("wrong method", {
      status: 405,
    });

  const body = await req.json();
  const { text } = PhonemizeRequestSchema.parse(body);

  const results = await phonemize(text);

  return new Response(JSON.stringify({ results }), {
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const semaine = new PiperVoice(
  `${process.env.MODEL_PATH}/semaine-medium.onnx`
);
export const ryan = new PiperVoice(
  `${process.env.MODEL_PATH}/ryan-medium.onnx`
);
semaine.load();
ryan.load();

export const voices: Record<SpeakerModels, PiperVoice> = {
  semaine,
  ryan,
};

const main = async () => {
  Bun.serve({
    port: process.env.PORT || 42069,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/") return new Response("Home page!");
      if (url.pathname === "/speak") return handleSpeakRequest(req);
      if (url.pathname === "/phonemize") return handlePhonemizeRequest(req);

      return new Response("404!");
    },
  });
};

main();
