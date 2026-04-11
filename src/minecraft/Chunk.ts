import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js";
import { Player } from "./Entity.js";

export class Chunk {
  private cubes: number; // Number of cubes that should be *drawn* each frame
  private cubePositionsF32!: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates
  private x: number; // Center of the chunk
  private z: number;
  private size: number; // Number of cubes along each side of the chunk

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
    const [topLeftX, topLeftZ] = this.origin();

    // chunk position as part of the seed for deterministic per-chunk generation
    const seed = `${this.x}_${this.z}`;
    const rng = new Rand(seed);

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

    const centerX = worldX - topLeftX;
    const centerZ = worldZ - topLeftZ;

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
            this.cubePositionsF32[
              4 * (cubeChunkZ * this.size + cubeChunkX) + 1
            ];
          floorY = Math.max(floorY, cubeWorldY);
        }
      }
    }

    return floorY;
  }
}
