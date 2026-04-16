import { Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { Debugger } from "../lib/webglutils/Debugging.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Chunk } from "./Chunk.js";
import { Cube } from "./Cube.js";
import { Billboard } from "./Billboard.js";
import { GUI } from "./Gui.js";
import { Enemy, Player, Block } from "./Entity.js";
import { LruCache } from "./Cache.js";
import { Camera } from "../lib/webglutils/Camera.js";
import { PortalRenderer } from "./PortalRenderer.js";
import { Portal } from "./Portal.js";
import { DecorationGenerator, type DecorBuffer } from "./Decorations.js";
import {
  blankCubeFSText,
  blankCubeVSText,
  decorBillboardFSText,
  decorBillboardVSText,
  skyboxFSText,
  skyboxVSText,
  enemyFSText,
  enemyVSText,
} from "./Shaders.js";
import { Mesh } from "./Mesh.js";
import { CLoader } from "./AnimationFileLoader.js";
import {
  Inventory,
  ItemAction,
  ItemStack,
  itemTypes,
  registerItemTypes,
} from "./Inventory.js";

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
  private static readonly safeFallDistance = 3;

  private gui: GUI;

  private chunkCache: LruCache<string, Chunk>;
  private renderedChunks: Map<string, Chunk>;
  private deltaMaps: Map<string, Map<number, number>>; // save map of changes for modified chunks

  // Nether dimension state — separate caches so overworld and nether chunks don't collide
  public playerInNether: boolean = false;
  private netherChunkCache: LruCache<string, Chunk>;
  private netherDeltaMaps: Map<string, Map<number, number>>;

  private static readonly renderDistance: number = 1;
  private static readonly chunkSize: number = 64;

  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass;
  private skyboxRenderPass: RenderPass;
  private billboardGeometry: Billboard;
  private decorationRenderPass: RenderPass;

  /*  Enemy Rendering */
  private enemyRenderPass: RenderPass;
  private enemyMeshLoader: CLoader;
  private enemyMesh: Mesh | null;
  private enemyBoneTransTex: WebGLTexture;
  private enemyBoneRotTex: WebGLTexture;

  /* Portal Rendering */
  private portalRenderer: PortalRenderer;
  private portals: Portal[];
  private tempPortal: Portal | null;
  private playerInPortal: Portal | null = null;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;
  private selectedCubePosition: Vec4;

  private canvas2d: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;
  private heartBitmap: ImageBitmap | null = null;
  private foodBitmap: ImageBitmap | null = null;
  private crosshairBitmap: ImageBitmap | null = null;

  public player: Player;
  private spawnPosition: Vec3;
  private decorationGenerator: DecorationGenerator;
  private decorationCache: Map<string, DecorBuffer>;
  private fallingBlocks: Block[];
  private isectNormal: Vec3;
  private wasPlayerGrounded: boolean;
  private airborneStartY: number;
  private fallDamageArmed: boolean;

  private enemies: Enemy[];
  private selectedEnemy: Enemy | null;
  private selectedEnemyDistance: number;
  private achievements: Achievement[];
  private achievementToast: AchievementToast | null;
  private showAchievements: boolean;
  private blocksBroken: number;
  private blocksPlaced: number;
  private successfulJumps: number;
  private blasterHits: number;
  private starvationDamageTaken: number;
  private jetpackUsed: boolean;
  private enemiesKilled: number;

  /* Inventory */
  public inventory: Inventory;
  private isInInventory: boolean;

  private doubleJumpAvailable: boolean;
  private jetpackFuel: number;
  private blasterCooldown: number;

  /**
   * Entities whose chunk is not in `renderedChunks` are parked here by chunk key.
   * Used for mobs (`Enemy`) and block entities (`Block`); the player is always active.
   */
  private parkedEntitiesByChunk: Map<
    string,
    { enemies: Enemy[]; blocks: Block[] }
  >;

  /** Chunk keys for which initial enemies have already been spawned. */
  private spawnedChunkKeys: Set<string> = new Set();
  private static readonly enemiesPerChunk: number = 1;

  /* Water simulation */
  private static readonly waterTickInterval: number = 30;
  private frameCount: number = 0;
  private waterDirty: Set<string> = new Set();

  /* Overlay information */
  private minimapPixelSize = 135;
  private minimapColors: Map<number, [number, number, number]>;

  /* Hunger and health*/
  private hungerTimer: number;
  private starvationTimer: number;
  private regenHealthTimer: number;
  private readonly regenHealthFoodThreshold: number = 0.9; // player must have at least 90% food to regen health
  private readonly hungerInterval: number = 4; // player experiences hunger every 4 seconds
  private readonly starvationInterval: number = 4; // player takes damage if starving every 4 seconds
  private readonly regenHealthInterval: number = 4; // player regenerates health at this interval when the threshold is met

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

    Chunk.setSeedHash(
      globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ??
        Date.now() >>> 0,
    );

    this.loadMinimapColors();

    this.gui = new GUI(this.canvas2d, this);
    this.chunkCache = new LruCache();
    this.renderedChunks = new Map();
    this.deltaMaps = new Map();
    this.netherChunkCache = new LruCache();
    this.netherDeltaMaps = new Map();
    this.decorationGenerator = new DecorationGenerator();
    this.decorationCache = new Map();

    const playerPosition = this.gui.getCamera().pos();
    this.player = new Player(playerPosition);
    this.spawnPosition = playerPosition.copy();
    this.fallingBlocks = [];
    this.isectNormal = new Vec3();
    this.parkedEntitiesByChunk = new Map();
    this.wasPlayerGrounded = false;
    this.airborneStartY = this.player.position.y;
    this.fallDamageArmed = false;

    // Must be initialized before loadChunksAroundPlayer, since that now
    // spawns enemies as chunks come online.
    this.enemies = [];
    this.selectedEnemy = null;
    this.enemyMesh = null;

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
    this.enemyRenderPass = new RenderPass(gl, enemyVSText, enemyFSText);
    this.initSkybox();
    this.initBlankCube();
    this.initDecorBillboards();

    // Portal rendering setup
    this.portalRenderer = new PortalRenderer(gl, this.cubeGeometry, 1280, 960);
    this.portals = [];
    this.tempPortal = null;
    this.achievements = this.createAchievements();
    this.achievementToast = null;
    this.showAchievements = false;
    this.blocksBroken = 0;
    this.blocksPlaced = 0;
    this.successfulJumps = 0;
    this.blasterHits = 0;
    this.starvationDamageTaken = 0;
    this.jetpackUsed = false;
    this.enemiesKilled = 0;

    this.isInInventory = false;

    this.enemyMeshLoader = new CLoader("./static/assets/robot.dae");
    this.enemyMeshLoader.load(() => this.initEnemies());

    this.lightPosition = new Vec4([-1000, 1000, -1000, 1]);
    this.backgroundColor = new Vec4([0.0, 0.37254903, 0.37254903, 1.0]);
    this.selectedCubePosition = new Vec4([-1000, -1000, -1000, 1]);

    this.inventory = new Inventory();
    this.doubleJumpAvailable = true;
    this.jetpackFuel = 100;
    this.blasterCooldown = 0;

    this.hungerTimer = 0;
    this.starvationTimer = 0;
    this.regenHealthTimer = 0;

    // Load pngs as bitmaps for drawing
    const heartImg = new Image();
    heartImg.src = "./static/assets/heart.png";
    heartImg.onload = () => {
      createImageBitmap(heartImg).then((bmp) => {
        this.heartBitmap = bmp;
      });
    };

    const foodImg = new Image();
    foodImg.src = "./static/assets/food.png";
    foodImg.onload = () => {
      createImageBitmap(foodImg).then((bmp) => {
        this.foodBitmap = bmp;
      });
    };

    const crosshairImg = new Image();
    crosshairImg.src = "./static/assets/crosshair.png";
    crosshairImg.onload = () => {
      createImageBitmap(crosshairImg).then((bmp) => {
        this.crosshairBitmap = bmp;
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
      {
        id: "blaster_hit",
        title: "In My Sights",
        description: "Shoot an enemy with a blaster.",
        completed: false,
        completedAt: null,
      },
      {
        id: "starvation",
        title: "Rumbling Stomach",
        description: "Take damage from starvation.",
        completed: false,
        completedAt: null,
      },
      {
        id: "jetpack",
        title: "Jetpack Joyride",
        description: "Use a jetpack.",
        completed: false,
        completedAt: null,
      },
      {
        id: "craft",
        title: "Crafty",
        description: "Craft anything.",
        completed: false,
        completedAt: null,
      },
      {
        id: "kill",
        title: "Murderous",
        description: "Ruthlessly kill an enemy.",
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
    if (this.blasterHits > 0) {
      this.completeAchievement("blaster_hit");
    }
    if (this.starvationDamageTaken > 0) {
      this.completeAchievement("starvation");
    }
    if (this.jetpackUsed) {
      this.completeAchievement("jetpack");
    }
    if (this.inventory.itemsCrafted > 0) {
      this.completeAchievement("craft");
    }
    if (this.enemiesKilled > 0) {
      this.completeAchievement("kill");
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
      this.minimapColors.set(blockType, [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ]);
    };

    putColor(Chunk.blockTypeDirt, "8b4513");
    putColor(Chunk.blockTypeCobble, "a6a199");
    putColor(Chunk.blockTypeWater, "2b4d8c");
    putColor(Chunk.blockTypeWaterFalling, "2b4d8c");
    putColor(Chunk.blockTypeWaterFlowLevel3, "2b4d8c");
    putColor(Chunk.blockTypeWaterFlowLevel2, "2b4d8c");
    putColor(Chunk.blockTypeWaterFlowLevel1, "2b4d8c");
    putColor(Chunk.blockTypeCoalOre, "3f3f3f");
    putColor(Chunk.blockTypeIronOre, "afafaf");
    putColor(Chunk.blockTypeGoldOre, "ffd700");
    putColor(Chunk.blockTypeDiamondOre, "00ffff");
    putColor(Chunk.blockTypeGrass, "567d46");
    putColor(Chunk.blockTypeSand, "e8d5a3");
    putColor(Chunk.blockTypeSandstone, "d4c496");
    putColor(Chunk.blockTypeSnow, "f0f0f0");
    putColor(Chunk.blockTypeNetherite, "443a3a");
    putColor(Chunk.blockTypeBedrock, "555555");
    putColor(Chunk.blockTypePortal, "8b00d4");
    putColor(Chunk.blockTypePortalFrame, "3a1a4d");

    putColor(DecorationGenerator.blockTypeWood, "6b4226");
    putColor(DecorationGenerator.blockTypeLeaves, "2d5a1e");
    putColor(DecorationGenerator.blockTypeBirchWood, "d6cdb2");
    putColor(DecorationGenerator.blockTypeSpruceLeaves, "1a3a1a");
    putColor(DecorationGenerator.blockTypeDecorRock, "7a7a7a");
  }

  /**
   * Setup the simulation. This can be called again to reset the program.
   */
  public reset(): void {
    this.gui.reset();

    this.player.position = this.spawnPosition.copy();
    this.playerInNether = false;
    this.player.velocity = new Vec3([0.0, 0.0, 0.0]);
    this.player.health = this.player.maxHealth;
    this.player.food = this.player.maxFood;
    this.resetInventoryState();
    this.wasPlayerGrounded = false;
    this.airborneStartY = this.player.position.y;
    this.fallDamageArmed = false;
    this.gui.getCamera().setPos(this.player.position);
    this.loadChunksAroundPlayer();
  }

  /** Toggle between the overworld and the Nether. Clears rendered chunks so
   *  the new dimension's terrain loads immediately on the next frame. */
  public toggleNether(): void {
    this.playerInNether = !this.playerInNether;
    this.renderedChunks.clear();
    this.decorationCache.clear();
  }

  /** Write a single block into a dimension's delta maps without requiring a loaded chunk. */
  private writeDeltaBlock(
    dimension: "overworld" | "nether",
    worldX: number,
    worldY: number,
    worldZ: number,
    blockType: number,
  ): void {
    const step = MinecraftAnimation.chunkSize;
    const chunkX = Chunk.worldToChunkAxis(worldX, step);
    const chunkZ = Chunk.worldToChunkAxis(worldZ, step);
    const chunkKey = `${chunkX},${chunkZ}`;

    const targetDeltaMaps =
      dimension === "nether" ? this.netherDeltaMaps : this.deltaMaps;
    if (!targetDeltaMaps.has(chunkKey)) {
      targetDeltaMaps.set(chunkKey, new Map());
    }
    const deltaMap = targetDeltaMaps.get(chunkKey)!;

    const originX = chunkX - step / 2;
    const originZ = chunkZ - step / 2;
    const localJ = Math.round(worldX - originX);
    const localI = Math.round(worldZ - originZ);
    const localY = Math.round(worldY);

    deltaMap.set(localJ + localI * step + localY * step * step, blockType);
  }

  /** Write a portal frame, interior blocks, and surrounding air pocket
   *  into the target dimension's delta maps. Returns the destination Portal. */
  private writeDestinationPortal(
    srcPortal: Portal,
    srcMinX: number,
    srcMinZ: number,
    srcMinY: number,
    isXAligned: boolean,
  ): Portal {
    const destDimension: "overworld" | "nether" = this.playerInNether
      ? "overworld"
      : "nether";
    const destY = this.playerInNether ? srcMinY : 20;

    // Carve air pocket: extends 1 block beyond frame on each side, 2 blocks deep
    // on both sides of the portal plane so the player can approach from either direction
    for (let dy = 0; dy < 7; dy++) {
      for (let along = -1; along < 5; along++) {
        for (let perp = -2; perp <= 2; perp++) {
          const wx = isXAligned ? srcMinX + along : srcMinX + perp;
          const wz = isXAligned ? srcMinZ + perp : srcMinZ + along;
          this.writeDeltaBlock(
            destDimension,
            wx,
            destY + dy,
            wz,
            Chunk.blockTypeAir,
          );
        }
      }
    }

    // Write portal frame (4 wide x 5 tall) and interior (2 wide x 3 tall)
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 5; j++) {
        const isFrame = i === 0 || i === 3 || j === 0 || j === 4;
        // const isInterior = i >= 1 && i <= 2 && j >= 1 && j <= 3;
        if (!isFrame) continue;

        const blockType = Chunk.blockTypePortalFrame;

        if (isXAligned) {
          this.writeDeltaBlock(
            destDimension,
            srcMinX + i,
            destY + j,
            srcMinZ,
            blockType,
          );
        } else {
          this.writeDeltaBlock(
            destDimension,
            srcMinX,
            destY + j,
            srcMinZ + i,
            blockType,
          );
        }
      }
    }

    // Add a floor under the portal
    const floorType =
      destDimension === "nether"
        ? Chunk.blockTypeNetherRack
        : Chunk.blockTypeCobble;
    for (let i = 0; i < 4; i++) {
      if (isXAligned) {
        this.writeDeltaBlock(
          destDimension,
          srcMinX + i,
          destY - 1,
          srcMinZ,
          floorType,
        );
      } else {
        this.writeDeltaBlock(
          destDimension,
          srcMinX,
          destY - 1,
          srcMinZ + i,
          floorType,
        );
      }
    }

    // Create destination Portal object
    let destPortal: Portal;
    if (isXAligned) {
      destPortal = new Portal(
        new Vec3([srcMinX + 1, destY + 1, srcMinZ]),
        new Vec3([0, 0, 1]),
        new Vec3([0, 1, 0]),
        2,
        3,
        destDimension,
      );
    } else {
      destPortal = new Portal(
        new Vec3([srcMinX, destY + 1, srcMinZ + 2]),
        new Vec3([1, 0, 0]),
        new Vec3([0, 1, 0]),
        2,
        3,
        destDimension,
      );
    }

    return destPortal;
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
    this.player.food = this.player.maxFood;
    this.resetInventoryState();
    this.wasPlayerGrounded = false;
    this.airborneStartY = this.player.position.y;
    this.fallDamageArmed = false;
    this.gui.getCamera().setPos(this.player.position);
  }

  private resetInventoryState(): void {
    this.inventory = new Inventory();
    this.doubleJumpAvailable = true;
    this.jetpackFuel = 100;
    this.blasterCooldown = 0;
    this.isInInventory = false;
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
        if (chunk.isWater(sampleX, sampleZ, sampleY)) {
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
        if (damage > 0 && !this.inventory.hasEquipmentById("jetpack")) {
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
    const randomItemType =
      allItemTypes[Math.floor(Math.random() * allItemTypes.length)];
    this.inventory.insertStack(new ItemStack(randomItemType, 1));
  }

  public giveAllItems(): void {
    for (const type of itemTypes.values()) {
      this.inventory.insertStack(new ItemStack(type, type.maxStackSize));
    }
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
    this.skyboxRenderPass.addUniform(
      "uIsNether",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1f(loc, this.playerInNether ? 1.0 : 0.0);
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
      "aAO",
      2,
      this.ctx.FLOAT,
      false,
      2 * Float32Array.BYTES_PER_ELEMENT,
      0,
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

  /**
   * Sets up the enemy drawing
   */
  private initEnemies(): void {
    if (this.enemyMeshLoader.meshes.length === 0) {
      throw new Error("Failed to load enemy mesh.");
    }
    this.enemyMesh = this.enemyMeshLoader.meshes[0];
    this.enemyMesh!.scale(0.85);

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

    // The mesh may have finished loading after the initial chunk batch was
    // rendered (the load is async), so retroactively spawn in every chunk
    // that's already live.
    for (const [key, chunk] of this.renderedChunks) {
      this.spawnEnemiesInChunk(key, chunk);
    }
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

  /**
   * Chunk key string for the column containing `pos` (same convention as chunk
   * maps).
   */
  private entityChunkKey(pos: Vec3): string {
    const ix = Math.round(pos.x);
    const iz = Math.round(pos.z);
    const cx = this.worldToChunkCoord(ix);
    const cz = this.worldToChunkCoord(iz);
    return `${cx},${cz}`;
  }

  private getOrCreateParked(chunkKey: string): {
    enemies: Enemy[];
    blocks: Block[];
  } {
    let p = this.parkedEntitiesByChunk.get(chunkKey);
    if (!p) {
      p = { enemies: [], blocks: [] };
      this.parkedEntitiesByChunk.set(chunkKey, p);
    }
    return p;
  }

  /** Park mobs and block-entities that live in a chunk that just unloaded. */
  private unloadEntitiesForChunk(chunkKey: string): void {
    const toParkEnemies: Enemy[] = [];
    const toParkBlocks: Block[] = [];
    this.enemies = this.enemies.filter((e) => {
      if (this.entityChunkKey(e.position) === chunkKey) {
        toParkEnemies.push(e);
        return false;
      }
      return true;
    });
    this.fallingBlocks = this.fallingBlocks.filter((b) => {
      if (this.entityChunkKey(b.position) === chunkKey) {
        toParkBlocks.push(b);
        return false;
      }
      return true;
    });
    if (toParkEnemies.length === 0 && toParkBlocks.length === 0) return;
    const parked = this.getOrCreateParked(chunkKey);
    parked.enemies.push(...toParkEnemies);
    parked.blocks.push(...toParkBlocks);
  }

  /** Restore entities parked while this chunk was unloaded. */
  private loadEntitiesForChunk(chunkKey: string): void {
    const parked = this.parkedEntitiesByChunk.get(chunkKey);
    if (!parked) return;
    if (parked.enemies.length > 0) {
      this.enemies.push(...parked.enemies);
      parked.enemies.length = 0;
    }
    if (parked.blocks.length > 0) {
      this.fallingBlocks.push(...parked.blocks);
      parked.blocks.length = 0;
    }
    if (parked.enemies.length === 0 && parked.blocks.length === 0) {
      this.parkedEntitiesByChunk.delete(chunkKey);
    }
  }

  /**
   * Drop a couple of enemies onto random walkable surface blocks in this
   * chunk. No-op if the enemy mesh isn't loaded yet, or if this chunk has
   * already been populated. When the mesh finishes loading `initEnemies`
   * retroactively spawns for any chunks that were skipped.
   */
  private spawnEnemiesInChunk(chunkKey: string, chunk: Chunk): void {
    if (!this.enemyMesh) return;
    if (this.spawnedChunkKeys.has(chunkKey)) return;
    this.spawnedChunkKeys.add(chunkKey);

    const size = chunk.chunkSize();
    const topLeftX = chunk.topLeftX();
    const topLeftZ = chunk.topLeftZ();
    const target = MinecraftAnimation.enemiesPerChunk;
    let spawned = 0;
    let attempts = 0;
    while (spawned < target && attempts < 20) {
      attempts++;
      const wx = topLeftX + Math.floor(Math.random() * size);
      const wz = topLeftZ + Math.floor(Math.random() * size);
      const top = chunk.topBlockAt(wx, wz);
      if (!top || top.height < 0) continue;
      const t = top.type;
      if (
        t === Chunk.blockTypeAir ||
        t === Chunk.blockTypeWater ||
        t === Chunk.blockTypeWaterFalling ||
        (t >= Chunk.blockTypeWaterFlowLevel3 &&
          t <= Chunk.blockTypeWaterFlowLevel1)
      ) {
        continue;
      }
      // Enemy position is head-based; hitboxHeight is 1. Spawn with feet just
      // above the surface block's top face (stepPhysics will snap cleanly).
      const headY = top.height + 1.5;
      this.enemies.push(new Enemy(this.enemyMesh!, new Vec3([wx, headY, wz])));
      spawned++;
    }
  }

  private removeDecorInstancesAtColumn(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): void {
    const ix = Math.round(worldX);
    const iy = Math.round(worldY);
    const iz = Math.round(worldZ);
    const key = `${this.worldToChunkCoord(ix)},${this.worldToChunkCoord(iz)}`;
    {
      const buffer = this.decorationCache.get(key);
      if (!buffer || buffer.count === 0) {
        return;
      }

      const keepIndices: number[] = [];
      for (let i = 0; i < buffer.count; i++) {
        const x = Math.round(buffer.offsets[i * 4 + 0]);
        const y = buffer.offsets[i * 4 + 1];
        const z = Math.round(buffer.offsets[i * 4 + 2]);

        // Remove only decorations anchored on this exact column, and only when
        // the edited block is at/near their support height.
        const sameColumn = x === ix && z === iz;
        const affectedByEdit = y <= iy + 1.0;
        if (sameColumn && affectedByEdit) {
          continue;
        }
        keepIndices.push(i);
      }

      if (keepIndices.length === buffer.count) {
        return;
      }

      const nextOffsets = new Float32Array(keepIndices.length * 4);
      const nextScales = new Float32Array(keepIndices.length);
      const nextVariants = new Float32Array(keepIndices.length);
      const nextTypes = new Float32Array(keepIndices.length);
      const nextAngles = new Float32Array(keepIndices.length);
      const nextTilts = new Float32Array(keepIndices.length);

      for (let n = 0; n < keepIndices.length; n++) {
        const i = keepIndices[n];
        nextOffsets.set(buffer.offsets.subarray(i * 4, i * 4 + 4), n * 4);
        nextScales[n] = buffer.scales[i];
        nextVariants[n] = buffer.variants[i];
        nextTypes[n] = buffer.types[i];
        nextAngles[n] = buffer.angles[i];
        nextTilts[n] = buffer.tilts[i];
      }

      this.decorationCache.set(key, {
        offsets: nextOffsets,
        scales: nextScales,
        variants: nextVariants,
        types: nextTypes,
        angles: nextAngles,
        tilts: nextTilts,
        treeCubePositions: buffer.treeCubePositions,
        treeCubeTypes: buffer.treeCubeTypes,
        count: keepIndices.length,
      });
    }
  }

  private loadChunksAroundPlayer(): void {
    const prevLoadedKeys = new Set(this.renderedChunks.keys());
    const nextLoadedKeys = new Set<string>();

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
        nextLoadedKeys.add(key);
        const activeCache = this.playerInNether
          ? this.netherChunkCache
          : this.chunkCache;
        const activeDeltaMaps = this.playerInNether
          ? this.netherDeltaMaps
          : this.deltaMaps;
        if (!activeCache.has(key)) {
          let deltaMap = activeDeltaMaps.has(key)
            ? activeDeltaMaps.get(key)
            : new Map();
          activeCache.set(
            key,
            new Chunk(chunkX, chunkZ, step, deltaMap, this.playerInNether),
          );
          this.decorationCache.delete(key);
        }
        const cachedChunk = activeCache.get(key)!;
        this.renderedChunks.set(key, cachedChunk);
        if (!this.decorationCache.has(key)) {
          this.decorationCache.set(
            key,
            this.decorationGenerator.generateForChunk(key, cachedChunk),
          );
        }
      }
    }

    for (const key of prevLoadedKeys) {
      if (!nextLoadedKeys.has(key)) {
        this.unloadEntitiesForChunk(key);
      }
    }
    for (const key of nextLoadedKeys) {
      if (!prevLoadedKeys.has(key)) {
        this.loadEntitiesForChunk(key);
      }
      this.spawnEnemiesInChunk(key, this.renderedChunks.get(key)!);
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

  private getAllCubeAO(): Float32Array {
    let totalCubes = 0;
    for (const chunk of this.renderedChunks.values()) {
      totalCubes += chunk.numCubes();
    }
    totalCubes += this.fallingBlocks.length;

    const combined = new Float32Array(totalCubes * 2);
    let offset = 0;
    for (const chunk of this.renderedChunks.values()) {
      const ao = chunk.cubeAO();
      combined.set(ao, offset);
      offset += ao.length;
    }
    // Falling blocks: fully lit (AO=3 at every corner).
    // Each face byte = 0xFF (all 4 corners at value 3), 3 faces per float = 0xFFFFFF = 16777215.
    const fullyLit = 16777215.0;
    for (let i = 0; i < this.fallingBlocks.length; i++) {
      combined[offset++] = fullyLit;
      combined[offset++] = fullyLit;
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
    this.blasterCooldown = Math.max(0, this.blasterCooldown - dt);

    const prov: Chunk.ColumnProvider = (ix, iz) => this.getChunkAtWorld(ix, iz);

    if (!this.player.isDead()) {
      const heldId = this.inventory.getHeldItem()?.itemType.id ?? null;
      if (
        this.inventory.hasEquipmentById("jetpack") &&
        this.gui.isSpaceDown &&
        this.jetpackFuel > 0 &&
        !this.isPlayerGrounded(prov)
      ) {
        if (this.player.velocity.y < 0) {
          this.player.velocity.y += -0.9 * this.player.velocity.y * dt;
        }
        this.player.velocity.y += 35.0 * dt;
        this.jetpackFuel = Math.max(0, this.jetpackFuel - 20.0 * dt);
        this.jetpackUsed = true;
      } else {
        this.jetpackFuel = Math.min(100, this.jetpackFuel + 12.0 * dt);
      }

      this.player.update(this.gui.walkDir(), prov, dt);
      this.checkPortalTeleport();
      this.updatePlayerFallDamage(prov);
      if (this.isPlayerGrounded(prov)) {
        this.doubleJumpAvailable = true;
      }
    } else {
      this.player.velocity = new Vec3([0.0, 0.0, 0.0]);
    }
    this.gui.getCamera().setPos(this.player.position);

    this.enemies.forEach((enemy) => {
      enemy.update(prov, this.player, dt);
    });

    // Update hunger
    this.hungerTimer += dt;
    if (this.hungerTimer >= this.hungerInterval) {
      this.hungerTimer = 0;
      this.player.experienceHunger(1);
    }

    if (this.player.food <= 0) {
      this.starvationTimer += dt;
      if (this.starvationTimer >= this.starvationInterval) {
        this.starvationTimer = 0;
        this.player.takeDamage(1);
        this.starvationDamageTaken++;
      }
    } else {
      this.starvationTimer = 0;
    }

    // Update health
    if (
      this.player.food >=
      this.player.maxFood * this.regenHealthFoodThreshold
    ) {
      this.regenHealthTimer += dt;
      if (this.regenHealthTimer >= this.regenHealthInterval) {
        this.regenHealthTimer = 0;
        this.player.heal(1);
      }
    } else {
      this.regenHealthTimer = 0;
    }

    this.updateAchievements(dt);

    // Update falling blocks
    let newFallingBlocks: Block[] = [];
    let chunksToUpdate = new Set<Chunk>();
    this.fallingBlocks.forEach((fallingBlock) => {
      const blockChunk = this.getChunkAtWorld(
        fallingBlock.position.x,
        fallingBlock.position.z,
      );
      if (blockChunk === undefined) {
        newFallingBlocks.push(fallingBlock);
        return;
      }

      if (fallingBlock.update(dt, blockChunk)) {
        newFallingBlocks.push(fallingBlock);
      } else {
        blockChunk.changeCubeTypeNoUpdate(
          fallingBlock.position.x,
          fallingBlock.position.z,
          fallingBlock.position.y,
          fallingBlock.type,
        );
        chunksToUpdate.add(blockChunk);
      }
    });
    this.fallingBlocks = newFallingBlocks;
    for (const chunk of chunksToUpdate) {
      chunk.updateCubePositionsAndTypes();
    }

    // Water simulation tick
    this.frameCount++;
    if (this.frameCount % MinecraftAnimation.waterTickInterval === 0) {
      this.tickWater();
    }

    // Drawing
    const gl = this.ctx as WebGL2RenderingContext;
    const bg: Vec4 = this.playerInNether
      ? new Vec4([0.33, 0.0, 0.0, 1.0])
      : this.backgroundColor;

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    // --- Portal FBO pass: render destination scene from portal camera ---
    const currentDimension: "overworld" | "nether" = this.playerInNether
      ? "nether"
      : "overworld";
    this.portalRenderer.renderPortalFBOs(
      this.gui.getCamera().pos(),
      (view, proj) => this.drawSceneWithCamera(0, 0, 1280, 960, view, proj),
      currentDimension,
    );

    // --- Main pass: render overworld to screen ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.drawScene(0, 0, 1280, 960);

    // --- Portal blocks pass: draw portal surface sampling the FBO ---
    this.portalRenderer.drawPortalBlocks(
      this.gui.viewMatrix(),
      this.gui.projMatrix(),
      currentDimension,
    );

    this.drawOverlay();
  }

  private setMatrixUniform(pass: RenderPass, name: string, matrix: Mat4): void {
    pass.addUniform(
      name,
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(matrix.all()));
      },
    );
  }

  private drawSceneWithCamera(
    x: number,
    y: number,
    width: number,
    height: number,
    viewMatrix: Mat4,
    projMatrix: Mat4,
  ): void {
    const gl = this.ctx as WebGL2RenderingContext;
    gl.viewport(x, y, width, height);

    // Skybox with portal camera (zero out translation)
    const skyVals = viewMatrix.copy().all();
    skyVals[12] = 0;
    skyVals[13] = 0;
    skyVals[14] = 0;
    this.setMatrixUniform(this.skyboxRenderPass, "uProj", projMatrix);
    this.setMatrixUniform(this.skyboxRenderPass, "uView", new Mat4(skyVals));

    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    this.skyboxRenderPass.draw();

    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // Terrain with portal camera
    this.setMatrixUniform(this.blankCubeRenderPass, "uProj", projMatrix);
    this.setMatrixUniform(this.blankCubeRenderPass, "uView", viewMatrix);

    const allPositions = this.getAllCubePositions();
    const allTypes = this.getAllCubeTypes();
    const allAO = this.getAllCubeAO();
    this.blankCubeRenderPass.updateAttributeBuffer("aOffset", allPositions);
    this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", allTypes);
    this.blankCubeRenderPass.updateAttributeBuffer("aAO", allAO);
    this.blankCubeRenderPass.drawInstanced(allTypes.length);

    // Restore player camera uniforms
    this.setMatrixUniform(
      this.blankCubeRenderPass,
      "uProj",
      this.gui.projMatrix(),
    );
    this.setMatrixUniform(
      this.blankCubeRenderPass,
      "uView",
      this.gui.viewMatrix(),
    );
    this.setMatrixUniform(
      this.skyboxRenderPass,
      "uProj",
      this.gui.projMatrix(),
    );
    this.setMatrixUniform(
      this.skyboxRenderPass,
      "uView",
      this.getSkyboxViewMatrix(),
    );
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

    const allAO = this.getAllCubeAO();
    this.blankCubeRenderPass.updateAttributeBuffer("aOffset", allPositions);
    this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", allTypes);
    this.blankCubeRenderPass.updateAttributeBuffer("aAO", allAO);
    this.blankCubeRenderPass.drawInstanced(instanceCount);

    // Enemies
    if (this.enemyMesh !== null && this.enemies.length > 0) {
      const enemyInstanceCount = this.enemies.length;
      const enemyPositions = new Float32Array(enemyInstanceCount * 4);
      const enemyRotations = new Float32Array(enemyInstanceCount * 4);
      const enemyIdxs = new Float32Array(enemyInstanceCount);
      for (let i = 0; i < this.enemies.length; i++) {
        enemyIdxs[i] = i;
        const pos = this.enemies[i].position;
        enemyPositions.set([pos.x, pos.y + 0.35, pos.z, 0], i * 4);
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

    const grounded = this.isPlayerGrounded(prov);
    if (grounded) {
      const previousVelocityY = this.player.velocity.y;
      this.player.jump(prov);
      if (this.player.velocity.y > previousVelocityY) {
        this.successfulJumps++;
      }
      this.doubleJumpAvailable = true;
      return;
    }

    if (
      this.doubleJumpAvailable &&
      (this.inventory.hasEquipmentById("boots") ||
        this.inventory.hasEquipmentById("jetpack"))
    ) {
      this.player.velocity.y = Math.max(this.player.velocity.y, 8.5);
      this.doubleJumpAvailable = false;
      this.successfulJumps++;
    }
  }

  public toggleAchievements(): void {
    this.showAchievements = !this.showAchievements;
  }

  public isInventoryOpen(): boolean {
    return this.isInInventory;
  }

  public toggleInventory(open?: boolean): void {
    this.isInInventory = open ?? !this.isInInventory;
    if (this.isInInventory) {
      document.exitPointerLock();
    } else {
      this.canvas2d.requestPointerLock();
      this.inventory.closeInventory();
    }
  }

  public isPlayerDead(): boolean {
    return this.player.isDead();
  }

  /**
   * Raycasts the crosshair ray against cubes and enemies, picking whichever is closer.
   * For cubes, it'll update `selectedCubePosition` and `isectNormal`. For enemies,
   * it'll update `selectedEnemy`.
   * Returns true if either is hit
   */
  public pickTarget(rayPos: Vec3, rayDir: Vec3): boolean {
    // --- Cubes ---
    let bestCubeT = Infinity;
    let bestPos = [-1000, -1000, -1000];
    let bestN = new Vec3();
    let cubeHit = false;

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
            if (t !== undefined && t < bestCubeT) {
              bestCubeT = t;
              bestPos = [x, y, z];
              bestN = isect?.normal !== undefined ? isect.normal : new Vec3();
              cubeHit = true;
            }
          }
        }
      }
    }

    // --- Enemies ---
    let bestEnemyT = Infinity;
    let bestEnemy: Enemy | null = null;
    for (const enemy of this.enemies) {
      if (enemy.isDead()) continue;
      const t = this.intersectEnemyAABB(rayPos, rayDir, enemy);
      if (t < bestEnemyT) {
        bestEnemyT = t;
        bestEnemy = enemy;
      }
    }

    // Prefer enemies
    if (bestEnemy !== null && bestEnemyT < bestCubeT) {
      this.selectedEnemy = bestEnemy;
      this.selectedEnemyDistance = bestEnemyT;
      this.selectedCubePosition = new Vec4([-1000, -1000, -1000, 0]);
      this.isectNormal = new Vec3();
      return true;
    }

    // fallback on cubes
    this.selectedEnemy = null;
    this.selectedCubePosition = new Vec4([
      Math.round(bestPos[0]),
      Math.round(bestPos[1]),
      Math.round(bestPos[2]),
      0,
    ]);
    this.isectNormal = bestN;
    return cubeHit;
  }

  /**
   * Returns t value of intersection, or infinity if no intersection
   */
  private intersectEnemyAABB(rayPos: Vec3, rayDir: Vec3, enemy: Enemy): number {
    const r = enemy.hitboxRadius;
    const hh = enemy.hitboxHeight / 2;
    const minX = enemy.position.x - r;
    const maxX = enemy.position.x + r;
    const minY = enemy.position.y - hh;
    const maxY = enemy.position.y + hh;
    const minZ = enemy.position.z - r;
    const maxZ = enemy.position.z + r;

    const invX = 1.0 / rayDir.x;
    const invY = 1.0 / rayDir.y;
    const invZ = 1.0 / rayDir.z;

    const t0x = (minX - rayPos.x) * invX;
    const t1x = (maxX - rayPos.x) * invX;
    const t0y = (minY - rayPos.y) * invY;
    const t1y = (maxY - rayPos.y) * invY;
    const t0z = (minZ - rayPos.z) * invZ;
    const t1z = (maxZ - rayPos.z) * invZ;

    const tNear = Math.max(
      Math.min(t0x, t1x),
      Math.min(t0y, t1y),
      Math.min(t0z, t1z),
    );
    const tFar = Math.min(
      Math.max(t0x, t1x),
      Math.max(t0y, t1y),
      Math.max(t0z, t1z),
    );

    if (tNear > tFar || tFar < 0) return Infinity;
    return tNear < 0 ? tFar : tNear;
  }

  /**
   *
   */
  private setFallingBlocksBFS(worldX: number, worldZ: number, worldY: number) {
    const cubeX = Math.round(worldX);
    const cubeY = Math.round(worldY);
    const cubeZ = Math.round(worldZ);

    // Only start search if block is not air
    let chunk = this.getChunkAtWorld(worldX, worldZ);
    if (
      chunk === undefined ||
      !chunk.isSolidBlockAtWorld(worldX, worldY, worldZ)
    ) {
      return;
    }

    const visited = new Set(); // track visited blocks
    visited.add(`${cubeX},${cubeY},${cubeZ}`);
    const queue = [[cubeX, cubeY, cubeZ]];
    const blocksToUpdate = [];
    let foundGround = false;
    let queueHead = 0;

    const directions = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];

    while (queueHead < queue.length) {
      const currBlockPos = queue[queueHead++];
      blocksToUpdate.push(currBlockPos);

      // Check if current block is touching "ground" by checking y = 0
      if (currBlockPos![1] === 0) {
        foundGround = true;
        break;
      }

      for (const [dx, dy, dz] of directions) {
        const x = currBlockPos![0] + dx;
        const y = currBlockPos![1] + dy;
        const z = currBlockPos![2] + dz;

        const blockKey = `${x},${y},${z}`;
        let chunk = this.getChunkAtWorld(x, z);

        // Only visit if cube contains a solid block
        if (
          chunk !== undefined &&
          chunk.isSolidBlockAtWorld(x, y, z) &&
          !visited.has(blockKey)
        ) {
          visited.add(blockKey);
          queue.push([x, y, z]);
        }
        if (chunk === undefined) {
          foundGround = true; // Assume block in unloaded chunk is connected to the ground
          break;
        }
      }
    }

    // Do nothing if ground is found, but mark all blocks searched as falling if ground is not found
    if (foundGround === false) {
      let chunksToUpdate = new Set<Chunk>();
      for (const blockPos of blocksToUpdate) {
        let chunk = this.getChunkAtWorld(blockPos![0], blockPos![2])!;
        const fallingBlockType = chunk.cubeType(
          blockPos![0],
          blockPos![2],
          blockPos![1],
        )!; // x, z, y
        this.fallingBlocks.push(
          new Block(
            new Vec3([blockPos![0], blockPos![1], blockPos![2]]),
            fallingBlockType,
          ),
        );
        chunk.changeCubeTypeNoUpdate(
          blockPos![0],
          blockPos![2],
          blockPos![1],
          Chunk.blockTypeAir,
        );
        chunksToUpdate.add(chunk);
      }
      for (const chunk of chunksToUpdate) {
        chunk.updateCubePositionsAndTypes();
      }
    }
  }

  private tickWater(): void {
    if (this.waterDirty.size === 0) return;

    const toPlace: {
      sourceKey: string;
      x: number;
      y: number;
      z: number;
      blockType: number;
    }[] = [];
    const nextDirty = new Set<string>();

    for (const posKey of this.waterDirty) {
      const [x, y, z] = posKey.split(",").map(Number);

      const chunkKey = `${this.worldToChunkCoord(x)},${this.worldToChunkCoord(z)}`;
      const chunk = this.renderedChunks.get(chunkKey);
      if (!chunk) {
        nextDirty.add(posKey);
        continue;
      } // chunk unloaded — retry later

      const blockType = chunk.cubeType(x, z, y);
      if (!chunk.isWater(x, z, y)) continue;

      // The block below is in the same xz column, so it belongs to the same chunk.
      const below = chunk.cubeType(x, z, y - 1);
      const belowIsOpen = below === undefined || below === Chunk.blockTypeAir;
      // Horizontal flow blocks below don't block falling — water punches through them.
      const belowIsHorizontalFlow =
        below !== undefined &&
        below >= Chunk.blockTypeWaterFlowLevel3 &&
        below <= Chunk.blockTypeWaterFlowLevel1;

      if (belowIsOpen || belowIsHorizontalFlow) {
        // Falling takes priority over spreading — handle it and move on.
        toPlace.push({
          sourceKey: posKey,
          x,
          y: y - 1,
          z,
          blockType: Chunk.blockTypeWaterFalling,
        });
        continue;
      }

      // Determine what level this block would spread its neighbors as.
      // Source and falling water both spread as Level3 (most water).
      // Level1 does not spread — it is the weakest flow and stops here.
      let spreadAs: number | null = null;
      if (blockType === Chunk.blockTypeWater) {
        // Source water doesn't need to spread horizontally if it already has a
        // waterfall below — the base of the fall handles the spread.
        const belowIsSourceOrFalling =
          below === Chunk.blockTypeWater ||
          below === Chunk.blockTypeWaterFalling;
        if (!belowIsSourceOrFalling) {
          spreadAs = Chunk.blockTypeWaterFlowLevel3;
        }
      } else if (blockType === Chunk.blockTypeWaterFalling) {
        // Falling water only spreads horizontally at the base of the waterfall —
        // when the block below is solid terrain, not another water block.
        if (!chunk.isWater(x, z, y - 1)) {
          spreadAs = Chunk.blockTypeWaterFlowLevel3;
        }
      } else if (blockType === Chunk.blockTypeWaterFlowLevel3) {
        spreadAs = Chunk.blockTypeWaterFlowLevel2;
      } else if (blockType === Chunk.blockTypeWaterFlowLevel2) {
        spreadAs = Chunk.blockTypeWaterFlowLevel1;
      }

      if (spreadAs === null) continue;

      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as [number, number][]) {
        const nx = x + dx,
          nz = z + dz;
        const nChunkKey = `${this.worldToChunkCoord(nx)},${this.worldToChunkCoord(nz)}`;
        const nChunk = this.renderedChunks.get(nChunkKey);
        if (!nChunk) {
          nextDirty.add(posKey);
          continue;
        } // retry when neighbor chunk loads

        const neighbor = nChunk.cubeType(nx, nz, y);
        const neighborIsOpen =
          neighbor === undefined || neighbor === Chunk.blockTypeAir;

        // Also overwrite a weaker flow block if we can improve it.
        // Lower ID = more water (Level3=100 > Level2=101 > Level1=102), so spreadAs < neighbor means stronger.
        const neighborIsWeakerFlow =
          neighbor !== undefined &&
          neighbor >= Chunk.blockTypeWaterFlowLevel3 &&
          neighbor <= Chunk.blockTypeWaterFlowLevel1 &&
          spreadAs < neighbor;

        if (neighborIsOpen || neighborIsWeakerFlow) {
          toPlace.push({
            sourceKey: posKey,
            x: nx,
            y,
            z: nz,
            blockType: spreadAs,
          });
        }
      }
    }

    this.waterDirty = nextDirty;

    // Apply placements. Multiple entries can target the same position within one tick
    // (e.g. falling from above + horizontal spread from the side). We track what was
    // written this tick so falling water always wins over horizontal flow.
    const writtenThisTick = new Map<string, number>(); // "x,y,z" → blockType

    let updatedChunks = new Set<Chunk>();
    for (const { sourceKey, x, y, z, blockType } of toPlace) {
      const posKey = `${x},${y},${z}`;
      const existing = writtenThisTick.get(posKey);
      if (existing !== undefined) {
        // Falling water (99) beats any horizontal flow (100+).
        // Among flow levels, lower ID = stronger. Skip if existing is already stronger or equal.
        if (existing <= blockType) continue;
      }

      const chunkKey = `${this.worldToChunkCoord(x)},${this.worldToChunkCoord(z)}`;
      const chunk = this.renderedChunks.get(chunkKey);
      if (!chunk) {
        this.waterDirty.add(sourceKey);
        continue;
      }
      const deltaMap = chunk.changeCubeTypeNoUpdate(x, z, y, blockType);
      (this.playerInNether ? this.netherDeltaMaps : this.deltaMaps).set(
        chunkKey,
        deltaMap,
      );
      writtenThisTick.set(posKey, blockType);
      this.waterDirty.add(posKey);
      updatedChunks.add(chunk);
    }
    for (const chunk of updatedChunks) {
      chunk.updateCubePositionsAndTypes();
    }
  }

  public leftClick(cubeSelected: boolean): void {
    if (this.selectedEnemy !== null && this.selectedEnemyDistance <= 5) {
      const enemy = this.selectedEnemy;
      this.attackEnemy(enemy, 5);
      this.selectedEnemy = null;
      return;
    }

    if (!cubeSelected) {
      return;
    }

    const chunkX = this.worldToChunkCoord(this.selectedCubePosition.x);
    const chunkZ = this.worldToChunkCoord(this.selectedCubePosition.z);
    let key = `${chunkX},${chunkZ}`;
    let chunk = this.renderedChunks.get(key)!;

    const cubeX = this.selectedCubePosition.x;
    const cubeY = this.selectedCubePosition.y;
    const cubeZ = this.selectedCubePosition.z;

    let brokenCubeType = chunk.cubeType(
      this.selectedCubePosition.x,
      this.selectedCubePosition.z,
      this.selectedCubePosition.y,
    );

    if (
      chunk.isWater(
        this.selectedCubePosition.x,
        this.selectedCubePosition.z,
        this.selectedCubePosition.y,
      ) ||
      brokenCubeType === Chunk.blockTypePortal ||
      brokenCubeType === Chunk.blockTypePortalFrame
    ) {
      return;
    }

    let chunkDeltaMap = chunk.changeCubeTypeNoUpdate(
      cubeX,
      cubeZ,
      cubeY,
      Chunk.blockTypeAir,
    );

    // TODO: Set blocks to fall according to bottom support if sand or gravel

    // Perform BFS beginning at each of the six surrounding cubes to update sets of blocks
    // connected to the ground
    this.setFallingBlocksBFS(cubeX, cubeZ, cubeY + 1);
    this.setFallingBlocksBFS(cubeX, cubeZ, cubeY - 1);
    this.setFallingBlocksBFS(cubeX, cubeZ + 1, cubeY);
    this.setFallingBlocksBFS(cubeX, cubeZ - 1, cubeY);
    this.setFallingBlocksBFS(cubeX + 1, cubeZ, cubeY);
    this.setFallingBlocksBFS(cubeX - 1, cubeZ, cubeY);

    // Single rebuild after all modifications (avoids duplicate rebuild from changeCubeType)
    chunk.updateCubePositionsAndTypes();
    this.removeDecorInstancesAtColumn(cubeX, cubeY, cubeZ);

    (this.playerInNether ? this.netherDeltaMaps : this.deltaMaps).set(
      key,
      chunkDeltaMap,
    );
    if (
      brokenCubeType !== undefined &&
      brokenCubeType !== Chunk.blockTypeAir &&
      !chunk.isWater(
        this.selectedCubePosition.x,
        this.selectedCubePosition.z,
        this.selectedCubePosition.y,
      )
    ) {
      this.blocksBroken++;
    }
    this.inventory.insertStack(ItemStack.dropsFrom(brokenCubeType ?? -1));

    // Any neighbor of the broken block may now have room to flow into
    const bx = this.selectedCubePosition.x;
    const by = this.selectedCubePosition.y;
    const bz = this.selectedCubePosition.z;
    for (const [dx, dy, dz] of [
      [0, 1, 0],
      [0, -1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as [number, number, number][]) {
      this.waterDirty.add(`${bx + dx},${by + dy},${bz + dz}`);
    }
  }

  public rightClick(cubeSelected: boolean) {
    const item = this.inventory.getHeldItem();
    if (item === null) {
      return;
    }

    const itemType = item.itemType!;
    switch (itemType.actionType) {
      case ItemAction.None: {
        return;
      }
      case ItemAction.Use: {
        itemType.useAction(this, new Vec3(this.selectedCubePosition.xyz));
        return;
      }
      case ItemAction.Place: {
        if (!cubeSelected) {
          return;
        }

        const blockType = itemType.getBlockType();

        // Place new cube based on side of cube that mouse is pointing at
        const cubeX = this.selectedCubePosition.x + this.isectNormal.x;
        const cubeY = this.selectedCubePosition.y + this.isectNormal.y;
        const cubeZ = this.selectedCubePosition.z + this.isectNormal.z;

        const chunkX = this.worldToChunkCoord(cubeX);
        const chunkZ = this.worldToChunkCoord(cubeZ);
        let key = `${chunkX},${chunkZ}`;
        let chunk = this.renderedChunks.get(key)!;

        let chunkDeltaMap = chunk.changeCubeType(
          cubeX,
          cubeZ,
          cubeY,
          blockType,
        );
        this.removeDecorInstancesAtColumn(cubeX, cubeY, cubeZ);

        (this.playerInNether ? this.netherDeltaMaps : this.deltaMaps).set(
          key,
          chunkDeltaMap,
        );
        this.blocksPlaced++;

        if (blockType === Chunk.blockTypePortalFrame) {
          this.checkPortal(cubeX, cubeZ, cubeY);
        }

        // The placed block and all its neighbors may now trigger water flow updates
        for (const [dx, dy, dz] of [
          [0, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
        ] as [number, number, number][]) {
          this.waterDirty.add(`${cubeX + dx},${cubeY + dy},${cubeZ + dz}`);
        }

        this.inventory.editSlotCount(
          Inventory.slotIndex(this.inventory.selectedHotbarIdx, 0),
          item!.count - 1,
        );
      }
    }
  }

  /** If the player is inside a portal's interior, teleport them to the linked portal.
   *  If the portals are in different dimensions, switch dimensions first. */
  private checkPortalTeleport(): void {
    const currentDimension: "overworld" | "nether" = this.playerInNether
      ? "nether"
      : "overworld";
    let currentPortal: Portal | null = null;
    for (const portal of this.portals) {
      if (portal.dimension !== currentDimension) continue;
      if (this.isPlayerInPortal(portal)) {
        currentPortal = portal;
        break;
      }
    }

    if (currentPortal === null) {
      this.playerInPortal = null;
      return;
    }

    // Don't re-teleport if the player was already inside a portal last frame
    if (this.playerInPortal === currentPortal) {
      return;
    }

    const linked = currentPortal.linked;
    if (linked === null) {
      this.playerInPortal = currentPortal;
      return;
    }

    // Switch dimension if crossing between overworld and nether
    if (linked.dimension !== currentPortal.dimension) {
      this.toggleNether();
    }

    // Add the offset between the two portals to the player's position
    this.player.position.x += linked.position.x - currentPortal.position.x;
    this.player.position.y += linked.position.y - currentPortal.position.y;
    this.player.position.z += linked.position.z - currentPortal.position.z;

    // Rotate the camera based on the two portal normals.
    const srcAngle = Math.atan2(currentPortal.normal.x, currentPortal.normal.z);
    const dstAngle = Math.atan2(linked.normal.x, linked.normal.z);
    const deltaYaw = dstAngle - srcAngle;
    if (deltaYaw !== 0) {
      this.gui.getCamera().rotate(new Vec3([0, 1, 0]), deltaYaw);
    }

    // Mark the player as being in the linked portal so we don't teleport again
    this.playerInPortal = linked;
  }

  private isPlayerInPortal(portal: Portal): boolean {
    const right = portal.right();
    const up = portal.up;
    const normal = portal.normal;
    const pos = portal.position;

    const relX = this.player.position.x - pos.x;
    const relY = this.player.position.y - pos.y;
    const relZ = this.player.position.z - pos.z;

    const alongRight = relX * right.x + relY * right.y + relZ * right.z;
    const alongUp = relX * up.x + relY * up.y + relZ * up.z;
    const alongNormal = relX * normal.x + relY * normal.y + relZ * normal.z;

    // Player is inside the portal's 2D rectangle (with vertical slack for height)
    // and close enough to the portal plane
    return (
      alongRight >= 0 &&
      alongRight <= portal.width &&
      alongUp >= -portal.height &&
      alongUp <= portal.height &&
      Math.abs(alongNormal) < 0.5
    );
  }

  private checkPortal(blockX: number, blockZ: number, blockY: number) {
    for (let x = blockX - 3; x <= blockX; x++) {
      for (let z = blockZ - 3; z <= blockZ; z++) {
        for (let y = blockY - 4; y <= blockY; y++) {
          if (this.checkPortalSpot(x, z, y)) {
            return;
          }
        }
      }
    }
  }

  private checkPortalSpot(minX: number, minZ: number, minY: number): boolean {
    const blockIsPortalX = (x: number, y: number): boolean => {
      x += minX;
      const z = minZ;
      y += minY;
      const chunk = this.chunkAt(x, z);
      return chunk.cubeType(x, z, y) === Chunk.blockTypePortalFrame;
    };

    const blockIsPortalZ = (z: number, y: number): boolean => {
      const x = minX;
      z += minZ;
      y += minY;
      const chunk = this.chunkAt(x, z);
      return chunk.cubeType(x, z, y) === Chunk.blockTypePortalFrame;
    };

    const check = (blockIsPortal: (x: number, y: number) => boolean) =>
      blockIsPortal(0, 0) &&
      blockIsPortal(1, 0) &&
      blockIsPortal(2, 0) &&
      blockIsPortal(3, 0) &&
      blockIsPortal(0, 4) &&
      blockIsPortal(1, 4) &&
      blockIsPortal(2, 4) &&
      blockIsPortal(3, 4) &&
      blockIsPortal(0, 1) &&
      blockIsPortal(0, 2) &&
      blockIsPortal(0, 3) &&
      blockIsPortal(3, 1) &&
      blockIsPortal(3, 2) &&
      blockIsPortal(3, 3);

    const srcDimension: "overworld" | "nether" = this.playerInNether
      ? "nether"
      : "overworld";

    if (check(blockIsPortalX)) {
      const newPortal = new Portal(
        new Vec3([minX + 1, minY + 1, minZ]),
        new Vec3([0, 0, 1]),
        new Vec3([0, 1, 0]),
        2,
        3,
        srcDimension,
      );
      this.portals.push(newPortal);
      if (this.tempPortal !== null) {
        this.portalRenderer.addPortalPair(this.tempPortal, newPortal);
        this.tempPortal = null;
      } else {
        this.tempPortal = newPortal;
      }
      return true;
    }
    if (check(blockIsPortalZ)) {
      const newPortal = new Portal(
        new Vec3([minX, minY + 1, minZ + 2]),
        new Vec3([1, 0, 0]),
        new Vec3([0, 1, 0]),
        2,
        3,
        srcDimension,
      );
      this.portals.push(newPortal);
      if (this.tempPortal !== null) {
        this.portalRenderer.addPortalPair(this.tempPortal, newPortal);
        this.tempPortal = null;
      } else {
        this.tempPortal = newPortal;
      }
      return true;
    }

    return false;
  }

  public checkCreateDimensionPortal(pos: Vec3): boolean {
    if (this.tempPortal === null) {
      return false;
    }

    if (
      Math.abs(
        Vec3.dot(pos, this.tempPortal.normal) -
          Vec3.dot(this.tempPortal.position, this.tempPortal.normal),
      ) < 0.5 &&
      Vec3.distance(pos, this.tempPortal.position) <= 5.1
    ) {
      const destPortal = this.writeDestinationPortal(
        this.tempPortal,
        this.tempPortal.position.x,
        this.tempPortal.position.z,
        this.tempPortal.position.y,
        this.tempPortal.normal.x === 0,
      );
      this.portalRenderer.addPortalPair(this.tempPortal, destPortal);
      this.tempPortal = null;
      return true;
    }

    return false;
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
    this.drawEnemyHealthbars();
    this.drawMinimap();
    this.drawAchievementToast();

    if (this.isInInventory) {
      this.inventory.drawInventoryScreen(
        this.overlayCtx,
        this.canvas2d.width,
        this.canvas2d.height,
        this.gui.mouseX,
        this.gui.mouseY,
      );
    } else {
      this.inventory.drawHotbar(
        this.overlayCtx,
        this.canvas2d.width,
        this.canvas2d.height,
      );
      this.drawHealthBar();
      this.drawHungerBar();
      this.drawCrosshair();
    }

    if (this.player.isDead()) {
      this.drawDeathOverlay();
    }

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
    return performance.now() / 1000 + MinecraftAnimation.dayDuration * 0.3;
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
        const color = !topBlock
          ? undefined
          : this.minimapColors.get(topBlock.type);
        if (!topBlock || !color) {
          ctx.fillStyle = "#C7C0B7";
          ctx.fillRect(
            i * scale,
            j * scale,
            Math.ceil(scale),
            Math.ceil(scale),
          );
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
    ctx.moveTo(0 * scale, 6 * scale);
    ctx.lineTo(-4 * scale, -4 * scale);
    ctx.lineTo(4 * scale, -4 * scale);
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
        ctx.fillRect(ex - scale, ez - scale, 2 * scale, 2 * scale);
      }
    });

    // border
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);

    ctx.restore();
  }

  public inventoryClick(mouseX: number, mouseY: number, button: number): void {
    this.inventory.handleClick(
      mouseX,
      mouseY,
      this.canvas2d.width,
      this.canvas2d.height,
      button,
    );
  }

  public attackEnemy(enemy: Enemy, amount: number): void {
    enemy.takeDamage(5);
    if (enemy.isDead()) {
      const idx = this.enemies.indexOf(enemy);
      if (idx >= 0) {
        this.enemies.splice(idx, 1);
      }
      this.inventory.insertItemById("food", 3);
      this.enemiesKilled++;
    }
  }

  public fireBlaster(): void {
    if (this.blasterCooldown > 0) {
      return;
    }

    if (!this.inventory.removeItemById("ammo", 1)) {
      return;
    }

    if (this.selectedEnemy !== null) {
      this.attackEnemy(this.selectedEnemy, 8);
      this.blasterHits++;
    }

    this.blasterCooldown = 0.35;
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

    // Position above the hotbar, left-aligned with hotbar
    const slotSize = 60;
    const hotbarSize = Inventory.width;
    const hotbarWidth = hotbarSize * slotSize + (hotbarSize - 1) * 10;
    const hotbarX = (this.canvas2d.width - hotbarWidth) / 2;
    const hotbarY = this.canvas2d.height - slotSize - 55;

    const startX = hotbarX - 15;
    const startY = hotbarY - 15 - heartSize - 4;

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
          0,
          0,
          this.heartBitmap.width / 2,
          this.heartBitmap.height,
          x,
          startY,
          heartSize / 2,
          heartSize,
        );
        ctx.globalAlpha = 0.25;
        ctx.drawImage(
          this.heartBitmap,
          this.heartBitmap.width / 2,
          0,
          this.heartBitmap.width / 2,
          this.heartBitmap.height,
          x + heartSize / 2,
          startY,
          heartSize / 2,
          heartSize,
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

  private drawCrosshair(): void {
    if (!this.crosshairBitmap) return;

    const ctx = this.overlayCtx;
    const centerX = this.canvas2d.width / 2;
    const centerY = this.canvas2d.height / 2;
    const size = 30;
    const x = centerX - size / 2;
    const y = centerY - size / 2;

    const targetingEnemy =
      this.selectedEnemy !== null && this.selectedEnemyDistance <= 5;

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.drawImage(this.crosshairBitmap, x, y, size, size);

    if (targetingEnemy) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(230, 40, 40, 0.85)";
      ctx.fillRect(x, y, size, size);
    }

    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  private drawHungerBar(): void {
    if (!this.foodBitmap) return;

    const ctx = this.overlayCtx;
    const food = this.player.food;
    const maxFood = this.player.maxFood;
    const totalFood = maxFood / 2;
    const fullFood = Math.floor(food / 2);
    const halfFood = food % 2 >= 0.5;

    const foodSize = 24;
    const spacing = 4;

    // Position above the hotbar, right-aligned with hotbar
    const slotSize = 60;
    const hotbarSize = Inventory.width;
    const hotbarWidth = hotbarSize * slotSize + (hotbarSize - 1) * 10;
    const hotbarX = (this.canvas2d.width - hotbarWidth) / 2;
    const hotbarY = this.canvas2d.height - slotSize - 55;

    const totalBarWidth = totalFood * foodSize + (totalFood - 1) * spacing;
    const startX = hotbarX + hotbarWidth + 15 - totalBarWidth;
    const startY = hotbarY - 15 - foodSize - 4;

    ctx.save();
    for (let i = 0; i < totalFood; i++) {
      const x = startX + i * (foodSize + spacing);
      if (i < fullFood) {
        // Full food
        ctx.globalAlpha = 1.0;
        ctx.drawImage(this.foodBitmap, x, startY, foodSize, foodSize);
      } else if (i === fullFood && halfFood) {
        // Half food: draw left half full, right half dimmed
        ctx.globalAlpha = 1.0;
        ctx.drawImage(
          this.foodBitmap,
          0,
          0,
          this.foodBitmap.width / 2,
          this.foodBitmap.height,
          x,
          startY,
          foodSize / 2,
          foodSize,
        );
        ctx.globalAlpha = 0.25;
        ctx.drawImage(
          this.foodBitmap,
          this.foodBitmap.width / 2,
          0,
          this.foodBitmap.width / 2,
          this.foodBitmap.height,
          x + foodSize / 2,
          startY,
          foodSize / 2,
          foodSize,
        );
      } else {
        // Empty food
        ctx.globalAlpha = 0.25;
        ctx.drawImage(this.foodBitmap, x, startY, foodSize, foodSize);
      }
    }
    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  private drawEnemyHealthbars(): void {
    const ctx = this.overlayCtx;

    // visibility factors
    const MAX_DIST = 15;
    const FADE_START = 7; // fully opaque within this radius; fades from here to MAX_DIST

    // Bar dimensions in canvas pixels.
    const BAR_W = 50;
    const BAR_H = 10;
    const BAR_YOFFSET = 1.5; // world units above enemy CoM

    const canvasW = this.canvas2d.width;
    const canvasH = this.canvas2d.height;

    // Combined projection * view matrix. Compute once per frame.
    const viewProj = this.gui
      .projMatrix()
      .copy()
      .multiply(this.gui.viewMatrix());

    const playerPos = this.player.position;

    ctx.save();
    for (const enemy of this.enemies) {
      if (enemy.isDead()) continue;

      // --- distance filtering + fade ---
      const dx = enemy.position.x - playerPos.x;
      const dy = enemy.position.y - playerPos.y;
      const dz = enemy.position.z - playerPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq > MAX_DIST * MAX_DIST) continue;

      const dist = Math.sqrt(distSq);
      let alpha = 1.0;
      if (dist > FADE_START) {
        // Linear fade from 1.0 at FADE_START to 0.0 at MAX_DIST.
        alpha = 1.0 - (dist - FADE_START) / (MAX_DIST - FADE_START);
      }
      if (alpha <= 0) continue;

      // --- world -> clip space ---
      const worldPos = new Vec4([
        enemy.position.x,
        enemy.position.y + BAR_YOFFSET,
        enemy.position.z,
        1.0,
      ]);
      const clip = viewProj.multiplyVec4(worldPos);

      // Cull anything behind the camera / near plane.
      if (clip.w <= 0) continue;

      const ndcX = clip.x / clip.w;
      const ndcY = clip.y / clip.w;

      // Off-screen cull (small margin so bars near the edge still render).
      if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2) continue;

      const screenX = (ndcX + 1) * 0.5 * canvasW;
      const screenY = (1 - ndcY) * 0.5 * canvasH;

      const healthRatio = Math.max(
        0,
        Math.min(1, enemy.health / enemy.maxHealth),
      );

      ctx.globalAlpha = alpha;

      // Background (dark).
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(screenX - BAR_W / 2, screenY - BAR_H / 2, BAR_W, BAR_H);

      // Filled portion (red).
      ctx.fillStyle = "rgba(220, 40, 40, 0.95)";
      ctx.fillRect(
        screenX - BAR_W / 2,
        screenY - BAR_H / 2,
        BAR_W * healthRatio,
        BAR_H,
      );

      // Thin border for readability.
      ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        screenX - BAR_W / 2 + 0.5,
        screenY - BAR_H / 2 + 0.5,
        BAR_W - 1,
        BAR_H - 1,
      );
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
