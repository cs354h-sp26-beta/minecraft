import { Vec3 } from "../lib/TSM.js";
import { Chunk } from "./Chunk.js";

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

export class Block {
  // The position of the block's center in world coordinates.
  public position: Vec3;

  // The velocity of the block in units/sec.
  public velocity: Vec3;

  constructor(position: Vec3) {
    this.position = position;
    this.velocity = new Vec3([0.0, 0.0, 0.0]);
  }

  // Detects if the block collides with any blocks in the given chunk.
  // Returns the cubes for which there is a collision.
  public collidesWithChunk(c: Chunk): Collision[] {
    // TODO
    return [];
  }
}
