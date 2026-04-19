import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { COURSE_JSON_SCHEMA } from '@/lib/generator/schema';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/generator/prompt';
import { estimateCostUsd } from '@/lib/generator/pricing';
import { PLANETS, type PlanetId } from '@/lib/generator/planets';
import { postProcessCourse } from '@/lib/generator/postProcess';
import type { GenerateCourseRequest } from '@/lib/generator/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

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

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(parsed) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'course',
          strict: true,
          schema,
        },
      },
      temperature: 0.8,
    });

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

    // Enforce hard caps (distance, ball-in-tee, cup-in-green) regardless of
    // what the LLM emitted.
    let postReport: ReturnType<typeof postProcessCourse> | null = null;
    try {
      postReport = postProcessCourse(course as Parameters<typeof postProcessCourse>[0]);
    } catch (e) {
      console.warn('postProcessCourse failed:', e);
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
