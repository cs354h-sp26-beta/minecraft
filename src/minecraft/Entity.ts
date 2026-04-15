import { Quat, Vec3 } from "../lib/TSM.js";
import { Chunk } from "./Chunk.js";
import { Mesh } from "./Mesh.js";
import { enemyIdlePose, enemyWalkAnimation } from "./Animations.js";

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
  public yaw: number;

  public mesh: Mesh;

  private state!: EnemyState;
  private animationTime!: number;

  constructor(mesh: Mesh, position: Vec3) {
    this.position = position;
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

  public getRotation(): Quat {
    return Quat.fromAxisAngle(Vec3.up, this.yaw - Math.PI / 2);
  }

  public update(dt: number, player: Player) {
    this.animationTime += dt;

    if (this.animationTime >= 8) {
      if (this.state === EnemyState.Idle) {
        this.setState(EnemyState.Walking);
      } else if (this.state === EnemyState.Walking) {
        this.setState(EnemyState.Idle);
      }
    }
    this.faceTowards(player.position);

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
