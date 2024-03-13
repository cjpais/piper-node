import { SpeakParamsSchema } from "./src/api";
import { generatePiperSpeech } from "./src/piper";

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
  const stream = await generatePiperSpeech(params);

  const response = new Response(stream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Transfer-Encoding": "chunked",
    },
  });

  return response;
};

const main = async () => {
  Bun.serve({
    port: process.env.PORT || 42069,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/") return new Response("Home page!");
      if (url.pathname === "/speak") return handleSpeakRequest(req);

      return new Response("404!");
    },
  });
};

main();
