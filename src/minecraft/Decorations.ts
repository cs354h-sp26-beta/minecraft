import { Chunk, type BlockData } from "./Chunk.js";
import {
  ACTIVE_BIOME_PROFILES,
  BIOME_SELECTION_TUNING,
  type BiomeProfile,
} from "./Biomes.js";

export enum DecorType {
  Grass = 0,
  Shrub = 1,
  Rock = 2,
  Tree = 3,
  Flower = 4,
  Mushroom = 5,
  Reed = 6,
  DeadBush = 7,
}

export interface DecorBuffer {
  offsets: Float32Array;
  scales: Float32Array;
  variants: Float32Array;
  types: Float32Array;
  angles: Float32Array;
  tilts: Float32Array;
  treeCubePositions: Float32Array;
  treeCubeTypes: Float32Array;
  count: number;
}

type ColumnSample = {
  x: number;
  z: number;
  topY: number;
  nearWater: boolean;
  surfaceType: number;
};

type BillboardInstance = {
  sample: ColumnSample;
  seedBase: string;
  type: DecorType;
};

type SpawnWeights = {
  grass: number;
  shrub: number;
  flower: number;
  mushroom: number;
  rock: number;
  tree: number;
  reed: number;
  deadBush: number;
};

export class DecorationGenerator {
  private static readonly maxInstancesPerChunk = 260;
  private static readonly maxTreesPerChunk = 22;
  private static readonly maxRocksPerChunk = 20;
  public static readonly blockTypeWood = 20;
  public static readonly blockTypeLeaves = 21;
  public static readonly blockTypeBirchWood = 22;
  public static readonly blockTypeSpruceLeaves = 23;
  public static readonly blockTypeDecorRock = 24;

  public generateForChunk(chunkKey: string, chunk: Chunk): DecorBuffer {
    const columnSamples = this.sampleColumns(chunk);

    const instances: BillboardInstance[] = [];
    const treeCubePositions: number[] = [];
    const treeCubeTypes: number[] = [];
    const perTypeCount = new Map<DecorType, number>();

    const incrementTypeCount = (type: DecorType): void => {
      perTypeCount.set(type, (perTypeCount.get(type) ?? 0) + 1);
    };

    const getTypeCount = (type: DecorType): number => {
      return perTypeCount.get(type) ?? 0;
    };

    for (const sample of columnSamples.values()) {
      if (instances.length >= DecorationGenerator.maxInstancesPerChunk) {
        break;
      }
      const biome = this.sampleBiomeProfileAt(sample.x, sample.z);
      const placementChance = this.rand01(
        `${chunkKey}|${sample.x}|${sample.z}|place`,
      );
      const altitude = sample.topY;
      const altitudeFactor = this.clamp01((altitude - 5) / 70);
      const localNoise = this.rand01(
        `${chunkKey}|${sample.x}|${sample.z}|noise`,
      );
      const biomeDensity = this.getBiomeDensityMultiplier(biome.name);
      const threshold =
        (0.055 - altitudeFactor * 0.025 + localNoise * 0.025) * biomeDensity;
      if (placementChance > threshold) {
        continue;
      }
      const seedBase = `${chunkKey}|${sample.x}|${sample.z}`;
      const type = this.pickType(seedBase, sample, biome);
      if (type === DecorType.Tree) {
        if (
          getTypeCount(DecorType.Tree) >= DecorationGenerator.maxTreesPerChunk
        ) {
          continue;
        }
        this.addTreeCubes(sample, seedBase, treeCubePositions, treeCubeTypes);
        incrementTypeCount(DecorType.Tree);
        continue;
      }
      if (type === DecorType.Rock) {
        if (
          getTypeCount(DecorType.Rock) >= DecorationGenerator.maxRocksPerChunk
        ) {
          continue;
        }
        this.addRockCubes(sample, seedBase, treeCubePositions, treeCubeTypes);
        incrementTypeCount(DecorType.Rock);
        continue;
      }

      if (getTypeCount(type) >= this.getBillboardTypeCap(type)) {
        continue;
      }
      instances.push({ sample, seedBase, type });
      incrementTypeCount(type);
    }

    if (treeCubeTypes.length > 0) {
      const cubeBlocks: BlockData[] = [];
      for (let i = 0; i < treeCubeTypes.length; i++) {
        const base = i * 4;
        cubeBlocks.push({
          x: Math.round(treeCubePositions[base + 0]),
          y: Math.round(treeCubePositions[base + 1]),
          z: Math.round(treeCubePositions[base + 2]),
          type: treeCubeTypes[i],
        });
      }
      chunk.applyCubeTypeChanges(cubeBlocks);
    }

    if (instances.length === 0) {
      return {
        offsets: new Float32Array(0),
        scales: new Float32Array(0),
        variants: new Float32Array(0),
        types: new Float32Array(0),
        angles: new Float32Array(0),
        tilts: new Float32Array(0),
        treeCubePositions: new Float32Array(0),
        treeCubeTypes: new Float32Array(0),
        count: 0,
      };
    }

    const offsets = new Float32Array(instances.length * 4);
    const scales = new Float32Array(instances.length);
    const variants = new Float32Array(instances.length);
    const types = new Float32Array(instances.length);
    const angles = new Float32Array(instances.length);
    const tilts = new Float32Array(instances.length);

    instances.forEach((instance, idx) => {
      const { sample, seedBase, type } = instance;
      const randomScale = this.rand01(`${seedBase}|scale`);
      const randomVariant = this.rand01(`${seedBase}|variant`);
      const randomAngle = this.rand01(`${seedBase}|angle`);
      const randomTilt = this.rand01(`${seedBase}|tilt`);

      const scale = this.scaleForType(type, randomScale);
      const posIndex = idx * 4;
      offsets[posIndex + 0] = sample.x + 0.0;
      offsets[posIndex + 1] = sample.topY;
      offsets[posIndex + 2] = sample.z + 0.0;
      offsets[posIndex + 3] = 1.0;

      scales[idx] = scale;
      variants[idx] = randomVariant;
      types[idx] = type;
      angles[idx] = randomAngle * Math.PI * 2;
      const tiltRange = type === DecorType.Grass ? 0.12 : 0.04;
      tilts[idx] = (randomTilt - 0.5) * tiltRange;
    });

    return {
      offsets,
      scales,
      variants,
      types,
      angles,
      tilts,
      treeCubePositions: new Float32Array(0),
      treeCubeTypes: new Float32Array(0),
      count: instances.length,
    };
  }

  private addTreeCubes(
    sample: ColumnSample,
    seed: string,
    positions: number[],
    types: number[],
  ): void {
    const variant = Math.floor(this.rand01(`${seed}|treeVariant`) * 3);
    const baseY = Math.ceil(sample.topY);
    if (variant === 0) {
      this.addOakTree(sample, baseY, seed, positions, types);
    } else if (variant === 1) {
      this.addSpruceTree(sample, baseY, seed, positions, types);
    } else {
      this.addBirchTree(sample, baseY, seed, positions, types);
    }
  }

  private addOakTree(
    sample: ColumnSample,
    baseY: number,
    seed: string,
    positions: number[],
    types: number[],
  ): void {
    const trunkHeight = 4 + Math.floor(this.rand01(`${seed}|oakTrunk`) * 2);
    for (let y = 0; y < trunkHeight; y++) {
      this.pushTreeCube(
        positions,
        types,
        sample.x,
        baseY + y,
        sample.z,
        DecorationGenerator.blockTypeWood,
      );
    }

    const leafBase = baseY + trunkHeight - 2;
    for (let dy = 0; dy <= 4; dy++) {
      const radius = dy === 0 || dy === 4 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          const edge = Math.abs(dx) + Math.abs(dz) > radius + 1;
          if (
            (corner || edge) &&
            radius === 2 &&
            this.rand01(`${seed}|oak|${dy}|${dx}|${dz}`) < 0.35
          ) {
            continue;
          }
          this.pushTreeCube(
            positions,
            types,
            sample.x + dx,
            leafBase + dy,
            sample.z + dz,
            DecorationGenerator.blockTypeLeaves,
          );
        }
      }
    }
  }

  private addSpruceTree(
    sample: ColumnSample,
    baseY: number,
    seed: string,
    positions: number[],
    types: number[],
  ): void {
    const trunkHeight = 8 + Math.floor(this.rand01(`${seed}|spruceTrunk`) * 4);
    for (let y = 0; y < trunkHeight; y++) {
      this.pushTreeCube(
        positions,
        types,
        sample.x,
        baseY + y,
        sample.z,
        DecorationGenerator.blockTypeWood,
      );
    }

    const topY = baseY + trunkHeight;
    for (let layer = 0; layer < 7; layer++) {
      const radius = layer < 2 ? 1 : layer < 5 ? 2 : 1;
      const y = topY - layer;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > radius + 1) {
            continue;
          }
          if (
            radius === 2 &&
            Math.abs(dx) === 2 &&
            Math.abs(dz) === 2 &&
            this.rand01(`${seed}|spruce|${layer}|${dx}|${dz}`) < 0.65
          ) {
            continue;
          }
          this.pushTreeCube(
            positions,
            types,
            sample.x + dx,
            y,
            sample.z + dz,
            DecorationGenerator.blockTypeSpruceLeaves,
          );
        }
      }
    }
    this.pushTreeCube(
      positions,
      types,
      sample.x,
      topY + 1,
      sample.z,
      DecorationGenerator.blockTypeSpruceLeaves,
    );
  }

  private addBirchTree(
    sample: ColumnSample,
    baseY: number,
    seed: string,
    positions: number[],
    types: number[],
  ): void {
    const trunkHeight = 5 + Math.floor(this.rand01(`${seed}|birchTrunk`) * 2);
    for (let y = 0; y < trunkHeight; y++) {
      this.pushTreeCube(
        positions,
        types,
        sample.x,
        baseY + y,
        sample.z,
        DecorationGenerator.blockTypeBirchWood,
      );
    }

    const leafBase = baseY + trunkHeight - 2;
    for (let dy = 0; dy <= 3; dy++) {
      const radius = dy === 3 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) {
            continue;
          }
          this.pushTreeCube(
            positions,
            types,
            sample.x + dx,
            leafBase + dy,
            sample.z + dz,
            DecorationGenerator.blockTypeLeaves,
          );
        }
      }
    }
  }

  private addRockCubes(
    sample: ColumnSample,
    seed: string,
    positions: number[],
    types: number[],
  ): void {
    const baseY = Math.ceil(sample.topY);
    this.pushTreeCube(
      positions,
      types,
      sample.x,
      baseY,
      sample.z,
      DecorationGenerator.blockTypeDecorRock,
    );
    if (this.rand01(`${seed}|rockA`) > 0.45) {
      this.pushTreeCube(
        positions,
        types,
        sample.x + 1,
        baseY,
        sample.z,
        DecorationGenerator.blockTypeDecorRock,
      );
    }
    if (this.rand01(`${seed}|rockB`) > 0.65) {
      this.pushTreeCube(
        positions,
        types,
        sample.x,
        baseY,
        sample.z + 1,
        DecorationGenerator.blockTypeDecorRock,
      );
    }
  }

  private pushTreeCube(
    positions: number[],
    types: number[],
    x: number,
    y: number,
    z: number,
    type: number,
  ): void {
    positions.push(x, y, z, 0);
    types.push(type);
  }

  private sampleColumns(chunk: Chunk): Map<string, ColumnSample> {
    const positions = chunk.cubePositions();
    const types = chunk.cubeTypes();
    const waterColumns = new Set<string>();
    const columnSamples = new Map<string, ColumnSample>();
    for (let i = 0; i < positions.length; i += 4) {
      const cubeIdx = i / 4;
      const blockType = types[cubeIdx];
      const wx = positions[i + 0];
      const wy = positions[i + 1];
      const wz = positions[i + 2];
      const key = `${wx},${wz}`;

      if (blockType === Chunk.blockTypeWater) {
        waterColumns.add(key);
        columnSamples.delete(key);
        continue;
      }
      if (blockType === Chunk.blockTypeAir) {
        continue;
      }
      if (waterColumns.has(key)) {
        continue;
      }
      const existing = columnSamples.get(key);
      if (!existing || wy > existing.topY) {
        columnSamples.set(key, {
          x: wx,
          z: wz,
          topY: wy + 0.5,
          nearWater: false,
          surfaceType: blockType,
        });
      }
    }

    // Mark columns neighboring water for water-loving decoration types.
    for (const sample of columnSamples.values()) {
      const baseX = sample.x;
      const baseZ = sample.z;
      let nearWater = false;
      for (let dz = -1; dz <= 1 && !nearWater; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) {
            continue;
          }
          if (waterColumns.has(`${baseX + dx},${baseZ + dz}`)) {
            nearWater = true;
            break;
          }
        }
      }
      sample.nearWater = nearWater;
    }

    return columnSamples;
  }

  private pickType(
    seed: string,
    sample: ColumnSample,
    biome: BiomeProfile,
  ): DecorType {
    const weights = this.getSpawnWeightsForSample(sample, biome);
    const table: Array<[DecorType, number]> = [
      [DecorType.Grass, weights.grass],
      [DecorType.Shrub, weights.shrub],
      [DecorType.Flower, weights.flower],
      [DecorType.Mushroom, weights.mushroom],
      [DecorType.Rock, weights.rock],
      [DecorType.Tree, weights.tree],
      [DecorType.Reed, weights.reed],
      [DecorType.DeadBush, weights.deadBush],
    ];

    let total = 0;
    for (const entry of table) {
      total += entry[1];
    }
    if (total <= 0) {
      return DecorType.Grass;
    }

    const r = this.rand01(`${seed}|type`) * total;
    let cumulative = 0;
    for (const [type, weight] of table) {
      cumulative += weight;
      if (r <= cumulative) {
        return type;
      }
    }
    return DecorType.Grass;
  }

  private scaleForType(type: DecorType, randomScale: number): number {
    switch (type) {
      case DecorType.Tree:
        return 1.8 + randomScale * 0.7;
      case DecorType.Rock:
        return 0.0;
      case DecorType.Shrub:
        return 0.42 + randomScale * 0.22;
      case DecorType.Flower:
        return 0.16 + randomScale * 0.08;
      case DecorType.Mushroom:
        return 0.18 + randomScale * 0.1;
      case DecorType.Reed:
        return 0.34 + randomScale * 0.36;
      case DecorType.DeadBush:
        return 0.34 + randomScale * 0.28;
      case DecorType.Grass:
      default:
        return 0.18 + randomScale * 0.14;
    }
  }

  private getBillboardTypeCap(type: DecorType): number {
    switch (type) {
      case DecorType.Grass:
        return 110;
      case DecorType.Shrub:
        return 56;
      case DecorType.Flower:
        return 40;
      case DecorType.Mushroom:
        return 32;
      case DecorType.Reed:
        return 36;
      case DecorType.DeadBush:
        return 44;
      default:
        return 40;
    }
  }

  private getBiomeDensityMultiplier(biomeName: string): number {
    switch (biomeName) {
      case "mountains":
      case "crag":
        return 0.78;
      case "highlands":
      case "hills":
        return 0.9;
      case "plains":
      default:
        return 1.08;
    }
  }

  private getSpawnWeightsForSample(
    sample: ColumnSample,
    biome: BiomeProfile,
  ): SpawnWeights {
    const biomeName = biome.name;
    const weights: SpawnWeights = this.getBaseSpawnWeightsForBiome(biomeName);

    // Surface-based hard rules.
    const isSandSurface =
      sample.surfaceType === Chunk.blockTypeSand ||
      sample.surfaceType === Chunk.blockTypeSandstone;
    const isSnowSurface = sample.surfaceType === Chunk.blockTypeSnow;
    const isRockSurface = sample.surfaceType === Chunk.blockTypeCobble;
    const isGrassSurface = sample.surfaceType === Chunk.blockTypeGrass;

    if (isSnowSurface) {
      weights.grass = 0;
      weights.shrub = 0;
      weights.flower = 0;
      weights.reed = 0;
      weights.tree = 0;
      weights.deadBush = 0;
      if (!isRockSurface) {
        weights.mushroom = 0;
      }
    }

    // Green foliage only on grass.
    if (!isGrassSurface) {
      weights.tree = 0;
      weights.grass = 0;
      weights.shrub = 0;
      weights.flower = 0;
      weights.reed = 0;
    }

    // Mushrooms are allowed on grass or stone only.
    if (!isGrassSurface && !isRockSurface) {
      weights.mushroom = 0;
    }

    // Dead bush only on sand/sandstone.
    if (!isSandSurface) {
      weights.deadBush = 0;
    } else {
      // Keep dead bushes visible in sandy regions, but not too dense.
      weights.deadBush = Math.max(weights.deadBush, 0.5);
      weights.rock *= 0.72;
    }

    // Reed only near water.
    if (!sample.nearWater) {
      weights.reed = 0;
    }

    // Trees require headroom.
    if (sample.topY < Chunk.SEA_LEVEL + 2) {
      weights.tree = 0;
    }

    // Keep mountain biomes mostly rocky.
    if (biomeName === "mountains" || biomeName === "crag") {
      weights.tree = 0;
      weights.grass = 0;
      weights.shrub = 0;
      weights.flower = 0;
      weights.reed = 0;
      weights.deadBush = 0;
      if (!isRockSurface) {
        weights.mushroom = 0;
      }
    }

    return weights;
  }

  private getBaseSpawnWeightsForBiome(biomeName: string): SpawnWeights {
    switch (biomeName) {
      case "forest":
        return {
          grass: 0.34,
          shrub: 0.22,
          flower: 0.1,
          mushroom: 0.11,
          rock: 0.07,
          tree: 0.13,
          reed: 0.04,
          deadBush: 0.0,
        };
      case "desert":
        return {
          grass: 0.0,
          shrub: 0.0,
          flower: 0.0,
          mushroom: 0.0,
          rock: 0.28,
          tree: 0.0,
          reed: 0.0,
          deadBush: 0.24,
        };
      case "mountains":
      case "crag":
        return {
          grass: 0.0,
          shrub: 0.0,
          flower: 0.0,
          mushroom: 0.1,
          rock: 0.44,
          tree: 0.0,
          reed: 0.0,
          deadBush: 0.0,
        };
      case "tundra":
        return {
          grass: 0.08,
          shrub: 0.12,
          flower: 0.01,
          mushroom: 0.03,
          rock: 0.4,
          tree: 0.02,
          reed: 0.0,
          deadBush: 0.0,
        };
      default:
        return {
          grass: 0.38,
          shrub: 0.2,
          flower: 0.11,
          mushroom: 0.07,
          rock: 0.1,
          tree: 0.08,
          reed: 0.02,
          deadBush: 0.0,
        };
    }
  }

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
    const lowerIdx = Math.floor(scaled);
    return ACTIVE_BIOME_PROFILES[lowerIdx];
  }

  private sampleValueNoise(
    worldX: number,
    worldZ: number,
    octave: number,
    frequency: number,
  ): number {
    const sx = worldX * frequency;
    const sz = worldZ * frequency;

    const x0 = Math.floor(sx);
    const z0 = Math.floor(sz);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const tx = sx - x0;
    const tz = sz - z0;
    const u = this.smoothstep(0, 1, tx);
    const v = this.smoothstep(0, 1, tz);

    const v00 = this.rand01AtLattice(x0, z0, octave);
    const v10 = this.rand01AtLattice(x1, z0, octave);
    const v01 = this.rand01AtLattice(x0, z1, octave);
    const v11 = this.rand01AtLattice(x1, z1, octave);

    const a = this.lerp(v00, v10, u);
    const b = this.lerp(v01, v11, u);
    return this.lerp(a, b, v);
  }

  private rand01AtLattice(ix: number, iz: number, octave: number): number {
    return this.rand01(`biome|${octave}|${ix}|${iz}`);
  }

  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = this.clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
  }

  private rand01(seed: string): number {
    return this.hash32(seed) / 0xffffffff;
  }

  private hash32(input: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }
}
