"use server";

import { generateText, Output } from "ai";
import { z } from "zod";
import { requireAccountAccess } from "@/lib/authorization";
import {
  DETECTION_INSTRUCTIONS,
  DETECTION_TIMEOUT_MS,
  buildDetectionPrompt,
  parseDetectionRequest,
  type RawColumnDetection,
} from "@/lib/importColumnDetection";

// Small and fast: the whole call has DETECTION_TIMEOUT_MS before File
// Import falls back to its header heuristics.
const MODEL = "anthropic/claude-haiku-5.5";

const field = z.object({
  column: z.number().int().nullable(),
  confidence: z.number(),
});

const detectionSchema = z.object({
  headerRowIndex: z.number().int(),
  date: field,
  payee: field,
  memo: field,
  amountMode: z.enum(["single", "split"]),
  amountModeConfidence: z.number(),
  amount: field,
  inflow: field,
  outflow: field,
  dateOrder: z.enum(["DMY", "MDY"]).nullable(),
});

/**
 * Asks an AI model, through Vercel AI Gateway, which columns of an import
 * file are the Date/Payee/Memo/amount fields (#197, docs/adr/0014). The
 * caller sends only a masked sample (see buildDetectionSample); the
 * answer is checked against the real file on the client
 * (normalizeDetection).
 *
 * Throws only if the user can't access the account. Resolves null when the feature is off (no Gateway
 * credential, e.g. local dev and e2e), the request is malformed, the model
 * takes longer than DETECTION_TIMEOUT_MS, or anything else fails. File
 * Import then falls back to its header-name heuristics.
 */
export async function detectImportColumns(input: {
  accountId: string;
  sample: string[][];
}): Promise<RawColumnDetection | null> {
  const request = parseDetectionRequest(input, process.env);
  if (!request) return null;
  // Outside the try: an access failure should surface like any other
  // action's, not read as "the model didn't answer".
  await requireAccountAccess(request.accountId);
  try {
    const { output } = await generateText({
      model: MODEL,
      output: Output.object({ schema: detectionSchema }),
      system: DETECTION_INSTRUCTIONS,
      prompt: buildDetectionPrompt(request.sample),
      abortSignal: AbortSignal.timeout(DETECTION_TIMEOUT_MS),
      maxRetries: 0,
    });
    return output;
  } catch (err) {
    console.warn("[import-detection] falling back to heuristics:", err);
    return null;
  }
}
