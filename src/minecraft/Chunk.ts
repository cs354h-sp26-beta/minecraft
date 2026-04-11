import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js";

export class Chunk {
  private cubes: number; // Number of cubes that should be *drawn* each frame
  private cubePositionsF32!: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates
  private x: number; // Center of the chunk
  private y: number;
  private size: number; // Number of cubes along each side of the chunk

  constructor(centerX: number, centerY: number, size: number) {
    this.x = centerX;
    this.y = centerY;
    this.size = size;
    this.cubes = size * size;
    this.generateCubes();
  }

  // returns gridSize x gridSize grid of white noise
  private generateWhiteNoise(rng: Rand, gridSize: number): Float32Array {
    const noise = new Float32Array(gridSize * gridSize);
    for (let i = 0; i < gridSize * gridSize; i++) {
      noise[i] = rng.next();
    }
    return noise;
  }

  // upsamples gridSize x gridSize grid to targetSize x targetSize grid
  private upsampleBilinear(
    noise: Float32Array,
    gridSize: number,
    targetSize: number,
  ): Float32Array {
    const result = new Float32Array(targetSize * targetSize);
    for (let i = 0; i < targetSize; i++) {
      for (let j = 0; j < targetSize; j++) {
        // where is it on the small grid?
        const srcI = (i / targetSize) * gridSize;
        const srcJ = (j / targetSize) * gridSize;

        // 4 nearest on small grid
        const i0 = Math.floor(srcI);
        const j0 = Math.floor(srcJ);
        const i1 = Math.min(i0 + 1, gridSize - 1);
        const j1 = Math.min(j0 + 1, gridSize - 1);

        // distances from nearest (to interpolate)
        const fi = srcI - i0;
        const fj = srcJ - j0;

        // bilinear interpolation
        const v00 = noise[i0 * gridSize + j0];
        const v01 = noise[i0 * gridSize + j1];
        const v10 = noise[i1 * gridSize + j0];
        const v11 = noise[i1 * gridSize + j1];

        const top = v00 * (1 - fj) + v01 * fj;
        const bot = v10 * (1 - fj) + v11 * fj;
        result[i * targetSize + j] = top * (1 - fi) + bot * fi;
      }
    }
    return result;
  }

  private generateCubes() {
    const topleftx = this.x - this.size / 2;
    const toplefty = this.y - this.size / 2;

    // chunk position as part of the seed for deterministic per-chunk generation
    const seed = `${this.x}_${this.y}`;
    let rng = new Rand(seed);

    const NUM_OCTAVES: number = 4;
    const gridSizes: number[] = [4, 8, 16, 32];
    const multCoeffs: number[] = [1.0, 0.5, 0.25, 0.125];

    const heightMap = new Float32Array(this.size * this.size);
    let maxPossibleHeight = 0;

    for (let i = 0; i < NUM_OCTAVES; i++) {
      const gridSize = gridSizes[i];
      const currCoeff = multCoeffs[i];
      const whiteNoise = this.generateWhiteNoise(rng, gridSize);
      const upsampled = this.upsampleBilinear(whiteNoise, gridSize, this.size);
      for (let k = 0; k < this.size * this.size; k++) {
        heightMap[k] += upsampled[k] * currCoeff;
      }
      maxPossibleHeight += currCoeff;
    }

    for (let k = 0; k < this.size * this.size; k++) {
      heightMap[k] = Math.floor((heightMap[k] / maxPossibleHeight) * 100); // normalize to [0, 100]
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
