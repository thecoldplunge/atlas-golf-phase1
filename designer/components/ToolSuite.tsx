'use client';

import { useMemo, useState } from 'react';
import { defaultCharacter, initialCharacters, type CharacterEntry } from '@/lib/characters';
import { clubTypes, defaultClub, getClubType, initialClubs, type BrandedClub, type ClubTypeKey } from '@/lib/clubs';

type TabKey = 'course' | 'characters' | 'clubs' | 'physics';

type PhysicsModel = {
  speedScale: number;
  launchScale: number;
  gravity: number;
  airDrag: number;
  windForceScale: number;
  apexHangFactor: number;
  curveForce: number;
  curveLaunchBlend: number;
  sideSpinCap: number;
  sideSpinDecay: number;
  previewCurveMultiplier: number;
  pushPullInfluence: number;
  lieMissAmplification: number;
  fairwayFriction: number;
  roughFriction: number;
  deepRoughFriction: number;
  sandFriction: number;
  greenFriction: number;
  fairwayBounce: number;
  roughBounce: number;
  sandBounce: number;
  fairwayLandingDamping: number;
  roughLandingDamping: number;
  sandLandingDamping: number;
  rolloutScale: number;
  backswingPowerCurve: number;
  tempoPerfectMinMs: number;
  tempoPerfectMaxMs: number;
  straightnessSensitivity: number;
  overpowerPenalty: number;
  mishitSeverity: number;
  clubForgivenessScale: number;
  puttLaunchScale: number;
  chipRolloutScale: number;
  greenSlopeInfluence: number;
  lineSampleCount: number;
  lineSmoothing: number;
  previewLiveCalibration: number;
};

const defaultPhysics: PhysicsModel = {
  speedScale: 1,
  launchScale: 1,
  gravity: 0.028,
  airDrag: 0.14,
  windForceScale: 0.35,
  apexHangFactor: 1,
  curveForce: 1.35,
  curveLaunchBlend: 1.15,
  sideSpinCap: 0.65,
  sideSpinDecay: 0.018,
  previewCurveMultiplier: 1,
  pushPullInfluence: 40,
  lieMissAmplification: 1,
  fairwayFriction: 3.3,
  roughFriction: 4.2,
  deepRoughFriction: 7,
  sandFriction: 6.5,
  greenFriction: 2.3,
  fairwayBounce: 0.24,
  roughBounce: 0.18,
  sandBounce: 0.1,
  fairwayLandingDamping: 0.8,
  roughLandingDamping: 0.72,
  sandLandingDamping: 0.54,
  rolloutScale: 1,
  backswingPowerCurve: 0.8,
  tempoPerfectMinMs: 50,
  tempoPerfectMaxMs: 80,
  straightnessSensitivity: 60,
  overpowerPenalty: 1.24,
  mishitSeverity: 1,
  clubForgivenessScale: 1,
  puttLaunchScale: 2.8,
  chipRolloutScale: 1,
  greenSlopeInfluence: 1.61,
  lineSampleCount: 16,
  lineSmoothing: 0.95,
  previewLiveCalibration: 1,
};

function SectionCard({ title, subtitle, children, className = '' }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-700 bg-gray-800/70 p-4 space-y-4 ${className}`}>
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-xs text-gray-400 mt-1">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function NumberField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1 block">
      <div className="text-xs text-gray-300">{label}</div>
      <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white" />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 block">
      <div className="text-xs text-gray-300">{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white" />
    </label>
  );
}

function SelectField<TValue extends string>({ label, value, options, onChange }: { label: string; value: TValue; options: Array<{ value: TValue; label: string }>; onChange: (value: TValue) => void }) {
  return (
    <label className="space-y-1 block">
      <div className="text-xs text-gray-300">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value as TValue)} className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function createNextCharacterId(characters: CharacterEntry[]) {
  const maxId = characters.reduce((max, entry) => {
    const match = /^char-(\d+)$/.exec(entry.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `char-${maxId + 1}`;
}

function createNextClubId(clubs: BrandedClub[]) {
  const maxId = clubs.reduce((max, entry) => {
    const match = /^club-(\d+)$/.exec(entry.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `club-${maxId + 1}`;
}

function getClubDisplayName(club: BrandedClub) {
  return [club.brand, club.model].filter(Boolean).join(' ') || 'Untitled Club';
}

function CharacterCreator() {
  const [characters, setCharacters] = useState(initialCharacters);
  const [selectedId, setSelectedId] = useState('char-1');
  const character = characters.find((entry) => entry.id === selectedId) ?? characters[0];
  const overall = Math.round((character.power + character.accuracy + character.touch + character.spinControl + character.putting + character.recovery) / 6);
  const exportJson = useMemo(() => JSON.stringify(characters, null, 2), [characters]);
  const updateCharacter = (patch: Partial<(typeof characters)[number]>) => {
    setCharacters((prev) => prev.map((entry) => (entry.id === selectedId ? { ...entry, ...patch } : entry)));
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(420px,0.6fr)_minmax(560px,1fr)] gap-4 overflow-x-auto pb-2">
      <SectionCard title={`Characters (${characters.length})`} subtitle="Create and manage a full roster." className="min-w-0">
        <div className="space-y-2">
          {characters.map((entry) => (
            <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)} className={`w-full rounded-lg border px-3 py-2 text-left ${selectedId === entry.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-gray-700 bg-gray-900'}`}>
              <div className="text-sm font-medium text-white">{entry.name || 'Untitled Character'}</div>
              <div className="truncate text-xs text-gray-400">{entry.species} • {entry.origin}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium" onClick={() => {
            const nextId = createNextCharacterId(characters);
            setCharacters((prev) => [...prev, { ...defaultCharacter, id: nextId, name: `New Character ${prev.length + 1}` }]);
            setSelectedId(nextId);
          }}>New</button>
          <button type="button" className="rounded-lg bg-gray-700 px-3 py-2 text-sm font-medium" onClick={() => {
            const nextId = createNextCharacterId(characters);
            setCharacters((prev) => [...prev, { ...character, id: nextId, name: `${character.name} Copy` }]);
            setSelectedId(nextId);
          }}>Duplicate</button>
          <button type="button" className="col-span-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-medium disabled:opacity-50" disabled={characters.length <= 1} onClick={() => {
            const filtered = characters.filter((entry) => entry.id !== selectedId);
            setCharacters(filtered);
            setSelectedId(filtered[0].id);
          }}>Delete</button>
        </div>
      </SectionCard>

      <SectionCard title="Character Creator" subtitle="Build golfers with gameplay stats, identity, and mental profile." className="min-w-0">
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Name" value={character.name} onChange={(value) => updateCharacter({ name: value })} />
          <TextField label="Species" value={character.species} onChange={(value) => updateCharacter({ species: value })} />
          <TextField label="Origin" value={character.origin} onChange={(value) => updateCharacter({ origin: value })} />
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 flex items-center justify-between">
            <div>
              <div className="text-xs text-emerald-200">Overall</div>
              <div className="text-lg font-semibold text-white">{overall}</div>
            </div>
            <div className="text-xs text-emerald-200">Roster-ready</div>
          </div>
          <div className="col-span-2">
            <label className="space-y-1 block">
              <div className="text-xs text-gray-300">Bio</div>
              <textarea value={character.bio} onChange={(e) => updateCharacter({ bio: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white" />
            </label>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(['power','accuracy','touch','spinControl','putting','recovery','focus','composure','courseManagement'] as const).map((key) => (
            <NumberField key={key} label={key} value={character[key]} onChange={(value) => updateCharacter({ [key]: value })} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Character Catalog JSON" subtitle="Export the whole created roster." className="min-w-0">
        <pre className="max-h-[calc(100vh-260px)] min-w-0 overflow-auto whitespace-pre rounded-lg bg-gray-950 p-3 text-xs text-emerald-200">{exportJson}</pre>
      </SectionCard>
    </div>
  );
}

function ClubCreator() {
  const [clubs, setClubs] = useState(initialClubs);
  const [selectedId, setSelectedId] = useState('club-1');
  const club = clubs.find((entry) => entry.id === selectedId) ?? clubs[0];
  const clubType = getClubType(club.clubType);
  const profile = club.distance >= 65 ? 'Distance-heavy' : club.spin >= 60 || club.feel >= 60 ? 'Control-heavy' : 'Balanced';
  const exportJson = useMemo(() => JSON.stringify(clubs, null, 2), [clubs]);
  const updateClub = (patch: Partial<(typeof clubs)[number]>) => {
    setClubs((prev) => prev.map((entry) => (entry.id === selectedId ? { ...entry, ...patch } : entry)));
  };
  const clubTypeOptions = clubTypes.map((type) => ({ value: type.key, label: `${type.short} — ${type.name}` }));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(420px,0.6fr)_minmax(560px,1fr)] gap-4 overflow-x-auto pb-2">
      <SectionCard title="Clubs" subtitle="Create branded clubs from fixed club types." className="min-w-0">
        <div className="space-y-2">
          {clubs.map((entry) => (
            <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)} className={`w-full rounded-lg border px-3 py-2 text-left ${selectedId === entry.id ? 'border-sky-400 bg-sky-500/10' : 'border-gray-700 bg-gray-900'}`}>
              <div className="text-sm font-medium text-white">{getClubDisplayName(entry)}</div>
              <div className="text-xs text-gray-400">{getClubType(entry.clubType).short} • Value {entry.value}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium" onClick={() => {
            const nextId = createNextClubId(clubs);
            setClubs((prev) => [...prev, { ...defaultClub, id: nextId, model: `Prototype ${prev.length + 1}` }]);
            setSelectedId(nextId);
          }}>New</button>
          <button type="button" className="rounded-lg bg-gray-700 px-3 py-2 text-sm font-medium" onClick={() => {
            const nextId = createNextClubId(clubs);
            setClubs((prev) => [...prev, { ...club, id: nextId, model: `${club.model} Copy` }]);
            setSelectedId(nextId);
          }}>Duplicate</button>
          <button type="button" className="col-span-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-medium disabled:opacity-50" disabled={clubs.length <= 1} onClick={() => {
            const filtered = clubs.filter((entry) => entry.id !== selectedId);
            setClubs(filtered);
            setSelectedId(filtered[0].id);
          }}>Delete</button>
        </div>
      </SectionCard>

      <SectionCard title="Club Creator" subtitle="Choose a fixed club type, then tune the branded model." className="min-w-0">
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Club Type" value={club.clubType} options={clubTypeOptions} onChange={(value: ClubTypeKey) => updateClub({ clubType: value })} />
          <NumberField label="Value" value={club.value} onChange={(value) => updateClub({ value: Math.max(0, Math.round(value)) })} />
          <TextField label="Brand" value={club.brand} onChange={(value) => updateClub({ brand: value })} />
          <TextField label="Model" value={club.model} onChange={(value) => updateClub({ model: value })} />
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 flex items-center justify-between">
            <div>
              <div className="text-xs text-sky-200">Profile</div>
              <div className="text-lg font-semibold text-white">{profile}</div>
            </div>
            <div className="text-xs text-sky-200">{clubType.name} • {clubType.carryYards} yd</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Distance" value={club.distance} onChange={(value) => updateClub({ distance: Math.max(0, Math.min(100, value)) })} />
          <NumberField label="Accuracy" value={club.accuracy} onChange={(value) => updateClub({ accuracy: Math.max(0, Math.min(100, value)) })} />
          <NumberField label="Forgiveness" value={club.forgiveness} onChange={(value) => updateClub({ forgiveness: Math.max(0, Math.min(100, value)) })} />
          <NumberField label="Spin" value={club.spin} onChange={(value) => updateClub({ spin: Math.max(0, Math.min(100, value)) })} />
          <NumberField label="Feel" value={club.feel} onChange={(value) => updateClub({ feel: Math.max(0, Math.min(100, value)) })} />
        </div>
      </SectionCard>

      <SectionCard title="Club Catalog JSON" subtitle="Export the whole created equipment list." className="min-w-0">
        <pre className="max-h-[calc(100vh-260px)] min-w-0 overflow-auto whitespace-pre rounded-lg bg-gray-950 p-3 text-xs text-sky-200">{exportJson}</pre>
      </SectionCard>
    </div>
  );
}

function PhysicsEditor() {
  const [physics, setPhysics] = useState(defaultPhysics);
  const exportJson = useMemo(() => JSON.stringify(physics, null, 2), [physics]);
  const setField = (key: keyof PhysicsModel, value: number) => setPhysics((prev) => ({ ...prev, [key]: value }));

  const sections: Array<{ title: string; subtitle: string; fields: Array<{ key: keyof PhysicsModel; label: string; step?: number }> }> = [
    {
      title: 'Ball Flight',
      subtitle: 'Core carry, launch, drag, and hang-time controls.',
      fields: [
        { key: 'speedScale', label: 'Speed Scale', step: 0.01 },
        { key: 'launchScale', label: 'Launch Scale', step: 0.01 },
        { key: 'gravity', label: 'Gravity Step', step: 0.001 },
        { key: 'airDrag', label: 'Air Drag', step: 0.001 },
        { key: 'windForceScale', label: 'Wind Force Scale', step: 0.01 },
        { key: 'apexHangFactor', label: 'Apex / Hang Factor', step: 0.01 },
      ],
    },
    {
      title: 'Curve / Shape',
      subtitle: 'Shot-shape, side-spin, preview, and miss-pattern controls.',
      fields: [
        { key: 'curveForce', label: 'Curve Force', step: 0.01 },
        { key: 'curveLaunchBlend', label: 'Curve Launch Blend', step: 0.01 },
        { key: 'sideSpinCap', label: 'Side Spin Cap', step: 0.01 },
        { key: 'sideSpinDecay', label: 'Side Spin Decay', step: 0.001 },
        { key: 'previewCurveMultiplier', label: 'Preview Curve Multiplier', step: 0.01 },
        { key: 'pushPullInfluence', label: 'Push / Pull Influence', step: 1 },
        { key: 'lieMissAmplification', label: 'Lie Miss Amplification', step: 0.01 },
      ],
    },
    {
      title: 'Surface Physics',
      subtitle: 'Ground friction, bounce, damping, and rollout by surface.',
      fields: [
        { key: 'fairwayFriction', label: 'Fairway Friction', step: 0.1 },
        { key: 'roughFriction', label: 'Rough Friction', step: 0.1 },
        { key: 'deepRoughFriction', label: 'Deep Rough Friction', step: 0.1 },
        { key: 'sandFriction', label: 'Sand Friction', step: 0.1 },
        { key: 'greenFriction', label: 'Green Friction', step: 0.1 },
        { key: 'fairwayBounce', label: 'Fairway Bounce', step: 0.01 },
        { key: 'roughBounce', label: 'Rough Bounce', step: 0.01 },
        { key: 'sandBounce', label: 'Sand Bounce', step: 0.01 },
        { key: 'fairwayLandingDamping', label: 'Fairway Landing Damping', step: 0.01 },
        { key: 'roughLandingDamping', label: 'Rough Landing Damping', step: 0.01 },
        { key: 'sandLandingDamping', label: 'Sand Landing Damping', step: 0.01 },
        { key: 'rolloutScale', label: 'Rollout Scale', step: 0.01 },
      ],
    },
    {
      title: 'Swing Mechanics',
      subtitle: 'Tempo windows, power curve, mishits, and forgiveness.',
      fields: [
        { key: 'backswingPowerCurve', label: 'Backswing Power Curve', step: 0.01 },
        { key: 'tempoPerfectMinMs', label: 'Tempo Perfect Min (ms)', step: 1 },
        { key: 'tempoPerfectMaxMs', label: 'Tempo Perfect Max (ms)', step: 1 },
        { key: 'straightnessSensitivity', label: 'Straightness Sensitivity', step: 1 },
        { key: 'overpowerPenalty', label: 'Overpower Penalty', step: 0.01 },
        { key: 'mishitSeverity', label: 'Mishit Severity', step: 0.01 },
        { key: 'clubForgivenessScale', label: 'Club Forgiveness Scale', step: 0.01 },
      ],
    },
    {
      title: 'Putting / Short Game',
      subtitle: 'Green pace, chips, and slope response.',
      fields: [
        { key: 'puttLaunchScale', label: 'Putt Launch Scale', step: 0.01 },
        { key: 'chipRolloutScale', label: 'Chip Rollout Scale', step: 0.01 },
        { key: 'greenSlopeInfluence', label: 'Green Slope Influence', step: 0.01 },
      ],
    },
    {
      title: 'Preview Model',
      subtitle: 'Shot-line quality and calibration against live flight.',
      fields: [
        { key: 'lineSampleCount', label: 'Line Sample Count', step: 1 },
        { key: 'lineSmoothing', label: 'Line Smoothing', step: 0.01 },
        { key: 'previewLiveCalibration', label: 'Preview / Live Calibration', step: 0.01 },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-4">
      <div className="space-y-4">
        {sections.map((section) => (
          <SectionCard key={section.title} title={section.title} subtitle={section.subtitle}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {section.fields.map((field) => (
                <NumberField key={field.key} label={field.label} value={physics[field.key]} step={field.step} onChange={(value) => setField(field.key, value)} />
              ))}
            </div>
          </SectionCard>
        ))}

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          This is the full parameter surface for tuning. Use it with the harness and only promote changes after scenario pass/fail checks look sane.
        </div>
      </div>

      <SectionCard title="Physics JSON" subtitle="Exportable full tuning block for the sim.">
        <pre className="rounded-lg bg-gray-950 p-3 text-xs text-amber-200 overflow-auto">{exportJson}</pre>
      </SectionCard>
    </div>
  );
}

export default function ToolSuite({ courseDesigner }: { courseDesigner: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<TabKey>('characters');

  const tabs: Array<{ key: TabKey; label: string; description: string }> = [
    { key: 'course', label: 'Course Editor', description: 'Design holes, terrain, hazards, and routing.' },
    { key: 'characters', label: `Character Creator (${initialCharacters.length})`, description: 'Build golfers and export stat blocks.' },
    { key: 'clubs', label: 'Club Creator', description: 'Tune clubs and export equipment specs.' },
    { key: 'physics', label: 'Physics Editor', description: 'Tune simulation constants before QA.' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 bg-gray-900/90 backdrop-blur">
        <div className="mx-auto max-w-[1800px] px-4 py-4 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-emerald-300">Atlas Golf Designer</div>
            <div className="text-2xl font-semibold text-white mt-1">Creation Suite</div>
            <div className="text-sm text-gray-400 mt-1">Course building, character design, club tuning, and physics calibration in one place.</div>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {tabs.map((tab) => (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`text-left rounded-xl border px-4 py-3 transition ${activeTab === tab.key ? 'border-emerald-400 bg-emerald-500/10' : 'border-gray-700 bg-gray-800 hover:bg-gray-750'}`}>
                <div className="text-sm font-semibold text-white">{tab.label}</div>
                <div className="text-xs text-gray-400 mt-1">{tab.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1800px] px-4 py-4">
        {activeTab === 'course' ? courseDesigner : null}
        {activeTab === 'characters' ? <CharacterCreator /> : null}
        {activeTab === 'clubs' ? <ClubCreator /> : null}
        {activeTab === 'physics' ? <PhysicsEditor /> : null}
      </div>
    </div>
  );
}
