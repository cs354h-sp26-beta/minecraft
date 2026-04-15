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
import {Inventory, ItemAction, ItemStack, itemTypes, registerItemTypes} from "./Inventory.js";

type Achievement = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  completedAt: number | null;
};

type AchievementToast = {
  title: string;
  description: string;
  timeLeft: number;
};

export class MinecraftAnimation extends CanvasAnimation {
  public static readonly dayDuration = 1440.0;
  private static readonly safeFallDistance = 3;

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
  private heartBitmap: ImageBitmap | null = null;

  private player: Player;
  private spawnPosition: Vec3;
  private fallingBlocks: Block[];
  private isectNormal: Vec3;
  private wasPlayerGrounded: boolean;
  private airborneStartY: number;
  private fallDamageArmed: boolean;

  private enemies: Enemy[];
  private achievements: Achievement[];
  private achievementToast: AchievementToast | null;
  private showAchievements: boolean;
  private blocksBroken: number;
  private blocksPlaced: number;
  private successfulJumps: number;

  /* Inventory */
  private inventory: Inventory;
  private selectedHotbarIdx: number;

  /* Overlay information */
  private minimapPixelSize = 135;
  private minimapColors: Map<number, [number,number,number]>;

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

    registerItemTypes();

    this.loadMinimapColors();

    this.gui = new GUI(this.canvas2d, this);
    this.chunkCache = new LruCache();
    this.renderedChunks = new Map();
    this.deltaMaps = new Map();

    const playerPosition = this.gui.getCamera().pos();
    this.player = new Player(playerPosition);
    this.spawnPosition = playerPosition.copy();
    this.fallingBlocks = [];
    this.isectNormal = new Vec3();
    this.wasPlayerGrounded = false;
    this.airborneStartY = this.player.position.y;
    this.fallDamageArmed = false;

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
    this.achievements = this.createAchievements();
    this.achievementToast = null;
    this.showAchievements = false;
    this.blocksBroken = 0;
    this.blocksPlaced = 0;
    this.successfulJumps = 0;
    this.enemyMesh = null;
    this.enemyMeshLoader = new CLoader("./static/assets/robot.dae");
    this.enemyMeshLoader.load(() => this.initEnemies());

    this.lightPosition = new Vec4([-1000, 1000, -1000, 1]);
    this.backgroundColor = new Vec4([0.0, 0.37254903, 0.37254903, 1.0]);
    this.selectedCubePosition = new Vec4([-1000, -1000, -1000, 1]);

    this.inventory = new Inventory();
    this.selectedHotbarIdx = 0;
    
    // Load heart icon for health bar
    const heartImg = new Image();
    heartImg.src = "./static/assets/heart.png";
    heartImg.onload = () => {
      createImageBitmap(heartImg).then((bmp) => {
        this.heartBitmap = bmp;
      });
    };
  }

  private createAchievements(): Achievement[] {
    return [
      {
        id: "jump",
        title: "First Jump",
        description: "Jump for the first time.",
        completed: false,
        completedAt: null,
      },
      {
        id: "mine",
        title: "Stone Age",
        description: "Break your first block.",
        completed: false,
        completedAt: null,
      },
      {
        id: "place",
        title: "Block by Block",
        description: "Place a block into the world.",
        completed: false,
        completedAt: null,
      },
      {
        id: "explore",
        title: "Adventuring Time",
        description: "Travel 32 blocks from spawn.",
        completed: false,
        completedAt: null,
      },
      {
        id: "night",
        title: "After Dark",
        description: "Stay out until night falls.",
        completed: false,
        completedAt: null,
      },
    ];
  }

  private completeAchievement(id: string): void {
    const achievement = this.achievements.find((entry) => entry.id === id);
    if (!achievement || achievement.completed) {
      return;
    }

    achievement.completed = true;
    achievement.completedAt = performance.now() / 1000;
    this.achievementToast = {
      title: achievement.title,
      description: achievement.description,
      timeLeft: 4.0,
    };
  }

  private horizontalDistanceFromSpawn(): number {
    const dx = this.player.position.x - this.spawnPosition.x;
    const dz = this.player.position.z - this.spawnPosition.z;
    return Math.hypot(dx, dz);
  }

  private isNightTime(): boolean {
    const current = this.getCurrentDayTime();
    return current >= 18 * 60 || current < 5 * 60;
  }

  private updateAchievements(dt: number): void {
    if (this.successfulJumps > 0) {
      this.completeAchievement("jump");
    }
    if (this.blocksBroken > 0) {
      this.completeAchievement("mine");
    }
    if (this.blocksPlaced > 0) {
      this.completeAchievement("place");
    }
    if (this.horizontalDistanceFromSpawn() >= 32) {
      this.completeAchievement("explore");
    }
    if (this.isNightTime()) {
      this.completeAchievement("night");
    }

    if (this.achievementToast !== null) {
      this.achievementToast.timeLeft -= dt;
      if (this.achievementToast.timeLeft <= 0) {
        this.achievementToast = null;
      }
    }
  }

  private loadMinimapColors(): void {
    this.minimapColors = new Map();
    // index corresponds to block type, value is [r, g, b] color for minimap
    const putColor = (blockType: number, hex: string) => {
      this.minimapColors.set(blockType,
          [Number.parseInt(hex.slice(0,2), 16), Number.parseInt(hex.slice(2,4), 16), Number.parseInt(hex.slice(4,6), 16)]);
    }

    putColor(Chunk.blockTypeDirt, "8b4513");
    putColor(Chunk.blockTypeCobble, "a6a199");
    putColor(Chunk.blockTypeWater, "2b4d8c");
    putColor(Chunk.blockTypeCoalOre, "3f3f3f");
    putColor(Chunk.blockTypeIronOre, "afafaf");
    putColor(Chunk.blockTypeGoldOre, "ffd700");
    putColor(Chunk.blockTypeDiamondOre, "00ffff");
  }

  /**
   * Setup the simulation. This can be called again to reset the program.
   */
  public reset(): void {
    this.gui.reset();

    this.player.position = this.spawnPosition.copy();
    this.player.velocity = new Vec3([0.0, 0.0, 0.0]);
    this.player.health = this.player.maxHealth;
    this.wasPlayerGrounded = false;
    this.airborneStartY = this.player.position.y;
    this.fallDamageArmed = false;
    this.gui.getCamera().setPos(this.player.position);
    this.loadChunksAroundPlayer();
  }

  private isPlayerGrounded(chunkProvider: Chunk.ColumnProvider): boolean {
    const floorHead = Chunk.supportedHeadYWorld(
      chunkProvider,
      this.player.position.x,
      this.player.position.z,
      this.player.position.y - this.player.hitboxHeight,
      this.player.hitboxRadius,
      this.player.hitboxHeight,
      0.55,
    );
    return (
      floorHead !== -Infinity && this.player.position.y <= floorHead + 0.02
    );
  }

  private respawnPlayer(): void {
    this.player.position = this.spawnPosition.copy();
    this.player.velocity = new Vec3([0.0, 0.0, 0.0]);
    this.player.health = this.player.maxHealth;
    this.wasPlayerGrounded = false;
    this.airborneStartY = this.player.position.y;
    this.fallDamageArmed = false;
    this.gui.getCamera().setPos(this.player.position);
  }

  private isPlayerTouchingWater(chunkProvider: Chunk.ColumnProvider): boolean {
    const feetY = this.player.position.y - this.player.hitboxHeight;
    const sampleHeights = [feetY - 0.6, feetY - 0.1, feetY + 0.4, feetY + 0.9];
    const offset = this.player.hitboxRadius * 0.7;
    const sampleOffsets = [
      [0, 0],
      [offset, 0],
      [-offset, 0],
      [0, offset],
      [0, -offset],
    ];

    for (const [dx, dz] of sampleOffsets) {
      const sampleX = this.player.position.x + dx;
      const sampleZ = this.player.position.z + dz;
      const chunk = chunkProvider(Math.round(sampleX), Math.round(sampleZ));
      if (!chunk) {
        continue;
      }
      for (const sampleY of sampleHeights) {
        if (
          chunk.cubeType(sampleX, sampleZ, sampleY) === Chunk.blockTypeWater
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private updatePlayerFallDamage(chunkProvider: Chunk.ColumnProvider): void {
    const grounded = this.isPlayerGrounded(chunkProvider);

    if (!grounded) {
      if (this.wasPlayerGrounded) {
        this.airborneStartY = this.player.position.y;
      }
    } else {
      if (!this.fallDamageArmed) {
        this.fallDamageArmed = true;
      } else if (!this.wasPlayerGrounded) {
        if (this.isPlayerTouchingWater(chunkProvider)) {
          this.airborneStartY = this.player.position.y;
          this.wasPlayerGrounded = grounded;
          return;
        }
        const fallDistance = this.airborneStartY - this.player.position.y;
        const damage = Math.max(
          0,
          fallDistance - MinecraftAnimation.safeFallDistance,
        );
        if (damage > 0) {
          this.player.takeDamage(damage);
        }
      }
      this.airborneStartY = this.player.position.y;
    }

    this.wasPlayerGrounded = grounded;
  }


  public giveRandomItem(): void {
    // Give the player a random item from the whole item pool
    const allItemTypes = Array.from(itemTypes.values());
    const randomItemType = allItemTypes[Math.floor(Math.random() * allItemTypes.length)];
    this.inventory.insertStack(new ItemStack(randomItemType, 1));
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
    return Chunk.worldToChunkAxis(worldVal, MinecraftAnimation.chunkSize);
  }

  private currentChunk(): Chunk {
    const chunkX = this.worldToChunkCoord(this.player.position.x);
    const chunkZ = this.worldToChunkCoord(this.player.position.z);
    return this.renderedChunks.get(`${chunkX},${chunkZ}`)!;
  }

  private chunkAt(worldX: number, worldZ: number): Chunk {
    const chunkX = this.worldToChunkCoord(Math.round(worldX));
    const chunkZ = this.worldToChunkCoord(Math.round(worldZ));
    return this.renderedChunks.get(`${chunkX},${chunkZ}`)!;
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
    totalCubes += this.fallingBlocks.length;

    const combined = new Float32Array(4 * totalCubes);
    let offset = 0;
    for (const chunk of this.renderedChunks.values()) {
      const positions = chunk.cubePositions();
      combined.set(positions, offset);
      offset += positions.length;
    }
    for (const block of this.fallingBlocks) {
      combined.set(
        [block.position.x, block.position.y, block.position.z, 0],
        offset,
      );
      offset += 4;
    }
    return combined;
  }

  private getAllCubeTypes(): Float32Array {
    let totalCubes = 0;
    for (const chunk of this.renderedChunks.values()) {
      totalCubes += chunk.numCubes();
    }
    totalCubes += this.fallingBlocks.length;

    const combined = new Float32Array(totalCubes);
    let offset = 0;
    for (const chunk of this.renderedChunks.values()) {
      const types = chunk.cubeTypes();
      combined.set(types, offset);
      offset += types.length;
    }
    for (const block of this.fallingBlocks) {
      combined.set([block.type], offset);
      offset += 1;
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

    const prov: Chunk.ColumnProvider = (ix, iz) => this.getChunkAtWorld(ix, iz);
    if (!this.player.isDead()) {
      this.player.update(this.gui.walkDir(), prov, dt);
      this.updatePlayerFallDamage(prov);
    } else {
      this.player.velocity = new Vec3([0.0, 0.0, 0.0]);
    }
    this.gui.getCamera().setPos(this.player.position);

    this.enemies.forEach((enemy) => {
      enemy.update(prov, this.player, dt);
    });

    this.updateAchievements(dt);

    // Update falling blocks
    let newFallingBlocks: Block[] = [];
    this.fallingBlocks.forEach((fallingBlock) => {
      let blockChunk = this.chunkAt(
        fallingBlock.position.x,
        fallingBlock.position.z,
      );

      if (fallingBlock.update(dt, blockChunk)) {
        newFallingBlocks.push(fallingBlock);
      }
      // Change back to static block once it lands on another block
      else {
        blockChunk.changeCubeType(
          fallingBlock.position.x,
          fallingBlock.position.z,
          fallingBlock.position.y,
          fallingBlock.type,
        );
      }
    });
    this.fallingBlocks = newFallingBlocks;

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

  private getSkyboxViewMatrix(): Mat4 {
    const skyboxView = this.gui.viewMatrix().copy();
    const viewValues = skyboxView.all();
    viewValues[12] = 0;
    viewValues[13] = 0;
    viewValues[14] = 0;
    return new Mat4(viewValues);
  }

  public jump() {
    const prov: Chunk.ColumnProvider = (ix, iz) => this.getChunkAtWorld(ix, iz);
    if (this.player.isDead()) {
      return;
    }
    const previousVelocityY = this.player.velocity.y;
    this.player.jump(prov);
    if (this.player.velocity.y > previousVelocityY) {
      this.successfulJumps++;
    }
  }

  public toggleAchievements(): void {
    this.showAchievements = !this.showAchievements;
  }

  public isPlayerDead(): boolean {
    return this.player.isDead();
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

          if (cubeType !== Chunk.blockTypeAir) {
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

  public leftClick(cubeSelected: boolean): void {
    if (!cubeSelected) { return; }

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
    if (
      brokenCubeType !== undefined &&
      brokenCubeType !== Chunk.blockTypeAir &&
      brokenCubeType !== Chunk.blockTypeWater
    ) {
      this.blocksBroken++;
    }
    this.inventory.insertStack(ItemStack.dropsFrom(brokenCubeType ?? -1));
  }

  public rightClick(cubeSelected: boolean) {
    const item = this.heldItem();
    if (item === null) { return; }

    const itemType = item.itemType!;
    switch (itemType.actionType) {
      case ItemAction.None: { return; }
      case ItemAction.Use: {
        itemType.useAction(item!, this.player);
        return;
      }
      case ItemAction.Place: {
        if (!cubeSelected) { return; }

        const blockType = itemType.getBlockType();

        // Place new cube based on side of cube that mouse is pointing at
        const cubeX = this.selectedCubePosition.x + this.isectNormal.x;
        const cubeY = this.selectedCubePosition.y + this.isectNormal.y;
        const cubeZ = this.selectedCubePosition.z + this.isectNormal.z;

        const chunkX = this.worldToChunkCoord(cubeX);
        const chunkZ = this.worldToChunkCoord(cubeZ);
        let key = `${chunkX},${chunkZ}`;
        let chunk = this.renderedChunks.get(key)!;

        let chunkDeltaMap = chunk.changeCubeType(cubeX, cubeZ, cubeY, blockType);

        // Test falling blocks
        if (chunk.cubeType(cubeX, cubeZ, cubeY - 1) === Chunk.blockTypeAir) {
          const fallingBlockType = chunk.cubeType(cubeX, cubeZ, cubeY)!;
          this.fallingBlocks.push(
            new Block(new Vec3([cubeX, cubeY, cubeZ]), fallingBlockType),
          );
          chunk.changeCubeType(cubeX, cubeZ, cubeY, Chunk.blockTypeAir);
        }

        this.deltaMaps.set(key, chunkDeltaMap);
        this.blocksPlaced++;
        
        this.inventory.editSlotCount(this.selectedHotbarIdx, 0, item!.count - 1);
      }
    }
  }

  private drawOverlay(): void {
    const ctx = this.overlayCtx;
    const x = 18;
    const y = 18;
    const timeLine = `Time ${this.formatDayTime(this.getCurrentDayTime())}`;
    const achievementPanelY = y + 42;

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

    if (this.showAchievements) {
      this.drawAchievementsPanel(x, achievementPanelY);
    }
    this.drawMinimap();
    this.drawHotbar();
    if (this.player.isDead()) {
      this.drawDeathOverlay();
    }
    this.drawHealthBar();
    this.drawAchievementToast();

    ctx.restore();
  }

  private drawAchievementsPanel(x: number, y: number): void {
    const ctx = this.overlayCtx;
    const rowHeight = 28;
    const panelWidth = 280;
    const panelHeight = 30 + this.achievements.length * rowHeight;

    ctx.fillStyle = "rgba(12, 18, 28, 0.58)";
    ctx.fillRect(x - 10, y - 8, panelWidth, panelHeight);
    ctx.fillStyle = "#fff6d7";
    ctx.font = "14px monospace";
    ctx.fillText("Goals", x, y);

    this.achievements.forEach((achievement, index) => {
      const rowY = y + 22 + index * rowHeight;
      const marker = achievement.completed ? "[x]" : "[ ]";
      ctx.fillStyle = achievement.completed ? "#9be59b" : "#f0eee6";
      ctx.fillText(`${marker} ${achievement.title}`, x, rowY);
      ctx.fillStyle = achievement.completed ? "#d6f5d6" : "#c9d1d9";
      ctx.font = "11px monospace";
      ctx.fillText(achievement.description, x + 26, rowY + 14);
      ctx.font = "14px monospace";
    });
  }

  private drawAchievementToast(): void {
    if (this.achievementToast === null) {
      return;
    }

    const ctx = this.overlayCtx;
    const width = 260;
    const height = 60;
    const x = this.canvas2d.width - width - 18;
    const y = this.canvas2d.height - height - 18;

    ctx.save();
    ctx.fillStyle = "rgba(52, 35, 12, 0.82)";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "#f7d774";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = "#f7d774";
    ctx.fillText("Advancement Made!", x + 12, y + 10);
    ctx.fillStyle = "#fff6d7";
    ctx.fillText(this.achievementToast.title, x + 12, y + 28);
    ctx.fillStyle = "#ddd3ba";
    ctx.fillText(this.achievementToast.description, x + 12, y + 44);
    ctx.restore();
  }

  private drawDeathOverlay(): void {
    const ctx = this.overlayCtx;
    const centerX = this.canvas2d.width / 2;
    const centerY = this.canvas2d.height / 2;

    ctx.save();
    ctx.fillStyle = "rgba(20, 0, 0, 0.45)";
    ctx.fillRect(0, 0, this.canvas2d.width, this.canvas2d.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 48px monospace";
    ctx.fillStyle = "#ff6b6b";
    ctx.fillText("You Died!", centerX, centerY - 26);
    ctx.font = "18px monospace";
    ctx.fillStyle = "#fff6d7";
    ctx.fillText("Press R to Respawn", centerX, centerY + 18);
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
    const scale = 1.5;
    const size = this.minimapPixelSize * scale;
    const minimapX = this.canvas2d.width - size - 10;
    const minimapY = 10;
    ctx.save();
    ctx.translate(minimapX, minimapY);

    // terrain
    for (let i = 0; i < this.minimapPixelSize; i++) {
      for (let j = 0; j < this.minimapPixelSize; j++) {
        const worldX = Math.floor(playerPos.x - this.minimapPixelSize / 2 + i);
        const worldZ = Math.floor(playerPos.z - this.minimapPixelSize / 2 + j);

        const chunkX = this.worldToChunkCoord(worldX);
        const chunkZ = this.worldToChunkCoord(worldZ);
        const chunk = this.renderedChunks.get(`${chunkX},${chunkZ}`);

        if (!chunk) {
          continue;
        }

        const topBlock = chunk.topBlockAt(worldX, worldZ);
        const color = !topBlock ? undefined : this.minimapColors.get(topBlock.type)
        if (!topBlock || !color) {
          ctx.fillStyle = "#C7C0B7";
          ctx.fillRect(i * scale, j * scale, Math.ceil(scale), Math.ceil(scale));
          continue;
        }

        // height-based tinting: darken below sea level, brighten above. tune t to adjust strength of effect
        const height = topBlock.height;
        const r = color[0];
        const g = color[1];
        const b = color[2];
        let lr: number, lg: number, lb: number;

        if (height < Chunk.SEA_LEVEL) {
          // Below sea level: dark bands
          // Depths: 0-2 = very dark (0.45), 3-4 = dark (0.30), 5-6 = dim (0.15), 7 = slight (0.05)
          const depth = Chunk.SEA_LEVEL - height;
          const t =
            depth >= 6 ? 0.45 : depth >= 4 ? 0.3 : depth >= 2 ? 0.15 : 0.05;
          lr = Math.round(r * (1 - t));
          lg = Math.round(g * (1 - t));
          lb = Math.round(b * (1 - t));
        } else {
          // Above sea level: bright bands
          // Heights above sea: 0-4 = base, 5-9 = +10%, 10-16 = +20%, 17-24 = +30%, 25+ = +40%
          const elev = height - Chunk.SEA_LEVEL;
          const t =
            elev >= 25
              ? 0.4
              : elev >= 17
                ? 0.3
                : elev >= 10
                  ? 0.2
                  : elev >= 5
                    ? 0.1
                    : 0;
          lr = Math.round(r + (255 - r) * t);
          lg = Math.round(g + (255 - g) * t);
          lb = Math.round(b + (255 - b) * t);
        }

        ctx.fillStyle = `rgb(${lr},${lg},${lb})`;
        ctx.fillRect(i * scale, j * scale, Math.ceil(scale), Math.ceil(scale));
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
    ctx.moveTo(0*scale, 6*scale);
    ctx.lineTo(-4*scale, -4*scale);
    ctx.lineTo(4*scale, -4*scale);
    ctx.closePath();
    ctx.fillStyle = "#0a9e2e";
    ctx.fill();
    ctx.restore();

    // enemy icons
    this.enemies.forEach((enemy) => {
      const ex = enemy.position.x - playerPos.x + size / 2;
      const ez = enemy.position.z - playerPos.z + size / 2;
      if (ex >= 0 && ex < size && ez >= 0 && ez < size) {
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(ex - scale, ez - scale, 2*scale, 2*scale);
      }
    });

    // border
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);

    ctx.restore();
  }

  private drawHotbar(): void {
    const ctx = this.overlayCtx;
    const hotbarSize = Inventory.width;
    const slotSize = 60;
    const hotbarWidth = hotbarSize * slotSize + (hotbarSize - 1) * 10;
    const hotbarX = (this.canvas2d.width - hotbarWidth) / 2;
    const hotbarY = this.canvas2d.height - slotSize - 35;

    ctx.save();
    ctx.translate(hotbarX, hotbarY);

    // background
    ctx.beginPath();
    ctx.roundRect(-15, -15, hotbarWidth + 30, slotSize + 30, 6);
    ctx.strokeStyle = "#737981";
    ctx.lineWidth = 4;
    ctx.fillStyle = "rgba(21,27,41,0.6)";
    ctx.fill();
    ctx.stroke();

    // slots
    ctx.font = "16px monospace";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "right";

    for (let i = 0; i < hotbarSize; i++) {
      ctx.beginPath();
      ctx.roundRect(i * (slotSize + 10), 0, slotSize, slotSize, 4);
      ctx.fillStyle = "rgba(15,15,25,0.6)";
      ctx.fill();
      ctx.strokeStyle = "#1b1717";
      ctx.lineWidth = 2;
      if (i === this.selectedHotbarIdx) {
        ctx.strokeStyle = "#e1d8b7";
        ctx.lineWidth = 4;
      }
      ctx.stroke();

      // item icons
      const item = this.inventory.getItemStack(i, 0);
      if (item) {
        const img = item.itemType.img!;
        if (img) {
          ctx.drawImage(img, i * (slotSize + 10) + 9, 9, slotSize - 18, slotSize - 18);
        } else {
            // draw a rectangle for items without icons
            ctx.fillStyle = "#d81cd5";
            ctx.fillRect(i * (slotSize + 10) + 9, 9, slotSize - 18, slotSize - 18);
        }

        if (item.count > 1) {
          ctx.fillStyle = "#fff6d7";
          ctx.fillText(String(item.count), i * (slotSize + 10) + slotSize - 8, slotSize - 6);
        }
      }
    }

    ctx.restore();
  }

  public setHotbarSlot(number: number) {
    this.selectedHotbarIdx = number;
  }

  public heldItem(): ItemStack | null {
    return this.inventory.getItemStack(this.selectedHotbarIdx, 0);
  }
  private drawHealthBar(): void {
    if (!this.heartBitmap) return;

    const ctx = this.overlayCtx;
    const health = this.player.health;
    const maxHealth = this.player.maxHealth;
    const totalHearts = maxHealth / 2;
    const fullHearts = Math.floor(health / 2);
    const halfHeart = health % 2 >= 0.5;

    const heartSize = 24;
    const spacing = 4;
    const startX = 18;
    const startY = this.canvas2d.height - heartSize - 18;

    ctx.save();
    for (let i = 0; i < totalHearts; i++) {
      const x = startX + i * (heartSize + spacing);
      if (i < fullHearts) {
        // Full heart
        ctx.globalAlpha = 1.0;
        ctx.drawImage(this.heartBitmap, x, startY, heartSize, heartSize);
      } else if (i === fullHearts && halfHeart) {
        // Half heart: draw left half full, right half dimmed
        ctx.globalAlpha = 1.0;
        ctx.drawImage(
          this.heartBitmap,
          0, 0, this.heartBitmap.width / 2, this.heartBitmap.height,
          x, startY, heartSize / 2, heartSize,
        );
        ctx.globalAlpha = 0.25;
        ctx.drawImage(
          this.heartBitmap,
          this.heartBitmap.width / 2, 0, this.heartBitmap.width / 2, this.heartBitmap.height,
          x + heartSize / 2, startY, heartSize / 2, heartSize,
        );
      } else {
        // Empty heart
        ctx.globalAlpha = 0.25;
        ctx.drawImage(this.heartBitmap, x, startY, heartSize, heartSize);
      }
    }
    ctx.globalAlpha = 1.0;
    ctx.restore();
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
