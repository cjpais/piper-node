import { z } from "zod";

// TODO really need to rename or put in namespace
export const SpeakerModels = z.enum(["semaine", "ryan"]);
export type SpeakerModels = z.infer<typeof SpeakerModels>;

export const QualityLevels = z.enum(["low", "medium", "high"]);
export type QualityLevel = z.infer<typeof QualityLevels>;

export const OutputFormats = z.enum(["mp3", "wav", "pcm", "ogg"]);
export type OutputFormat = z.infer<typeof OutputFormats>;

export const SpeakParamsSchema = z.object({
  text: z.string(),
  model: SpeakerModels.optional().default("semaine"),
  quality: QualityLevels.optional().default("medium"),
  speaker: z.number().optional(),
  speed: z.number().min(0.000001).max(1.99999999).optional().default(1.0),
  sentenceSilence: z.number().optional().default(0.2),
  format: OutputFormats.optional().default("mp3"),
  pitch: z.number().optional().default(1),
});
export type SpeakParams = z.infer<typeof SpeakParamsSchema>;
