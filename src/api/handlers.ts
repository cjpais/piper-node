import { z } from "zod";
import { SpeakParamsSchema, type OutputFormat } from ".";
import { validateAuthToken } from "./middleware";
import { generateSpeech, phonemize } from "../piper";
import { devlog } from "../misc/utils";

const getContentType = (format: OutputFormat) => {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "pcm":
      return "audio/x-raw";
    case "ogg":
      return "audio/ogg";
  }
};

export const handleSpeakRequest = async (req: Request) => {
  if (req.method !== "POST") {
    devlog("wrong method");
    return new Response("wrong method", {
      status: 405,
    });
  }

  if (!validateAuthToken(req)) {
    devlog("invalid auth token");
    return new Response("invalid auth token", {
      status: 401,
    });
  }

  const body = await req.json();

  const params = SpeakParamsSchema.parse(body);
  const stream = generateSpeech(params);

  const response = new Response(stream, {
    headers: {
      "Content-Type": getContentType(params.format),
      "Transfer-Encoding": "chunked",
    },
  });

  return response;
};

const PhonemizeRequestSchema = z.object({
  text: z.string(),
});

export const handlePhonemizeRequest = async (req: Request) => {
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
