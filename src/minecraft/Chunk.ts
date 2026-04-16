import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import { Player } from "./Entity.js";
import {
  ACTIVE_BIOME_PROFILES,
  BIOME_BLEND_TUNING,
  BIOME_SELECTION_TUNING,
  TERRAIN_OCTAVE_TUNING,
  type BiomeProfile,
} from "./Biomes.js";

export interface BlockData {
  x: number;
  y: number;
  z: number;
  type: number;
}

export class Chunk {
  public static readonly blockTypeAir: number = -1;
  public static readonly blockTypeDirt: number = 0;
  public static readonly blockTypeCobble: number = 1;
  public static readonly blockTypeWater: number = 2;

  public static readonly blockTypeWaterFalling: number = 99; // water rushing straight down
  public static readonly blockTypeWaterFlowLevel3: number = 100; // most water, 1 step from source/falling
  public static readonly blockTypeWaterFlowLevel2: number = 101; // 2 steps out
  public static readonly blockTypeWaterFlowLevel1: number = 102; // least water, max spread (does not spread further)

  public static readonly blockTypeCoalOre: number = 3;
  public static readonly blockTypeIronOre: number = 4;
  public static readonly blockTypeGoldOre: number = 5;
  public static readonly blockTypeDiamondOre: number = 6;
  public static readonly blockTypeGrass: number = 7;
  public static readonly blockTypeSand: number = 8;
  public static readonly blockTypeSandstone: number = 9;
  public static readonly blockTypeSnow: number = 10;
  public static readonly blockTypeNetherite: number = 11;
  public static readonly blockTypeBedrock: number = 12;
  public static readonly blockTypePortal: number = 13;
  public static readonly blockTypePortalFrame: number = 30;
  public static readonly blockTypeLava: number = 14;
  public static readonly blockTypeNetherRack: number = 15;
  public static readonly SEA_LEVEL: number = 8;
  public static readonly NETHER_LAVA_LEVEL: number = 4;
  public static readonly NETHER_CEILING: number = 58;

  private cubes: number; // Number of cubes that should be *drawn* each frame
  private cubePositionsF32!: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates. Sent to GPU, only visible cubes
  private cubeTypesF32!: Float32Array; // (1 x cubes) array of block ids. Sent to GPU, only visible cubes
  private aoF32!: Float32Array; // (2 x cubes) packed per-vertex AO. Sent to GPU, only visible cubes
  private heightMapData!: Float32Array; // Ground truth of what blocks exist.
  private blockTypeData!: Int8Array; // 3D cache of block types for cave-aware rendering
  private x: number; // Center of the chunk
  private z: number;
  private size: number; // Number of cubes along each side of the chunk
  private static seedHash: number = 2166136261 >>> 0;

  private deltaMap: Map<number, number>; // Stores the modified cubes in the chunk (position -> block type)
  private isNether: boolean; // Whether this chunk is in the Nether dimension

  // Encode local chunk coords (j, i, y) into a single numeric key for deltaMap.
  private deltaKey(j: number, i: number, y: number): number {
    return j + i * this.size + y * this.size * this.size;
  }

  // Decode a numeric deltaMap key back to [j, i, y].
  private decodeDeltaKey(key: number): [number, number, number] {
    const j = key % this.size;
    const i = Math.floor(key / this.size) % this.size;
    const y = Math.floor(key / (this.size * this.size));
    return [j, i, y];
  }

  constructor(
    centerX: number,
    centerZ: number,
    size: number,
    deltaMap: Map<number, number> = new Map(),
    isNether = false,
  ) {
    this.x = centerX;
    this.z = centerZ;
    this.size = size;
    this.cubes = size * size;
    this.deltaMap = deltaMap;
    this.isNether = isNether;
    this.generateCubes();
  }

  public static setSeedHash(seedHash: number): void {
    Chunk.seedHash = seedHash >>> 0;
  }

  // Returns the maximum Y for visibility iteration in this chunk column.
  // Nether uses a fixed ceiling; overworld uses terrain height clamped to sea level.
  private getColMaxY(i: number, j: number): number {
    if (this.isNether) return Chunk.NETHER_CEILING;
    return Math.max(this.heightMapData[this.size * i + j], Chunk.SEA_LEVEL);
  }

  private origin(): [number, number] {
    return [this.x - this.size / 2, this.z - this.size / 2];
  }

  private hashInts(a: number, b: number, c: number, d: number): number {
    let h = Chunk.seedHash;
    h = (h ^ ((a + 0x9e3779b9 + (h << 6) + (h >>> 2)) >>> 0)) >>> 0;
    h = (h ^ ((b + 0x9e3779b9 + (h << 6) + (h >>> 2)) >>> 0)) >>> 0;
    h = (h ^ ((c + 0x9e3779b9 + (h << 6) + (h >>> 2)) >>> 0)) >>> 0;
    h = (h ^ ((d + 0x9e3779b9 + (h << 6) + (h >>> 2)) >>> 0)) >>> 0;

    h = (h ^ (h >>> 16)) >>> 0;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
  }

  // deterministic float in [0, 1) by lattice coord and octave
  private rand01AtLattice(ix: number, iz: number, octave: number): number {
    return this.hashInts(ix, iz, octave, ix ^ iz) / 4294967295;
  }

  // gradient directions for 3D Perlin noise
  // chosen bc not axis-aligned, not favoring one axis, and easy dot products
  private static readonly GRAD3: [number, number, number][] = [
    [1, 1, 0],
    [-1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0],
    [1, 0, 1],
    [-1, 0, 1],
    [1, 0, -1],
    [-1, 0, -1],
    [0, 1, 1],
    [0, -1, 1],
    [0, 1, -1],
    [0, -1, -1],
  ];

  // deterministic gradient index at a 3D lattice point
  private grad3At(ix: number, iy: number, iz: number, octave: number): number {
    return this.hashInts(octave, ix, iy, iz) % 12;
  }

  // dot product of gradient vector and offset vector at a 3D lattice corner
  private gradDot3D(
    gradient_index: number,
    dx: number,
    dy: number,
    dz: number,
  ): number {
    const g = Chunk.GRAD3[gradient_index];
    return g[0] * dx + g[1] * dy + g[2] * dz;
  }

  // instead of linear interpolation to avoid grid artifacts
  // from Perlin's "Improving Noise" paper: https://mrl.cs.nyu.edu/~perlin/paper445.pdf
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
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
    const nearest = t < 0.5 ? a : b;
    return {
      name: nearest.name,
      baseHeight: this.lerp(a.baseHeight, b.baseHeight, t),
      reliefScale: this.lerp(a.reliefScale, b.reliefScale, t),
      frequencyScale: this.lerp(a.frequencyScale, b.frequencyScale, t),
      highFreqBoost: this.lerp(a.highFreqBoost, b.highFreqBoost, t),
      octaveGain: this.lerp(a.octaveGain, b.octaveGain, t),
      surfaceBlock: nearest.surfaceBlock,
      subsurfaceBlock: nearest.subsurfaceBlock,
      snowlineOffset: nearest.snowlineOffset,
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

  // 3D Perlin noise
  private perlinNoise3D(
    worldX: number,
    worldY: number,
    worldZ: number,
    octave: number,
    frequency: number,
  ): number {
    const sx = worldX * frequency;
    const sy = worldY * frequency;
    const sz = worldZ * frequency;

    // lattice cell coordinates
    //  lower corner
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const z0 = Math.floor(sz);
    //  upper corner
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const z1 = z0 + 1;

    // offsets within cell
    //  lower corner to sample point
    const dx0 = sx - x0;
    const dy0 = sy - y0;
    const dz0 = sz - z0;
    //  upper corner to sample point
    const dx1 = dx0 - 1;
    const dy1 = dy0 - 1;
    const dz1 = dz0 - 1;

    // get smooth interpolation weights
    const u = this.fade(dx0);
    const v = this.fade(dy0);
    const w = this.fade(dz0);

    // gradient indices at corners
    //  g000 = lower corner, g100 = +x corner, g010 = +y corner, etc.
    const g000 = this.grad3At(x0, y0, z0, octave);
    const g100 = this.grad3At(x1, y0, z0, octave);
    const g010 = this.grad3At(x0, y1, z0, octave);
    const g110 = this.grad3At(x1, y1, z0, octave);
    const g001 = this.grad3At(x0, y0, z1, octave);
    const g101 = this.grad3At(x1, y0, z1, octave);
    const g011 = this.grad3At(x0, y1, z1, octave);
    const g111 = this.grad3At(x1, y1, z1, octave);

    // dot products of gradient and offset vectors at each corner
    const n000 = this.gradDot3D(g000, dx0, dy0, dz0);
    const n100 = this.gradDot3D(g100, dx1, dy0, dz0);
    const n010 = this.gradDot3D(g010, dx0, dy1, dz0);
    const n110 = this.gradDot3D(g110, dx1, dy1, dz0);
    const n001 = this.gradDot3D(g001, dx0, dy0, dz1);
    const n101 = this.gradDot3D(g101, dx1, dy0, dz1);
    const n011 = this.gradDot3D(g011, dx0, dy1, dz1);
    const n111 = this.gradDot3D(g111, dx1, dy1, dz1);

    // trilinear interpolation of dot products
    //  lerp pairs along x
    const a00 = this.lerp(n000, n100, u);
    const a10 = this.lerp(n010, n110, u);
    const a01 = this.lerp(n001, n101, u);
    const a11 = this.lerp(n011, n111, u);

    //  lerp pairs along y
    const b0 = this.lerp(a00, a10, v);
    const b1 = this.lerp(a01, a11, v);

    //  lerp pair along z
    return this.lerp(b0, b1, w);
  }

  // Discrete biome regions in world space with a narrow smooth transition band.
  private sampleBiomeProfileAt(worldX: number, worldZ: number): BiomeProfile {
    const selector =
      this.clamp01(
        this.sampleValueNoise(
          worldX,
          worldZ,
          BIOME_SELECTION_TUNING.selectorOctave,
          BIOME_SELECTION_TUNING.selectorFrequency,
        ),
      ) * 0.999999;

    const biomeCount = ACTIVE_BIOME_PROFILES.length;
    const scaled = selector * biomeCount;

    // Find which two biomes we're between
    const lowerIdx = Math.floor(scaled);
    const upperIdx = (lowerIdx + 1) % biomeCount;
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

    const sampleHeightAtPoint = (sampleX: number, sampleZ: number): number => {
      const biome = this.sampleBiomeProfileAt(sampleX, sampleZ);

      let sum = 0;
      let maxPossibleHeight = 0;
      for (let octave = 0; octave < octaves; octave++) {
        const octaveT = octaves <= 1 ? 0 : octave / (octaves - 1);
        const frequency =
          (gridSizes[octave] / this.size) * biome.frequencyScale;
        const detailWeight = this.lerp(1.0, biome.highFreqBoost, octaveT);
        const coeff = multCoeffs[octave] * detailWeight * biome.octaveGain;
        const noiseVal = this.sampleValueNoise(
          sampleX,
          sampleZ,
          octave,
          frequency,
        );
        sum += noiseVal * coeff;
        maxPossibleHeight += coeff;
      }
      const normalized = sum / maxPossibleHeight;
      const shaped = this.smoothstep(
        BIOME_BLEND_TUNING.defaultShapeLow,
        BIOME_BLEND_TUNING.defaultShapeHigh,
        normalized,
      );
      return Math.min(
        100,
        Math.max(0, biome.baseHeight + shaped * biome.reliefScale),
      );
    };

    // Blend nearby samples to soften sharp per-block transitions at biome borders.
    const blendRadius = 1;
    let weightedHeightSum = 0;
    let weightSum = 0;
    for (let dz = -blendRadius; dz <= blendRadius; dz++) {
      for (let dx = -blendRadius; dx <= blendRadius; dx++) {
        const adx = Math.abs(dx);
        const adz = Math.abs(dz);
        const weight = (blendRadius + 1 - adx) * (blendRadius + 1 - adz);
        const sampleHeight = sampleHeightAtPoint(worldX + dx, worldZ + dz);

        weightedHeightSum += sampleHeight * weight;
        weightSum += weight;
      }
    }

    return Math.min(
      100,
      Math.max(0, Math.floor(weightedHeightSum / weightSum)),
    );
  }

  private generateCubes() {
    const [topLeftX, topLeftZ] = this.origin();

    // TODO: wire Chunk.setWorldSeed(...) to a user-provided world seed from app/UI settings.

    if (this.isNether) {
      // Nether: flat ceiling height map — all columns extend to NETHER_CEILING.
      this.heightMapData = new Float32Array(this.size * this.size).fill(
        Chunk.NETHER_CEILING,
      );
    } else {
      // Overworld: biome-driven multi-octave height map.
      const activeGridSizes: number[] = [...TERRAIN_OCTAVE_TUNING.gridSizes];
      const activeMultCoeffs: number[] = [...TERRAIN_OCTAVE_TUNING.multCoeffs];

      this.heightMapData = new Float32Array(this.size * this.size);
      for (let i = 0; i < this.size; i++) {
        for (let j = 0; j < this.size; j++) {
          const worldX = topLeftX + j;
          const worldZ = topLeftZ + i;
          this.heightMapData[this.size * i + j] = this.sampleHeightAtWorld(
            worldX,
            worldZ,
            activeGridSizes,
            activeMultCoeffs,
          );
        }
      }

      // Carve pond basins using 3D Perlin noise.
      // Sample noise at sea level to find pond regions, then lower terrain there.
      const seaLvl = Chunk.SEA_LEVEL;
      for (let i = 0; i < this.size; i++) {
        for (let j = 0; j < this.size; j++) {
          const worldX = topLeftX + j;
          const worldZ = topLeftZ + i;
          const terrainH = this.heightMapData[this.size * i + j];

          // Only carve near sea level
          if (terrainH > seaLvl + 5) {
            continue;
          }

          // 3D Perlin noise sampled at sea level determines pond placement
          const pondNoise = this.perlinNoise3D(
            worldX,
            seaLvl,
            worldZ,
            200,
            0.04,
          );

          // negative noise = pond basin
          if (pondNoise < -0.15) {
            const carveDepth = Math.floor((-0.15 - pondNoise) * 12);
            this.heightMapData[this.size * i + j] = Math.max(
              1,
              terrainH - carveDepth,
            );
          }
        }
      }
    }

    // Pre-compute 3D block types for cave-aware rendering
    let maxH = 0;
    for (let k = 0; k < this.size * this.size; k++) {
      if (this.heightMapData[k] > maxH) maxH = this.heightMapData[k];
    }
    this.blockTypeData = new Int8Array(this.size * this.size * maxH);
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const worldX = topLeftX + j;
        const worldZ = topLeftZ + i;
        const h = this.heightMapData[this.size * i + j];
        if (this.isNether) {
          for (let y = 0; y < h; y++) {
            this.blockTypeData[y * this.size * this.size + i * this.size + j] =
              this.netherBlockTypeAt(worldX, y, worldZ, h);
          }
        } else {
          const biome = this.sampleBiomeProfileAt(worldX, worldZ);
          for (let y = 0; y < h; y++) {
            this.blockTypeData[y * this.size * this.size + i * this.size + j] =
              this.blockTypeAt(worldX, y, worldZ, h, biome);
          }
        }
      }
    }

    // Count all visible cubes up to column max Y (water fills overworld, lava is in blockTypeData for nether)
    this.cubes = 0;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const colMaxY = this.getColMaxY(i, j);
        for (let y = 0; y < colMaxY; y++) {
          if (
            this.getLocalCubeType(i, j, y) !== Chunk.blockTypeAir &&
            this.isExposed(i, j, y)
          )
            this.cubes++;
        }
      }
    }
    // Count player-placed blocks above the generated column height
    for (const [key, blockType] of this.deltaMap) {
      if (blockType === Chunk.blockTypeAir) continue;
      const [j, i, y] = this.decodeDeltaKey(key);
      const colMaxY = this.getColMaxY(i, j);
      if (y >= colMaxY && this.isExposed(i, j, y)) this.cubes++;
    }

    this.cubePositionsF32 = new Float32Array(4 * this.cubes);
    this.cubeTypesF32 = new Float32Array(this.cubes);
    this.aoF32 = new Float32Array(this.cubes * 2);

    let cubeIdx = 0;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const colMaxY = this.getColMaxY(i, j);
        for (let y = 0; y < colMaxY; y++) {
          const blockType = this.getLocalCubeType(i, j, y);
          if (blockType === Chunk.blockTypeAir || !this.isExposed(i, j, y))
            continue;

          this.cubePositionsF32[4 * cubeIdx + 0] = topLeftX + j;
          this.cubePositionsF32[4 * cubeIdx + 1] = y;
          this.cubePositionsF32[4 * cubeIdx + 2] = topLeftZ + i;
          this.cubePositionsF32[4 * cubeIdx + 3] = 0;

          this.cubeTypesF32[cubeIdx] = blockType;
          this.computeVertexAO(i, j, y, this.aoF32, cubeIdx * 2);
          cubeIdx++;
        }
      }
    }
    // Fill player-placed blocks above the generated column height
    for (const [key, blockType] of this.deltaMap) {
      if (blockType === Chunk.blockTypeAir) continue;
      const [j, i, y] = this.decodeDeltaKey(key);
      const colMaxY = this.getColMaxY(i, j);
      if (y < colMaxY || !this.isExposed(i, j, y)) continue;

      this.cubePositionsF32[4 * cubeIdx + 0] = topLeftX + j;
      this.cubePositionsF32[4 * cubeIdx + 1] = y;
      this.cubePositionsF32[4 * cubeIdx + 2] = topLeftZ + i;
      this.cubePositionsF32[4 * cubeIdx + 3] = 0;

      this.cubeTypesF32[cubeIdx] = blockType;
      this.computeVertexAO(i, j, y, this.aoF32, cubeIdx * 2);
      cubeIdx++;
    }
  }

  private blockTypeAt(
    worldX: number,
    y: number,
    worldZ: number,
    columnHeight: number,
    biome: BiomeProfile,
  ): number {
    // Height = 0: bedrock
    if (y == 0) {
      return Chunk.blockTypeBedrock;
    }

    // Top block: snow if above snowline, otherwise biome surface block
    if (y >= columnHeight - 1) {
      if (
        biome.snowlineOffset >= 0 &&
        columnHeight >= biome.baseHeight + biome.reliefScale * 0.5
      ) {
        return Chunk.blockTypeSnow;
      }
      return biome.surfaceBlock;
    }
    // Subsurface layers use biome subsurface block (no caves near surface)
    if (y >= columnHeight - 3) {
      return biome.subsurfaceBlock;
    }

    // Ravine carving — two 2D noise channels intersect
    // A ravine exists only where both noise values are near 0.5 simultaneously,
    // producing eelongated cuts through the terrain with a V-shaped cross-section
    const depth = columnHeight - y;
    if (depth >= 2 && y > 1) {
      const r1 = this.sampleValueNoise(worldX, worldZ, 170, 0.012) - 0.5;
      const r2 = this.sampleValueNoise(worldX, worldZ, 171, 0.018) - 0.5;

      // V-shape: wider near surface, narrower deeper down
      const maxRavineDepth = Math.min(columnHeight - 3, 30);
      const depthFrac = Math.min(1, (depth - 2) / maxRavineDepth);
      const widthThreshold = 0.035 * (1.0 - depthFrac * 0.8);

      if (Math.abs(r1) < widthThreshold && Math.abs(r2) < 0.09) {
        return Chunk.blockTypeAir;
      }
    }

    // Cave carving
    if (depth >= 5) {
      if (this.perlinNoise3D(worldX, y, worldZ, 160, 0.05) > 0.3) {
        return Chunk.blockTypeAir;
      }
    }

    // Diamond
    if (depth >= 20) {
      if (this.perlinNoise3D(worldX, y, worldZ, 150, 0.15) > 0.45) {
        return Chunk.blockTypeDiamondOre;
      }
    }

    // Gold
    if (depth >= 14) {
      if (this.perlinNoise3D(worldX, y, worldZ, 140, 0.13) > 0.4) {
        return Chunk.blockTypeGoldOre;
      }
    }

    // Iron
    if (depth >= 6) {
      if (this.perlinNoise3D(worldX, y, worldZ, 130, 0.12) > 0.35) {
        return Chunk.blockTypeIronOre;
      }
    }

    // Coal
    if (depth >= 4) {
      if (this.perlinNoise3D(worldX, y, worldZ, 120, 0.1) > 0.3) {
        return Chunk.blockTypeCoalOre;
      }
    }

    // Base block type (dirt vs cobble)
    // two octaves at different frequencies for natural-looking variation
    const noise =
      0.7 * this.perlinNoise3D(worldX, y, worldZ, 100, 0.1) +
      0.3 * this.perlinNoise3D(worldX, y, worldZ, 101, 0.25);

    if (noise > 0.15) {
      return Chunk.blockTypeDirt;
    }
    return Chunk.blockTypeCobble;
  }

  // Assigns a block type for a given voxel inside a Nether chunk.
  // Uses height-biased cave carving: more open near the lava sea, more solid near the ceiling.
  private netherBlockTypeAt(
    worldX: number,
    y: number,
    worldZ: number,
    columnHeight: number,
  ): number {
    // Impassable bedrock floor
    if (y === 0) return Chunk.blockTypeBedrock;

    // Always-solid nether rack ceiling (top 3 rows never carved)
    if (y >= columnHeight - 3) return Chunk.blockTypeNetherRack;

    // Height-based carving threshold: more aggressive near lava level, tighter near ceiling.
    // heightFrac goes 0 → 1 from NETHER_LAVA_LEVEL to ceiling-6.
    const heightFrac = this.clamp01(
      (y - Chunk.NETHER_LAVA_LEVEL) /
        (columnHeight - 6 - Chunk.NETHER_LAVA_LEVEL),
    );
    const threshold = this.lerp(-0.1, 0.35, heightFrac * heightFrac);

    const caveNoise = this.perlinNoise3D(worldX, y, worldZ, 161, 0.035);
    if (caveNoise > threshold) {
      // Carved voxel: below lava level becomes lava, above becomes air
      return y < Chunk.NETHER_LAVA_LEVEL
        ? Chunk.blockTypeLava
        : Chunk.blockTypeAir;
    }

    // Netherite veins deep in the nether
    if (y <= 15 && this.perlinNoise3D(worldX, y, worldZ, 155, 0.14) > 0.42) {
      return Chunk.blockTypeNetherite;
    }

    return Chunk.blockTypeNetherRack;
  }

  // Returns the procedurally generated block type at local chunk coords (i=localZ, j=localX).
  // Handles water for positions above terrain but below sea level.
  private getGeneratedBlockType(i: number, j: number, y: number): number {
    const height = this.heightMapData[this.size * i + j];
    if (y >= height) {
      // In the nether there is no water sea; above the ceiling is just air.
      if (this.isNether) return Chunk.blockTypeAir;
      return y < Chunk.SEA_LEVEL ? Chunk.blockTypeWater : Chunk.blockTypeAir;
    }
    return this.blockTypeData[y * this.size * this.size + i * this.size + j];
  }

  // Returns the effective block type at local chunk coords, applying deltaMap overrides.
  // Skips string key allocation entirely for unedited chunks.
  private getLocalCubeType(i: number, j: number, y: number): number {
    if (this.deltaMap.size > 0) {
      const override = this.deltaMap.get(this.deltaKey(j, i, y));
      if (override !== undefined) return override;
    }
    return this.getGeneratedBlockType(i, j, y);
  }

  // Compute per-vertex AO for the block at local coords (i, j, y).
  // Returns two packed floats. Each float encodes 3 faces × 4 corners × 2 bits.
  // Float 0: faces Top(+Y), Left(-X), Right(+X)
  // Float 1: faces Front(+Z), Back(-Z), Bottom(-Y)
  // Each face byte: corners (--),(+-),(-+),(++) each 2 bits, AO value 0-3.
  private computeVertexAO(
    i: number,
    j: number,
    y: number,
    out: Float32Array,
    idx: number,
  ): void {
    const opaqueAt = (ci: number, cj: number, cy: number): boolean =>
      this.isOpaqueAt(ci, cj, cy);

    // Classic Minecraft AO formula for one corner:
    // side1, side2 = two edge neighbors; diag = diagonal neighbor
    // If both sides are solid, AO=0 (fully occluded, corner is hidden).
    // Otherwise AO = 3 - (side1 + side2 + diag).
    const aoCorner = (s1: boolean, s2: boolean, d: boolean): number => {
      if (s1 && s2) return 0;
      return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (d ? 1 : 0));
    };

    let float0 = 0;
    let float1 = 0;

    // Face 0: Top (+Y) — normal dy=+1, t1=j(X), t2=i(Z)
    {
      const ny = y + 1;
      let fb = 0;
      for (let c = 0; c < 4; c++) {
        const s1 = c & 1 ? 1 : -1;
        const s2 = c & 2 ? 1 : -1;
        fb |=
          aoCorner(
            opaqueAt(i, j + s1, ny),
            opaqueAt(i + s2, j, ny),
            opaqueAt(i + s2, j + s1, ny),
          ) <<
          (c * 2);
      }
      float0 += fb;
    }

    // Face 1: Left (-X) — normal dj=-1, t1=i(Z), t2=y(Y)
    {
      const nj = j - 1;
      let fb = 0;
      for (let c = 0; c < 4; c++) {
        const s1 = c & 1 ? 1 : -1;
        const s2 = c & 2 ? 1 : -1;
        fb |=
          aoCorner(
            opaqueAt(i + s1, nj, y),
            opaqueAt(i, nj, y + s2),
            opaqueAt(i + s1, nj, y + s2),
          ) <<
          (c * 2);
      }
      float0 += fb * 256;
    }

    // Face 2: Right (+X) — normal dj=+1, t1=i(Z), t2=y(Y)
    {
      const nj = j + 1;
      let fb = 0;
      for (let c = 0; c < 4; c++) {
        const s1 = c & 1 ? 1 : -1;
        const s2 = c & 2 ? 1 : -1;
        fb |=
          aoCorner(
            opaqueAt(i + s1, nj, y),
            opaqueAt(i, nj, y + s2),
            opaqueAt(i + s1, nj, y + s2),
          ) <<
          (c * 2);
      }
      float0 += fb * 65536;
    }

    // Face 3: Front (+Z) — normal di=+1, t1=j(X), t2=y(Y)
    {
      const ni = i + 1;
      let fb = 0;
      for (let c = 0; c < 4; c++) {
        const s1 = c & 1 ? 1 : -1;
        const s2 = c & 2 ? 1 : -1;
        fb |=
          aoCorner(
            opaqueAt(ni, j + s1, y),
            opaqueAt(ni, j, y + s2),
            opaqueAt(ni, j + s1, y + s2),
          ) <<
          (c * 2);
      }
      float1 += fb;
    }

    // Face 4: Back (-Z) — normal di=-1, t1=j(X), t2=y(Y)
    {
      const ni = i - 1;
      let fb = 0;
      for (let c = 0; c < 4; c++) {
        const s1 = c & 1 ? 1 : -1;
        const s2 = c & 2 ? 1 : -1;
        fb |=
          aoCorner(
            opaqueAt(ni, j + s1, y),
            opaqueAt(ni, j, y + s2),
            opaqueAt(ni, j + s1, y + s2),
          ) <<
          (c * 2);
      }
      float1 += fb * 256;
    }

    // Face 5: Bottom (-Y) — normal dy=-1, t1=j(X), t2=i(Z)
    {
      const ny = y - 1;
      let fb = 0;
      for (let c = 0; c < 4; c++) {
        const s1 = c & 1 ? 1 : -1;
        const s2 = c & 2 ? 1 : -1;
        fb |=
          aoCorner(
            opaqueAt(i, j + s1, ny),
            opaqueAt(i + s2, j, ny),
            opaqueAt(i + s2, j + s1, ny),
          ) <<
          (c * 2);
      }
      float1 += fb * 65536;
    }

    out[idx] = float0;
    out[idx + 1] = float1;
  }

  // Returns true if the block at (i, j, y) is non-air (solid terrain or water).
  // Returns true if the block at local chunk coords fully fills its voxel for rendering purposes.
  // Opaque blocks hide the faces of their neighbors; non-opaque blocks do not.
  // Source water and falling water are full-height blocks → opaque.
  // Leveled flow water (FlowLevel1–3) are partial-height blocks → non-opaque.
  private isOpaqueAt(i: number, j: number, y: number): boolean {
    if (i < 0 || i >= this.size || j < 0 || j >= this.size) return false;
    if (y < 0) return true; // below world is always opaque
    const t = this.getLocalCubeType(i, j, y);
    if (t === Chunk.blockTypeAir) return false;
    if (
      t >= Chunk.blockTypeWaterFlowLevel3 &&
      t <= Chunk.blockTypeWaterFlowLevel1
    )
      return false;
    return true;
  }

  // A block is exposed (and should be rendered) if any of its 6 neighbors is non-opaque.
  private isExposed(i: number, j: number, y: number): boolean {
    if (!this.isOpaqueAt(i, j, y + 1)) return true; // above
    if (y === 0 || !this.isOpaqueAt(i, j, y - 1)) return true; // below
    if (!this.isOpaqueAt(i - 1, j, y)) return true;
    if (!this.isOpaqueAt(i + 1, j, y)) return true;
    if (!this.isOpaqueAt(i, j - 1, y)) return true;
    if (!this.isOpaqueAt(i, j + 1, y)) return true;
    return false;
  }

  public updateCubePositionsAndTypes() {
    const [topLeftX, topLeftZ] = this.origin();

    // Single-pass: use oversized buffers then trim, avoiding a double iteration
    const maxPossible = this.cubes + 7; // at most 7 new cubes exposed by a single edit
    let capacity = Math.max(maxPossible, 1024);
    let positions = new Float32Array(4 * capacity);
    let types = new Float32Array(capacity);
    let aoArr = new Float32Array(capacity * 2);

    let cubeIdx = 0;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const colMaxY = this.getColMaxY(i, j);
        for (let y = 0; y < colMaxY; y++) {
          const blockType = this.getLocalCubeType(i, j, y);
          if (blockType === Chunk.blockTypeAir || !this.isExposed(i, j, y))
            continue;

          if (cubeIdx >= capacity) {
            capacity = capacity * 2;
            const newPos = new Float32Array(4 * capacity);
            newPos.set(positions);
            positions = newPos;
            const newTypes = new Float32Array(capacity);
            newTypes.set(types);
            types = newTypes;
            const newAO = new Float32Array(capacity * 2);
            newAO.set(aoArr);
            aoArr = newAO;
          }

          positions[4 * cubeIdx + 0] = topLeftX + j;
          positions[4 * cubeIdx + 1] = y;
          positions[4 * cubeIdx + 2] = topLeftZ + i;
          positions[4 * cubeIdx + 3] = 0;

          types[cubeIdx] = blockType;
          this.computeVertexAO(i, j, y, aoArr, cubeIdx * 2);
          cubeIdx++;
        }
      }
    }
    // Fill player-placed blocks above the generated column height
    for (const [key, blockType] of this.deltaMap) {
      if (blockType === Chunk.blockTypeAir) continue;
      const [j, i, y] = this.decodeDeltaKey(key);
      const colMaxY = this.getColMaxY(i, j);
      if (y < colMaxY || !this.isExposed(i, j, y)) continue;

      if (cubeIdx >= capacity) {
        capacity = capacity * 2;
        const newPos = new Float32Array(4 * capacity);
        newPos.set(positions);
        positions = newPos;
        const newTypes = new Float32Array(capacity);
        newTypes.set(types);
        types = newTypes;
        const newAO = new Float32Array(capacity * 2);
        newAO.set(aoArr);
        aoArr = newAO;
      }

      positions[4 * cubeIdx + 0] = topLeftX + j;
      positions[4 * cubeIdx + 1] = y;
      positions[4 * cubeIdx + 2] = topLeftZ + i;
      positions[4 * cubeIdx + 3] = 0;

      types[cubeIdx] = blockType;
      this.computeVertexAO(i, j, y, aoArr, cubeIdx * 2);
      cubeIdx++;
    }

    this.cubes = cubeIdx;
    this.cubePositionsF32 = positions.subarray(0, 4 * cubeIdx);
    this.cubeTypesF32 = types.subarray(0, cubeIdx);
    this.aoF32 = aoArr.subarray(0, cubeIdx * 2);
  }

  public cubePositions(): Float32Array {
    return this.cubePositionsF32;
  }

  public cubeTypes(): Float32Array {
    return this.cubeTypesF32;
  }

  public cubeAO(): Float32Array {
    return this.aoF32;
  }

  public numCubes(): number {
    return this.cubes;
  }

  public heightMap(): Float32Array {
    return this.heightMapData;
  }

  public topLeftX(): number {
    return this.x - this.size / 2;
  }

  public topLeftZ(): number {
    return this.z - this.size / 2;
  }

  public chunkSize(): number {
    return this.size;
  }

  // Calculates the height of the floor for a given an xz world player coordinate.
  //
  // FIXME: Using this for collisions is not going to work with overhangs.
  // We will likely need to adapt to an API similar to `Player::collidesWithChunk`.
  // I also just don't like the coupling here, but oh well it is a prototype.
  //   public floorHeight(worldX: number, worldZ: number): number {
  //     const [topLeftX, topLeftZ] = this.origin();

  //     const centerX = Math.round(worldX - topLeftX);
  //     const centerZ = Math.round(worldZ - topLeftZ);

  //     let floorY = -Infinity;
  //     for (let dx = -1; dx <= 1; dx += 1) {
  //       const cubeChunkX = centerX + dx;
  //       if (cubeChunkX < 0 || cubeChunkX >= this.size) {
  //         continue;
  //       }

  //       for (let dz = -1; dz <= 1; dz += 1) {
  //         const cubeChunkZ = centerZ + dz;
  //         if (cubeChunkZ < 0 || cubeChunkZ >= this.size) {
  //           continue;
  //         }

  //         const cubeWorldX = topLeftX + cubeChunkX;
  //         const cubeWorldZ = topLeftZ + cubeChunkZ;

  //         // Clamp.
  //         // https://stackoverflow.com/questions/11409895/whats-the-most-elegant-way-to-cap-a-number-to-a-segment
  //         const nearX = Math.max(
  //           cubeWorldX - 0.5,
  //           Math.min(cubeWorldX + 0.5, worldX),
  //         );
  //         const nearZ = Math.max(
  //           cubeWorldZ - 0.5,
  //           Math.min(cubeWorldZ + 0.5, worldZ),
  //         );

  //         // Radial distance.
  //         const rdX = worldX - nearX;
  //         const rdZ = worldZ - nearZ;
  //         const hbr = Player.hitboxRadius;
  //         if (rdX * rdX + rdZ * rdZ < hbr * hbr) {
  //           const cubeWorldY = this.topBlockAt(cubeWorldX, cubeWorldZ);
  //           if (cubeWorldY !== -Infinity) {
  //             floorY = Math.max(floorY, cubeWorldY - 0.5);
  //           }
  //         }
  //       }
  //     }

  //     return floorY;
  //   }

  /**
   * Highest occupied block center Y in the world column at (worldX, worldZ).
   * Uses current voxel occupancy (positionMap/cubeType), so mined/built edits
   * are reflected immediately.
   */
  public topBlockAt(
    worldX: number,
    worldZ: number,
    yMaxInclusive: number = 100,
  ): { type: number; height: number } | undefined {
    const [topLeftX, topLeftZ] = this.origin();
    const cubeChunkX = Math.round(worldX - topLeftX);
    const cubeChunkZ = Math.round(worldZ - topLeftZ);
    if (
      cubeChunkX < 0 ||
      cubeChunkX >= this.size ||
      cubeChunkZ < 0 ||
      cubeChunkZ >= this.size
    ) {
      return undefined;
    }

    let y = this.heightMapData[this.size * cubeChunkZ + cubeChunkX];
    while (
      y < 100 &&
      this.getLocalCubeType(cubeChunkZ, cubeChunkX, y) !== Chunk.blockTypeAir
    ) {
      y++;
    }
    while (
      y >= 0 &&
      this.getLocalCubeType(cubeChunkZ, cubeChunkX, y) === Chunk.blockTypeAir
    ) {
      y--;
    }
    return {
      type: this.getLocalCubeType(cubeChunkZ, cubeChunkX, y),
      height: y,
    };
  }

  ///// Cylinder-voxel collision

  /**
   *  True if the horizontal circle (radius r) at (px,pz) overlaps the block
   *  column centered at integer (ix, iz).
   */
  public static circleOverlapsBlockColumn(
    px: number,
    pz: number,
    r: number,
    ix: number,
    iz: number,
  ): boolean {
    const nx = Math.max(ix - 0.5, Math.min(ix + 0.5, px));
    const nz = Math.max(iz - 0.5, Math.min(iz + 0.5, pz));
    const dx = px - nx;
    const dz = pz - nz;
    return dx * dx + dz * dz < r * r + 1e-10;
  }

  /**
   * Vertical capsule: y in [headY - height, headY], circular footprint of
   * radius `radius`.
   *
   * Calls solidAt(ix, iy, iz) for integer block centers in the swept bounds.
   */
  public static verticalCapsuleIntersectsSolids(
    solidAt: (ix: number, iy: number, iz: number) => boolean,
    px: number,
    headY: number,
    pz: number,
    radius: number,
    capsuleHeight: number,
  ): boolean {
    const yLow = headY - capsuleHeight;
    const yHigh = headY;
    const iMin = Math.floor(px - radius - 0.5);
    const iMax = Math.ceil(px + radius + 0.5);
    const kMin = Math.floor(pz - radius - 0.5);
    const kMax = Math.ceil(pz + radius + 0.5);
    const iyMin = Math.floor(yLow - 0.5);
    const iyMax = Math.ceil(yHigh + 0.5);

    for (let ix = iMin; ix <= iMax; ix++) {
      for (let iz = kMin; iz <= kMax; iz++) {
        if (!Chunk.circleOverlapsBlockColumn(px, pz, radius, ix, iz)) {
          continue;
        }
        for (let iy = iyMin; iy <= iyMax; iy++) {
          if (!solidAt(ix, iy, iz)) continue;
          const bLow = iy - 0.5;
          const bHigh = iy + 0.5;
          if (yLow < bHigh && yHigh > bLow) return true;
        }
      }
    }
    return false;
  }

  public static worldToChunkAxis(worldVal: number, chunkSize: number): number {
    return Math.floor((worldVal + chunkSize / 2) / chunkSize) * chunkSize;
  }

  public static isSolidBlockWorldWide(
    getChunk: Chunk.ColumnProvider,
    wx: number,
    wy: number,
    wz: number,
  ): boolean {
    const ix = Math.round(wx);
    const iy = Math.round(wy);
    const iz = Math.round(wz);
    const chunk = getChunk(ix, iz);
    if (!chunk) return false;
    return chunk.isSolidBlockAtWorld(ix, iy, iz);
  }

  public static cylinderIntersectsSolidWorld(
    getChunk: Chunk.ColumnProvider,
    px: number,
    headY: number,
    pz: number,
    radius: number,
    capsuleHeight: number,
  ): boolean {
    return Chunk.verticalCapsuleIntersectsSolids(
      (ix, iy, iz) => Chunk.isSolidBlockWorldWide(getChunk, ix, iy, iz),
      px,
      headY,
      pz,
      radius,
      capsuleHeight,
    );
  }

  public static supportedHeadYWorld(
    getChunk: Chunk.ColumnProvider,
    px: number,
    pz: number,
    feetY: number,
    radius: number,
    capsuleHeight: number,
    footSlack: number,
  ): number {
    let supportTop = -Infinity;
    const iMin = Math.floor(px - radius - 0.5);
    const iMax = Math.ceil(px + radius + 0.5);
    const kMin = Math.floor(pz - radius - 0.5);
    const kMax = Math.ceil(pz + radius + 0.5);

    for (let ix = iMin; ix <= iMax; ix++) {
      for (let iz = kMin; iz <= kMax; iz++) {
        if (!Chunk.circleOverlapsBlockColumn(px, pz, radius, ix, iz)) {
          continue;
        }
        const chunk = getChunk(ix, iz);
        const colMax = chunk
          ? chunk.supportTopUnderFeet(ix, iz, feetY, footSlack)
          : -Infinity;
        if (colMax === -Infinity) continue;
        supportTop = Math.max(supportTop, colMax);
      }
    }
    if (supportTop === -Infinity) return -Infinity;
    return supportTop + capsuleHeight;
  }

  public static separateVerticalCapsuleFromSolids(
    getChunk: Chunk.ColumnProvider,
    px: number,
    py: number,
    pz: number,
    radius: number,
    capsuleHeight: number,
    vy: number,
  ): number {
    const solid = (hx: number, hy: number, hz: number) =>
      Chunk.cylinderIntersectsSolidWorld(
        getChunk,
        hx,
        hy,
        hz,
        radius,
        capsuleHeight,
      );

    if (!solid(px, py, pz)) return py;
    const step = 0.025;
    const maxSteps = 400;

    let downY = py;
    let s = 0;
    while (solid(px, downY, pz) && s < maxSteps) {
      downY -= step;
      s++;
    }
    const downClear = !solid(px, downY, pz);

    let upY = py;
    s = 0;
    while (solid(px, upY, pz) && s < maxSteps) {
      upY += step;
      s++;
    }
    const upClear = !solid(px, upY, pz);

    if (!downClear && !upClear) return py;
    if (!downClear) return upY;
    if (!upClear) return downY;

    const downDist = py - downY;
    const upDist = upY - py;

    if (vy > 1e-4) {
      return downY;
    }
    if (vy < -1e-4) {
      return upY;
    }
    if (downDist < upDist) return downY;
    if (upDist < downDist) return upY;
    return downY;
  }

  /**
   * Step down until the vertical capsule is clear (ceiling / upward
   * penetration).
   */
  public static resolveUpwardPenetration(
    getChunk: Chunk.ColumnProvider,
    px: number,
    py: number,
    pz: number,
    radius: number,
    capsuleHeight: number,
  ): number {
    if (
      !Chunk.cylinderIntersectsSolidWorld(
        getChunk,
        px,
        py,
        pz,
        radius,
        capsuleHeight,
      )
    ) {
      return py;
    }
    const sepStep = 0.025;
    let y = py;
    let guard = 0;
    while (
      Chunk.cylinderIntersectsSolidWorld(
        getChunk,
        px,
        y,
        pz,
        radius,
        capsuleHeight,
      ) &&
      guard < 400
    ) {
      y -= sepStep;
      guard++;
    }
    return y;
  }

  public static tryHorizontalCylinderMove(
    getChunk: Chunk.ColumnProvider,
    px: number,
    py: number,
    pz: number,
    dx: number,
    dz: number,
    radius: number,
    capsuleHeight: number,
  ): { ax: number; az: number } {
    const solid = (x: number, z: number) =>
      Chunk.cylinderIntersectsSolidWorld(
        getChunk,
        x,
        py,
        z,
        radius,
        capsuleHeight,
      );

    if (!solid(px + dx, pz + dz)) return { ax: dx, az: dz };
    if (dx !== 0 && !solid(px + dx, pz)) return { ax: dx, az: 0 };
    if (dz !== 0 && !solid(px, pz + dz)) return { ax: 0, az: dz };
    return { ax: 0, az: 0 };
  }

  /**
   * Samples head positions along a short jump arc; false if any sample
   * intersects solid.
   */
  public static verticalCapsuleHasHeadroomForJump(
    getChunk: Chunk.ColumnProvider,
    px: number,
    headY: number,
    pz: number,
    radius: number,
    capsuleHeight: number,
  ): boolean {
    for (let dh = 0; dh <= 1; dh += 0.35) {
      if (
        Chunk.cylinderIntersectsSolidWorld(
          getChunk,
          px,
          headY + dh,
          pz,
          radius,
          capsuleHeight,
        )
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Solid voxel at integer block center (world coords); false if empty or out
   * of this chunk.
   */
  public isSolidBlockAtWorld(wx: number, wy: number, wz: number): boolean {
    const type = this.cubeType(wx, wz, wy);
    if (type === undefined || type === Chunk.blockTypeAir) return false;
    // Water is non-solid — the player walks and swims through it.
    if (this.isWater(wx, wz, wy)) return false;
    return true;
  }

  /**
   * Highest block top (iy + 0.5) in this column at/below feetY + footSlack, or
   * -Infinity if none. Only columns owned by this chunk contribute; others
   * should query the owning chunk.
   */
  public supportTopUnderFeet(
    columnWorldX: number,
    columnWorldZ: number,
    feetY: number,
    footSlack: number,
    yMaxInclusive: number = 100,
  ): number {
    let colMax = -Infinity;
    for (let iy = 0; iy <= yMaxInclusive; iy++) {
      const type = this.cubeType(columnWorldX, columnWorldZ, iy);
      if (
        type === undefined ||
        type === Chunk.blockTypeAir ||
        type === Chunk.blockTypeWater
      ) {
        continue;
      }
      const top = iy + 0.5;
      if (top <= feetY + footSlack) {
        colMax = Math.max(colMax, top);
      }
    }
    return colMax;
  }

  /**
   * Gets the type of the cube located at a given position in world coordinates.
   * Returns blockTypeAir for empty positions.
   */
  public cubeType(
    worldX: number,
    worldZ: number,
    worldY: number,
  ): number | undefined {
    const [topLeftX, topLeftZ] = this.origin();
    const localX = Math.round(worldX - topLeftX);
    const localZ = Math.round(worldZ - topLeftZ);
    const localY = Math.round(worldY);
    return this.getLocalCubeType(localZ, localX, localY);
  }

  /**
   * Changes the type of the cube at the given world coordinates and returns the chunks
   * new delta map.
   */
  public changeCubeType(
    worldX: number,
    worldZ: number,
    worldY: number,
    newType: number,
  ): Map<number, number> {
    const [topLeftX, topLeftZ] = this.origin();
    const cubeChunkX = Math.round(worldX - topLeftX);
    const cubeChunkZ = Math.round(worldZ - topLeftZ);
    const cubeChunkY = Math.round(worldY);

    this.deltaMap.set(
      this.deltaKey(cubeChunkX, cubeChunkZ, cubeChunkY),
      newType,
    );
    this.updateCubePositionsAndTypes();
    return this.deltaMap;
  }

  public changeCubeTypeNoUpdate(
    worldX: number,
    worldZ: number,
    worldY: number,
    newType: number,
  ): Map<number, number> {
    const [topLeftX, topLeftZ] = this.origin();
    const cubeChunkX = Math.round(worldX - topLeftX);
    const cubeChunkZ = Math.round(worldZ - topLeftZ);
    const cubeChunkY = Math.round(worldY);

    this.deltaMap.set(
      this.deltaKey(cubeChunkX, cubeChunkZ, cubeChunkY),
      newType,
    );
    return this.deltaMap;
  }

  // Returns true if the block at the given world coords is any water (source, falling, or flowing).
  public isWater(worldX: number, worldZ: number, worldY: number): boolean {
    const t = this.cubeType(worldX, worldZ, worldY);
    return (
      t === Chunk.blockTypeWater ||
      t === Chunk.blockTypeWaterFalling ||
      (t !== undefined &&
        t >= Chunk.blockTypeWaterFlowLevel3 &&
        t <= Chunk.blockTypeWaterFlowLevel1)
    );
  }

  // Returns true if the block at the given world coords is lava.
  public isLava(worldX: number, worldZ: number, worldY: number): boolean {
    return this.cubeType(worldX, worldZ, worldY) === Chunk.blockTypeLava;
  }

  // Returns true if the block at the given world coords is a non-source (falling or flowing) water block.
  public isFlowWater(worldX: number, worldZ: number, worldY: number): boolean {
    const t = this.cubeType(worldX, worldZ, worldY);
    return (
      t === Chunk.blockTypeWaterFalling ||
      (t !== undefined &&
        t >= Chunk.blockTypeWaterFlowLevel3 &&
        t <= Chunk.blockTypeWaterFlowLevel1)
    );
  }
  /**
   * Applies multiple block changes and rebuilds chunk render buffers once.
   * By default, changes only fill air voxels.
   */
  public applyCubeTypeChanges(
    blocks: BlockData[],
    overwriteSolid: boolean = false,
  ): Map<number, number> {
    if (blocks.length === 0) {
      return this.deltaMap;
    }

    const [topLeftX, topLeftZ] = this.origin();
    let changed = false;

    for (const block of blocks) {
      const cubeChunkX = Math.round(block.x - topLeftX);
      const cubeChunkZ = Math.round(block.z - topLeftZ);
      const cubeChunkY = Math.round(block.y);

      if (
        cubeChunkX < 0 ||
        cubeChunkX >= this.size ||
        cubeChunkZ < 0 ||
        cubeChunkZ >= this.size ||
        cubeChunkY < 0
      ) {
        continue;
      }

      const currentType = this.getLocalCubeType(
        cubeChunkZ,
        cubeChunkX,
        cubeChunkY,
      );
      if (!overwriteSolid && currentType !== Chunk.blockTypeAir) {
        continue;
      }

      if (currentType === block.type) {
        continue;
      }

      this.deltaMap.set(
        this.deltaKey(cubeChunkX, cubeChunkZ, cubeChunkY),
        block.type,
      );
      changed = true;
    }

    if (changed) {
      this.updateCubePositionsAndTypes();
    }
    return this.deltaMap;
  }
}

// Check if the chunk is defined
export namespace Chunk {
  export type ColumnProvider = (ix: number, iz: number) => Chunk | undefined;
}
