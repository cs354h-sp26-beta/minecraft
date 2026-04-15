import { Quat, Vec3 } from "../lib/TSM.js";
import { Chunk } from "./Chunk.js";
import { Mesh } from "./Mesh.js";
import {
  enemyIdlePose,
  enemyWalkAnimation,
  enemyWalkPose1,
} from "./Animations.js";

export type Collision = {
  blockCenter: Vec3;
  belowEntity: boolean;
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

  public update(lookDir: Vec3, dt: number, chunk: Chunk) {
    // Apply base movement.
    const walkDx = lookDir.scale(0.1);
    const momentumDx = this.velocity.scale(dt, new Vec3());
    const totalDx = walkDx.add(momentumDx, new Vec3());
    this.position.add(totalDx);

    // Check for collisions.
    //
    // FIXME: Ew. This system sucks. It's what the hint says to do but...
    const floorY = chunk.floorHeight(this.position.x, this.position.z);
    // Apply gravity acceleration.
    if (this.position.y > floorY + Player.hitboxHeight) {
      const gDelta = -9.8 * dt;
      const gDv = new Vec3([0.0, gDelta, 0.0]);
      this.velocity.add(gDv);
    } else {
      // Stop all movement in vertical direction.
      this.velocity.y = 0;
      this.position.y = floorY + Player.hitboxHeight;
    }
  }

  // Detects if the player collides with any blocks in the given chunk.
  // Returns the cubes for which there is a collision.
  public collidesWithChunk(c: Chunk): Collision[] {
    // TODO
    return [];
  }
}

enum EnemyState {
  Idle,
  Walking,
  Attacking,
}

export class Enemy {
  // The enemy's position in world coordinates.
  public position: Vec3;

  // The velocity of the enemy in units/sec.
  public velocity: Vec3;

  public yaw: number;

  public mesh: Mesh;

  private state: EnemyState;
  private animationTime: number;

  // Radial dimensions of hitbox.
  public static readonly hitboxRadius: number = 0.4;
  // HACK: Enemy centered at CoM rather than head.
  public static readonly hitboxHeight: number = 1.0;

  constructor(mesh: Mesh, position: Vec3) {
    this.position = position;
    this.velocity = new Vec3([0.0, 0.0, 0.0]);
    this.yaw = 0.0;
    this.mesh = new Mesh(mesh);
    this.mesh.setPose(enemyIdlePose);
    this.setState(EnemyState.Idle);
  }

  private setState(state: EnemyState) {
    console.log("Setting state ", state);
    this.state = state;
    this.animationTime = 0;
  }

  private targetPose(): Quat[] {
    switch (this.state) {
      case EnemyState.Idle:
        return enemyIdlePose;
      case EnemyState.Walking:
        return enemyWalkAnimation(this.animationTime);
      case EnemyState.Attacking:
        return enemyIdlePose;
    }
  }

  public faceTowards(pos: Vec3): void {
    const dir = Vec3.difference(pos, this.position);
    this.yaw = Math.atan2(-dir.z, dir.x);
  }

  public lookDir(): Vec3 {
    // Assuming this is how you calculate `lookDir` based on `yaw` set in `faceTowards`.
    return new Vec3([Math.cos(this.yaw), 0.0, -Math.sin(this.yaw)]);
  }

  public getRotation(): Quat {
    return Quat.fromAxisAngle(Vec3.up, this.yaw - Math.PI / 2);
  }

  public update(dt: number, chunk: Chunk, player: Player) {
    this.faceTowards(player.position);

    // Update position based on velocity.
    //
    // Could just use `player.position` here, I guess. Lol.
    const lookDir = this.lookDir();
    const momentumDx = this.velocity.scale(dt, new Vec3());
    this.position.add(momentumDx);

    // Apply gravity.
    //
    // FIXME: This uses the shitty current collision system.
    // I will overhaul this in the future to make more sense.
    const floorY = chunk.floorHeight(this.position.x, this.position.z);
    // Apply gravity acceleration.
    if (this.position.y > floorY + Enemy.hitboxHeight) {
      const gDelta = -9.8 * dt;
      const gDv = new Vec3([0.0, gDelta, 0.0]);
      this.velocity.add(gDv);
    } else {
      // Stop all movement in vertical direction.
      this.velocity.y = 0.0;
      this.position.y = floorY + Enemy.hitboxHeight;
    }

    this.animationTime += dt;

    if (this.animationTime >= 8) {
      if (this.state === EnemyState.Idle) {
        this.setState(EnemyState.Walking);
      } else if (this.state === EnemyState.Walking) {
        this.setState(EnemyState.Idle);
      }
    }

    this.mesh.setPose(this.targetPose(), Math.pow(0.01, dt));
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

  public update(dt: number, chunk: Chunk): boolean {
    this.position.add(this.velocity.scale(dt, new Vec3()));

    // Undo update if overlaps with another block (can change to entity later)
    if (this.collidesWithChunk(chunk).length > 0) {
      this.position.subtract(this.velocity.scale(dt, new Vec3()));
      return false;
    }

    // Apply gravity acceleration.
    const gDelta = -9.8 * dt;
    const gDv = new Vec3([0.0, gDelta, 0.0]);
    this.velocity.add(gDv);
    return true;
  }

  // Detects if the block collides with any blocks in the given chunk.
  // Returns the cubes for which there is a collision.
  // FIXME: Check bottom face for now.
  public collidesWithChunk(c: Chunk): Collision[] {
    if (
      c.cubeType(this.position.x, this.position.z, this.position.y - 0.5) !=
      Chunk.blockTypeAir
    ) {
      return [
        {
          blockCenter: new Vec3([
            Math.round(this.position.x),
            Math.round(this.position.y),
            Math.round(this.position.z),
          ]),
          belowEntity: true,
        },
      ];
    }
    return [];
  }
}
