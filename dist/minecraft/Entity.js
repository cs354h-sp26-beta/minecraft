import { Quat, Vec3 } from "../lib/TSM.js";
import { Chunk } from "./Chunk.js";
import { Mesh } from "./Mesh.js";
import { enemyAttackAnimation, enemyIdlePose, enemyWalkAnimation, } from "./Animations.js";
import { findPath } from "./Pathfinding.js";
import { MathUtils } from "../lib/threejs/build/three.module.js";
const GRAVITY = -30;
class Entity {
    constructor(position, hitboxRadius, hitboxHeight, health = 20, food = 20) {
        this.position = position;
        this.velocity = new Vec3([0.0, 0.0, 0.0]);
        this.hitboxRadius = hitboxRadius;
        this.hitboxHeight = hitboxHeight;
        this.health = health;
        this.maxHealth = health;
        this.food = food;
        this.maxFood = food;
    }
    applyVerticalSeparationAndZeroVelocity(newY, prevY) {
        this.position.y = newY;
        if (newY === prevY)
            return;
        const vy = this.velocity.y;
        if (newY < prevY && vy > 0)
            this.velocity.y = 0;
        if (newY > prevY && vy < 0)
            this.velocity.y = 0;
    }
    // Does base physics updates for entities.
    stepPhysics(lookDir, speed, chunkProvider, dt) {
        const r = this.hitboxRadius;
        const h = this.hitboxHeight;
        const footSlack = 0.55;
        const momentumH = this.velocity.scale(dt, new Vec3());
        momentumH.y = 0;
        lookDir = lookDir.scale(speed, new Vec3());
        const totalH = lookDir.add(momentumH, new Vec3());
        let px = this.position.x;
        let py = this.position.y;
        let pz = this.position.z;
        const { ax, az } = Chunk.tryHorizontalCylinderMove(chunkProvider, px, py, pz, totalH.x, totalH.z, r, h);
        if (ax === 0)
            this.velocity.x = 0;
        if (az === 0)
            this.velocity.z = 0;
        this.position.x += ax;
        this.position.z += az;
        px = this.position.x;
        py = this.position.y;
        pz = this.position.z;
        let floorHead = Chunk.supportedHeadYWorld(chunkProvider, px, pz, py - h, r, h, footSlack);
        const grounded = floorHead !== -Infinity && py <= floorHead + 0.02;
        if (!grounded) {
            this.velocity.add(new Vec3([0.0, GRAVITY * dt, 0.0]));
        }
        else {
            const v = this.velocity.copy();
            if (v.y < 0)
                v.y = 0;
            this.velocity = v;
        }
        this.position.y += this.velocity.y * dt;
        py = this.position.y;
        floorHead = Chunk.supportedHeadYWorld(chunkProvider, px, pz, py - h, r, h, footSlack);
        if (floorHead !== -Infinity && py < floorHead) {
            this.position.y = floorHead;
            if (this.velocity.y < 0)
                this.velocity.y = 0;
            py = this.position.y;
        }
        const yBeforeSep = py;
        const ySep = Chunk.separateVerticalCapsuleFromSolids(chunkProvider, px, py, pz, r, h, this.velocity.y);
        this.applyVerticalSeparationAndZeroVelocity(ySep, yBeforeSep);
        py = this.position.y;
        if (this.velocity.y > 0 &&
            Chunk.cylinderIntersectsSolidWorld(chunkProvider, px, py, pz, r, h)) {
            py = Chunk.resolveUpwardPenetration(chunkProvider, px, py, pz, r, h);
            this.position.y = py;
            this.velocity.y = 0;
        }
        floorHead = Chunk.supportedHeadYWorld(chunkProvider, px, pz, py - h, r, h, footSlack);
        if (floorHead !== -Infinity && py < floorHead) {
            this.position.y = floorHead;
            if (this.velocity.y < 0)
                this.velocity.y = 0;
        }
    }
    jump(chunkProvider, velocity = GRAVITY * -0.25) {
        const r = this.hitboxRadius;
        const h = this.hitboxHeight;
        const footSlack = 0.55;
        const px = this.position.x;
        const py = this.position.y;
        const pz = this.position.z;
        const floorHead = Chunk.supportedHeadYWorld(chunkProvider, px, pz, py - h, r, h, footSlack);
        if (floorHead === -Infinity ||
            py > floorHead + 0.02 ||
            !Chunk.verticalCapsuleHasHeadroomForJump(chunkProvider, px, py, pz, r, h)) {
            return;
        }
        this.velocity.add(new Vec3([0.0, velocity, 0.0]));
    }
    takeDamage(amount = 1) {
        if (this.isDead())
            return;
        this.health -= amount;
        if (this.health < 0) {
            this.health = 0;
        }
    }
    heal(amount = 1) {
        if (this.isDead())
            return;
        this.health += amount;
        if (this.health > this.maxHealth) {
            this.health = this.maxHealth;
        }
    }
    experienceHunger(amount = 1) {
        this.food -= amount;
        if (this.food < 0) {
            this.food = 0;
        }
    }
    eat(amount = 1) {
        this.food += amount;
        if (this.food > this.maxFood) {
            this.food = this.maxFood;
        }
    }
    isDead() {
        return this.health <= 0;
    }
}
export class Player extends Entity {
    constructor(position) {
        super(position, 0.4, 2.0, 20, 20);
        this.speed = 0.2;
    }
    update(lookDir, chunkProvider, dt) {
        super.stepPhysics(lookDir, this.speed, chunkProvider, dt);
    }
    jump(chunkProvider) {
        super.jump(chunkProvider, GRAVITY * -0.5);
    }
    // Detects if the player collides with any blocks in the given chunk.
    // Returns the cubes for which there is a collision.
    collidesWithChunk(c) {
        // TODO
        return [];
    }
}
var EnemyState;
(function (EnemyState) {
    EnemyState[EnemyState["Idle"] = 0] = "Idle";
    EnemyState[EnemyState["Walking"] = 1] = "Walking";
    EnemyState[EnemyState["Attacking"] = 2] = "Attacking";
})(EnemyState || (EnemyState = {}));
export class Enemy extends Entity {
    constructor(mesh, position) {
        // HACK: Enemy centered at CoM rather than head.
        super(position, 0.4, 1.0, 20, 20);
        // Pathfinding states
        this.path = null; // the current A* path to follow (list of waypoints)
        this.MIN_STANDOFF = 1.5; // minimum distance the enemy keeps from the player (still in attack range)
        this.SEEK_RADIUS = 64; // beyond this radius, skip A* pathfinding. note its the chunk size
        this.yaw = 0.0;
        this.mesh = new Mesh(mesh);
        this.mesh.setPose(enemyIdlePose);
        this.setState(EnemyState.Idle);
        this.path = [];
        this.pathIndex = 0;
        this.pathTimer = 0;
        this.speed = 0.05;
        this.animationTime = 0;
        this.idleTime = 0;
        this.attackTime = 0;
    }
    setState(state) {
        if (this.state !== state) {
            this.state = state;
            this.animationTime = 0;
        }
    }
    targetPose() {
        switch (this.state) {
            case EnemyState.Idle:
                return enemyIdlePose;
            case EnemyState.Walking:
                return enemyWalkAnimation(this.animationTime);
            case EnemyState.Attacking:
                return enemyAttackAnimation(this.animationTime);
        }
    }
    faceTowards(pos, dt) {
        const dir = Vec3.difference(pos, this.position);
        let t = MathUtils.clamp(4 * dt, 0, 1);
        this.yaw = MathUtils.lerp(this.yaw, Math.atan2(-dir.z, dir.x), t);
    }
    getRotation() {
        return Quat.fromAxisAngle(Vec3.up, this.yaw - Math.PI / 2);
    }
    jump(chunkProvider) {
        super.jump(chunkProvider);
    }
    update(chunkProvider, player, dt) {
        this.animationTime += dt;
        this.pathTimer += dt;
        const distToPlayer = Vec3.distance(this.position, player.position);
        const insideStandoff = distToPlayer < this.MIN_STANDOFF;
        const farFromPlayer = distToPlayer > this.SEEK_RADIUS;
        if (this.attackTime > 0) {
            this.faceTowards(player.position, dt);
            this.attackTime -= dt;
            if (this.attackTime <= 0) {
                if (Vec3.distance(this.position, player.position) < 5) {
                    player.takeDamage(3);
                }
                this.setState(EnemyState.Idle);
            }
        }
        if (this.attackTime <= 0 && distToPlayer < 2) {
            this.setState(EnemyState.Attacking);
            this.attackTime = 1;
            this.path = null;
        }
        if (this.state != EnemyState.Attacking &&
            !insideStandoff &&
            !farFromPlayer &&
            (this.pathTimer > 1.0 || this.path === null || this.path.length === 0)) {
            this.pathTimer = 0;
            const enemyFeet = new Vec3([
                this.position.x,
                this.position.y - 0.5,
                this.position.z,
            ]);
            // compute the y below the player for the enemies to target
            let yBelowPlayer = player.position.y - player.hitboxHeight;
            const playerX = Math.round(player.position.x);
            const playerZ = Math.round(player.position.z);
            for (let dy = 0; dy >= -10; dy--) {
                if (Chunk.isSolidBlockWorldWide(chunkProvider, playerX, Math.round(yBelowPlayer) + dy, playerZ)) {
                    yBelowPlayer = Math.round(yBelowPlayer) + dy + 1;
                    break;
                }
            }
            // add some level of randomness so they dont overlap perfectly and look weird
            const jitterX = (Math.random() - 0.5) * 2;
            const jitterZ = (Math.random() - 0.5) * 2;
            const playerFeet = new Vec3([
                player.position.x + jitterX,
                yBelowPlayer,
                player.position.z + jitterZ,
            ]);
            this.path = findPath(enemyFeet, playerFeet, chunkProvider);
            this.pathIndex = this.path.length > 1 ? 1 : 0; // try to skip 0 since that's the enemy's current position
        }
        if (insideStandoff) {
            // Already close enough to the player — hold position (but keep facing them).
            this.faceTowards(player.position, dt);
            super.stepPhysics(new Vec3([0.0, 0.0, 0.0]), this.speed, chunkProvider, dt);
        }
        else if (farFromPlayer) {
            // Out of A* range — chill in place so enemies stay distributed across
            // the chunks they spawned in instead of all converging on the player.
            this.path = null;
            super.stepPhysics(new Vec3([0.0, 0.0, 0.0]), this.speed, chunkProvider, dt);
        }
        else if (this.path && this.pathIndex < this.path.length) {
            const target = this.path[this.pathIndex];
            const distance = Math.sqrt(Math.pow((target.x - this.position.x), 2) + Math.pow((target.z - this.position.z), 2));
            if (distance < 0.5) {
                // we can advance to the next waypoint
                this.pathIndex++;
            }
            this.faceTowards(target, dt);
            if (target.y > this.position.y) {
                this.jump(chunkProvider);
            }
            const dir = Vec3.difference(target, this.position);
            dir.y = 0;
            super.stepPhysics(dir.normalize(), this.speed, chunkProvider, dt);
        }
        else {
            // no path or reached the end of path...stand still
            super.stepPhysics(new Vec3([0.0, 0.0, 0.0]), this.speed, chunkProvider, dt);
        }
        if (!insideStandoff && this.path && this.pathIndex < this.path.length) {
            this.setState(EnemyState.Walking);
            this.idleTime = 0;
        }
        else if (this.attackTime <= 0) {
            this.idleTime += dt;
            if (this.idleTime > 0.3) {
                this.setState(EnemyState.Idle);
            }
        }
        this.mesh.setPose(this.targetPose(), Math.pow(0.01, dt));
    }
}
// Specifically the Block ENTITY (falling blocks!)
export class Block {
    constructor(position, type) {
        this.position = position;
        this.velocity = new Vec3([0.0, 0.0, 0.0]);
        this.type = type;
    }
    update(dt, chunk) {
        this.position.add(this.velocity.scale(dt, new Vec3()));
        // Undo update if overlaps with another block (can change to entity later)
        if (this.collidesWithChunk(chunk).length > 0) {
            this.position.subtract(this.velocity.scale(dt, new Vec3()));
            return false;
        }
        // Apply gravity acceleration.
        const gDelta = GRAVITY * 2 * dt;
        const gDv = new Vec3([0.0, gDelta, 0.0]);
        this.velocity.add(gDv);
        return true;
    }
    // Detects if the block collides with any blocks in the given chunk.
    // Returns the cubes for which there is a collision.
    // FIXME: Check bottom face for now.
    collidesWithChunk(c) {
        if (c.cubeType(this.position.x, this.position.z, this.position.y - 0.5) !=
            Chunk.blockTypeAir &&
            c.cubeType(this.position.x, this.position.z, this.position.y - 0.5) !=
                Chunk.blockTypeWater &&
            c.cubeType(this.position.x, this.position.z, this.position.y - 0.5) !=
                Chunk.blockTypeLava) {
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
//# sourceMappingURL=Entity.js.map