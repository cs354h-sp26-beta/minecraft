import { Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { Debugger } from "../lib/webglutils/Debugging.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Chunk } from "./Chunk.js";
import { Cube } from "./Cube.js";
import { GUI } from "./Gui.js";
import { Player, Block } from "./Entity.js";
import { LruCache } from "./Cache.js";
import { Camera } from "../lib/webglutils/Camera.js";
import {
  blankCubeFSText,
  blankCubeVSText,
  skyboxFSText,
  skyboxVSText,
} from "./Shaders.js";

export class MinecraftAnimation extends CanvasAnimation {
  public static readonly dayDuration = 1440.0;

  private gui: GUI;

  private chunkCache: LruCache<string, Chunk>;
  private renderedChunks: Map<string, Chunk>;
  private deltaMaps: Map<string, Map<string, number>>; // save map of changes for modified chunks

  private static readonly renderDistance: number = 1;
  private static readonly chunkSize: number = 64;

  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass;
  private skyboxRenderPass: RenderPass;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;
  private selectedCubePosition: Vec4;

  private canvas2d: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;

  private player: Player;
  private fallingBlocks: Block[];
  private isectNormal: Vec3;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
    const overlayCtx = this.canvas2d.getContext("2d");
    if (!overlayCtx) {
      throw new Error("Failed to create 2D overlay context.");
    }
    this.overlayCtx = overlayCtx;

    this.ctx = Debugger.makeDebugContext(this.ctx);
    const gl = this.ctx;

    this.gui = new GUI(this.canvas2d, this);
    this.chunkCache = new LruCache();
    this.renderedChunks = new Map();
    this.deltaMaps = new Map();
    const playerPosition = this.gui.getCamera().pos();
    this.player = new Player(playerPosition);
    this.fallingBlocks = [];
    this.isectNormal = new Vec3();

    this.loadChunksAroundPlayer();

    this.blankCubeRenderPass = new RenderPass(
      gl,
      blankCubeVSText,
      blankCubeFSText,
    );
    this.skyboxRenderPass = new RenderPass(gl, skyboxVSText, skyboxFSText);
    this.cubeGeometry = new Cube();
    this.initSkybox();
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
   * Sets up the skybox drawing
   */
  private initSkybox(): void {
    this.skyboxRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
    this.skyboxRenderPass.addAttribute(
      "aVertPos",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.positionsFlat(),
    );

    this.skyboxRenderPass.addUniform(
      "uProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(
          loc,
          false,
          new Float32Array(this.gui.projMatrix().all()),
        );
      },
    );
    this.skyboxRenderPass.addUniform(
      "uView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(
          loc,
          false,
          new Float32Array(this.getSkyboxViewMatrix().all()),
        );
      },
    );
    this.skyboxRenderPass.addUniform(
      "uTime",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1f(loc, this.getTimeValue());
      },
    );

    this.skyboxRenderPass.setDrawData(
      this.ctx.TRIANGLES,
      this.cubeGeometry.indicesFlat().length,
      this.ctx.UNSIGNED_INT,
      0,
    );
    this.skyboxRenderPass.setup();
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
      "aBlockType",
      1, // size (1 float)
      this.ctx.FLOAT,
      false,
      1 * Float32Array.BYTES_PER_ELEMENT, // stride (1 float)
      0, // offset
      undefined,
      new Float32Array(0),
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

    //time variable for animating water & maybe leaves
    this.blankCubeRenderPass.addUniform(
      "uTime",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1f(loc, this.getTimeValue());
      },
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
    const s = MinecraftAnimation.chunkSize;
    return Math.floor((worldVal + s / 2) / s) * s;
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
          let deltaMap = this.deltaMaps.has(key)
            ? this.deltaMaps.get(key)
            : new Map();
          this.chunkCache.set(key, new Chunk(chunkX, chunkZ, step, deltaMap));
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

  private getAllCubeTypes(): Float32Array {
    let totalCubes = 0;
    for (const chunk of this.renderedChunks.values()) {
      totalCubes += chunk.numCubes();
    }
    const combined = new Float32Array(totalCubes);
    let offset = 0;
    for (const chunk of this.renderedChunks.values()) {
      const types = chunk.cubeTypes();
      combined.set(types, offset);
      offset += types.length;
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

    const walkDx = this.gui.walkDir();
    const momentumDx = this.player.velocity.scale(dt, new Vec3());
    const totalDx = walkDx.add(momentumDx, new Vec3());
    this.player.position.add(totalDx);

    this.gui.getCamera().setPos(this.player.position);

    // Check for collisions.
    //
    // FIXME: Ew. This system sucks. It's what the hint says to do but...
    const floorY = this.currentChunk().floorHeight(
      this.player.position.x,
      this.player.position.z,
    );
    // Apply gravity acceleration.
    if (this.player.position.y > floorY + Player.hitboxHeight) {
      const gDelta = -9.8 * dt;
      const gDv = new Vec3([0.0, gDelta, 0.0]);
      this.player.velocity.add(gDv);
    } else {
      // Stop all movement in vertical direction.
      const v = this.player.velocity.copy();
      v.y = 0.0;
      this.player.velocity = v;
      this.player.position.y = floorY + Player.hitboxHeight;
    }
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
    this.drawOverlay();
  }

  private drawScene(x: number, y: number, width: number, height: number): void {
    const gl: WebGLRenderingContext = this.ctx;
    gl.viewport(x, y, width, height);

    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    this.skyboxRenderPass.draw();

    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    const allPositions = this.getAllCubePositions();
    const allTypes = this.getAllCubeTypes();
    const instanceCount = allTypes.length;

    if (allPositions.length !== instanceCount * 4) {
      throw new Error(
        `Instance buffer mismatch: ${allPositions.length / 4} positions vs ${instanceCount} block types`,
      );
    }

    this.blankCubeRenderPass.updateAttributeBuffer("aOffset", allPositions);
    this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", allTypes);
    this.blankCubeRenderPass.drawInstanced(instanceCount);
  }

  /**
   * Returns the position of the highest block within an n x n square centered on the player (bird's eye view),
   * or null if no blocks are found within range.
   */
  public getHighestBlockNearby(n: number): Vec3 | null {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const half = n / 2;
    let bestY = -Infinity;
    let bestX = 0;
    let bestZ = 0;

    for (const chunk of this.renderedChunks.values()) {
      const tlx = chunk.topLeftX();
      const tlz = chunk.topLeftZ();
      const size = chunk.chunkSize();
      const hmap = chunk.heightMap();

      // clamp to overlap between current chunk and query square
      const minX = Math.max(0, Math.floor(px - half - tlx));
      const maxX = Math.min(size - 1, Math.floor(px + half - tlx));
      const minZ = Math.max(0, Math.floor(pz - half - tlz));
      const maxZ = Math.min(size - 1, Math.floor(pz + half - tlz));

      for (let i = minZ; i <= maxZ; i++) {
        for (let j = minX; j <= maxX; j++) {
          const y = hmap[size * i + j];
          if (y > bestY) {
            bestY = y;
            bestX = tlx + j;
            bestZ = tlz + i;
          }
        }
      }
    }

    if (bestY === -Infinity) {
      return null;
    }
    return new Vec3([bestX, bestY, bestZ]);
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
    let minCube = new Vec3([centerX - 0.5, centerY - 0.5, centerZ - 0.5]);
    let maxCube = new Vec3([centerX + 0.5, centerY + 0.5, centerZ + 0.5]);

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

  private getSkyboxViewMatrix(): Mat4 {
    const skyboxView = this.gui.viewMatrix().copy();
    const viewValues = skyboxView.all();
    viewValues[12] = 0;
    viewValues[13] = 0;
    viewValues[14] = 0;
    return new Mat4(viewValues);
  }

  public jump() {
    // If player is not already in the air, launch them up at 10 units/sec.
    //
    // FIXME: Same problem as in draw loop.
    const floorY = this.currentChunk().floorHeight(
      this.player.position.x,
      this.player.position.z,
    );
    // FIXME: Wtf. Does this even work?
    if (this.player.position.y <= floorY + Player.hitboxHeight) {
      const dv = new Vec3([0.0, 10.0, 0.0]);
      this.player.velocity.add(dv);
    }
  }

  public intersectCubes(rayPos: Vec3, rayDir: Vec3): boolean {
    let bestT = Infinity;
    let bestPos = [-1000, -1000, -1000];
    let bestN = new Vec3();
    let hit = false;

    // Have player's reach extend 5 cubes
    for (let dx = -5; dx <= 5; dx++) {
      for (let dz = -5; dz <= 5; dz++) {
        for (let dy = -5; dy <= 5; dy++) {
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

  public breakSelectedBlock(): number | undefined {
    const chunkX = this.worldToChunkCoord(this.selectedCubePosition.x);
    const chunkZ = this.worldToChunkCoord(this.selectedCubePosition.z);
    let key = `${chunkX},${chunkZ}`;
    let chunk = this.renderedChunks.get(key)!;

    let brokenCubeType = chunk.cubeType(
      this.selectedCubePosition.x,
      this.selectedCubePosition.z,
      this.selectedCubePosition.y,
    );
    let chunkDeltaMap = chunk.changeCubeType(
      this.selectedCubePosition.x,
      this.selectedCubePosition.z,
      this.selectedCubePosition.y,
      Chunk.blockTypeAir,
    );

    this.deltaMaps.set(key, chunkDeltaMap);
    return brokenCubeType;
  }

  public placeBlock(cubeType: number) {
    // Place new cube based on side of cube that mouse is pointing at
    const cubeX = this.selectedCubePosition.x + this.isectNormal.x;
    const cubeY = this.selectedCubePosition.y + this.isectNormal.y;
    const cubeZ = this.selectedCubePosition.z + this.isectNormal.z;

    const chunkX = this.worldToChunkCoord(cubeX);
    const chunkZ = this.worldToChunkCoord(cubeZ);
    let key = `${chunkX},${chunkZ}`;
    let chunk = this.renderedChunks.get(key)!;

    let chunkDeltaMap = chunk.changeCubeType(cubeX, cubeZ, cubeY, cubeType);

    // TODO: Test falling blocks by checking if block below is empty
    if (chunk.cubeType(cubeX, cubeZ, cubeY - 1) === undefined) {
      this.fallingBlocks.push(new Block(new Vec3([cubeX, cubeY, cubeZ])));
      // TODO: Remove block from chunk's map so that its static version is not rendered
    }

    this.deltaMaps.set(key, chunkDeltaMap);
  }

  private drawOverlay(): void {
    const ctx = this.overlayCtx;
    const x = 18;
    const y = 18;
    const timeLine = `Time ${this.formatDayTime(this.getCurrentDayTime())}`;

    ctx.clearRect(0, 0, this.canvas2d.width, this.canvas2d.height);
    ctx.save();
    ctx.font = "14px monospace";
    ctx.textBaseline = "top";
    const panelWidth = ctx.measureText(timeLine).width + 20;
    const panelHeight = 32;
    ctx.fillStyle = "rgba(12, 18, 28, 0.58)";
    ctx.fillRect(x - 10, y - 8, panelWidth, panelHeight);
    ctx.fillStyle = "#fff6d7";
    ctx.fillText(timeLine, x, y);

    ctx.restore();
  }

  private formatDayTime(value: number): string {
    const wrapped = Math.floor(this.wrapDayTime(value));
    const hours24 = Math.floor(wrapped / 60);
    const minutes = wrapped % 60;
    const suffix = hours24 < 12 ? "AM" : "PM";
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const minuteText = minutes < 10 ? `0${minutes}` : String(minutes);
    return `${hours12}:${minuteText} ${suffix}`;
  }

  private getCurrentDayTime(): number {
    return this.wrapDayTime(this.getTimeValue());
  }

  private getTimeValue(): number {
    return performance.now() / 1000;
  }

  private wrapDayTime(value: number): number {
    const dayDuration = MinecraftAnimation.dayDuration;
    return ((value % dayDuration) + dayDuration) % dayDuration;
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
