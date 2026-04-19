import type { PlanetId } from './planets';

export type Landscape =
  | 'links'
  | 'forest'
  | 'desert'
  | 'mountain'
  | 'coastal'
  | 'canyon'
  | 'tundra'
  | 'crystal'
  | 'volcanic'
  | 'lunar-basin';

export type WaterPresence = 'none' | 'incidental' | 'featured' | 'dominant';
export type Difficulty = 'casual' | 'standard' | 'hard' | 'championship';
export type WindLevel = 'calm' | 'moderate' | 'gusting' | 'hazardous';
export type HoleCount = 3 | 9 | 18;

export interface GenerateCourseRequest {
  planet: PlanetId;
  landscape: Landscape;
  waterPresence: WaterPresence;
  difficulty: Difficulty;
  wind: WindLevel;
  holeCount: HoleCount;
  inspiration: string;
  courseName: string;
  designer: string;
}

export interface CostEstimate {
  promptTokens: number;
  completionTokens: number;
  estimatedUsd: number;
  model: string;
}

export interface GeneratedCourseMeta {
  planet: PlanetId;
  landscape: Landscape;
  waterPresence: WaterPresence;
  difficulty: Difficulty;
  wind: WindLevel;
  inspiration: string;
  worldWidth: number;
  worldHeight: number;
  seed: number;
}
