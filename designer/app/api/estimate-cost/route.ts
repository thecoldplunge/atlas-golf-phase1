import { NextResponse } from 'next/server';
import { estimateTokens, estimateCostUsd } from '@/lib/generator/pricing';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const holeCount = Number(body.holeCount ?? 9);
    const inspirationLength = typeof body.inspiration === 'string' ? body.inspiration.length : 0;
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    const { promptTokens, completionTokens } = estimateTokens(holeCount, inspirationLength);
    const estimatedUsd = estimateCostUsd(promptTokens, completionTokens, model);

    return NextResponse.json({
      promptTokens,
      completionTokens,
      estimatedUsd,
      model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
