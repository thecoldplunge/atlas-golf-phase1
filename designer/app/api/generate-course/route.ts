import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { COURSE_JSON_SCHEMA } from '@/lib/generator/schema';
import { buildSystemPrompt, buildUserPrompt, computeCorridors } from '@/lib/generator/prompt';
import { estimateCostUsd } from '@/lib/generator/pricing';
import { PLANETS, type PlanetId } from '@/lib/generator/planets';
import { postProcessCourse } from '@/lib/generator/postProcess';
import { procedurallyEnrich } from '@/lib/generator/filler';
import type { GenerateCourseRequest } from '@/lib/generator/types';

export const runtime = 'nodejs';
// gpt-5 is a reasoning model — a full 18-hole course with reasoning_tokens
// can take 2–5 minutes. 300s is the Vercel Pro max.
export const maxDuration = 300;

/** Reasoning models (gpt-5 / o3 / o1 family) use max_completion_tokens and
 *  don't accept custom temperature. */
function isReasoningModel(model: string): boolean {
  return /^gpt-5|^o[13]/.test(model);
}

const VALID_PLANETS = Object.keys(PLANETS) as PlanetId[];
const VALID_LANDSCAPES = [
  'links', 'forest', 'desert', 'mountain', 'coastal', 'canyon', 'tundra', 'crystal', 'volcanic', 'lunar-basin',
] as const;
const VALID_WATER = ['none', 'incidental', 'featured', 'dominant'] as const;
const VALID_DIFFICULTY = ['casual', 'standard', 'hard', 'championship'] as const;
const VALID_WIND = ['calm', 'moderate', 'gusting', 'hazardous'] as const;
const VALID_HOLE_COUNTS = [3, 9, 18] as const;

function parseRequest(body: Record<string, unknown>): GenerateCourseRequest | { error: string } {
  const planet = body.planet as string | undefined;
  if (!planet || !VALID_PLANETS.includes(planet as PlanetId)) {
    return { error: `Invalid planet: ${planet}` };
  }
  const landscape = body.landscape as string | undefined;
  if (!landscape || !VALID_LANDSCAPES.includes(landscape as (typeof VALID_LANDSCAPES)[number])) {
    return { error: `Invalid landscape: ${landscape}` };
  }
  const waterPresence = body.waterPresence as string | undefined;
  if (!waterPresence || !VALID_WATER.includes(waterPresence as (typeof VALID_WATER)[number])) {
    return { error: `Invalid waterPresence: ${waterPresence}` };
  }
  const difficulty = body.difficulty as string | undefined;
  if (!difficulty || !VALID_DIFFICULTY.includes(difficulty as (typeof VALID_DIFFICULTY)[number])) {
    return { error: `Invalid difficulty: ${difficulty}` };
  }
  const wind = body.wind as string | undefined;
  if (!wind || !VALID_WIND.includes(wind as (typeof VALID_WIND)[number])) {
    return { error: `Invalid wind: ${wind}` };
  }
  const holeCount = Number(body.holeCount);
  if (!VALID_HOLE_COUNTS.includes(holeCount as (typeof VALID_HOLE_COUNTS)[number])) {
    return { error: `Invalid holeCount: ${holeCount}` };
  }
  const courseName = typeof body.courseName === 'string' && body.courseName.trim() ? body.courseName.trim() : 'Untitled Course';
  const designer = typeof body.designer === 'string' && body.designer.trim() ? body.designer.trim() : 'AI Generator';
  const inspiration = typeof body.inspiration === 'string' ? body.inspiration : '';

  return {
    planet: planet as PlanetId,
    landscape: landscape as GenerateCourseRequest['landscape'],
    waterPresence: waterPresence as GenerateCourseRequest['waterPresence'],
    difficulty: difficulty as GenerateCourseRequest['difficulty'],
    wind: wind as GenerateCourseRequest['wind'],
    holeCount: holeCount as GenerateCourseRequest['holeCount'],
    inspiration,
    courseName,
    designer,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not set on the server.' },
      { status: 500 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseRequest(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const client = new OpenAI({ apiKey });
  const preferredModel = process.env.OPENAI_MODEL ?? 'gpt-5';
  const fallbackModel = 'gpt-4o';
  let model = preferredModel;

  // Allocate non-overlapping per-hole corridors so holes don't cross each other.
  const corridors = computeCorridors(parsed.holeCount);

  // Pin hole count exactly for this request — base schema allows 1–18,
  // but we want the model to produce exactly N for the hole count asked.
  const schema = {
    ...COURSE_JSON_SCHEMA,
    properties: {
      ...COURSE_JSON_SCHEMA.properties,
      holes: {
        ...COURSE_JSON_SCHEMA.properties.holes,
        minItems: parsed.holeCount,
        maxItems: parsed.holeCount,
      },
    },
  };

  const callModel = async (modelName: string) => {
    const reasoning = isReasoningModel(modelName);
    // Big budget — reasoning tokens + JSON output for 18 holes can easily
    // hit 20k+ tokens.
    const base = {
      model: modelName,
      messages: [
        { role: 'system' as const, content: buildSystemPrompt() },
        { role: 'user' as const, content: buildUserPrompt(parsed, corridors) },
      ],
      response_format: {
        type: 'json_schema' as const,
        json_schema: {
          name: 'course',
          strict: true,
          schema,
        },
      },
    };
    if (reasoning) {
      return client.chat.completions.create({
        ...base,
        max_completion_tokens: 32000,
      });
    }
    return client.chat.completions.create({ ...base, temperature: 0.8 });
  };

  try {
    let completion;
    try {
      completion = await callModel(preferredModel);
    } catch (err) {
      // Fall back if model is unavailable (404 / model_not_found)
      const msg = err instanceof Error ? err.message : String(err);
      const isModelErr = /model_not_found|does not exist|invalid.*model|unsupported.*model|404/i.test(msg);
      if (!isModelErr) throw err;
      console.warn(`Preferred model ${preferredModel} unavailable (${msg.slice(0, 160)}); falling back to ${fallbackModel}`);
      model = fallbackModel;
      completion = await callModel(fallbackModel);
    }

    const content = completion.choices[0]?.message?.content ?? '';
    if (!content) {
      return NextResponse.json({ error: 'Empty response from model' }, { status: 502 });
    }

    let course: unknown;
    try {
      course = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: 'Model returned invalid JSON', raw: content.slice(0, 500) },
        { status: 502 },
      );
    }

    // Attach per-hole corridors so the post-processor can clamp any stray
    // geometry back into its allocated box (prevents cross-hole overlaps).
    try {
      const c = course as { holes?: Array<Record<string, unknown>> };
      if (Array.isArray(c.holes)) {
        c.holes.forEach((h, i) => {
          if (corridors[i]) h.corridor = corridors[i];
        });
      }
    } catch (e) {
      console.warn('corridor attach failed:', e);
    }

    // Enforce hard caps (distance, ball-in-tee, cup-in-green, corridor clamp,
    // evict hazards/trees from the green) regardless of what the LLM emitted.
    // Also apply routingAngle to rotate whole holes.
    let postReport: ReturnType<typeof postProcessCourse> | null = null;
    try {
      postReport = postProcessCourse(course as Parameters<typeof postProcessCourse>[0]);
    } catch (e) {
      console.warn('postProcessCourse failed:', e);
    }

    // Procedurally enrich with bunker clusters, tree clusters, slope padding.
    let fillerReport: ReturnType<typeof procedurallyEnrich> | null = null;
    try {
      fillerReport = procedurallyEnrich(course as Parameters<typeof procedurallyEnrich>[0], parsed);
    } catch (e) {
      console.warn('procedurallyEnrich failed:', e);
    }

    const usage = completion.usage;
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    const costUsd = estimateCostUsd(promptTokens, completionTokens, model);

    return NextResponse.json({
      course,
      meta: {
        planet: parsed.planet,
        landscape: parsed.landscape,
        waterPresence: parsed.waterPresence,
        difficulty: parsed.difficulty,
        wind: parsed.wind,
        inspiration: parsed.inspiration,
        postProcess: postReport,
        filler: fillerReport,
      },
      usage: {
        promptTokens,
        completionTokens,
        costUsd,
        model,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('generate-course error:', err);
    return NextResponse.json({ error: `OpenAI request failed: ${message}` }, { status: 502 });
  }
}
