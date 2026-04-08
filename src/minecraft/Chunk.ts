import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js"

export class Chunk {
    private cubes: number; // Number of cubes that should be *drawn* each frame
    private cubePositionsF32: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates
    private x : number; // Center of the chunk
    private y : number;
    private size: number; // Number of cubes along each side of the chunk
    
    constructor(centerX : number, centerY : number, size: number) {
        this.x = centerX;
        this.y = centerY;
        this.size = size;
        this.cubes = size*size;        
        this.generateCubes();
    }
    
    
    private generateCubes() {
        const topleftx = this.x - this.size / 2;
        const toplefty = this.y - this.size / 2;
        
      //TODO: The real landscape-generation logic. The example code below shows you how to use the pseudorandom number generator to create a few cubes.
      this.cubes = this.size * this.size;
      this.cubePositionsF32 = new Float32Array(4 * this.cubes);

      const seed = "42";
      let rng = new Rand(seed);
      for(let i=0; i<this.size; i++)
      {
          for(let j=0; j<this.size; j++)
          {
            const height = Math.floor(10.0 * rng.next());
            const idx = this.size * i + j;
            this.cubePositionsF32[4*idx + 0] = topleftx + j;
            this.cubePositionsF32[4*idx + 1] = height;
            this.cubePositionsF32[4*idx + 2] = toplefty + i;
            this.cubePositionsF32[4*idx + 3] = 0;
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
