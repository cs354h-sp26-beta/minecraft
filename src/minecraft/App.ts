import { Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { Debugger } from "../lib/webglutils/Debugging.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Chunk } from "./Chunk.js";
import { Cube } from "./Cube.js";
import { GUI } from "./Gui.js";
import { Enemy, Player, Block } from "./Entity.js";
import { LruCache } from "./Cache.js";
import { Camera } from "../lib/webglutils/Camera.js";
import {
  blankCubeFSText,
  blankCubeVSText,
  skyboxFSText,
  skyboxVSText,
  enemyFSText,
  enemyVSText,
} from "./Shaders.js";
import { Mesh } from "./Mesh.js";
import { CLoader } from "./AnimationFileLoader.js";

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

  /*  Enemy Rendering */
  private enemyRenderPass: RenderPass;
  private enemyMeshLoader: CLoader;
  private enemyMesh: Mesh | null;
  private enemyBoneTransTex: WebGLTexture;
  private enemyBoneRotTex: WebGLTexture;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;
  private selectedCubePosition: Vec4;

  private canvas2d: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;

  private player: Player;
  private fallingBlocks: Block[];
  private isectNormal: Vec3;

  private enemies: Enemy[];

  /* Overlay information */
  private minimapPixelSize = 135;
  private minimapColors = [ // index corresponds to block type, value is [r, g, b] color for minimap
    [Number.parseInt("8b", 16), Number.parseInt("45", 16), Number.parseInt("13", 16)], // dirt
    [Number.parseInt("a6", 16), Number.parseInt("a1", 16), Number.parseInt("99", 16)], // cobble
    [Number.parseInt("2b", 16), Number.parseInt("4d", 16), Number.parseInt("8c", 16)], // water
    [Number.parseInt("3f", 16), Number.parseInt("3f", 16), Number.parseInt("3f", 16)], // coal ore
    [Number.parseInt("af", 16), Number.parseInt("af", 16), Number.parseInt("af", 16)], // iron ore
    [Number.parseInt("ff", 16), Number.parseInt("d7", 16), Number.parseInt("00", 16)], // gold ore
    [Number.parseInt("00", 16), Number.parseInt("ff", 16), Number.parseInt("ff", 16)], // diamond ore
  ]

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
    this.enemyRenderPass = new RenderPass(gl, enemyVSText, enemyFSText);
    this.initSkybox();
    this.initBlankCube();

    this.enemies = [];
    this.enemyMesh = null;
    this.enemyMeshLoader = new CLoader("./static/assets/robot.dae");
    this.enemyMeshLoader.load(() => this.initEnemies());

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

  /**
   * Sets up the enemy drawing
   */
  private initEnemies(): void {
    if (this.enemyMeshLoader.meshes.length === 0) {
      throw new Error("Failed to load enemy mesh.");
    }
    this.enemyMesh = this.enemyMeshLoader.meshes[0];
    this.enemyMesh!.scale(0.5);

    let faceCount = this.enemyMesh!.geometry.position.count / 3;
    let fIndices = new Uint32Array(faceCount * 3);
    for (let i = 0; i < faceCount * 3; i += 3) {
      fIndices[i] = i;
      fIndices[i + 1] = i + 1;
      fIndices[i + 2] = i + 2;
    }
    this.enemyRenderPass.setIndexBufferData(fIndices);

    this.enemyRenderPass.addInstancedAttribute(
      "aOffset",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    this.enemyRenderPass.addInstancedAttribute(
      "aRot",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );
    this.enemyRenderPass.addInstancedAttribute(
      "aIdx",
      1,
      this.ctx.FLOAT,
      false,
      1 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0),
    );

    this.enemyRenderPass.addAttribute(
      "aNorm",
      3,
      this.ctx.FLOAT,
      false,
      3 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.enemyMesh!.geometry.normal.values,
    );
    this.enemyRenderPass.addAttribute(
      "skinIndices",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.enemyMesh!.geometry.skinIndex.values,
    );
    this.enemyRenderPass.addAttribute(
      "skinWeights",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.enemyMesh!.geometry.skinWeight.values,
    );
    this.enemyRenderPass.addAttribute(
      "v0",
      3,
      this.ctx.FLOAT,
      false,
      3 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.enemyMesh!.geometry.v0.values,
    );
    this.enemyRenderPass.addAttribute(
      "v1",
      3,
      this.ctx.FLOAT,
      false,
      3 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.enemyMesh!.geometry.v1.values,
    );
    this.enemyRenderPass.addAttribute(
      "v2",
      3,
      this.ctx.FLOAT,
      false,
      3 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.enemyMesh!.geometry.v2.values,
    );
    this.enemyRenderPass.addAttribute(
      "v3",
      3,
      this.ctx.FLOAT,
      false,
      3 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.enemyMesh!.geometry.v3.values,
    );

    this.enemyRenderPass.addUniform(
      "uLightPos",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
      },
    );
    this.enemyRenderPass.addUniform(
      "uProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(
          loc,
          false,
          new Float32Array(this.gui.projMatrix().all()),
        );
      },
    );
    this.enemyRenderPass.addUniform(
      "uView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(
          loc,
          false,
          new Float32Array(this.gui.viewMatrix().all()),
        );
      },
    );

    this.enemyBoneTransTex = this.ctx.createTexture();
    if (this.enemyBoneTransTex === null) {
      console.error("Error creating texture");
    }
    this.enemyBoneRotTex = this.ctx.createTexture();
    if (this.enemyBoneRotTex === null) {
      console.error("Error creating texture");
    }

    this.enemyRenderPass.addUniform(
      "uTexDim",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        const width = this.enemyMesh!.bones.length;
        const height = this.enemies.length;
        gl.uniform2f(loc, width, height);
      },
    );
    this.enemyRenderPass.addUniform(
      "uJTrans",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.activeTexture(gl.TEXTURE0);
        this.loadEnemyBoneTranslations(gl);
        gl.uniform1i(loc, 0);
      },
    );
    this.enemyRenderPass.addUniform(
      "uJRots",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.activeTexture(gl.TEXTURE1);
        this.loadEnemyBoneRotations(gl);
        gl.uniform1i(loc, 1);
      },
    );

    // this.enemyRenderPass.addUniform("jTrans",
    //     (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
    //       gl.uniform3fv(loc, this.enemyMesh!.getBoneTranslations());
    //     });
    // this.enemyRenderPass.addUniform("jRots",
    //     (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
    //       gl.uniform4fv(loc, this.enemyMesh!.getBoneRotations());
    //     });

    this.enemyRenderPass.setDrawData(
      this.ctx.TRIANGLES,
      this.enemyMesh!.geometry.position.count,
      this.ctx.UNSIGNED_INT,
      0,
    );
    this.enemyRenderPass.setup();

    this.enemies.push(
      new Enemy(
        this.enemyMesh!,
        new Vec3([
          this.player.position.x + 2,
          this.player.position.y - 85,
          this.player.position.z + 2,
        ]),
      ),
    );
    this.enemies.push(
      new Enemy(
        this.enemyMesh!,
        new Vec3([
          this.player.position.x - 2,
          this.player.position.y - 85,
          this.player.position.z + 2,
        ]),
      ),
    );
    this.enemies.push(
      new Enemy(
        this.enemyMesh!,
        new Vec3([
          this.player.position.x + 2,
          this.player.position.y - 85,
          this.player.position.z - 2,
        ]),
      ),
    );
    this.enemies.push(
      new Enemy(
        this.enemyMesh!,
        new Vec3([
          this.player.position.x - 2,
          this.player.position.y - 85,
          this.player.position.z - 2,
        ]),
      ),
    );
  }

  private loadEnemyBoneTranslations(gl: WebGLRenderingContext): void {
    const height = this.enemies.length;
    const width = this.enemyMesh!.bones.length;
    let boneTransData = new Uint8Array(width * height * 4);

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      const boneTrans = enemy.mesh.getBoneTranslationsUi8();
      boneTransData.set(boneTrans, i * width * 4);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.enemyBoneTransTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      boneTransData,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  }

  private loadEnemyBoneRotations(gl: WebGLRenderingContext): void {
    const height = this.enemies.length;
    const width = this.enemyMesh!.bones.length;
    let boneRotData = new Uint8Array(width * height * 4);

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      const boneRots = enemy.mesh.getBoneRotationsUi8();
      boneRotData.set(boneRots, i * width * 4);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.enemyBoneRotTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      boneRotData,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
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

    this.enemies.forEach((enemy) => {
      enemy.update(dt, this.player);
    });

    const walkDx = this.gui.walkDir().scale(0.1);
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

    // Enemies
    if (this.enemyMesh !== null) {
      const enemyInstanceCount = this.enemies.length;
      const enemyPositions = new Float32Array(enemyInstanceCount * 4);
      const enemyRotations = new Float32Array(enemyInstanceCount * 4);
      const enemyIdxs = new Float32Array(enemyInstanceCount);
      for (let i = 0; i < this.enemies.length; i++) {
        enemyIdxs[i] = i;
        const pos = this.enemies[i].position;
        enemyPositions.set([pos.x, pos.y, pos.z, 0], i * 4);
        const rot = this.enemies[i].getRotation();
        enemyRotations.set([rot.x, rot.y, rot.z, rot.w], i * 4);
      }

      this.enemyRenderPass.updateAttributeBuffer("aOffset", enemyPositions);
      this.enemyRenderPass.updateAttributeBuffer("aRot", enemyRotations);
      this.enemyRenderPass.updateAttributeBuffer("aIdx", enemyIdxs);
      this.enemyRenderPass.drawInstanced(enemyInstanceCount);
    }
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
    const cubeX = this.selectedCubePosition.x;
    const cubeY = this.selectedCubePosition.y;
    const cubeZ = this.selectedCubePosition.z;

    const chunkX = this.worldToChunkCoord(cubeX);
    const chunkZ = this.worldToChunkCoord(cubeZ);
    let key = `${chunkX},${chunkZ}`;
    let chunk = this.renderedChunks.get(key)!;

    // Place new cube based on side of cube that mouse is pointing at
    let chunkDeltaMap = chunk.changeCubeType(
      cubeX + this.isectNormal.x,
      cubeZ + this.isectNormal.z,
      cubeY + this.isectNormal.y,
      cubeType,
    );

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

    this.drawMinimap();

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

  /**
   * Draw the minimap in the top right corner of the screen
   */
  private drawMinimap(): void {
    const ctx = this.overlayCtx;
    const playerPos = this.player.position;
    const size = this.minimapPixelSize;
    const minimapX = this.canvas2d.width - size - 10;
    const minimapY = 10;
    ctx.save();
    ctx.translate(minimapX, minimapY);

    // terrain
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const worldX = Math.floor(playerPos.x - size / 2 + i);
            const worldZ = Math.floor(playerPos.z - size / 2 + j);

            const chunkX = this.worldToChunkCoord(worldX);
            const chunkZ = this.worldToChunkCoord(worldZ);
            const chunk = this.renderedChunks.get(`${chunkX},${chunkZ}`);

            if (!chunk) {
              continue;
            }

            const topBlock = chunk.topBlockAt(worldX, worldZ);
            if (!topBlock || topBlock.type < 0 || topBlock.type >= this.minimapColors.length) {
              ctx.fillStyle = "#C7C0B7";
              ctx.fillRect(i, j, 1, 1);
              continue;
            }

            // height-based tinting: darken below sea level, brighten above. tune t to adjust strength of effect
            const height = topBlock.height;
            const r = this.minimapColors[topBlock.type][0];
            const g = this.minimapColors[topBlock.type][1];
            const b = this.minimapColors[topBlock.type][2];
            let lr: number, lg: number, lb: number;

            if (height < Chunk.SEA_LEVEL) {
              // Below sea level: dark bands
              // Depths: 0-2 = very dark (0.45), 3-4 = dark (0.30), 5-6 = dim (0.15), 7 = slight (0.05)
              const depth = Chunk.SEA_LEVEL - height;
              const t = depth >= 6 ? 0.45 : depth >= 4 ? 0.30 : depth >= 2 ? 0.15 : 0.05;
              lr = Math.round(r * (1 - t));
              lg = Math.round(g * (1 - t));
              lb = Math.round(b * (1 - t));
            } else {
              // Above sea level: bright bands
              // Heights above sea: 0-4 = base, 5-9 = +10%, 10-16 = +20%, 17-24 = +30%, 25+ = +40%
              const elev = height - Chunk.SEA_LEVEL;
              const t = elev >= 25 ? 0.40 : elev >= 17 ? 0.30 : elev >= 10 ? 0.20 : elev >= 5 ? 0.10 : 0;
              lr = Math.round(r + (255 - r) * t);
              lg = Math.round(g + (255 - g) * t);
              lb = Math.round(b + (255 - b) * t);
            }

            ctx.fillStyle = `rgb(${lr},${lg},${lb})`;
            ctx.fillRect(i, j, 1, 1);
        }
    }

    // player icon
    const camera = this.gui.getCamera();
    const look = camera.forward().negate();
    const angle = Math.atan2(-look.x, look.z);
    
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(-4, -4);
    ctx.lineTo(4, -4);
    ctx.closePath();
    ctx.fillStyle = "#0000ff";
    ctx.fill();
    ctx.restore();

    // enemy icons
    this.enemies.forEach((enemy) => {
      const ex = enemy.position.x - playerPos.x + size / 2;
      const ez = enemy.position.z - playerPos.z + size / 2;
      if (ex >= 0 && ex < size && ez >= 0 && ez < size) {
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(ex, ez, 2, 2);
      }
    });

    // border
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
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
