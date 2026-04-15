import { Quat, Vec3 } from "../lib/TSM.js";
import { Chunk } from "./Chunk.js";
import { Mesh } from "./Mesh.js";

export type Collision = {
  blockCenter: Vec3;
  belowPlayer: boolean;
};

export class Player {
  // The player's head position in world coordinates.
  //
  // Player should extend two units down from this location and 0.4 units radially.
  public position: Vec3;

  // The velocity of the player in units/sec.
  public velocity: Vec3;

  // Radial dimensions of hitbox.
  public static readonly hitboxRadius: number = 0.4;
  public static readonly hitboxHeight: number = 2.0;

  constructor(position: Vec3) {
    this.position = position;
    this.velocity = new Vec3([0.0, 0.0, 0.0]);
  }

  // Detects if the player collides with any blocks in the given chunk.
  // Returns the cubes for which there is a collision.
  public collidesWithChunk(c: Chunk): Collision[] {
    // TODO
    return [];
  }
}

export class Enemy {
  // The enemy's position in world coordinates.
  public position: Vec3;
  public yaw: number;

  public mesh: Mesh;

  constructor(mesh: Mesh, position: Vec3) {
    this.position = position;
    this.mesh = new Mesh(mesh);
  }

  public faceTowards(pos: Vec3): void {
    const dir = Vec3.difference(pos, this.position);
    this.yaw = Math.atan2(-dir.z, dir.x);
  }

  public getRotation(): Quat {
    return Quat.fromAxisAngle(Vec3.up, this.yaw - Math.PI / 2);
  }
}

// Specifically the Block ENTITY (falling blocks!)
export class Block {
  // The position of the block's center in world coordinates.
  public position: Vec3;

  // The velocity of the block in units/sec.
  public velocity: Vec3;

  // The type of the block, as specified in Chunk.ts
  public type: number;

  constructor(position: Vec3, type: number) {
    this.position = position;
    this.velocity = new Vec3([0.0, 0.0, 0.0]);
    this.type = type;
  }

  // Detects if the block collides with any blocks in the given chunk.
  // Returns the cubes for which there is a collision.
  public collidesWithChunk(c: Chunk): Collision[] {
    // TODO
    return [];
  }
}
