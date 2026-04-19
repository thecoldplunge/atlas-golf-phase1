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
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5': { input: 5, output: 15 },
};

const DEFAULT_PRICING: Pricing = { input: 0.15, output: 0.6 };

export function getModelPricing(model: string): Pricing {
  return MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

/**
 * Rough token estimate for the prompt + expected course JSON response.
 * Numbers chosen based on empirical testing — error ±30% is fine; this is a pre-run guide.
 */
export function estimateTokens(holeCount: number, inspirationLength: number) {
  const promptBase = 1900;
  const perHolePrompt = 15;
  const inspirationTokens = Math.ceil(inspirationLength / 4);

  const promptTokens = promptBase + holeCount * perHolePrompt + inspirationTokens;

  const perHoleOutput = 380;
  const completionTokens = 150 + holeCount * perHoleOutput;

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
