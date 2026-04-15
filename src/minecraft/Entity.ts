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
    console.log(
      `Enemy momentum: ${momentumDx.x} ${momentumDx.y} ${momentumDx.z}`,
    );
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
