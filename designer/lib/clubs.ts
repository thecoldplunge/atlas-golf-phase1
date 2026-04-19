export const clubTypes = [
  { key: 'PT', name: 'Putter', short: 'PT', carryYards: 40 },
  { key: 'LW', name: 'Lob Wedge', short: 'LW', carryYards: 70 },
  { key: 'SW', name: 'Sand Wedge', short: 'SW', carryYards: 80 },
  { key: 'GW', name: 'Gap Wedge', short: 'GW', carryYards: 90 },
  { key: 'PW', name: 'Pitching Wedge', short: 'PW', carryYards: 105 },
  { key: '9I', name: '9 Iron', short: '9i', carryYards: 120 },
  { key: '8I', name: '8 Iron', short: '8i', carryYards: 130 },
  { key: '7I', name: '7 Iron', short: '7i', carryYards: 140 },
  { key: '6I', name: '6 Iron', short: '6i', carryYards: 150 },
  { key: '5I', name: '5 Iron', short: '5i', carryYards: 160 },
  { key: '4I', name: '4 Iron', short: '4i', carryYards: 170 },
  { key: '3I', name: '3 Iron', short: '3i', carryYards: 180 },
  { key: '7W', name: '7 Wood', short: '7w', carryYards: 190 },
  { key: '5W', name: '5 Wood', short: '5w', carryYards: 210 },
  { key: '3W', name: '3 Wood', short: '3w', carryYards: 225 },
  { key: 'DR', name: 'Driver', short: 'DR', carryYards: 250 },
] as const;

export type ClubTypeKey = (typeof clubTypes)[number]['key'];

export type BrandedClub = {
  id: string;
  clubType: ClubTypeKey;
  brand: string;
  model: string;
  value: number;
  distance: number;
  accuracy: number;
  forgiveness: number;
  spin: number;
  feel: number;
};

export const defaultClub: Omit<BrandedClub, 'id'> = {
  clubType: 'DR',
  brand: 'Atlas',
  model: 'Prototype',
  value: 0,
  distance: 50,
  accuracy: 50,
  forgiveness: 50,
  spin: 50,
  feel: 50,
};

export const initialClubs: BrandedClub[] = [
  { id: 'club-1', clubType: 'PT', brand: 'Atlas', model: 'Stock Putter', value: 100, distance: 50, accuracy: 50, forgiveness: 50, spin: 50, feel: 50 },
  { id: 'club-2', clubType: 'LW', brand: 'Atlas', model: 'Stock Lob Wedge', value: 120, distance: 50, accuracy: 45, forgiveness: 45, spin: 65, feel: 50 },
  { id: 'club-3', clubType: 'SW', brand: 'Atlas', model: 'Stock Sand Wedge', value: 120, distance: 50, accuracy: 50, forgiveness: 50, spin: 62, feel: 50 },
  { id: 'club-4', clubType: 'GW', brand: 'Atlas', model: 'Stock Gap Wedge', value: 125, distance: 50, accuracy: 50, forgiveness: 52, spin: 58, feel: 50 },
  { id: 'club-5', clubType: 'PW', brand: 'Atlas', model: 'Stock Pitching Wedge', value: 130, distance: 50, accuracy: 50, forgiveness: 55, spin: 55, feel: 50 },
  { id: 'club-6', clubType: '9I', brand: 'Atlas', model: 'Stock 9 Iron', value: 140, distance: 50, accuracy: 50, forgiveness: 58, spin: 50, feel: 50 },
  { id: 'club-7', clubType: '8I', brand: 'Atlas', model: 'Stock 8 Iron', value: 145, distance: 50, accuracy: 50, forgiveness: 55, spin: 50, feel: 50 },
  { id: 'club-8', clubType: '7I', brand: 'Atlas', model: 'Stock 7 Iron', value: 150, distance: 50, accuracy: 50, forgiveness: 52, spin: 50, feel: 50 },
  { id: 'club-9', clubType: '6I', brand: 'Atlas', model: 'Stock 6 Iron', value: 155, distance: 50, accuracy: 50, forgiveness: 48, spin: 50, feel: 50 },
  { id: 'club-10', clubType: '5I', brand: 'Atlas', model: 'Stock 5 Iron', value: 160, distance: 50, accuracy: 50, forgiveness: 45, spin: 50, feel: 50 },
  { id: 'club-11', clubType: '4I', brand: 'Atlas', model: 'Stock 4 Iron', value: 165, distance: 50, accuracy: 50, forgiveness: 42, spin: 50, feel: 50 },
  { id: 'club-12', clubType: '3I', brand: 'Atlas', model: 'Stock 3 Iron', value: 170, distance: 50, accuracy: 50, forgiveness: 40, spin: 50, feel: 50 },
  { id: 'club-13', clubType: '7W', brand: 'Atlas', model: 'Stock 7 Wood', value: 190, distance: 50, accuracy: 50, forgiveness: 50, spin: 50, feel: 50 },
  { id: 'club-14', clubType: '5W', brand: 'Atlas', model: 'Stock 5 Wood', value: 210, distance: 50, accuracy: 50, forgiveness: 50, spin: 50, feel: 50 },
  { id: 'club-15', clubType: '3W', brand: 'Atlas', model: 'Stock 3 Wood', value: 225, distance: 50, accuracy: 50, forgiveness: 50, spin: 50, feel: 50 },
  { id: 'club-16', clubType: 'DR', brand: 'Atlas', model: 'Stock Driver', value: 250, distance: 50, accuracy: 50, forgiveness: 50, spin: 50, feel: 50 },
];

export function getClubType(clubType: ClubTypeKey) {
  return clubTypes.find((type) => type.key === clubType) ?? clubTypes[0];
}
