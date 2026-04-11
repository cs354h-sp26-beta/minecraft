import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import {
  ACTIVE_BIOME_PROFILES,
  BIOME_BLEND_TUNING,
  BIOME_SELECTION_TUNING,
  TERRAIN_OCTAVE_TUNING,
  type BiomeProfile,
} from "./Biomes.js";

export class Chunk {
  private cubes: number; // Number of cubes that should be *drawn* each frame
  private cubePositionsF32!: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates
  private x: number; // Center of the chunk
  private y: number;
  private size: number; // Number of cubes along each side of the chunk
  private static worldSeed: string = "default";

  // world seed 
  public static setWorldSeed(seed: string): void {
    Chunk.worldSeed = seed;
  }

  constructor(centerX: number, centerY: number, size: number) {
    this.x = centerX;
    this.y = centerY;
    this.size = size;
    this.cubes = size * size;
    this.generateCubes();
  }

  // 32-bit hash so world sampling is deterministic by hash
  private hash32(input: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  // deterministic float in [0, 1) by lattice coord and octave
  private rand01AtLattice(ix: number, iz: number, octave: number): number {
    const h = this.hash32(`${Chunk.worldSeed}|${octave}|${ix}|${iz}`);
    return h / 4294967295;
  }

  // linear interpolation
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
  }

  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = this.clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }


  // bilinear interpolation of 2 biomes for transitions
  private blendBiomeProfiles(
    a: BiomeProfile,
    b: BiomeProfile,
    t: number,
  ): BiomeProfile {
    return {
      name: t < 0.5 ? a.name : b.name,
      baseHeight: this.lerp(a.baseHeight, b.baseHeight, t),
      reliefScale: this.lerp(a.reliefScale, b.reliefScale, t),
      frequencyScale: this.lerp(a.frequencyScale, b.frequencyScale, t),
      highFreqBoost: this.lerp(a.highFreqBoost, b.highFreqBoost, t),
      octaveGain: this.lerp(a.octaveGain, b.octaveGain, t),
    };
  }

  // random value noise given world coord, octave, and frequency
  private sampleValueNoise(
    worldX: number,
    worldZ: number,
    octave: number,
    frequency: number,
  ): number {
    // octave-specific orientation and offset to reduce visible axis alignment
    const theta = 0.37 + octave * 1.213;
    
    // x and z offsets in range [-4096, 4096]
    const offsetX =
      (this.hash32(`${Chunk.worldSeed}|octaveOffsetX|${octave}`) /
        4294967295) *
        8192 -
      4096;
    const offsetZ =
      (this.hash32(`${Chunk.worldSeed}|octaveOffsetZ|${octave}`) /
        4294967295) *
        8192 -
      4096;

    // rotate and offset world coordinates for sampling
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const x = worldX + offsetX;
    const z = worldZ + offsetZ;
    const rx = x * c - z * s;
    const rz = x * s + z * c;

    const sx = rx * frequency;
    const sz = rz * frequency;

    // grid corner lattice coordinates
    const x0 = Math.floor(sx);
    const z0 = Math.floor(sz);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const tx = sx - x0;
    const tz = sz - z0;
    const u = this.smoothstep(0, 1, tx);
    const v = this.smoothstep(0, 1, tz);

    // get random values at the corners of the grid cell
    const v00 = this.rand01AtLattice(x0, z0, octave);
    const v10 = this.rand01AtLattice(x1, z0, octave);
    const v01 = this.rand01AtLattice(x0, z1, octave);
    const v11 = this.rand01AtLattice(x1, z1, octave);

    // interpolate between bottom corners
    const a = this.lerp(v00, v10, u);

    // interpolate between top corners
    const b = this.lerp(v01, v11, u);
    
    // interpolate between top and bottom
    return this.lerp(a, b, v);
  }

  // Discrete biome regions in world space with a narrow smooth transition band.
  private sampleBiomeProfileAt(worldX: number, worldZ: number): BiomeProfile {
    const macro = this.sampleValueNoise(
      worldX,
      worldZ,
      BIOME_SELECTION_TUNING.macroOctave,
      BIOME_SELECTION_TUNING.macroFrequency,
    );
    const detail = this.sampleValueNoise(
      worldX,
      worldZ,
      BIOME_SELECTION_TUNING.detailOctave,
      BIOME_SELECTION_TUNING.detailFrequency,
    );
    const selectorRaw = Math.min(
      0.999999,
      this.clamp01(this.lerp(macro, detail, BIOME_SELECTION_TUNING.detailMix)),
    );
    const selector = Math.min(
      0.999999,
      Math.pow(selectorRaw, BIOME_SELECTION_TUNING.selectorBiasPower),
    );

    const biomeCount = ACTIVE_BIOME_PROFILES.length;
    const scaled = selector * biomeCount;
    const idx = Math.min(biomeCount - 1, Math.floor(scaled));
    const frac = scaled - idx;
    const transitionWidth = BIOME_SELECTION_TUNING.transitionWidth;

    if (frac < transitionWidth && idx > 0) {
      const t = this.smoothstep(0, transitionWidth, frac);
      return this.blendBiomeProfiles(
        ACTIVE_BIOME_PROFILES[idx - 1],
        ACTIVE_BIOME_PROFILES[idx],
        t,
      );
    }

    if (frac > 1 - transitionWidth && idx < biomeCount - 1) {
      const t = this.smoothstep(1 - transitionWidth, 1, frac);
      return this.blendBiomeProfiles(
        ACTIVE_BIOME_PROFILES[idx],
        ACTIVE_BIOME_PROFILES[idx + 1],
        t,
      );
    }

    return ACTIVE_BIOME_PROFILES[idx];
  }

  // sample height at world coordinates by combining multiple octaves of value noise
  private sampleHeightAtWorld(
    worldX: number,
    worldZ: number,
    gridSizes: number[],
    multCoeffs: number[],
  ): number {
    const octaves = Math.min(gridSizes.length, multCoeffs.length);
    const biome = this.sampleBiomeProfileAt(worldX, worldZ);

    let sum = 0;
    let maxPossibleHeight = 0;
    for (let octave = 0; octave < octaves; octave++) {
      const octaveT = octaves <= 1 ? 0 : octave / (octaves - 1);
      const frequency = (gridSizes[octave] / this.size) * biome.frequencyScale;
      const detailWeight = this.lerp(1.0, biome.highFreqBoost, octaveT);
      const coeff = multCoeffs[octave] * detailWeight * biome.octaveGain;
      const noiseVal = this.sampleValueNoise(worldX, worldZ, octave, frequency);
      sum += noiseVal * coeff;
      maxPossibleHeight += coeff;
    }
    const normalized = sum / maxPossibleHeight;
    const shaped = this.smoothstep(
      BIOME_BLEND_TUNING.defaultShapeLow,
      BIOME_BLEND_TUNING.defaultShapeHigh,
      normalized,
    );
    return Math.floor(biome.baseHeight + shaped * biome.reliefScale);
  }

  private generateCubes() {
    const topleftx = this.x - this.size / 2;
    const toplefty = this.y - this.size / 2;

    // TODO: wire Chunk.setWorldSeed(...) to a user-provided world seed from app/UI settings.

    const activeGridSizes: number[] = [...TERRAIN_OCTAVE_TUNING.gridSizes];
    const activeMultCoeffs: number[] = [...TERRAIN_OCTAVE_TUNING.multCoeffs];

    const heightMap = new Float32Array(this.size * this.size);
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const worldX = topleftx + j;
        const worldZ = toplefty + i;
        heightMap[this.size * i + j] = this.sampleHeightAtWorld(
          worldX,
          worldZ,
          activeGridSizes,
          activeMultCoeffs,
        );
      }
    }

    this.cubes = 0;
    for (let k = 0; k < this.size * this.size; k++) {
      this.cubes += Math.max(heightMap[k], 1); // at least 1 cube per column
    }
    this.cubePositionsF32 = new Float32Array(4 * this.cubes);

    let cubeIdx = 0;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const height = Math.max(heightMap[this.size * i + j], 1);
        for (let y = 0; y < height; y++) {
          this.cubePositionsF32[4 * cubeIdx + 0] = topleftx + j;
          this.cubePositionsF32[4 * cubeIdx + 1] = y;
          this.cubePositionsF32[4 * cubeIdx + 2] = toplefty + i;
          this.cubePositionsF32[4 * cubeIdx + 3] = 0;
          cubeIdx++;
        }
      }
    }
  }

  public cubePositions(): Float32Array {
    return this.cubePositionsF32;
  }

  public numCubes(): number {
    return this.cubes;
  }
}
