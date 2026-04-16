// Octave configuration for multi-octave fBm terrain generation
// gridSizes: Lateral frequency per octave (smaller = higher frequency, finer detail)
// multCoeffs: Contribution weight of each octave (typically halved per octave)
export const TERRAIN_OCTAVE_TUNING = {
    gridSizes: [4, 8, 16, 32],
    multCoeffs: [1.0, 0.5, 0.25, 0.125],
};
// World-space biome selector configuration
// selectorOctave/Frequency: Biome region boundaries (low frequency = large regions)
// transitionWidth: Blend zone width between biomes (0-0.5, larger = smoother)
export const BIOME_SELECTION_TUNING = {
    selectorOctave: 500,
    selectorFrequency: 1 / 900,
    transitionWidth: 0.45,
};
// Height value shaping applied after noise normalization [0,1]
// defaultShapeLow/High: Smoothstep bounds for terrain curve
// (pushes low values lower, high values higher for more dramatic relief)
export const BIOME_BLEND_TUNING = {
    defaultShapeLow: 0.08,
    defaultShapeHigh: 0.92,
};
// Low elevation, gentle rolling terrain with minimal variation
export const PLAINS_BIOME = {
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
export const HILLS_BIOME = {
    name: "hills",
    baseHeight: 22,
    reliefScale: 36,
    frequencyScale: 0.6,
    highFreqBoost: 0.52,
    octaveGain: 0.72,
    surfaceBlock: 7, // Grass
    subsurfaceBlock: 0, // Dirt
    snowlineOffset: -1,
};
// High elevation plateau with significant relief and jagged features
export const HIGHLANDS_BIOME = {
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
export const MOUNTAINS_BIOME = {
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
// Frozen wasteland with flat terrain and snow cover
export const TUNDRA_BIOME = {
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
export const DESERT_BIOME = {
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
export const FOREST_BIOME = {
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
function makeBiomeVariant(base, name, baseHeight, reliefScale) {
    return Object.assign(Object.assign({}, base), { name,
        baseHeight,
        reliefScale });
}
export const TUNDRA_LOW_BIOME = makeBiomeVariant(TUNDRA_BIOME, "tundra_low", 2, 5);
export const PLAINS_LOW_BIOME = makeBiomeVariant(PLAINS_BIOME, "plains_low", 4, 10);
export const FOREST_LOW_BIOME = makeBiomeVariant(FOREST_BIOME, "forest_low", 8, 16);
export const DESERT_LOW_BIOME = makeBiomeVariant(DESERT_BIOME, "desert_low", 6, 8);
export const HILLS_LOW_BIOME = makeBiomeVariant(HILLS_BIOME, "hills_low", 18, 30);
export const HIGHLANDS_LOW_BIOME = makeBiomeVariant(HIGHLANDS_BIOME, "highlands_low", 24, 46);
export const MOUNTAINS_LOW_BIOME = makeBiomeVariant(MOUNTAINS_BIOME, "mountains_low", 28, 62);
export const MOUNTAINS_HIGH_BIOME = makeBiomeVariant(MOUNTAINS_BIOME, "mountains_high", 34, 74);
export const HIGHLANDS_HIGH_BIOME = makeBiomeVariant(HIGHLANDS_BIOME, "highlands_high", 30, 54);
export const HILLS_HIGH_BIOME = makeBiomeVariant(HILLS_BIOME, "hills_high", 22, 36);
export const DESERT_HIGH_BIOME = makeBiomeVariant(DESERT_BIOME, "desert_high", 10, 10);
export const FOREST_HIGH_BIOME = makeBiomeVariant(FOREST_BIOME, "forest_high", 14, 22);
export const PLAINS_HIGH_BIOME = makeBiomeVariant(PLAINS_BIOME, "plains_high", 8, 12);
export const TUNDRA_HIGH_BIOME = makeBiomeVariant(TUNDRA_BIOME, "tundra_high", 5, 7);
// Runtime selection order maps to selector buckets from low to high.
export const ACTIVE_BIOME_PROFILES = [
    TUNDRA_LOW_BIOME,
    PLAINS_LOW_BIOME,
    TUNDRA_HIGH_BIOME,
    DESERT_LOW_BIOME,
    PLAINS_HIGH_BIOME,
    FOREST_LOW_BIOME,
    DESERT_HIGH_BIOME,
    FOREST_HIGH_BIOME,
    HILLS_LOW_BIOME,
    HILLS_HIGH_BIOME,
    HIGHLANDS_LOW_BIOME,
    MOUNTAINS_LOW_BIOME,
    HIGHLANDS_HIGH_BIOME,
    MOUNTAINS_HIGH_BIOME,
    HIGHLANDS_HIGH_BIOME,
    MOUNTAINS_LOW_BIOME,
    HIGHLANDS_LOW_BIOME,
    HILLS_HIGH_BIOME,
    HILLS_LOW_BIOME,
    FOREST_HIGH_BIOME,
    DESERT_HIGH_BIOME,
    FOREST_LOW_BIOME,
    PLAINS_HIGH_BIOME,
    DESERT_LOW_BIOME,
    TUNDRA_HIGH_BIOME,
    PLAINS_LOW_BIOME,
    TUNDRA_LOW_BIOME,
];
//# sourceMappingURL=Biomes.js.map