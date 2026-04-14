import { Debugger } from "../lib/webglutils/Debugging.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { GUI } from "./Gui.js";
import { blankCubeFSText, blankCubeVSText } from "./Shaders.js";
import { Vec4, Vec3 } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { LruCache } from "./Cache.js";
import { Cube } from "./Cube.js";
import { Chunk } from "./Chunk.js";
import { Player } from "./Entity.js";

export class MinecraftAnimation extends CanvasAnimation {
  private gui: GUI;

  private chunkCache: LruCache<string, Chunk>;
  private renderedChunks: Map<string, Chunk>;

  private static readonly renderDistance: number = 1;
  private static readonly chunkSize: number = 64;

  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;
  private selectedCubePosition: Vec4;

  private canvas2d: HTMLCanvasElement;

  private player: Player;
  private isectNormal: Vec3;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;

    this.ctx = Debugger.makeDebugContext(this.ctx);
    const gl = this.ctx;

    this.gui = new GUI(this.canvas2d, this);
    this.chunkCache = new LruCache();
    this.renderedChunks = new Map();
    const playerPosition = this.gui.getCamera().pos();
    this.player = new Player(playerPosition);
    this.isectNormal = new Vec3();

    this.loadChunksAroundPlayer();

    this.blankCubeRenderPass = new RenderPass(
      gl,
      blankCubeVSText,
      blankCubeFSText,
    );
    this.cubeGeometry = new Cube();
    this.initBlankCube();

    this.lightPosition = new Vec4([-1000, 1000, -1000, 1]);
    this.backgroundColor = new Vec4([0.0, 0.37254903, 0.37254903, 1.0]);
    this.selectedCubePosition = new Vec4([-1000, -1000, -1000, 1]);
  }

  /**
   * Setup the simulation. This can be called again to reset the program.
   */
  public reset(): void {
    this.gui.reset();

    this.player.position = this.gui.getCamera().pos();
  }

  /**
   * Sets up the blank cube drawing
   */
  private initBlankCube(): void {
    this.blankCubeRenderPass.setIndexBufferData(
      this.cubeGeometry.indicesFlat(),
    );
    this.blankCubeRenderPass.addAttribute(
      "aVertPos",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.positionsFlat(),
    );

    this.blankCubeRenderPass.addAttribute(
      "aNorm",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.normalsFlat(),
    );

    this.blankCubeRenderPass.addAttribute(
      "aUV",
      2,
      this.ctx.FLOAT,
      false,
      2 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.uvFlat(),
    );

    this.blankCubeRenderPass.addInstancedAttribute(
      "aOffset",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );

    this.blankCubeRenderPass.addUniform(
      "uLightPos",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
      },
    );
    this.blankCubeRenderPass.addUniform(
      "uProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(
          loc,
          false,
          new Float32Array(this.gui.projMatrix().all()),
        );
      },
    );
    this.blankCubeRenderPass.addUniform(
      "uView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(
          loc,
          false,
          new Float32Array(this.gui.viewMatrix().all()),
        );
      },
    );
    this.blankCubeRenderPass.addUniform(
      "uSelectedCubePos",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.selectedCubePosition.xyzw);
      },
    );

    this.blankCubeRenderPass.setDrawData(
      this.ctx.TRIANGLES,
      this.cubeGeometry.indicesFlat().length,
      this.ctx.UNSIGNED_INT,
      0,
    );
    this.blankCubeRenderPass.setup();
  }

  private worldToChunkCoord(worldVal: number): number {
    return Chunk.worldToChunkAxis(worldVal, MinecraftAnimation.chunkSize);
  }

  private currentChunk(): Chunk {
    const chunkX = this.worldToChunkCoord(this.player.position.x);
    const chunkZ = this.worldToChunkCoord(this.player.position.z);
    return this.renderedChunks.get(`${chunkX},${chunkZ}`)!;
  }

  // Given a location (we encode this as a string for now) and a seed, reconstruct the original chunk.
  //
  // FIXME: Maybe this should be in `Chunk`, but only allowed a single constructor.
  // Oh well. This can be refactored.
  private loadChunkFromSeed(
    centerX: number,
    centerZ: number,
    seed: string,
  ): Chunk {
    // TODO: Actually do it. For now, just create a new chunk alltogther.
    return new Chunk(centerX, centerZ, 64);
  }

  /**
   * Resolves the chunk that owns the block column at (wx, wz).
   * Snaps to integer block centers first so values like 31.999999 at a seam still map to the
   * same chunk as column 32 (avoids phantom air / wrong chunk).
   */
  private getChunkAtWorld(wx: number, wz: number): Chunk | undefined {
    const ix = Math.round(wx);
    const iz = Math.round(wz);
    const cx = this.worldToChunkCoord(ix);
    const cz = this.worldToChunkCoord(iz);
    const key = `${cx},${cz}`;
    const live = this.renderedChunks.get(key);
    if (live !== undefined) {
      return live;
    }
    return this.chunkCache.get(key);
  }

  private applyVerticalSeparationAndZeroVelocity(
    newY: number,
    prevY: number,
  ): void {
    this.player.position.y = newY;
    if (newY === prevY) return;
    const vy = this.player.velocity.y;
    if (newY < prevY && vy > 0) this.player.velocity.y = 0;
    if (newY > prevY && vy < 0) this.player.velocity.y = 0;
  }

  private stepPlayerPhysics(dt: number): void {
    const prov: Chunk.ColumnProvider = (ix, iz) => this.getChunkAtWorld(ix, iz);
    const r = Player.hitboxRadius;
    const h = Player.hitboxHeight;
    const footSlack = 0.55;

    const walkDx = this.gui.walkDir();
    const momentumH = this.player.velocity.scale(dt, new Vec3());
    momentumH.y = 0;
    const totalH = walkDx.add(momentumH, new Vec3());

    let px = this.player.position.x;
    let py = this.player.position.y;
    let pz = this.player.position.z;

    const { ax, az } = Chunk.tryHorizontalCylinderMove(
      prov,
      px,
      py,
      pz,
      totalH.x,
      totalH.z,
      r,
      h,
    );
    if (ax === 0) this.player.velocity.x = 0;
    if (az === 0) this.player.velocity.z = 0;
    this.player.position.x += ax;
    this.player.position.z += az;
    px = this.player.position.x;
    py = this.player.position.y;
    pz = this.player.position.z;

    let floorHead = Chunk.supportedHeadYWorld(
      prov,
      px,
      pz,
      py - h,
      r,
      h,
      footSlack,
    );
    const grounded =
        floorHead !== -Infinity &&
        py <= floorHead + 0.02;

    if (!grounded) {
      this.player.velocity.add(
          new Vec3([0.0, -9.8 * dt, 0.0]),
      );
    } else {
      const v = this.player.velocity.copy();
      if (v.y < 0) v.y = 0;
      this.player.velocity = v;
    }

    this.player.position.y += this.player.velocity.y * dt;
    py = this.player.position.y;

    floorHead = Chunk.supportedHeadYWorld(
      prov,
      px,
      pz,
      py - h,
      r,
      h,
      footSlack,
    );
    if (floorHead !== -Infinity && py < floorHead) {
      this.player.position.y = floorHead;
      if (this.player.velocity.y < 0) this.player.velocity.y = 0;
      py = this.player.position.y;
    }

    const yBeforeSep = py;
    const ySep = Chunk.separateVerticalCapsuleFromSolids(
      prov,
      px,
      py,
      pz,
      r,
      h,
      this.player.velocity.y,
    );
    this.applyVerticalSeparationAndZeroVelocity(ySep, yBeforeSep);
    py = this.player.position.y;

    if (
      this.player.velocity.y > 0 &&
      Chunk.cylinderIntersectsSolidWorld(prov, px, py, pz, r, h)
    ) {
      py = Chunk.resolveUpwardPenetration(prov, px, py, pz, r, h);
      this.player.position.y = py;
      this.player.velocity.y = 0;
    }

    floorHead = Chunk.supportedHeadYWorld(
      prov,
      px,
      pz,
      py - h,
      r,
      h,
      footSlack,
    );
    if (floorHead !== -Infinity && py < floorHead) {
      this.player.position.y = floorHead;
      if (this.player.velocity.y < 0) this.player.velocity.y = 0;
    }
  }

  private loadChunksAroundPlayer(): void {
    // FIXME: Reuse chunks already loaded, instead of re-adding each frame.
    this.renderedChunks.clear();

    const cx = this.worldToChunkCoord(this.player.position.x);
    const cz = this.worldToChunkCoord(this.player.position.z);

    const rd = MinecraftAnimation.renderDistance;
    const step = MinecraftAnimation.chunkSize;
    for (let di = -rd; di <= rd; di++) {
      for (let dj = -rd; dj <= rd; dj++) {
        const chunkX = cx + di * step;
        const chunkZ = cz + dj * step;
        const key = `${chunkX},${chunkZ}`;
        if (!this.chunkCache.has(key)) {
          this.chunkCache.set(key, new Chunk(chunkX, chunkZ, step));
        }
        const cachedChunk = this.chunkCache.get(key)!;
        this.renderedChunks.set(key, cachedChunk);
      }
    }
  }

  private getAllCubePositions(): Float32Array {
    let totalCubes = 0;
    for (const chunk of this.renderedChunks.values()) {
      totalCubes += chunk.numCubes();
    }
    const combined = new Float32Array(4 * totalCubes);
    let offset = 0;
    for (const chunk of this.renderedChunks.values()) {
      const positions = chunk.cubePositions();
      combined.set(positions, offset);
      offset += positions.length;
    }
    return combined;
  }

  /**
   * Draws a single frame
   *
   */
  public draw(): void {
    // Load chunks.
    this.loadChunksAroundPlayer();

    // To slow movement to something more natural, scale the amount we can move per frame.
    const dt = 1 / 60;

    this.stepPlayerPhysics(dt);

    this.gui.getCamera().setPos(this.player.position);
    // Drawing
    const gl: WebGLRenderingContext = this.ctx;
    const bg: Vec4 = this.backgroundColor;
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is the default frame buffer
    this.drawScene(0, 0, 1280, 960);
  }

  private drawScene(x: number, y: number, width: number, height: number): void {
    const gl: WebGLRenderingContext = this.ctx;
    gl.viewport(x, y, width, height);

    const allPositions = this.getAllCubePositions();
    this.blankCubeRenderPass.updateAttributeBuffer("aOffset", allPositions);
    this.blankCubeRenderPass.drawInstanced(allPositions.length / 4);
  }

  // Intersects ray with the cube at the given position in world coordinates.
  private intersectCube(
    rayPos: Vec3,
    rayDir: Vec3,
    worldX: number,
    worldZ: number,
    worldY: number,
  ): intersection | null {
    let centerX = Math.round(worldX);
    let centerY = Math.round(worldY);
    let centerZ = Math.round(worldZ);
    const h = 0.5;
    let minCube = new Vec3([centerX - h, centerY - h, centerZ - h]);
    let maxCube = new Vec3([centerX + h, centerY + h, centerZ + h]);

    // Calculate inverse directions to avoid division by zero
    const invDirX = 1.0 / rayDir.x;
    const invDirY = 1.0 / rayDir.y;
    const invDirZ = 1.0 / rayDir.z;

    let tNear = -Infinity;
    let tFar = Infinity;
    let normal = new Vec3([0, 0, 0]);

    // x-axis slab
    const t0x = (minCube.x - rayPos.x) * invDirX;
    const t1x = (maxCube.x - rayPos.x) * invDirX;
    const tNearX = Math.min(t0x, t1x);
    const tFarX = Math.max(t0x, t1x);

    if (tNearX > tNear) {
      tNear = tNearX;
      normal = new Vec3([invDirX < 0 ? 1 : -1, 0, 0]);
    }
    tFar = Math.min(tFar, tFarX);

    // y-axis slab
    const t0y = (minCube.y - rayPos.y) * invDirY;
    const t1y = (maxCube.y - rayPos.y) * invDirY;
    const tNearY = Math.min(t0y, t1y);
    const tFarY = Math.max(t0y, t1y);

    if (tNearY > tNear) {
      tNear = tNearY;
      normal = new Vec3([0, invDirY < 0 ? 1 : -1, 0]);
    }
    tFar = Math.min(tFar, tFarY);

    // z-axis slab
    const t0z = (minCube.z - rayPos.z) * invDirZ;
    const t1z = (maxCube.z - rayPos.z) * invDirZ;
    const tNearZ = Math.min(t0z, t1z);
    const tFarZ = Math.max(t0z, t1z);

    if (tNearZ > tNear) {
      tNear = tNearZ;
      normal = new Vec3([0, 0, invDirZ < 0 ? 1 : -1]);
    }
    tFar = Math.min(tFar, tFarZ);

    if (tNear > tFar) return null;
    if (tFar < 0) return null;

    const t = tNear < 0 ? tFar : tNear;
    return { t, normal };
  }

  public getGUI(): GUI {
    return this.gui;
  }

  public jump() {
    const prov: Chunk.ColumnProvider = (ix, iz) => this.getChunkAtWorld(ix, iz);
    const r = Player.hitboxRadius;
    const h = Player.hitboxHeight;
    const footSlack = 0.55;
    const px = this.player.position.x;
    const py = this.player.position.y;
    const pz = this.player.position.z;
    const floorHead = Chunk.supportedHeadYWorld(
      prov,
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
      !Chunk.verticalCapsuleHasHeadroomForJump(prov, px, py, pz, r, h)
    ) {
      return;
    }
    this.player.velocity.add(new Vec3([0.0, 10.0, 0.0]));
  }

  public intersectCubes(rayPos: Vec3, rayDir: Vec3): boolean {
    let bestT = Infinity;
    let bestPos = [-1000, -1000, -1000];
    let bestN = new Vec3();
    let hit = false;

    const rPick = 5;
    for (let dx = -rPick; dx <= rPick; dx++) {
      for (let dz = -rPick; dz <= rPick; dz++) {
        for (let dy = -rPick; dy <= rPick; dy++) {
          let x = this.player.position.x + dx;
          let z = this.player.position.z + dz;
          let y = this.player.position.y + dy;

          const chunkX = this.worldToChunkCoord(Math.round(x));
          const chunkZ = this.worldToChunkCoord(Math.round(z));
          let currentChunk = this.renderedChunks.get(`${chunkX},${chunkZ}`)!;
          let cubeType = currentChunk.cubeType(x, z, y);

          if (cubeType !== undefined) {
            let isect = this.intersectCube(rayPos, rayDir, x, z, y);
            let t = isect?.t;
            // TODO: Save the cube face that was hit for placing blocks
            if (t !== undefined && t < bestT) {
              bestT = t;
              bestPos = [x, y, z];
              bestN = isect?.normal !== undefined ? isect.normal : new Vec3();
              hit = true;
            }
          }
        }
      }
    }
    this.selectedCubePosition = new Vec4([
      Math.round(bestPos[0]),
      Math.round(bestPos[1]),
      Math.round(bestPos[2]),
      0,
    ]);
    this.isectNormal = bestN;
    return hit;
  }

  public breakSelectedCube(): number | undefined {
    const chunkX = this.worldToChunkCoord(this.selectedCubePosition.x);
    const chunkZ = this.worldToChunkCoord(this.selectedCubePosition.z);
    let chunk = this.renderedChunks.get(`${chunkX},${chunkZ}`)!;

    let brokenCubeType = chunk.cubeType(
      this.selectedCubePosition.x,
      this.selectedCubePosition.z,
      this.selectedCubePosition.y,
    );
    chunk.changeCubeType(
      this.selectedCubePosition.x,
      this.selectedCubePosition.z,
      this.selectedCubePosition.y,
      -1.0,
    );
    return brokenCubeType;
  }

  public placeCube(cubeType: number) {
    const chunkX = this.worldToChunkCoord(this.selectedCubePosition.x);
    const chunkZ = this.worldToChunkCoord(this.selectedCubePosition.z);
    let chunk = this.renderedChunks.get(`${chunkX},${chunkZ}`)!;

    // Place new cube based on side of cube that mouse is pointing at
    chunk.changeCubeType(
      this.selectedCubePosition.x + this.isectNormal.x,
      this.selectedCubePosition.z + this.isectNormal.z,
      this.selectedCubePosition.y + this.isectNormal.y,
      cubeType,
    );
  }
}

export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: MinecraftAnimation = new MinecraftAnimation(canvas);
  canvasAnimation.start();
}

interface intersection {
  t: number;
  normal: Vec3;
}
