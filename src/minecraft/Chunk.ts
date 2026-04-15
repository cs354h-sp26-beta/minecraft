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
  public static readonly blockTypeAir: number = -1;
  public static readonly blockTypeDirt: number = 0;
  public static readonly blockTypeCobble: number = 1;
  public static readonly blockTypeWater: number = 2;
  public static readonly blockTypeCoalOre: number = 3;
  public static readonly blockTypeIronOre: number = 4;
  public static readonly blockTypeGoldOre: number = 5;
  public static readonly blockTypeDiamondOre: number = 6;
  public static readonly blockTypeGrass: number = 7;
  public static readonly blockTypeSand: number = 8;
  public static readonly blockTypeSandstone: number = 9;
  public static readonly blockTypeSnow: number = 10;
  public static readonly SEA_LEVEL: number = 8;

  private cubes: number; // Number of cubes that should be *drawn* each frame
  private cubePositionsF32!: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates. Sent to GPU, only visible cubes
  private cubeTypesF32!: Float32Array; // (1 x cubes) array of block ids. Sent to GPU, only visible cubes
  private heightMapData!: Float32Array; // Ground truth of what blocks exist.
  private blockTypeData!: Int8Array; // 3D cache of block types for cave-aware rendering
  private x: number; // Center of the chunk
  private z: number;
  private size: number; // Number of cubes along each side of the chunk
  private static worldSeed: string = "default";

  private positionMap: Map<string, number>; // Maps local position (x, z, y) to cube type
  private deltaMap: Map<string, number>; // Stores the modified cubes in the chunk (position -> block type)
  private numCubesAdded: number;

  // world seed
  public static setWorldSeed(seed: string): void {
    Chunk.worldSeed = seed;
  }

  constructor(centerX: number, centerZ: number, size: number) {
    this.x = centerX;
    this.z = centerZ;
    this.size = size;
    this.cubes = size * size;
    this.positionMap = new Map();
    this.deltaMap = new Map();
    this.numCubesAdded = 0;
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
    const h = this.hash32(`${Chunk.worldSeed}|${octave}|${ix}|${iy}|${iz}`);
    return h % 12;
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
        const pondNoise = this.perlinNoise3D(worldX, seaLvl, worldZ, 200, 0.04);

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
        const biome = this.sampleBiomeProfileAt(worldX, worldZ);
        for (let y = 0; y < h; y++) {
          this.blockTypeData[y * this.size * this.size + i * this.size + j] =
            this.blockTypeAt(worldX, y, worldZ, h, biome);
        }
      }
    }

    // Count visible cubes: solid terrain blocks + water blocks
    this.cubes = 0;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const height = Math.max(this.heightMapData[this.size * i + j], 1);
        for (let y = 0; y < height; y++) {
          if (this.getGeneratedBlockType(i, j, y) === Chunk.blockTypeAir)
            continue;
          if (this.isExposed(i, j, y)) this.cubes++;
        }
        if (height < seaLvl) {
          for (let y = height; y < seaLvl; y++) {
            if (this.isWaterExposed(i, j, y)) this.cubes++;
          }
        }
      }
    }
    this.cubes += this.numCubesAdded;
    this.cubePositionsF32 = new Float32Array(4 * this.cubes);
    this.cubeTypesF32 = new Float32Array(this.cubes);

    let cubeIdx = 0;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const height = Math.max(this.heightMapData[this.size * i + j], 1);
        for (let y = 0; y <= 100; y++) {
          const key = `${j},${i},${y}`;

          // skip empty cube
          if (
            y < height &&
            (this.deltaMap.get(key) == Chunk.blockTypeAir ||
              this.getGeneratedBlockType(i, j, y) === Chunk.blockTypeAir ||
              !this.isExposed(i, j, y))
          ) {
            continue;
          } else if (
            y >= height &&
            (this.deltaMap.get(key) == undefined ||
              this.deltaMap.get(key) == Chunk.blockTypeAir)
          ) {
            continue;
          }
          this.cubePositionsF32[4 * cubeIdx + 0] = topLeftX + j;
          this.cubePositionsF32[4 * cubeIdx + 1] = y;
          this.cubePositionsF32[4 * cubeIdx + 2] = topLeftZ + i;
          this.cubePositionsF32[4 * cubeIdx + 3] = 0;

          if (this.deltaMap.has(key)) {
            this.cubeTypesF32[cubeIdx] = this.deltaMap.get(key)!;
            this.positionMap.set(key, this.deltaMap.get(key)!);
          } else {
            const blockType = this.getGeneratedBlockType(i, j, y);
            this.cubeTypesF32[cubeIdx] = blockType;
            this.positionMap.set(key, blockType);
          }
          cubeIdx++;
        }
        // Place water blocks only in carved pond basins
        if (height < seaLvl) {
          for (let y = height; y < seaLvl; y++) {
            if (this.isWaterExposed(i, j, y)) {
              this.cubePositionsF32[4 * cubeIdx + 0] = topLeftX + j;
              this.cubePositionsF32[4 * cubeIdx + 1] = y;
              this.cubePositionsF32[4 * cubeIdx + 2] = topLeftZ + i;
              this.cubePositionsF32[4 * cubeIdx + 3] = 0;
              this.cubeTypesF32[cubeIdx] = Chunk.blockTypeWater;
              cubeIdx++;
            }
          }
        }
      }
    }
  }

  private blockTypeAt(
    worldX: number,
    y: number,
    worldZ: number,
    columnHeight: number,
    biome: BiomeProfile,
  ): number {
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

    // Cave carving
    const depth = columnHeight - y;
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

  private getGeneratedBlockType(i: number, j: number, y: number): number {
    return this.blockTypeData[y * this.size * this.size + i * this.size + j];
  }

  // Returns true if the block at (i, j, y) is a solid (non-transparent) block.
  // Out-of-bounds and above-terrain positions are not solid.
  private isSolidAt(i: number, j: number, y: number): boolean {
    if (i < 0 || i >= this.size || j < 0 || j >= this.size) return false;
    if (y < 0) return true; // below world is solid
    const height = this.heightMapData[this.size * i + j];
    if (y >= height) return false; // above terrain = air or water (transparent)
    return this.getGeneratedBlockType(i, j, y) !== Chunk.blockTypeAir;
  }

  // A solid block is exposed if any of its 6 neighbors is non-solid
  // (air, water, cave, or out of chunk bounds).
  private isExposed(i: number, j: number, y: number): boolean {
    if (!this.isSolidAt(i, j, y + 1)) return true; // above
    if (y === 0 || !this.isSolidAt(i, j, y - 1)) return true; // below
    if (!this.isSolidAt(i - 1, j, y)) return true;
    if (!this.isSolidAt(i + 1, j, y)) return true;
    if (!this.isSolidAt(i, j - 1, y)) return true;
    if (!this.isSolidAt(i, j + 1, y)) return true;
    return false;
  }

  // Water block is exposed if it's at the surface or borders a non-water column
  private isWaterExposed(i: number, j: number, y: number): boolean {
    // Top water surface
    if (y === Chunk.SEA_LEVEL - 1) return true;
    // Chunk edge
    if (i <= 0 || i >= this.size - 1 || j <= 0 || j >= this.size - 1)
      return true;
    // Edge of water body
    if (this.getHeight(i - 1, j) <= y) return true;
    if (this.getHeight(i + 1, j) <= y) return true;
    if (this.getHeight(i, j - 1) <= y) return true;
    if (this.getHeight(i, j + 1) <= y) return true;
    return false;
  }

  private getHeight(i: number, j: number): number {
    if (i < 0 || i >= this.size || j < 0 || j >= this.size) return 0;
    return this.heightMapData[this.size * i + j];
  }

  public cubePositions(): Float32Array {
    return this.cubePositionsF32;
  }

  public cubeTypes(): Float32Array {
    return this.cubeTypesF32;
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
            this.heightMapData[cubeChunkZ * this.size + cubeChunkX];
          floorY = Math.max(floorY, cubeWorldY - 0.5);
        }
      }
    }

    return floorY;
  }

  /**
   * Gets the type of the cube located at a given position in world coordinates.
   * Returns undefined for an empty cube.
   */
  public cubeType(
    worldX: number,
    worldZ: number,
    worldY: number,
  ): number | undefined {
    const [topLeftX, topLeftZ] = this.origin();
    const cubeChunkX = Math.round(worldX - topLeftX);
    const cubeChunkZ = Math.round(worldZ - topLeftZ);
    const cubeChunkY = Math.round(worldY);

    const key = `${cubeChunkX},${cubeChunkZ},${cubeChunkY}`;
    return this.positionMap.get(key);
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
  ): Map<string, number> {
    const [topLeftX, topLeftZ] = this.origin();
    const cubeChunkX = Math.round(worldX - topLeftX);
    const cubeChunkZ = Math.round(worldZ - topLeftZ);
    const cubeChunkY = Math.round(worldY);

    const key = `${cubeChunkX},${cubeChunkZ},${cubeChunkY}`;

    if (newType == Chunk.blockTypeAir) {
      this.positionMap.delete(key);
      this.numCubesAdded--;
    } else {
      this.numCubesAdded++;
    }
    this.deltaMap.set(key, newType);
    this.generateCubes(); // re-generate cubes with the modification
    return this.deltaMap;
  }
}
