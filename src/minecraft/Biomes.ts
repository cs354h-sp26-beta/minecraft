export interface BiomeProfile {
  name: string;
  baseHeight: number;
  reliefScale: number;
  frequencyScale: number;
  highFreqBoost: number;
  octaveGain: number;
}

export const TERRAIN_OCTAVE_TUNING = {
  gridSizes: [4, 8, 16, 32],
  multCoeffs: [1.0, 0.5, 0.25, 0.125],
} as const;

export const BIOME_SELECTION_TUNING = {
  macroOctave: 500,
  detailOctave: 501,
  macroFrequency: 1 / 900,
  detailFrequency: 1 / 450,
  detailMix: 0.16,
  selectorBiasPower: 1.1,
  transitionWidth: 0.12,
} as const;

export const BIOME_BLEND_TUNING = {
  defaultShapeLow: 0.08,
  defaultShapeHigh: 0.92,
} as const;

export const PLAINS_BIOME: BiomeProfile = {
  name: "plains",
  baseHeight: 4,
  reliefScale: 12,
  frequencyScale: 0.52,
  highFreqBoost: 0.3,
  octaveGain: 0.56,
};

export const HILLS_BIOME: BiomeProfile = {
  name: "hills",
  baseHeight: 18,
  reliefScale: 36,
  frequencyScale: 0.6,
  highFreqBoost: 0.52,
  octaveGain: 0.72,
};

export const HIGHLANDS_BIOME: BiomeProfile = {
  name: "highlands",
  baseHeight: 26,
  reliefScale: 52,
  frequencyScale: 0.62,
  highFreqBoost: 0.62,
  octaveGain: 0.78,
};

export const MOUNTAINS_BIOME: BiomeProfile = {
  name: "mountains",
  baseHeight: 40,
  reliefScale: 60,
  frequencyScale: 0.62,
  highFreqBoost: 0.48,
  octaveGain: 0.64,
};

export const CRAG_BIOME: BiomeProfile = {
  name: "crag",
  baseHeight: 46,
  reliefScale: 78,
  frequencyScale: 0.95,
  highFreqBoost: 1.2,
  octaveGain: 1.02,
};

// Runtime selection order maps to selector buckets from low to high.
export const ACTIVE_BIOME_PROFILES: BiomeProfile[] = [
  PLAINS_BIOME,
//   HILLS_BIOME,
//   HIGHLANDS_BIOME,
  MOUNTAINS_BIOME,
//   CRAG_BIOME,
];
