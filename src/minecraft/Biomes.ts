export interface BiomeProfile {
  name: string;
  // baseHeight: Floor elevation (blocks above sea level)
  baseHeight: number;
  // reliefScale: Height range of noise variation (0 = flat, higher = mountainous)
  reliefScale: number;
  // frequencyScale: Noise detail scale (>1 = finer features, <1 = coarser features)
  frequencyScale: number;
  // highFreqBoost: Emphasis on high-frequency octaves (>1 = jagged, <1 = smooth)
  highFreqBoost: number;
  // octaveGain: Overall amplitude multiplier for all octaves (affects roughness)
  octaveGain: number;
}

// Octave configuration for multi-octave fBm terrain generation
// gridSizes: Lateral frequency per octave (smaller = higher frequency, finer detail)
// multCoeffs: Contribution weight of each octave (typically halved per octave)
export const TERRAIN_OCTAVE_TUNING = {
  gridSizes: [4, 8, 16, 32],
  multCoeffs: [1.0, 0.5, 0.25, 0.125],
} as const;

// World-space biome selector configuration
// selectorOctave/Frequency: Biome region boundaries (low frequency = large regions)
// transitionWidth: Blend zone width between biomes (0-0.5, larger = smoother)
export const BIOME_SELECTION_TUNING = {
  selectorOctave: 500,
  selectorFrequency: 1 / 900,
  transitionWidth: 0.15,
} as const;

// Height value shaping applied after noise normalization [0,1]
// defaultShapeLow/High: Smoothstep bounds for terrain curve
// (pushes low values lower, high values higher for more dramatic relief)
export const BIOME_BLEND_TUNING = {
  defaultShapeLow: 0.08,
  defaultShapeHigh: 0.92,
} as const;

// Low elevation, gentle rolling terrain with minimal variation
export const PLAINS_BIOME: BiomeProfile = {
  name: "plains",
  baseHeight: 4,
  reliefScale: 12,
  frequencyScale: 0.52,
  highFreqBoost: 0.3,
  octaveGain: 0.56,
};

// Rolling hills with moderate elevation and relief
export const HILLS_BIOME: BiomeProfile = {
  name: "hills",
  baseHeight: 18,
  reliefScale: 36,
  frequencyScale: 0.6,
  highFreqBoost: 0.52,
  octaveGain: 0.72,
};

// High elevation plateau with significant relief and jagged features
export const HIGHLANDS_BIOME: BiomeProfile = {
  name: "highlands",
  baseHeight: 26,
  reliefScale: 52,
  frequencyScale: 0.62,
  highFreqBoost: 0.62,
  octaveGain: 0.78,
};

// Tall peaks with high base elevation and large relief variation
export const MOUNTAINS_BIOME: BiomeProfile = {
  name: "mountains",
  baseHeight: 40,
  reliefScale: 90,
  frequencyScale: 0.62,
  highFreqBoost: 0.48,
  octaveGain: 0.64,
};

// Jagged rock formations with high frequency detail and extreme elevation swings
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
