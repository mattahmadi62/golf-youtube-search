import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const MODEL = "claude-haiku-4-5";

export const ExtractedCourseSchema = z.object({
  name: z.string().describe("Course name as referenced in the source text"),
  evidence: z
    .string()
    .describe("Short snippet (10-40 words) from the source text mentioning this course"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("0..1 — how certain we are the players actually played this course"),
});

export const ExtractionResultSchema = z.object({
  courses: z.array(ExtractedCourseSchema),
});

export type ExtractedCourse = z.infer<typeof ExtractedCourseSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

const SYSTEM_PROMPT = `You extract golf course names from YouTube video metadata for a search index.

Given a video's title, description, and auto-captions, identify every golf course where the players actually play in this video. For each course, return:
- name: the course name as referenced in the text (e.g., "Pebble Beach Golf Links", "Saticoy CC", "Augusta National")
- evidence: a short snippet (10-40 words) from the source text showing the mention
- confidence: 0..1 — how certain you are the players actually played here

Rules:
- ONLY return courses where players actually play in this video. Skip courses mentioned in passing, in equipment talk, in tournament discussion on TV, or named-but-not-played.
- If a video covers multiple rounds at different courses (golf trip, "play 18 courses in a week" content), return all of them.
- Use the course name as it appears in the source. Don't normalize aggressively — leave "TPC Sawgrass" as "TPC Sawgrass", not "Tournament Players Club Sawgrass".
- For multi-course resorts (Bandon Dunes, Streamsong, Pinehurst), return the specific course (e.g., "Pacific Dunes") when identifiable. If only the resort is named, return the resort.
- Confidence calibration: 0.9+ only when explicitly stated (e.g., "Today we're playing X"). 0.6-0.8 when strongly implied. Lower if uncertain — those go to review.
- If no courses are identifiable, return an empty array.

The text comes from auto-captions, which often have transcription errors and inconsistent capitalization. Treat phonetic spellings charitably (e.g., "Sat-i-coy" → "Saticoy"). Course names ARE often misheard (e.g., "Pine Valley" → "Pine Bali") — when a word sequence is close to a known course name in context, prefer the real course name in your output.`;

export class CourseExtractor {
  private client: Anthropic;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    // The free tier is 50 RPM; sustained batch runs need more retry headroom
    // than the SDK's default (2) to ride out 429 bursts.
    this.client = new Anthropic({ maxRetries: 8 });
  }

  async extract(input: {
    title: string;
    description: string | null;
    captions: string | null;
    captionsLimit?: number;
  }): Promise<{ courses: ExtractedCourse[]; inputTokens: number; outputTokens: number; cachedTokens: number }> {
    const captionsLimit = input.captionsLimit ?? 12_000;
    const captions = (input.captions ?? "").slice(0, captionsLimit);
    const description = (input.description ?? "").slice(0, 4_000);

    const userText = [
      `Title: ${input.title}`,
      description ? `Description:\n${description}` : "",
      captions ? `Captions:\n${captions}` : "(no captions available)",
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userText }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              courses: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    evidence: { type: "string" },
                    confidence: {
                      type: "number",
                      description: "0..1; clamp to this range",
                    },
                  },
                  required: ["name", "evidence", "confidence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["courses"],
            additionalProperties: false,
          },
        },
      },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in extraction response");
    }
    const parsed = ExtractionResultSchema.parse(JSON.parse(textBlock.text));

    return {
      courses: parsed.courses,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cachedTokens: response.usage.cache_read_input_tokens ?? 0,
    };
  }
}

export const MODEL_ID = MODEL;
