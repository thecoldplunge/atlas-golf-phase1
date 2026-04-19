/**
 * OpenAI model pricing (USD per 1M tokens). Keep in sync with platform.openai.com pricing
 * — used purely for the pre-run cost estimate shown in the wizard.
 */
interface Pricing {
  input: number;
  output: number;
}

const MODEL_PRICING: Record<string, Pricing> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5': { input: 5, output: 15 },
  'o1': { input: 15, output: 60 },
  'o3': { input: 2, output: 8 },
  'o3-mini': { input: 1.1, output: 4.4 },
};

const DEFAULT_PRICING: Pricing = { input: 2.5, output: 10 };

export function getModelPricing(model: string): Pricing {
  return MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

/**
 * Rough token estimate for the prompt + expected course JSON response.
 * Numbers chosen based on empirical testing — error ±30% is fine; this is a pre-run guide.
 */
export function estimateTokens(holeCount: number, inspirationLength: number, model?: string) {
  const promptBase = 2400;
  const perHolePrompt = 18;
  const inspirationTokens = Math.ceil(inspirationLength / 4);

  const promptTokens = promptBase + holeCount * perHolePrompt + inspirationTokens;

  // Denser v3 schema: waypoints + per-surface rotation + ≥6 hazards + ≥2 slopes + more obstacles
  const perHoleOutput = 700;
  const baseCompletion = 200 + holeCount * perHoleOutput;

  // Reasoning models (gpt-5 / o-series) also charge for internal reasoning
  // tokens — roughly 2× the visible output for structured JSON generation.
  const isReasoning = !!model && /^gpt-5|^o[13]/.test(model);
  const completionTokens = isReasoning ? Math.round(baseCompletion * 3) : baseCompletion;

  return { promptTokens, completionTokens };
}

export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  model: string,
): number {
  const p = getModelPricing(model);
  const cost = (promptTokens / 1_000_000) * p.input + (completionTokens / 1_000_000) * p.output;
  return Math.round(cost * 10000) / 10000;
}
