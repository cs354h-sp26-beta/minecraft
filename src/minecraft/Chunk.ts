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

  private generateCubes() {
    const [topLeftX, topLeftZ] = this.origin();

    //TODO: The real landscape-generation logic. The example code below shows you how to use the pseudorandom number generator to create a few cubes.
    this.cubes = this.size * this.size;
    this.cubePositionsF32 = new Float32Array(4 * this.cubes);

    const seed = "42";
    let rng = new Rand(seed);
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const height = Math.floor(10.0 * rng.next());
        const idx = this.size * i + j;
        this.cubePositionsF32[4 * idx + 0] = topLeftX + j;
        this.cubePositionsF32[4 * idx + 1] = height;
        this.cubePositionsF32[4 * idx + 2] = topLeftZ + i;
        this.cubePositionsF32[4 * idx + 3] = 0;
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
