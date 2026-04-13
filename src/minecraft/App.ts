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
import { Billboard } from "./Billboard.js";
import {
  DecorationGenerator,
  type DecorBuffer,
} from "./Decorations.js";
import {
  blankCubeFSText,
  blankCubeVSText,
  decorBillboardFSText,
  decorBillboardVSText,
  skyboxFSText,
  skyboxVSText,
} from "./Shaders.js";

type DecorBatch = {
  offsets: Float32Array;
  scales: Float32Array;
  variants: Float32Array;
  types: Float32Array;
  angles: Float32Array;
  tilts: Float32Array;
  count: number;
};

export class MinecraftAnimation extends CanvasAnimation {
  public static readonly dayDuration = 1440.0;

  private gui: GUI;

  private chunkCache: LruCache<string, Chunk>;
  private renderedChunks: Map<string, Chunk>;

  private static readonly renderDistance: number = 1;
  private static readonly chunkSize: number = 64;

  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass;
  private skyboxRenderPass: RenderPass;
  private billboardGeometry: Billboard;
  private decorationRenderPass: RenderPass;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;

  private player: Player;
  private decorationGenerator: DecorationGenerator;
  private decorationCache: Map<string, DecorBuffer>;

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
    this.decorationGenerator = new DecorationGenerator();
    this.decorationCache = new Map();
    const playerPosition = this.gui.getCamera().pos();
    this.player = new Player(playerPosition);

    this.loadChunksAroundPlayer();

    this.blankCubeRenderPass = new RenderPass(
      gl,
      blankCubeVSText,
      blankCubeFSText,
    );
    this.skyboxRenderPass = new RenderPass(gl, skyboxVSText, skyboxFSText);
    this.decorationRenderPass = new RenderPass(
      gl,
      decorBillboardVSText,
      decorBillboardFSText,
    );
    this.cubeGeometry = new Cube();
    this.billboardGeometry = new Billboard();
    this.initSkybox();
    this.initBlankCube();
    this.initDecorBillboards();

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

  /**
   * Sets up billboard decoration rendering
   */
  private initDecorBillboards(): void {
    this.decorationRenderPass.setIndexBufferData(
      this.billboardGeometry.indicesFlat(),
    );
    this.decorationRenderPass.addAttribute(
      "aQuadPos",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.billboardGeometry.positionsFlat(),
    );
    this.decorationRenderPass.addAttribute(
      "aQuadUV",
      2,
      this.ctx.FLOAT,
      false,
      2 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.billboardGeometry.uvFlat(),
    );
    this.decorationRenderPass.addInstancedAttribute(
      "aInstancePos",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    this.decorationRenderPass.addInstancedAttribute(
      "aScale",
      1,
      this.ctx.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    this.decorationRenderPass.addInstancedAttribute(
      "aVariant",
      1,
      this.ctx.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    this.decorationRenderPass.addInstancedAttribute(
      "aType",
      1,
      this.ctx.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    this.decorationRenderPass.addInstancedAttribute(
      "aAngle",
      1,
      this.ctx.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    this.decorationRenderPass.addInstancedAttribute(
      "aTilt",
      1,
      this.ctx.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    this.decorationRenderPass.addUniform(
      "uProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(
          loc,
          false,
          new Float32Array(this.gui.projMatrix().all()),
        );
      },
    );
    this.decorationRenderPass.addUniform(
      "uView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(
          loc,
          false,
          new Float32Array(this.gui.viewMatrix().all()),
        );
      },
    );
    this.decorationRenderPass.addUniform(
      "uCameraRight",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        const right = this.gui.getCamera().right();
        gl.uniform3fv(loc, new Float32Array(right.xyz));
      },
    );
    this.decorationRenderPass.addUniform(
      "uCameraUp",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        const up = this.gui.getCamera().up();
        gl.uniform3fv(loc, new Float32Array(up.xyz));
      },
    );
    this.decorationRenderPass.addUniform(
      "uCameraPos",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        const pos = this.gui.getCamera().pos();
        gl.uniform3fv(loc, new Float32Array(pos.xyz));
      },
    );
    this.decorationRenderPass.addUniform(
      "uTime",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1f(loc, this.getTimeValue());
      },
    );
    this.decorationRenderPass.setDrawData(
      this.ctx.TRIANGLES,
      this.billboardGeometry.indicesFlat().length,
      this.ctx.UNSIGNED_INT,
      0,
    );
    this.decorationRenderPass.setup();
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
          this.chunkCache.set(key, new Chunk(chunkX, chunkZ, step));
          this.decorationCache.delete(key);
        }
        const cachedChunk = this.chunkCache.get(key)!;
        this.renderedChunks.set(key, cachedChunk);
        if (!this.decorationCache.has(key)) {
          this.decorationCache.set(
            key,
            this.decorationGenerator.generateForChunk(key, cachedChunk),
          );
        }
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

  private getDecorBatch(): DecorBatch {
    let totalInstances = 0;
    for (const key of this.renderedChunks.keys()) {
      const buffer = this.decorationCache.get(key);
      if (buffer) {
        totalInstances += buffer.count;
      }
    }
    if (totalInstances === 0) {
      return {
        offsets: new Float32Array(0),
        scales: new Float32Array(0),
        variants: new Float32Array(0),
        types: new Float32Array(0),
        angles: new Float32Array(0),
        tilts: new Float32Array(0),
        count: 0,
      };
    }
    const offsets = new Float32Array(totalInstances * 4);
    const scales = new Float32Array(totalInstances);
    const variants = new Float32Array(totalInstances);
    const types = new Float32Array(totalInstances);
    const angles = new Float32Array(totalInstances);
    const tilts = new Float32Array(totalInstances);
    let cursor = 0;
    for (const key of this.renderedChunks.keys()) {
      const buffer = this.decorationCache.get(key);
      if (!buffer || buffer.count === 0) {
        continue;
      }
      offsets.set(buffer.offsets, cursor * 4);
      scales.set(buffer.scales, cursor);
      variants.set(buffer.variants, cursor);
      types.set(buffer.types, cursor);
      angles.set(buffer.angles, cursor);
      tilts.set(buffer.tilts, cursor);
      cursor += buffer.count;
    }
    return {
      offsets,
      scales,
      variants,
      types,
      angles,
      tilts,
      count: totalInstances,
    };
  }

  private drawDecorations(): void {
    const batch = this.getDecorBatch();
    if (batch.count === 0) {
      return;
    }
    this.decorationRenderPass.updateAttributeBuffer(
      "aInstancePos",
      batch.offsets,
    );
    this.decorationRenderPass.updateAttributeBuffer("aScale", batch.scales);
    this.decorationRenderPass.updateAttributeBuffer("aVariant", batch.variants);
    this.decorationRenderPass.updateAttributeBuffer("aType", batch.types);
    this.decorationRenderPass.updateAttributeBuffer("aAngle", batch.angles);
    this.decorationRenderPass.updateAttributeBuffer("aTilt", batch.tilts);
    this.decorationRenderPass.drawInstanced(batch.count);
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

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    this.drawDecorations();
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);

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
