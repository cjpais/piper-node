// @ts-ignore
import * as ort from "onnxruntime-node";
import { synthesizeStream } from "./synthesis";

export class PiperVoice {
  session: ort.InferenceSession;
  configPath: string;
  modelPath: string;
  config: any;

  constructor(modelPath: string) {
    this.modelPath = modelPath;
    this.configPath = `${modelPath}.json`;
  }

  async load() {
    this.config = await Bun.file(this.configPath).json();
    const providers = ["cpu"]; // add coreml, cuda if supported

    this.session = await ort.InferenceSession.create(this.modelPath, {
      executionProviders: providers,
    });
  }

  synthesize(text: string, speaker: number = 0, speed?: number) {
    return synthesizeStream(text, speaker, this.config, this.session, speed);
  }
}
