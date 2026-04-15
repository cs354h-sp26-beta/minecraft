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

class Entity {
  // The entity's head position in world coordinates.
  public position: Vec3;

  // The velocity of the entity in units/sec.
  public velocity: Vec3;

  // Radial dimensions of entity's hitbox.
  public readonly hitboxRadius: number;
  public readonly hitboxHeight: number;

  // Health stats
  public health: number;
  public maxHealth: number;

  constructor(
    position: Vec3,
    hitboxRadius: number,
    hitboxHeight: number,
    health: number = 100,
  ) {
    this.position = position;
    this.velocity = new Vec3([0.0, 0.0, 0.0]);
    this.hitboxRadius = hitboxRadius;
    this.hitboxHeight = hitboxHeight;
    this.health = health;
    this.maxHealth = health;
  }

  private applyVerticalSeparationAndZeroVelocity(
    newY: number,
    prevY: number,
  ): void {
    this.position.y = newY;
    if (newY === prevY) return;
    const vy = this.velocity.y;
    if (newY < prevY && vy > 0) this.velocity.y = 0;
    if (newY > prevY && vy < 0) this.velocity.y = 0;
  }

  // Does base physics updates for entities.
  public stepPhysics(
    lookDir: Vec3,
    chunkProvider: Chunk.ColumnProvider,
    dt: number,
  ) {
    const r = this.hitboxRadius;
    const h = this.hitboxHeight;
    const footSlack = 0.55;

    const momentumH = this.velocity.scale(dt, new Vec3());
    momentumH.y = 0;
    const totalH = lookDir.add(momentumH, new Vec3());

    let px = this.position.x;
    let py = this.position.y;
    let pz = this.position.z;

    const { ax, az } = Chunk.tryHorizontalCylinderMove(
      chunkProvider,
      px,
      py,
      pz,
      totalH.x,
      totalH.z,
      r,
      h,
    );
    if (ax === 0) this.velocity.x = 0;
    if (az === 0) this.velocity.z = 0;
    this.position.x += ax;
    this.position.z += az;
    px = this.position.x;
    py = this.position.y;
    pz = this.position.z;

    let floorHead = Chunk.supportedHeadYWorld(
      chunkProvider,
      px,
      pz,
      py - h,
      r,
      h,
      footSlack,
    );
    const grounded = floorHead !== -Infinity && py <= floorHead + 0.02;

    if (!grounded) {
      this.velocity.add(new Vec3([0.0, -9.8 * dt, 0.0]));
    } else {
      const v = this.velocity.copy();
      if (v.y < 0) v.y = 0;
      this.velocity = v;
    }

    this.position.y += this.velocity.y * dt;
    py = this.position.y;

    floorHead = Chunk.supportedHeadYWorld(
      chunkProvider,
      px,
      pz,
      py - h,
      r,
      h,
      footSlack,
    );
    if (floorHead !== -Infinity && py < floorHead) {
      this.position.y = floorHead;
      if (this.velocity.y < 0) this.velocity.y = 0;
      py = this.position.y;
    }

    const yBeforeSep = py;
    const ySep = Chunk.separateVerticalCapsuleFromSolids(
      chunkProvider,
      px,
      py,
      pz,
      r,
      h,
      this.velocity.y,
    );
    this.applyVerticalSeparationAndZeroVelocity(ySep, yBeforeSep);
    py = this.position.y;

    if (
      this.velocity.y > 0 &&
      Chunk.cylinderIntersectsSolidWorld(chunkProvider, px, py, pz, r, h)
    ) {
      py = Chunk.resolveUpwardPenetration(chunkProvider, px, py, pz, r, h);
      this.position.y = py;
      this.velocity.y = 0;
    }

    floorHead = Chunk.supportedHeadYWorld(
      chunkProvider,
      px,
      pz,
      py - h,
      r,
      h,
      footSlack,
    );
    if (floorHead !== -Infinity && py < floorHead) {
      this.position.y = floorHead;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
  }

  public jump(chunkProvider: Chunk.ColumnProvider) {
    const r = this.hitboxRadius;
    const h = this.hitboxHeight;
    const footSlack = 0.55;
    const px = this.position.x;
    const py = this.position.y;
    const pz = this.position.z;
    const floorHead = Chunk.supportedHeadYWorld(
      chunkProvider,
      px,
      pz,
      py - h,
      r,
      h,
      footSlack,
    );
    if (
      floorHead === -Infinity ||
      py > floorHead + 0.02 ||
      !Chunk.verticalCapsuleHasHeadroomForJump(chunkProvider, px, py, pz, r, h)
    ) {
      return;
    }
    this.velocity.add(new Vec3([0.0, 10.0, 0.0]));
  }

  public takeDamage(amount: number = 1) {
    if (this.isDead()) return;
    this.health -= amount;
  }

  public heal(amount: number = 0.5) {
    this.health += amount;
    if (this.health > this.maxHealth) {
      this.health = this.maxHealth;
    }
  }

  public isDead(): boolean {
    return this.health <= 0;
  }
}

export class Player extends Entity {
  constructor(position: Vec3) {
    super(position, 0.4, 2.0, 20);
  }

  public update(
    lookDir: Vec3,
    chunkProvider: Chunk.ColumnProvider,
    dt: number,
  ) {
    super.stepPhysics(lookDir, chunkProvider, dt);
  }

  public jump(chunkProvider: Chunk.ColumnProvider) {
    super.jump(chunkProvider);
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

export class Enemy extends Entity {
  public yaw: number;

  public mesh: Mesh;

  private state: EnemyState;
  private animationTime: number;

  constructor(mesh: Mesh, position: Vec3) {
    // HACK: Enemy centered at CoM rather than head.
    super(position, 0.4, 1.0, 20);
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

  public jump(chunkProvider: Chunk.ColumnProvider) {
    super.jump(chunkProvider);
  }

  public update(
    chunkProvider: Chunk.ColumnProvider,
    player: Player,
    dt: number,
  ) {
    this.faceTowards(player.position);

    // HACK: `stepPhysics` moves entities some base amount in their `lookDir`.
    // Since we don't want enemies to update based on that, we just pass in an
    // empty vec.
    super.stepPhysics(new Vec3([0.0, 0.0, 0.0]), chunkProvider, dt);

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
