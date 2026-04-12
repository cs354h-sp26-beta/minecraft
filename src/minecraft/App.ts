import { Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { Debugger } from "../lib/webglutils/Debugging.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Chunk } from "./Chunk.js";
import { Cube } from "./Cube.js";
import { GUI } from "./Gui.js";
import { Player } from "./Entity.js";
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

  // TODO: Map chunk to seed!
  private chunkSeeds: Map<string, string>;

  private chunkCache: LruCache<string, Chunk>;
  private renderedChunks: Map<string, Chunk>;

  private static readonly renderDistance: number = 3;

  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass;
  private skyboxRenderPass: RenderPass;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;

  private player: Player;

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
    this.chunkSeeds = new Map();
    this.chunkCache = new LruCache();
    this.renderedChunks = new Map();
    const playerPosition = this.gui.getCamera().pos();
    this.player = new Player(playerPosition);

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

    this.blankCubeRenderPass.setDrawData(
      this.ctx.TRIANGLES,
      this.cubeGeometry.indicesFlat().length,
      this.ctx.UNSIGNED_INT,
      0,
    );
    this.blankCubeRenderPass.setup();
  }

  private worldToChunkCoord(worldVal: number): number {
    // returns the center of the chunk on the grid
    return Math.floor(worldVal / 64) * 64;
  }

  private currentChunk(): Chunk {
    const chunkX = this.worldToChunkCoord(this.player.position.x);
    const chunkZ = this.worldToChunkCoord(this.player.position.z);
    return this.renderedChunks.get(`${chunkX},${chunkZ}`)!;
  }

  // Initializes a chunk and maps its seed.
  private initChunk(chunkX: number, chunkZ: number): Chunk {
    const chunk = new Chunk(chunkX, chunkZ, 64);
    const key = `${chunkX},${chunkZ}`;
    this.chunkSeeds.set(key, chunk.seed);
    return chunk;
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
    for (let di = -rd; di <= rd; di++) {
      for (let dj = -rd; dj <= rd; dj++) {
        const chunkX = cx + di * 64;
        const chunkZ = cz + dj * 64;
        const key = `${chunkX},${chunkZ}`;
        if (!this.chunkCache.has(key)) {
          const chunkToLoadSeed = this.chunkSeeds.get(key);
          if (chunkToLoadSeed === undefined) {
            const initChunk = this.initChunk(chunkX, chunkZ);
            this.chunkCache.set(key, initChunk);
          } else {
            const loadedChunk = this.loadChunkFromSeed(
              chunkX,
              chunkZ,
              chunkToLoadSeed,
            );
            this.chunkCache.set(key, loadedChunk);
          }
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
    // To slow movement to something more natural, scale the amount we can move per frame.
    const dt = 1;

    const walkDx = this.gui.walkDir().scale(dt, new Vec3());
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

    this.loadChunksAroundPlayer();

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
    this.blankCubeRenderPass.updateAttributeBuffer("aOffset", allPositions);
    //this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", allTypes);
    this.blankCubeRenderPass.drawInstanced(allPositions.length / 4);

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
