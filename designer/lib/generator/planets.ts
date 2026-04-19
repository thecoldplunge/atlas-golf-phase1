export type PlanetId = 'earth' | 'keldara' | 'rill-shelf' | 'aeris-station' | 'paxi-canyon';

export interface PlanetDefinition {
  id: PlanetId;
  name: string;
  system: string;
  summary: string;
  palette: {
    grassFairway: string;
    grassRough: string;
    grassDeepRough: string;
    green: string;
    fringe: string;
    sand: string;
    water: string;
    desert: string;
    sky: string;
  };
  flora: Array<'pine' | 'oak' | 'palm' | 'birch' | 'cypress'>;
  gravity: number;
  atmosphere: {
    windBase: number;
    airDrag: number;
  };
  waterBehavior: 'standard' | 'frictionless-ice' | 'low-grav-floaty' | 'reactive';
  inspirationTags: string[];
}

export const PLANETS: Record<PlanetId, PlanetDefinition> = {
  earth: {
    id: 'earth',
    name: 'Earth',
    system: 'Sol',
    summary: 'Home. Familiar grass, pines, oaks, traditional golf aesthetics.',
    palette: {
      grassFairway: '#7ab855',
      grassRough: '#4a7a3a',
      grassDeepRough: '#2a5220',
      green: '#4ec96a',
      fringe: '#5fa048',
      sand: '#d4b96a',
      water: '#3a7bc8',
      desert: '#c8a06a',
      sky: '#87ceeb',
    },
    flora: ['pine', 'oak', 'palm', 'birch', 'cypress'],
    gravity: 1.0,
    atmosphere: { windBase: 1.0, airDrag: 1.0 },
    waterBehavior: 'standard',
    inspirationTags: ['links', 'parkland', 'coastal', 'augusta', 'pebble-beach', 'st-andrews', 'pine-valley'],
  },
  keldara: {
    id: 'keldara',
    name: 'Keldara-7',
    system: 'Keldara',
    summary: 'Voss homeworld. Heavy gravity, rust-red grass, obsidian rock, high-pressure atmosphere.',
    palette: {
      grassFairway: '#b07a3a',
      grassRough: '#7e5320',
      grassDeepRough: '#4a3010',
      green: '#c49040',
      fringe: '#946828',
      sand: '#2a1e14',
      water: '#6a3820',
      desert: '#8a5a28',
      sky: '#d49060',
    },
    flora: ['cypress'],
    gravity: 1.08,
    atmosphere: { windBase: 0.7, airDrag: 1.15 },
    waterBehavior: 'standard',
    inspirationTags: ['volcanic', 'obsidian', 'heavy-gravity', 'brutalist'],
  },
  'rill-shelf': {
    id: 'rill-shelf',
    name: 'Rill Ice Shelf',
    system: 'Rill Consortium',
    summary: 'Frictionless ice courses. Pale blues and whites. Ball rolls forever; precision is everything.',
    palette: {
      grassFairway: '#b8d8e8',
      grassRough: '#7090a8',
      grassDeepRough: '#4a6878',
      green: '#d8e8f0',
      fringe: '#98b8c8',
      sand: '#e8e0c8',
      water: '#2848a8',
      desert: '#a8b8c8',
      sky: '#c8d8e8',
    },
    flora: [],
    gravity: 0.95,
    atmosphere: { windBase: 1.4, airDrag: 0.85 },
    waterBehavior: 'frictionless-ice',
    inspirationTags: ['tundra', 'ice', 'minimalist', 'precision'],
  },
  'aeris-station': {
    id: 'aeris-station',
    name: 'Aeris Station',
    system: 'Neutral Compact',
    summary: 'Orbital golf on ring sections. Low gravity; engineered turf; neon-lit at night.',
    palette: {
      grassFairway: '#6ea058',
      grassRough: '#3e6a38',
      grassDeepRough: '#1e3e22',
      green: '#6adc78',
      fringe: '#4a8858',
      sand: '#dac8a0',
      water: '#5080c8',
      desert: '#a89880',
      sky: '#1a1a3a',
    },
    flora: ['palm', 'birch'],
    gravity: 0.85,
    atmosphere: { windBase: 0.4, airDrag: 0.9 },
    waterBehavior: 'low-grav-floaty',
    inspirationTags: ['orbital', 'engineered', 'neon', 'low-gravity', 'manicured'],
  },
  'paxi-canyon': {
    id: 'paxi-canyon',
    name: 'Paxi Canyon',
    system: 'Paxi Collective',
    summary: 'Deep wind-carved canyons. Thin atmosphere; vicious cross-winds; sparse vegetation.',
    palette: {
      grassFairway: '#9ea858',
      grassRough: '#5a6228',
      grassDeepRough: '#3a3e18',
      green: '#bac868',
      fringe: '#7a8840',
      sand: '#b89058',
      water: '#4a7890',
      desert: '#c8925a',
      sky: '#e8b060',
    },
    flora: ['palm', 'cypress'],
    gravity: 1.02,
    atmosphere: { windBase: 1.8, airDrag: 0.75 },
    waterBehavior: 'standard',
    inspirationTags: ['canyon', 'wind', 'desert', 'sparse', 'dramatic'],
  },
};

export const PLANET_OPTIONS = Object.values(PLANETS).map((p) => ({
  id: p.id,
  name: p.name,
  system: p.system,
  summary: p.summary,
}));
