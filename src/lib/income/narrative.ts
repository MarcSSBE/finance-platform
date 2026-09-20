/**
 * AI plain-language narrative for the Income Summary (Project 1, M2).
 *
 * THE HARD RULE: the LLM never produces a money figure. This helper hands
 * Claude the deterministic stats + anomaly flags and asks only for a short,
 * QUALITATIVE recap ("all rows were USD", "one refund", "a few repeated
 * amounts"). We then re-validate the output and REJECT it if it contains any
 * money-like number, so a hallucinated figure can never reach the screen. The
 * real numbers are always rendered by code around this text.
 *
 * Inert without ANTHROPIC_API_KEY (extractStructured returns null).
 */
import { z } from "zod";
import { extractStructured } from "@/lib/ai/claude";
import type { IncomeInsights } from "./insights";

const schema = z.object({ narrative: z.string() });

export type NarrativeLang = "en" | "sv";

/** Reject anything that looks like a monetary amount or a large/decimal number.
 *  Small standalone counts ("2 currencies") are tolerated; money is not. */
function containsMoneyLikeNumber(text: string): boolean {
  if (text.includes("$") || /[£€]/.test(text)) return true;
  if (/\d[\d.,\s]*[.,]\d/.test(text)) return true; // decimals / grouped amounts
  if (/\d{3,}/.test(text)) return true; // 100+ — bigger than a plausible row count
  return false;
}

/**
 * Ask Claude for a 2-3 sentence, figure-free recap of the month, in the given
 * UI language. Returns the narrative string, or null when AI is off, the call
 * fails, or the output failed the money-number guard.
 */
export async function summarizeIncome(
  insights: IncomeInsights,
  lang: NarrativeLang = "en",
): Promise<string | null> {
  const { stats, anomalies } = insights;

  const language = lang === "sv" ? "Swedish" : "English";
  const facts = [
    `Currencies present: ${stats.currencyCount}` +
      (stats.primaryCurrency ? ` (main: ${stats.primaryCurrency})` : ""),
    `Counted rows: ${stats.countedRows}`,
    `Refund/negative rows: ${stats.negativeCount}`,
    `Rows skipped as unreadable: ${stats.skippedCount}`,
    `Duplicate-amount groups flagged: ${anomalies.filter((a) => a.code === "duplicate-amount").length}`,
    `Large outlier rows flagged: ${anomalies.filter((a) => a.code === "large-outlier").reduce((n, a) => n + a.count, 0)}`,
  ].join("\n");

  const narrative = await extractStructured({
    toolName: "write_income_recap",
    toolDescription:
      "Return a short, plain-language recap of a month of TikTok income for a bookkeeper.",
    prompt:
      "You are helping a bookkeeper review one month of TikTok income that has ALREADY been " +
      "totalled by exact, deterministic code. The precise figures are shown to her separately.\n\n" +
      "Here are the deterministic facts about this month:\n" +
      facts +
      "\n\nWrite 2 to 3 short sentences that recap the month and point out anything worth a " +
      "quick check. Rules you MUST follow:\n" +
      "- Do NOT include any specific numbers, amounts, or currency figures. Refer to them " +
      "qualitatively instead (for example: 'every row', 'a couple of', 'one refund', 'no refunds').\n" +
      "- Do NOT invent or estimate any total.\n" +
      "- Do NOT use em dashes or en dashes; use commas or periods.\n" +
      `- Write in ${language}.\n` +
      "- Keep it calm and factual, like a colleague's note.",
    jsonSchema: {
      type: "object",
      properties: { narrative: { type: "string" } },
      required: ["narrative"],
    },
    schema,
    maxTokens: 400,
  });

  if (!narrative) return null;
  const text = narrative.narrative.trim();
  if (!text) return null;
  // Re-validate: a figure-free recap must not carry money-like numbers.
  if (containsMoneyLikeNumber(text)) return null;
  return text;
}
