'use client';

import { useEffect, useMemo, useState } from 'react';
import { PLANET_OPTIONS } from '@/lib/generator/planets';
import type {
  Difficulty,
  GenerateCourseRequest,
  HoleCount,
  Landscape,
  WaterPresence,
  WindLevel,
} from '@/lib/generator/types';
import type { PlanetId } from '@/lib/generator/planets';
import type { HoleData } from '@/lib/types';

interface GenerateCourseWizardProps {
  open: boolean;
  onClose: () => void;
  onCourseGenerated: (payload: { courseName: string; designer: string; holes: HoleData[] }) => void;
  initialCourseName: string;
  initialDesigner: string;
}

type Step =
  | 'planet'
  | 'landscape'
  | 'water'
  | 'difficulty'
  | 'wind'
  | 'holeCount'
  | 'inspiration'
  | 'name'
  | 'review';

const STEPS: Step[] = [
  'planet',
  'landscape',
  'water',
  'difficulty',
  'wind',
  'holeCount',
  'inspiration',
  'name',
  'review',
];

const LANDSCAPE_OPTIONS: Array<{ id: Landscape; label: string; blurb: string }> = [
  { id: 'links', label: 'Links', blurb: 'Open, firm turf. Wind-exposed. Pot bunkers.' },
  { id: 'forest', label: 'Forest', blurb: 'Tree-lined corridors. Strategic shot-shaping.' },
  { id: 'desert', label: 'Desert', blurb: 'Waste areas frame fairways. Sun-bleached.' },
  { id: 'mountain', label: 'Mountain', blurb: 'Dramatic elevation. Pines. Cross-hazards.' },
  { id: 'coastal', label: 'Coastal', blurb: 'Water one side of many holes. Wind.' },
  { id: 'canyon', label: 'Canyon', blurb: 'Forced carries over chasms. Narrow corridors.' },
  { id: 'tundra', label: 'Tundra', blurb: 'Minimal flora. Precision over power.' },
  { id: 'crystal', label: 'Crystal', blurb: 'Alien aesthetic. Sparse, geometric.' },
  { id: 'volcanic', label: 'Volcanic', blurb: 'Obsidian. Lava-pool hazards. Penal.' },
  { id: 'lunar-basin', label: 'Lunar Basin', blurb: 'Craters as bunkers. Wide fairways.' },
];

const WATER_OPTIONS: Array<{ id: WaterPresence; label: string; blurb: string }> = [
  { id: 'none', label: 'None', blurb: 'No water hazards.' },
  { id: 'incidental', label: 'Incidental', blurb: '1–2 small water hazards.' },
  { id: 'featured', label: 'Featured', blurb: '3–5 hazards, one signature water hole.' },
  { id: 'dominant', label: 'Dominant', blurb: '5+ hazards. Water defines the course.' },
];

const DIFFICULTY_OPTIONS: Array<{ id: Difficulty; label: string; blurb: string }> = [
  { id: 'casual', label: 'Casual', blurb: 'Generous fairways. Mild greens.' },
  { id: 'standard', label: 'Standard', blurb: 'Tour-ready. Balanced pressure.' },
  { id: 'hard', label: 'Hard', blurb: 'Narrow fairways. Heavy bunkering.' },
  { id: 'championship', label: 'Championship', blurb: 'Major-level. Severe greens.' },
];

const WIND_OPTIONS: Array<{ id: WindLevel; label: string; blurb: string }> = [
  { id: 'calm', label: 'Calm', blurb: 'No wind pressure.' },
  { id: 'moderate', label: 'Moderate', blurb: 'Varied holes get breeze.' },
  { id: 'gusting', label: 'Gusting', blurb: 'Several holes battle wind.' },
  { id: 'hazardous', label: 'Hazardous', blurb: 'Wind is a character on every tee.' },
];

const HOLE_COUNT_OPTIONS: Array<{ id: HoleCount; label: string; blurb: string }> = [
  { id: 3, label: '3 holes', blurb: 'Quick test. ~30s generation.' },
  { id: 9, label: '9 holes', blurb: 'Standard. ~1 min generation.' },
  { id: 18, label: '18 holes', blurb: 'Championship full. ~2 min generation.' },
];

interface WizardState {
  planet: PlanetId | null;
  landscape: Landscape | null;
  waterPresence: WaterPresence | null;
  difficulty: Difficulty | null;
  wind: WindLevel | null;
  holeCount: HoleCount | null;
  inspiration: string;
  courseName: string;
  designer: string;
}

const EMPTY_STATE: WizardState = {
  planet: null,
  landscape: null,
  waterPresence: null,
  difficulty: null,
  wind: null,
  holeCount: null,
  inspiration: '',
  courseName: '',
  designer: '',
};

function formatUsd(n: number): string {
  if (n < 0.01) return `< $0.01`;
  return `$${n.toFixed(3)}`;
}

export default function GenerateCourseWizard({
  open,
  onClose,
  onCourseGenerated,
  initialCourseName,
  initialDesigner,
}: GenerateCourseWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [wizard, setWizard] = useState<WizardState>({
    ...EMPTY_STATE,
    courseName: initialCourseName || '',
    designer: initialDesigner || '',
  });
  const [estimateUsd, setEstimateUsd] = useState<number | null>(null);
  const [estimateModel, setEstimateModel] = useState<string>('gpt-4o-mini');
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [actualCostUsd, setActualCostUsd] = useState<number | null>(null);

  const currentStep = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  useEffect(() => {
    if (!open) {
      // reset on close
      setStepIndex(0);
      setWizard({ ...EMPTY_STATE, courseName: initialCourseName, designer: initialDesigner });
      setEstimateUsd(null);
      setGenerateError(null);
      setActualCostUsd(null);
    }
  }, [open, initialCourseName, initialDesigner]);

  // Refresh cost estimate when inputs change
  useEffect(() => {
    if (!open) return;
    if (!wizard.holeCount) return;
    let cancelled = false;
    setEstimateLoading(true);
    fetch('/api/estimate-cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        holeCount: wizard.holeCount,
        inspiration: wizard.inspiration,
      }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (typeof body.estimatedUsd === 'number') {
          setEstimateUsd(body.estimatedUsd);
          if (typeof body.model === 'string') setEstimateModel(body.model);
        }
      })
      .catch(() => {
        // swallow; estimate is cosmetic
      })
      .finally(() => {
        if (!cancelled) setEstimateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, wizard.holeCount, wizard.inspiration]);

  const canAdvance = useMemo(() => {
    switch (currentStep) {
      case 'planet':
        return Boolean(wizard.planet);
      case 'landscape':
        return Boolean(wizard.landscape);
      case 'water':
        return Boolean(wizard.waterPresence);
      case 'difficulty':
        return Boolean(wizard.difficulty);
      case 'wind':
        return Boolean(wizard.wind);
      case 'holeCount':
        return Boolean(wizard.holeCount);
      case 'inspiration':
        return true;
      case 'name':
        return wizard.courseName.trim().length > 0 && wizard.designer.trim().length > 0;
      case 'review':
        return true;
      default:
        return false;
    }
  }, [currentStep, wizard]);

  if (!open) return null;

  const advance = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  const handleGenerate = async () => {
    if (!wizard.planet || !wizard.landscape || !wizard.waterPresence || !wizard.difficulty || !wizard.wind || !wizard.holeCount) return;

    const req: GenerateCourseRequest = {
      planet: wizard.planet,
      landscape: wizard.landscape,
      waterPresence: wizard.waterPresence,
      difficulty: wizard.difficulty,
      wind: wizard.wind,
      holeCount: wizard.holeCount,
      inspiration: wizard.inspiration,
      courseName: wizard.courseName.trim(),
      designer: wizard.designer.trim(),
    };

    setGenerating(true);
    setGenerateError(null);
    setActualCostUsd(null);

    try {
      const res = await fetch('/api/generate-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error ?? `Server error (${res.status})`);
      }
      if (typeof body?.usage?.costUsd === 'number') {
        setActualCostUsd(body.usage.costUsd);
      }

      // Convert course JSON (rect-based) to HoleData[] via the existing import path
      const { parseImportedCourseJson } = await import('@/lib/export');
      const parsed = parseImportedCourseJson(JSON.stringify(body.course));

      onCourseGenerated({
        courseName: parsed.courseName || req.courseName,
        designer: parsed.designer || req.designer,
        holes: parsed.holes,
      });

      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      setGenerateError(message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[680px] max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div>
            <div className="text-sm text-gray-400 uppercase tracking-wide">AI Course Generator</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Step {stepIndex + 1} / {STEPS.length}
              {' · '}
              <span className="capitalize">{currentStep.replace(/([A-Z])/g, ' $1')}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded bg-gray-700 hover:bg-gray-600 text-sm"
          >
            Cancel
          </button>
        </header>

        {/* Progress dots */}
        <div className="px-5 pt-3 flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded ${
                i < stepIndex ? 'bg-green-600' : i === stepIndex ? 'bg-green-400' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {currentStep === 'planet' && (
            <StepCards
              title="Which planet?"
              subtitle="Planet sets the palette, flora, gravity, and atmosphere."
              options={PLANET_OPTIONS.map((p) => ({
                id: p.id,
                label: p.name,
                blurb: `${p.system} — ${p.summary}`,
              }))}
              value={wizard.planet}
              onSelect={(id) => setWizard((w) => ({ ...w, planet: id as PlanetId }))}
            />
          )}

          {currentStep === 'landscape' && (
            <StepCards
              title="Landscape style"
              subtitle="Shapes fairways, hazards, and the overall feel."
              options={LANDSCAPE_OPTIONS}
              value={wizard.landscape}
              onSelect={(id) => setWizard((w) => ({ ...w, landscape: id as Landscape }))}
            />
          )}

          {currentStep === 'water' && (
            <StepCards
              title="Water presence"
              subtitle="How much water hazard."
              options={WATER_OPTIONS}
              value={wizard.waterPresence}
              onSelect={(id) => setWizard((w) => ({ ...w, waterPresence: id as WaterPresence }))}
            />
          )}

          {currentStep === 'difficulty' && (
            <StepCards
              title="Difficulty"
              subtitle="Drives fairway widths, green severity, and hazard density."
              options={DIFFICULTY_OPTIONS}
              value={wizard.difficulty}
              onSelect={(id) => setWizard((w) => ({ ...w, difficulty: id as Difficulty }))}
            />
          )}

          {currentStep === 'wind' && (
            <StepCards
              title="Wind"
              subtitle="How often wind affects your shots."
              options={WIND_OPTIONS}
              value={wizard.wind}
              onSelect={(id) => setWizard((w) => ({ ...w, wind: id as WindLevel }))}
            />
          )}

          {currentStep === 'holeCount' && (
            <StepCards
              title="Hole count"
              subtitle="How many holes on the course."
              options={HOLE_COUNT_OPTIONS.map((o) => ({ id: String(o.id), label: o.label, blurb: o.blurb }))}
              value={wizard.holeCount == null ? null : String(wizard.holeCount)}
              onSelect={(id) => setWizard((w) => ({ ...w, holeCount: Number(id) as HoleCount }))}
            />
          )}

          {currentStep === 'inspiration' && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Inspiration (optional)</h2>
              <p className="text-sm text-gray-400">
                Free-form description — names, moods, references, architectural philosophies.
                E.g. &quot;Augusta meets Aeris Station,&quot; &quot;a links course with one crystal
                cathedral green,&quot; &quot;Paxi wind-canyon, brutal par 3s.&quot;
              </p>
              <textarea
                value={wizard.inspiration}
                onChange={(e) => setWizard((w) => ({ ...w, inspiration: e.target.value }))}
                placeholder="Describe the vibe…"
                className="w-full h-32 p-3 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100"
              />
            </div>
          )}

          {currentStep === 'name' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Name your course</h2>
              <div>
                <label className="text-xs uppercase text-gray-400 mb-1 block">Course name</label>
                <input
                  value={wizard.courseName}
                  onChange={(e) => setWizard((w) => ({ ...w, courseName: e.target.value }))}
                  className="w-full h-10 px-3 rounded bg-gray-800 border border-gray-700 text-sm"
                  placeholder="e.g. Aeris Dunes"
                />
              </div>
              <div>
                <label className="text-xs uppercase text-gray-400 mb-1 block">Designer credit</label>
                <input
                  value={wizard.designer}
                  onChange={(e) => setWizard((w) => ({ ...w, designer: e.target.value }))}
                  className="w-full h-10 px-3 rounded bg-gray-800 border border-gray-700 text-sm"
                  placeholder="Your name"
                />
              </div>
            </div>
          )}

          {currentStep === 'review' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Ready to generate?</h2>
              <div className="rounded border border-gray-700 bg-gray-800/50 p-4 space-y-1 text-sm">
                <ReviewRow label="Course" value={wizard.courseName} />
                <ReviewRow label="Designer" value={wizard.designer} />
                <ReviewRow label="Planet" value={PLANET_OPTIONS.find((p) => p.id === wizard.planet)?.name ?? '-'} />
                <ReviewRow label="Landscape" value={wizard.landscape ?? '-'} />
                <ReviewRow label="Water" value={wizard.waterPresence ?? '-'} />
                <ReviewRow label="Difficulty" value={wizard.difficulty ?? '-'} />
                <ReviewRow label="Wind" value={wizard.wind ?? '-'} />
                <ReviewRow label="Holes" value={wizard.holeCount != null ? String(wizard.holeCount) : '-'} />
                {wizard.inspiration && <ReviewRow label="Inspiration" value={wizard.inspiration} />}
              </div>

              <div className="rounded border border-yellow-900/40 bg-yellow-900/10 p-3 text-sm text-yellow-100/90 flex items-baseline justify-between gap-3">
                <div>
                  <div className="font-medium">Estimated cost</div>
                  <div className="text-yellow-200/60 text-xs mt-0.5">
                    Model: <span className="font-mono">{estimateModel}</span>. Based on token estimate; actual may vary.
                  </div>
                </div>
                <div className="text-xl font-mono">
                  {estimateLoading ? '…' : estimateUsd != null ? formatUsd(estimateUsd) : '—'}
                </div>
              </div>

              {generateError && (
                <div className="rounded border border-red-900/50 bg-red-900/20 p-3 text-sm text-red-200">
                  <div className="font-medium">Generation failed</div>
                  <div className="text-red-300/80 mt-1">{generateError}</div>
                </div>
              )}
              {actualCostUsd != null && (
                <div className="text-sm text-gray-400">Actual cost: <span className="font-mono text-gray-200">{formatUsd(actualCostUsd)}</span></div>
              )}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-gray-700 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={back}
            disabled={stepIndex === 0 || generating}
            className="h-9 px-4 rounded bg-gray-700 hover:bg-gray-600 text-sm disabled:opacity-50"
          >
            Back
          </button>

          <div className="text-xs text-gray-500">
            {wizard.holeCount && estimateUsd != null && !isLast && (
              <>Est. cost <span className="font-mono text-gray-300">{formatUsd(estimateUsd)}</span></>
            )}
          </div>

          {isLast ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canAdvance || generating}
              className="h-9 px-5 rounded bg-green-600 hover:bg-green-500 text-sm font-semibold disabled:opacity-50"
            >
              {generating ? 'Generating…' : 'Generate Course'}
            </button>
          ) : (
            <button
              type="button"
              onClick={advance}
              disabled={!canAdvance}
              className="h-9 px-5 rounded bg-green-600 hover:bg-green-500 text-sm font-semibold disabled:opacity-50"
            >
              Next
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <div className="text-xs uppercase text-gray-400 w-24">{label}</div>
      <div className="text-gray-100 capitalize">{value}</div>
    </div>
  );
}

interface Option {
  id: string;
  label: string;
  blurb: string;
}

function StepCards({
  title,
  subtitle,
  options,
  value,
  onSelect,
}: {
  title: string;
  subtitle: string;
  options: readonly Option[];
  value: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={`text-left p-3 rounded border transition-colors ${
                active
                  ? 'bg-green-600/20 border-green-500 text-white'
                  : 'bg-gray-800 border-gray-700 hover:bg-gray-700/50'
              }`}
            >
              <div className="font-medium text-sm">{opt.label}</div>
              <div className="text-xs text-gray-400 mt-1 leading-tight">{opt.blurb}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
