import { Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { Debugger } from "../lib/webglutils/Debugging.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Chunk } from "./Chunk.js";
import { Cube } from "./Cube.js";
import { GUI } from "./Gui.js";
import { Enemy, Player } from "./Entity.js";
import { LruCache } from "./Cache.js";
import { Camera } from "../lib/webglutils/Camera.js";
import { enemyIdlePose } from "./Animations.js";
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

  private static readonly renderDistance: number = 1;
  private static readonly chunkSize: number = 64;

  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass;
  private skyboxRenderPass: RenderPass;

  /*  Enemy Rendering */
  private enemyRenderPass: RenderPass;
  private enemyMeshLoader: CLoader;
  private enemyMesh: Mesh;
  private enemyBoneTransTex: WebGLTexture;
  private enemyBoneRotTex: WebGLTexture;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;

  private player: Player;

  private enemies: Enemy[];

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
    this.enemyRenderPass = new RenderPass(gl, enemyVSText, enemyFSText);
    this.initSkybox();
    this.initBlankCube();

    this.enemies = [];
    this.enemyMesh = null;
    this.enemyMeshLoader = new CLoader("./static/assets/robot.dae");
    this.enemyMeshLoader.load(() => this.initEnemies());

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
    * Sets up the enemy drawing
   */
  private initEnemies(): void {
    if (this.enemyMeshLoader.meshes.length === 0) { throw new Error("Failed to load enemy mesh."); }
    this.enemyMesh = this.enemyMeshLoader.meshes[0];
    this.enemyMesh.scale(0.5);

    let faceCount = this.enemyMesh.geometry.position.count / 3;
    let fIndices = new Uint32Array(faceCount * 3);
    for (let i = 0; i < faceCount * 3; i += 3) {
      fIndices[i] = i;
      fIndices[i + 1] = i + 1;
      fIndices[i + 2] = i + 2;
    }
    this.enemyRenderPass.setIndexBufferData(fIndices);

    this.enemyRenderPass.addInstancedAttribute("aOffset", 4, this.ctx.FLOAT, false,
        4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
    this.enemyRenderPass.addInstancedAttribute("aIdx", 1, this.ctx.FLOAT, false,
        1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));

    this.enemyRenderPass.addAttribute("aNorm", 3, this.ctx.FLOAT, false,
        3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.enemyMesh.geometry.normal.values);
    this.enemyRenderPass.addAttribute("skinIndices", 4, this.ctx.FLOAT, false,
        4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.enemyMesh.geometry.skinIndex.values);
    this.enemyRenderPass.addAttribute("skinWeights", 4, this.ctx.FLOAT, false,
        4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.enemyMesh.geometry.skinWeight.values);
    this.enemyRenderPass.addAttribute("v0", 3, this.ctx.FLOAT, false,
        3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.enemyMesh.geometry.v0.values);
    this.enemyRenderPass.addAttribute("v1", 3, this.ctx.FLOAT, false,
        3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.enemyMesh.geometry.v1.values);
    this.enemyRenderPass.addAttribute("v2", 3, this.ctx.FLOAT, false,
        3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.enemyMesh.geometry.v2.values);
    this.enemyRenderPass.addAttribute("v3", 3, this.ctx.FLOAT, false,
        3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.enemyMesh.geometry.v3.values);

    this.enemyRenderPass.addUniform("uLightPos",
        (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          gl.uniform4fv(loc, this.lightPosition.xyzw);
        },);
    this.enemyRenderPass.addUniform("uProj",
        (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
        });
    this.enemyRenderPass.addUniform("uView",
        (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
        });

    this.enemyBoneTransTex = this.ctx.createTexture();
    if (this.enemyBoneTransTex === null) {
      console.error("Error creating texture");
    }
    this.enemyBoneRotTex = this.ctx.createTexture();
    if (this.enemyBoneRotTex === null) {
      console.error("Error creating texture");
    }

    this.enemyRenderPass.addUniform("uTexDim",
        (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
            const width = this.enemyMesh.bones.length;
            const height = this.enemies.length;
            gl.uniform2f(loc, width, height);
        });
    this.enemyRenderPass.addUniform("uJTrans",
        (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          gl.activeTexture(gl.TEXTURE0);
          this.loadEnemyBoneTranslations(gl);
          gl.uniform1i(loc, 0);
        });
    this.enemyRenderPass.addUniform("uJRots",
        (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
          gl.activeTexture(gl.TEXTURE1);
          this.loadEnemyBoneRotations(gl);
          gl.uniform1i(loc, 1);
        });

    // this.enemyRenderPass.addUniform("jTrans",
    //     (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
    //       gl.uniform3fv(loc, this.enemyMesh.getBoneTranslations());
    //     });
    // this.enemyRenderPass.addUniform("jRots",
    //     (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
    //       gl.uniform4fv(loc, this.enemyMesh.getBoneRotations());
    //     });

    this.enemyRenderPass.setDrawData(this.ctx.TRIANGLES, this.enemyMesh.geometry.position.count, this.ctx.UNSIGNED_INT, 0);
    this.enemyRenderPass.setup();

    this.enemies.push(new Enemy(this.enemyMesh, new Vec3([this.player.position.x + 2, this.player.position.y - 85, this.player.position.z + 2])));
    this.enemies.push(new Enemy(this.enemyMesh, new Vec3([this.player.position.x - 2, this.player.position.y - 85, this.player.position.z + 2])));
    this.enemies.push(new Enemy(this.enemyMesh, new Vec3([this.player.position.x + 2, this.player.position.y - 85, this.player.position.z - 2])));
    this.enemies.push(new Enemy(this.enemyMesh, new Vec3([this.player.position.x - 2, this.player.position.y - 85, this.player.position.z - 2])));

    this.enemies[0].mesh.setPose(enemyIdlePose);
    this.enemies[2].mesh.setPose(enemyIdlePose);
  }

  private loadEnemyBoneTranslations(gl: WebGLRenderingContext): void {
    const height = this.enemies.length;
    const width = this.enemyMesh.bones.length;
    let boneTransData = new Uint8Array(width * height * 4);

    for (let i = 0; i < this.enemies.length; i++) {
        const enemy = this.enemies[i];
        const boneTrans = enemy.mesh.getBoneTranslationsUi8();
        boneTransData.set(boneTrans, i * width * 4);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.enemyBoneTransTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, boneTransData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  }

  private loadEnemyBoneRotations(gl: WebGLRenderingContext): void {
    const height = this.enemies.length;
    const width = this.enemyMesh.bones.length;
    let boneRotData = new Uint8Array(width * height * 4);

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      const boneRots = enemy.mesh.getBoneRotationsUi8();
      boneRotData.set(boneRots, i * width * 4);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.enemyBoneRotTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, boneRotData);
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

    // Enemies
    if (this.enemyMesh !== null) {
      const enemyInstanceCount = this.enemies.length;
      const enemyPositions = new Float32Array(enemyInstanceCount * 4);
      const enemyIdxs = new Float32Array(enemyInstanceCount);
      for (let i = 0; i < this.enemies.length; i++) {
        enemyIdxs[i] = i;
        const pos = this.enemies[i].position;
        enemyPositions.set([pos.x, pos.y, pos.z, 0], i * 4);
      }

      this.enemyRenderPass.updateAttributeBuffer("aOffset", enemyPositions);
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
