import { Chunk } from "./Chunk.js";

export enum DecorType {
  Grass = 0,
  Shrub = 1,
  Rock = 2,
  Tree = 3,
}

export interface DecorBuffer {
  offsets: Float32Array;
  scales: Float32Array;
  variants: Float32Array;
  types: Float32Array;
  angles: Float32Array;
  tilts: Float32Array;
  count: number;
}

type ColumnSample = {
  x: number;
  z: number;
  topY: number;
};

export class DecorationGenerator {
  private static readonly maxInstancesPerChunk = 260;

  public generateForChunk(chunkKey: string, chunk: Chunk): DecorBuffer {
    const columnSamples = this.sampleColumns(chunk);

    const instances: ColumnSample[] = [];
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
      const tiltRange = type === DecorType.Tree ? 0.12 : 0.3;
      tilts[idx] = (randomTilt - 0.5) * tiltRange;
    });

    return {
      offsets,
      scales,
      variants,
      types,
      angles,
      tilts,
      count: instances.length,
    };
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
    if (worldY > 50 && r < 0.04) {
      return DecorType.Tree;
    }
    if (r < 0.58) {
      return DecorType.Grass;
    }
    if (r < 0.82) {
      return DecorType.Shrub;
    }
    if (r < 0.97) {
      return DecorType.Rock;
    }
    return DecorType.Tree;
  }

  private scaleForType(type: DecorType, randomScale: number): number {
    switch (type) {
      case DecorType.Tree:
        return 1.6 + randomScale * 0.8;
      case DecorType.Rock:
        return 0.55 + randomScale * 0.35;
      case DecorType.Shrub:
        return 0.45 + randomScale * 0.3;
      case DecorType.Grass:
      default:
        return 0.25 + randomScale * 0.2;
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
