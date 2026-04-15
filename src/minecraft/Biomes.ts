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
  // surfaceBlock: Block type ID for the top 1 block
  surfaceBlock: number;
  // subsurfaceBlock: Block type ID for blocks 2-3 below surface
  subsurfaceBlock: number;
  // snowlineOffset: Blocks below peak where snow replaces surface block (-1 = no snow)
  snowlineOffset: number;
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
  surfaceBlock: 7, // Grass
  subsurfaceBlock: 0, // Dirt
  snowlineOffset: -1,
};

// Rolling hills with moderate elevation and relief
export const HILLS_BIOME: BiomeProfile = {
  name: "hills",
  baseHeight: 18,
  reliefScale: 36,
  frequencyScale: 0.6,
  highFreqBoost: 0.52,
  octaveGain: 0.72,
  surfaceBlock: 7, // Grass
  subsurfaceBlock: 0, // Dirt
  snowlineOffset: -1,
};

// High elevation plateau with significant relief and jagged features
export const HIGHLANDS_BIOME: BiomeProfile = {
  name: "highlands",
  baseHeight: 26,
  reliefScale: 52,
  frequencyScale: 0.62,
  highFreqBoost: 0.62,
  octaveGain: 0.78,
  surfaceBlock: 7, // Grass
  subsurfaceBlock: 0, // Dirt
  snowlineOffset: -1,
};

// Tall peaks with high base elevation and large relief variation
export const MOUNTAINS_BIOME: BiomeProfile = {
  name: "mountains",
  baseHeight: 30,
  reliefScale: 70,
  frequencyScale: 0.62,
  highFreqBoost: 0.48,
  octaveGain: 0.64,
  surfaceBlock: 1, // Cobble
  subsurfaceBlock: 1, // Cobble
  snowlineOffset: 8,
};

// Jagged rock formations with high frequency detail and extreme elevation swings
export const CRAG_BIOME: BiomeProfile = {
  name: "crag",
  baseHeight: 35,
  reliefScale: 65,
  frequencyScale: 0.95,
  highFreqBoost: 1.2,
  octaveGain: 1.02,
  surfaceBlock: 1, // Cobble
  subsurfaceBlock: 1, // Cobble
  snowlineOffset: 6,
};

// Frozen wasteland with flat terrain and snow cover
export const TUNDRA_BIOME: BiomeProfile = {
  name: "tundra",
  baseHeight: 3,
  reliefScale: 6,
  frequencyScale: 0.4,
  highFreqBoost: 0.2,
  octaveGain: 0.4,
  surfaceBlock: 10, // Snow
  subsurfaceBlock: 0, // Dirt
  snowlineOffset: -1,
};

// Arid landscape with smooth dunes and sandy surface
export const DESERT_BIOME: BiomeProfile = {
  name: "desert",
  baseHeight: 6,
  reliefScale: 10,
  frequencyScale: 0.35,
  highFreqBoost: 0.15,
  octaveGain: 0.45,
  surfaceBlock: 8, // Sand
  subsurfaceBlock: 9, // Sandstone
  snowlineOffset: -1,
};

// Dense woodland with moderate elevation and varied terrain
export const FOREST_BIOME: BiomeProfile = {
  name: "forest",
  baseHeight: 10,
  reliefScale: 20,
  frequencyScale: 0.55,
  highFreqBoost: 0.4,
  octaveGain: 0.6,
  surfaceBlock: 7, // Grass
  subsurfaceBlock: 0, // Dirt
  snowlineOffset: -1,
};

// Runtime selection order maps to selector buckets from low to high.
export const ACTIVE_BIOME_PROFILES: BiomeProfile[] = [
  TUNDRA_BIOME,
  PLAINS_BIOME,
  FOREST_BIOME,
  DESERT_BIOME,
  MOUNTAINS_BIOME,
];
