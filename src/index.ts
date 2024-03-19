import { SpeakerModels } from "./api";
import { handlePhonemizeRequest, handleSpeakRequest } from "./api/handlers";
import { PiperVoice } from "./piper/voice";

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
