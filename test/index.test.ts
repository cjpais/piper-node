import { test, expect } from "bun:test";
import { spawn } from "node:child_process";
import { Readable } from "stream";
import {
  Inference,
  MistralProvider,
  WhisperCppProvider,
  createRateLimiter,
} from "@cjpais/inference";

const LocalWhisperProvider = new WhisperCppProvider({
  url: "http://localhost:8080",
});
const mistralProvider = new MistralProvider({
  apiKey: process.env.MISTRAL_API_KEY!,
});

const inference = new Inference({
  chatModels: {
    "mistral-small": {
      provider: mistralProvider,
      rateLimiter: createRateLimiter(1),
      providerModel: "mistral-small-latest",
      name: "mistral-small",
    },
  },
  audioModels: {
    local: {
      provider: LocalWhisperProvider,
      rateLimiter: createRateLimiter(1),
      providerModel: "local",
      name: "local",
    },
  },
});

const URL = "http://localhost:53098";
// const URL = "https://prod.geppetto.app";
//const URL = "http://5.78.87.239:10420";
// const URL = "https://geppetto-tts.fly.dev";
const BASE_PHRASE =
  "hello there, would you like to get balls deep in some beefy delight?";
const LONG_PHRASE =
  "Once upon a time, in a vast sky filled with twinkling stars and wandering clouds, there lived a radiant Sun named Solara. Solara was not just any sun; she was the heart of her solar system, a beacon of light and warmth for all the planets that danced around her in a splendid cosmic ballet. Despite her fiery exterior, Solara was the kindest celestial being. She took great pride in her job, rising early each morning to spread her golden rays across the universe. Her light touched everything, from the tiniest flower bud on Earth to the farthest asteroid drifting through space.";

const speak = async (
  text: string,
  format: string = "mp3",
  model = "semaine",
  speaker = 0
) => {
  return await fetch(`${URL}/speak`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TOKEN}`,
    },
    body: JSON.stringify({
      text,
      format,
      model,
      speaker,
    }),
  });
};

test(
  "profile pcm",
  async () => {
    // run 10 concurrent requests, time how long each one takes
    const start = Date.now();
    console.log(process.env.TOKEN);
    const test = await Promise.all(
      Array.from({ length: 15 }).map(async (i) => {
        const s = Date.now();
        const result = await speak(BASE_PHRASE, "pcm");
        // console.log(`Time taken : ${Date.now() - s}`);
        return result;
      })
    );

    console.log(test.length);

    const end = Date.now();
    console.log("100 Concurrent Time taken PCM: ", end - start);
  },
  { timeout: 60000 }
);

test(
  "profile mp3",
  async () => {
    // run 10 concurrent requests, time how long each one takes
    const start = Date.now();
    console.log(process.env.TOKEN);
    const test = await Promise.all(
      Array.from({ length: 10 }).map(async (i) => {
        const s = Date.now();
        const result = await speak(BASE_PHRASE, "mp3");
        console.log(`Time taken MP3: ${Date.now() - s}`);
        return result;
      })
    );

    console.log(test.length);

    const end = Date.now();
    console.log("50 Concurrent Time taken: ", end - start);
  },
  { timeout: 60000 }
);

// test("valid pcm", async () => {
//   const data = await speak(BASE_PHRASE, "pcm");

//   await Bun.write("test.pcm", await data.arrayBuffer());
// });

test("valid wav", async () => {
  const data = await speak(BASE_PHRASE, "wav");

  // await Bun.write("test.wav", await data.arrayBuffer());

  const transcription = await inference.transcribe({
    file: Buffer.from(await data.arrayBuffer()),
    model: "local",
  });

  const modelThinks = await inference.chat({
    prompt: `are these two sentences basically the same?\nsentence 1: ${BASE_PHRASE}\nsentence 2: ${transcription}\n\nplease respond in json: {"response": boolean}`,
    model: "mistral-small",
    json: true,
  });

  expect(JSON.parse(modelThinks).response).toBe(true);

  expect(transcription.toLowerCase().trim()).toBe(BASE_PHRASE);
});

test("valid mp3", async () => {
  const data = await speak(BASE_PHRASE);

  const transcription = await inference.transcribe({
    file: Buffer.from(await data.arrayBuffer()),
    model: "local",
  });

  const modelThinks = await inference.chat({
    prompt: `are these two sentences basically the same?\nsentence 1: ${BASE_PHRASE}\nsentence 2: ${transcription}\n\nplease respond in json: {"response": boolean}`,
    model: "mistral-small",
    json: true,
  });

  expect(JSON.parse(modelThinks).response).toBe(true);

  expect(transcription.toLowerCase().trim()).toBe(BASE_PHRASE);
});

test("valid ogg", async () => {
  const data = await speak(BASE_PHRASE, "ogg");

  const transcription = await inference.transcribe({
    file: Buffer.from(await data.arrayBuffer()),
    model: "local",
  });

  console.log(transcription);

  const modelThinks = await inference.chat({
    prompt: `are these two sentences basically the same?\nsentence 1: ${BASE_PHRASE}\nsentence 2: ${transcription}\n\nplease respond in json: {"response": boolean}`,
    model: "mistral-small",
    json: true,
  });

  expect(JSON.parse(modelThinks).response).toBe(true);

  expect(transcription.toLowerCase().trim()).toBe(BASE_PHRASE);
});

// test("valid aac", async () => {
//   const data = await speak(BASE_PHRASE, "aac");

//   const transcription = await inference.transcribe({
//     file: Buffer.from(await data.arrayBuffer()),
//     model: "local",
//   });

//   const modelThinks = await inference.chat({
//     prompt: `are these two sentences basically the same?\nsentence 1: ${BASE_PHRASE}\nsentence 2: ${transcription}\n\nplease respond in json: {"response": boolean}`,
//     model: "mistral-small",
//     json: true,
//   });

//   expect(JSON.parse(modelThinks).response).toBe(true);

//   expect(transcription.toLowerCase().trim()).toBe(BASE_PHRASE);
// });

test("mp3 streams properly", async () => {
  const start = Date.now();
  const data = await speak(LONG_PHRASE, "mp3");

  if (data.body === null) {
    expect(data.body).toBeDefined();
  } else {
    let firstChunkTime;
    for await (const chunk of data.body) {
      if (!firstChunkTime) firstChunkTime = Date.now();
    }

    if (!firstChunkTime) expect(firstChunkTime).toBeDefined();
    else {
      console.log("MP3 Time taken: ", firstChunkTime - start);
      expect(firstChunkTime - start).toBeLessThan(700);
    }
  }
});

test("pcm streams properly", async () => {
  const start = Date.now();
  const data = await speak(LONG_PHRASE, "pcm");

  if (data.body === null) {
    expect(data.body).toBeDefined();
  } else {
    let firstChunkTime;
    for await (const chunk of data.body) {
      if (!firstChunkTime) firstChunkTime = Date.now();
    }

    if (!firstChunkTime) expect(firstChunkTime).toBeDefined();
    else {
      console.log("PCM Time taken: ", firstChunkTime - start);
      expect(firstChunkTime - start).toBeLessThan(700);
    }
  }
});

test("wav streams properly", async () => {
  const start = Date.now();
  const data = await speak(LONG_PHRASE, "wav");

  if (data.body === null) {
    expect(data.body).toBeDefined();
  } else {
    let firstChunkTime;
    for await (const chunk of data.body) {
      if (!firstChunkTime) firstChunkTime = Date.now();
    }

    if (!firstChunkTime) expect(firstChunkTime).toBeDefined();
    else {
      console.log("WAV Time taken: ", firstChunkTime - start);
      expect(firstChunkTime - start).toBeLessThan(700);
    }
  }
});

// test("aac streams properly", async () => {
//   const start = Date.now();
//   const data = await speak(LONG_PHRASE, "aac");

//   if (data.body === null) {
//     expect(data.body).toBeDefined();
//   } else {
//     let firstChunkTime;
//     for await (const chunk of data.body) {
//       if (!firstChunkTime) firstChunkTime = Date.now();
//     }

//     if (!firstChunkTime) expect(firstChunkTime).toBeDefined();
//     else {
//       console.log("WAV Time taken: ", firstChunkTime - start);
//       expect(firstChunkTime - start).toBeLessThan(550);
//     }
//   }
// });

test("ogg streams properly", async () => {
  const start = Date.now();
  const data = await speak(LONG_PHRASE, "ogg");

  if (data.body === null) {
    expect(data.body).toBeDefined();
  } else {
    let firstChunkTime;
    for await (const chunk of data.body) {
      if (!firstChunkTime) firstChunkTime = Date.now();
    }

    if (!firstChunkTime) expect(firstChunkTime).toBeDefined();
    else {
      console.log("OGG Time taken: ", firstChunkTime - start);
      expect(firstChunkTime - start).toBeLessThan(550);
    }
  }
});

test.only("multiple voices from same model", async () => {
  const data = await speak(BASE_PHRASE, "mp3", "semaine", 0);
  const data2 = await speak(BASE_PHRASE, "mp3", "semaine", 1);
  const data3 = await speak(BASE_PHRASE, "mp3", "semaine", 2);
  const data4 = await speak(BASE_PHRASE, "mp3", "semaine", 3);

  Bun.write("./test/data/semaine0.mp3", await data.arrayBuffer());
  Bun.write("./test/data/semaine1.mp3", await data2.arrayBuffer());
  Bun.write("./test/data/semaine2.mp3", await data3.arrayBuffer());
  Bun.write("./test/data/semaine3.mp3", await data4.arrayBuffer());
});
