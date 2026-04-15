import { Chunk } from "./Chunk.js";

export enum DecorType {
  Grass = 0,
  Shrub = 1,
  Rock = 2,
  Tree = 3,
  Flower = 4,
  Mushroom = 5,
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
};

export class DecorationGenerator {
  private static readonly maxInstancesPerChunk = 260;
  public static readonly blockTypeWood = 20;
  public static readonly blockTypeLeaves = 21;
  public static readonly blockTypeBirchWood = 22;
  public static readonly blockTypeSpruceLeaves = 23;
  public static readonly blockTypeDecorRock = 24;

  public generateForChunk(chunkKey: string, chunk: Chunk): DecorBuffer {
    const columnSamples = this.sampleColumns(chunk);

    const instances: ColumnSample[] = [];
    const treeCubePositions: number[] = [];
    const treeCubeTypes: number[] = [];
    for (const sample of columnSamples.values()) {
      if (instances.length >= DecorationGenerator.maxInstancesPerChunk) {
        break;
      }
      const placementChance = this.rand01(
        `${chunkKey}|${sample.x}|${sample.z}|place`,
      );
      const altitude = sample.topY;
      const altitudeFactor = this.clamp01((altitude - 5) / 70);
      const localNoise = this.rand01(`${chunkKey}|${sample.x}|${sample.z}|noise`);
      const threshold = 0.055 - altitudeFactor * 0.025 + localNoise * 0.025;
      if (placementChance > threshold) {
        continue;
      }
      const seedBase = `${chunkKey}|${sample.x}|${sample.z}`;
      const type = this.pickType(seedBase, sample.topY);
      if (type === DecorType.Tree) {
        this.addTreeCubes(sample, seedBase, treeCubePositions, treeCubeTypes);
        continue;
      }
      if (type === DecorType.Rock) {
        this.addRockCubes(sample, seedBase, treeCubePositions, treeCubeTypes);
        continue;
      }
      instances.push(sample);
    }

    if (instances.length === 0) {
      return {
        offsets: new Float32Array(0),
        scales: new Float32Array(0),
        variants: new Float32Array(0),
        types: new Float32Array(0),
        angles: new Float32Array(0),
        tilts: new Float32Array(0),
        treeCubePositions: new Float32Array(treeCubePositions),
        treeCubeTypes: new Float32Array(treeCubeTypes),
        count: 0,
      };
    }

    const offsets = new Float32Array(instances.length * 4);
    const scales = new Float32Array(instances.length);
    const variants = new Float32Array(instances.length);
    const types = new Float32Array(instances.length);
    const angles = new Float32Array(instances.length);
    const tilts = new Float32Array(instances.length);

    instances.forEach((sample, idx) => {
      const seedBase = `${chunkKey}|${sample.x}|${sample.z}`;
      const type = this.pickType(seedBase, sample.topY);
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
      treeCubePositions: new Float32Array(treeCubePositions),
      treeCubeTypes: new Float32Array(treeCubeTypes),
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
      if (
        blockType === Chunk.blockTypeAir
      ) {
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
        });
      }
    }
    return columnSamples;
  }

  private pickType(seed: string, worldY: number): DecorType {
    const r = this.rand01(`${seed}|type`);
    if (worldY > 12 && r < 0.045) {
      return DecorType.Tree;
    }
    if (r < 0.48) {
      return DecorType.Grass;
    }
    if (r < 0.68) {
      return DecorType.Shrub;
    }
    if (r < 0.78) {
      return DecorType.Flower;
    }
    if (r < 0.86) {
      return DecorType.Mushroom;
    }
    if (r < 0.97) {
      return DecorType.Rock;
    }
    return DecorType.Tree;
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
      case DecorType.Grass:
      default:
        return 0.18 + randomScale * 0.14;
    }
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
