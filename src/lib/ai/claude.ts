/**
 * Shared Claude client for the assist layer.
 *
 * Design rules:
 *  - AI is a FALLBACK only. The deterministic path always runs first.
 *  - AI never produces a final money figure that isn't re-validated or flagged
 *    for human review.
 *  - The whole layer is INERT without ANTHROPIC_API_KEY — every helper returns
 *    null and callers keep their deterministic result.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Ask Claude to return a single structured object via a forced tool call, then
 * validate it with Zod. Returns null on any failure (missing key, API error,
 * or validation mismatch) so callers fall back gracefully.
 */
export async function extractStructured<T>(opts: {
  prompt: string;
  toolName: string;
  toolDescription: string;
  jsonSchema: Record<string, unknown>;
  schema: ZodType<T>;
  /** Optional PDF to attach as a document block (base64, no data: prefix). */
  pdfBase64?: string;
  maxTokens?: number;
}): Promise<T | null> {
  if (!isAiEnabled()) return null;

  try {
    const content: Anthropic.ContentBlockParam[] = [];
    if (opts.pdfBase64) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: opts.pdfBase64 },
      });
    }
    content.push({ type: "text", text: opts.prompt });

    const res = await getClient().messages.create({
      model: getModel(),
      max_tokens: opts.maxTokens ?? 1024,
      tools: [
        {
          name: opts.toolName,
          description: opts.toolDescription,
          input_schema: opts.jsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: opts.toolName },
      messages: [{ role: "user", content }],
    });

    const toolUse = res.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;

    const parsed = opts.schema.safeParse(toolUse.input);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
