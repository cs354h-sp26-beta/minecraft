import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js";
import { Player } from "./Entity.js";
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
  private heightMap: Float32Array;
  private x: number; // Center of the chunk
  private z: number;
  private size: number; // Number of cubes along each side of the chunk
  private static worldSeed: string = "default";

  // FIXME: This needs to be implemented and integrated.
  //
  // Chunk's personal seed.
  public seed: string;

  // world seed
  public static setWorldSeed(seed: string): void {
    Chunk.worldSeed = seed;
  }

  constructor(centerX: number, centerZ: number, size: number) {
    this.x = centerX;
    this.z = centerZ;
    this.size = size;
    this.cubes = size * size;
    this.generateCubes();
  }

  private origin(): [number, number] {
    return [this.x - this.size / 2, this.z - this.size / 2];
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
    // Apply 2D rotation per octave to break up axis-aligned artifacts
    const theta = octave * 0.8;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const rx = worldX * c - worldZ * s;
    const rz = worldX * s + worldZ * c;

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
    const selector = Math.min(
      0.999999,
      this.sampleValueNoise(
        worldX,
        worldZ,
        BIOME_SELECTION_TUNING.selectorOctave,
        BIOME_SELECTION_TUNING.selectorFrequency,
      ),
    );

    const biomeCount = ACTIVE_BIOME_PROFILES.length;
    const scaled = selector * biomeCount;

    // Find which two biomes we're between
    const lowerIdx = Math.floor(scaled);
    const upperIdx = Math.min(biomeCount - 1, lowerIdx + 1);
    const frac = scaled - lowerIdx; // Position between lower and upper biome (0 to 1)
    const transitionWidth = BIOME_SELECTION_TUNING.transitionWidth;

    // Only blend if within transition zone
    if (frac < transitionWidth || frac > 1 - transitionWidth) {
      // Compute blend factor: 0 = fully lower, 1 = fully upper
      let blendFactor: number;
      if (frac < transitionWidth) {
        blendFactor = this.smoothstep(0, transitionWidth, frac);
      } else {
        blendFactor = this.smoothstep(1 - transitionWidth, 1, frac);
      }

      return this.blendBiomeProfiles(
        ACTIVE_BIOME_PROFILES[lowerIdx],
        ACTIVE_BIOME_PROFILES[upperIdx],
        blendFactor,
      );
    }

    // Solidly in one biome
    return ACTIVE_BIOME_PROFILES[lowerIdx];
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
    const [topLeftX, topLeftZ] = this.origin();

    // TODO: wire Chunk.setWorldSeed(...) to a user-provided world seed from app/UI settings.

    const activeGridSizes: number[] = [...TERRAIN_OCTAVE_TUNING.gridSizes];
    const activeMultCoeffs: number[] = [...TERRAIN_OCTAVE_TUNING.multCoeffs];

    this.heightMap = new Float32Array(this.size * this.size);
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const worldX = topLeftX + j;
        const worldZ = topLeftZ + i;
        this.heightMap[this.size * i + j] = this.sampleHeightAtWorld(
          worldX,
          worldZ,
          activeGridSizes,
          activeMultCoeffs,
        );
      }
    }

    this.cubes = 0;
    for (let k = 0; k < this.size * this.size; k++) {
      this.cubes += Math.max(this.heightMap[k], 1); // at least 1 cube per column
    }
    this.cubePositionsF32 = new Float32Array(4 * this.cubes);

    let cubeIdx = 0;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const height = Math.max(this.heightMap[this.size * i + j], 1);
        for (let y = 0; y < height; y++) {
          this.cubePositionsF32[4 * cubeIdx + 0] = topLeftX + j;
          this.cubePositionsF32[4 * cubeIdx + 1] = y;
          this.cubePositionsF32[4 * cubeIdx + 2] = topLeftZ + i;
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

  // Calculates the height of the floor for a given an xz world player coordinate.
  //
  // FIXME: Using this for collisions is not going to work with overhangs.
  // We will likely need to adapt to an API similar to `Player::collidesWithChunk`.
  // I also just don't like the coupling here, but oh well it is a prototype.
  public floorHeight(worldX: number, worldZ: number): number {
    const [topLeftX, topLeftZ] = this.origin();

    const centerX = Math.round(worldX - topLeftX);
    const centerZ = Math.round(worldZ - topLeftZ);

    let floorY = -Infinity;
    for (let dx = -1; dx <= 1; dx += 1) {
      const cubeChunkX = centerX + dx;
      if (cubeChunkX < 0 || cubeChunkX >= this.size) {
        continue;
      }

      for (let dz = -1; dz <= 1; dz += 1) {
        const cubeChunkZ = centerZ + dz;
        if (cubeChunkZ < 0 || cubeChunkZ >= this.size) {
          continue;
        }

        const cubeWorldX = topLeftX + cubeChunkX;
        const cubeWorldZ = topLeftZ + cubeChunkZ;

        // Clamp.
        // https://stackoverflow.com/questions/11409895/whats-the-most-elegant-way-to-cap-a-number-to-a-segment
        const nearX = Math.max(
          cubeWorldX - 0.5,
          Math.min(cubeWorldX + 0.5, worldX),
        );
        const nearZ = Math.max(
          cubeWorldZ - 0.5,
          Math.min(cubeWorldZ + 0.5, worldZ),
        );

        // Radial distance.
        const rdX = worldX - nearX;
        const rdZ = worldZ - nearZ;
        const hbr = Player.hitboxRadius;
        if (rdX * rdX + rdZ * rdZ < hbr * hbr) {
          const cubeWorldY =
            this.heightMap[cubeChunkZ * this.size + cubeChunkX];
          floorY = Math.max(floorY, cubeWorldY - 0.5);
        }
      }
    }

    return floorY;
  }
}
