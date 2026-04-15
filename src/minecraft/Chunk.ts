import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js";
import { Player } from "./Entity.js";
import {
  ACTIVE_BIOME_PROFILES,
  BIOME_BLEND_TUNING,
  BIOME_SELECTION_TUNING,
  TERRAIN_OCTAVE_TUNING,
  type BiomeProfile,
} from "./Biomes.js";

export class Chunk {
  public static readonly blockTypeAir: number = -1;
  public static readonly blockTypeDirt: number = 0;
  public static readonly blockTypeCobble: number = 1;
  public static readonly blockTypeWater: number = 2;

  private cubes: number; // Number of cubes that should be *drawn* each frame
  private cubePositionsF32!: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates. Sent to GPU, only visible cubes
  private cubeTypesF32!: Float32Array; // (1 x cubes) array of block ids. Sent to GPU, only visible cubes
  private heightMapData!: Float32Array; // Ground truth of what blocks exist.
  private x: number; // Center of the chunk
  private z: number;
  private size: number; // Number of cubes along each side of the chunk
  private static worldSeed: string = "default";

  private positionMap: Map<string, number>; // Maps local position (x, z, y) to cube type
  private deltaMap: Map<string, number>; // Stores the modified cubes in the chunk (position -> block type)
  private numCubesAdded: number;

  // world seed
  public static setWorldSeed(seed: string): void {
    Chunk.worldSeed = seed;
  }

  constructor(centerX: number, centerZ: number, size: number) {
    this.x = centerX;
    this.z = centerZ;
    this.size = size;
    this.cubes = size * size;
    this.positionMap = new Map();
    this.deltaMap = new Map();
    this.numCubesAdded = 0;
    this.generateCubes();
  }

  private origin(): [number, number] {
    return [this.x - this.size / 2, this.z - this.size / 2];
  }

  // 32-bit hash so world sampling is deterministic by hash
  private hash32(input: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  // deterministic float in [0, 1) by lattice coord and octave
  private rand01AtLattice(ix: number, iz: number, octave: number): number {
    const h = this.hash32(`${Chunk.worldSeed}|${octave}|${ix}|${iz}`);
    return h / 4294967295;
  }

  // linear interpolation
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
  }

  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = this.clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  // bilinear interpolation of 2 biomes for transitions
  private blendBiomeProfiles(
    a: BiomeProfile,
    b: BiomeProfile,
    t: number,
  ): BiomeProfile {
    return {
      name: t < 0.5 ? a.name : b.name,
      baseHeight: this.lerp(a.baseHeight, b.baseHeight, t),
      reliefScale: this.lerp(a.reliefScale, b.reliefScale, t),
      frequencyScale: this.lerp(a.frequencyScale, b.frequencyScale, t),
      highFreqBoost: this.lerp(a.highFreqBoost, b.highFreqBoost, t),
      octaveGain: this.lerp(a.octaveGain, b.octaveGain, t),
    };
  }

  // random value noise given world coord, octave, and frequency
  private sampleValueNoise(
    worldX: number,
    worldZ: number,
    octave: number,
    frequency: number,
  ): number {
    // Apply 2D rotation per octave to break up axis-aligned artifacts
    const theta = octave * 0.8;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const rx = worldX * c - worldZ * s;
    const rz = worldX * s + worldZ * c;

    const sx = rx * frequency;
    const sz = rz * frequency;

    // grid corner lattice coordinates
    const x0 = Math.floor(sx);
    const z0 = Math.floor(sz);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const tx = sx - x0;
    const tz = sz - z0;
    const u = this.smoothstep(0, 1, tx);
    const v = this.smoothstep(0, 1, tz);

    // get random values at the corners of the grid cell
    const v00 = this.rand01AtLattice(x0, z0, octave);
    const v10 = this.rand01AtLattice(x1, z0, octave);
    const v01 = this.rand01AtLattice(x0, z1, octave);
    const v11 = this.rand01AtLattice(x1, z1, octave);

    // interpolate between bottom corners
    const a = this.lerp(v00, v10, u);

    // interpolate between top corners
    const b = this.lerp(v01, v11, u);

    // interpolate between top and bottom
    return this.lerp(a, b, v);
  }

  // Discrete biome regions in world space with a narrow smooth transition band.
  private sampleBiomeProfileAt(worldX: number, worldZ: number): BiomeProfile {
    const selector = Math.min(
      0.999999,
      this.sampleValueNoise(
        worldX,
        worldZ,
        BIOME_SELECTION_TUNING.selectorOctave,
        BIOME_SELECTION_TUNING.selectorFrequency,
      ),
    );

    const biomeCount = ACTIVE_BIOME_PROFILES.length;
    const scaled = selector * biomeCount;

    // Find which two biomes we're between
    const lowerIdx = Math.floor(scaled);
    const upperIdx = Math.min(biomeCount - 1, lowerIdx + 1);
    const frac = scaled - lowerIdx; // Position between lower and upper biome (0 to 1)
    const transitionWidth = BIOME_SELECTION_TUNING.transitionWidth;

    // Only blend if within transition zone
    if (frac < transitionWidth || frac > 1 - transitionWidth) {
      // Compute blend factor: 0 = fully lower, 1 = fully upper
      let blendFactor: number;
      if (frac < transitionWidth) {
        blendFactor = this.smoothstep(0, transitionWidth, frac);
      } else {
        blendFactor = this.smoothstep(1 - transitionWidth, 1, frac);
      }

      return this.blendBiomeProfiles(
        ACTIVE_BIOME_PROFILES[lowerIdx],
        ACTIVE_BIOME_PROFILES[upperIdx],
        blendFactor,
      );
    }

    // Solidly in one biome
    return ACTIVE_BIOME_PROFILES[lowerIdx];
  }

  // sample height at world coordinates by combining multiple octaves of value noise
  private sampleHeightAtWorld(
    worldX: number,
    worldZ: number,
    gridSizes: number[],
    multCoeffs: number[],
  ): number {
    const octaves = Math.min(gridSizes.length, multCoeffs.length);
    const biome = this.sampleBiomeProfileAt(worldX, worldZ);

    let sum = 0;
    let maxPossibleHeight = 0;
    for (let octave = 0; octave < octaves; octave++) {
      const octaveT = octaves <= 1 ? 0 : octave / (octaves - 1);
      const frequency = (gridSizes[octave] / this.size) * biome.frequencyScale;
      const detailWeight = this.lerp(1.0, biome.highFreqBoost, octaveT);
      const coeff = multCoeffs[octave] * detailWeight * biome.octaveGain;
      const noiseVal = this.sampleValueNoise(worldX, worldZ, octave, frequency);
      sum += noiseVal * coeff;
      maxPossibleHeight += coeff;
    }
    const normalized = sum / maxPossibleHeight;
    const shaped = this.smoothstep(
      BIOME_BLEND_TUNING.defaultShapeLow,
      BIOME_BLEND_TUNING.defaultShapeHigh,
      normalized,
    );
    return Math.floor(biome.baseHeight + shaped * biome.reliefScale);
  }

  private generateCubes() {
    const [topLeftX, topLeftZ] = this.origin();

    // TODO: wire Chunk.setWorldSeed(...) to a user-provided world seed from app/UI settings.

    const activeGridSizes: number[] = [...TERRAIN_OCTAVE_TUNING.gridSizes];
    const activeMultCoeffs: number[] = [...TERRAIN_OCTAVE_TUNING.multCoeffs];

    this.heightMapData = new Float32Array(this.size * this.size);
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const worldX = topLeftX + j;
        const worldZ = topLeftZ + i;
        this.heightMapData[this.size * i + j] = this.sampleHeightAtWorld(
          worldX,
          worldZ,
          activeGridSizes,
          activeMultCoeffs,
        );
      }
    }

    // Count only visible cubes
    this.cubes = 0;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const height = Math.max(this.heightMapData[this.size * i + j], 1);
        for (let y = 0; y < height; y++) {
          if (this.isExposed(i, j, y)) this.cubes++;
        }
      }
    }
    this.cubes += this.numCubesAdded;
    this.cubePositionsF32 = new Float32Array(4 * this.cubes);
    this.cubeTypesF32 = new Float32Array(this.cubes);

    let cubeIdx = 0;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const height = Math.max(this.heightMapData[this.size * i + j], 1);
        for (let y = 0; y <= 100; y++) {
          const key = `${j},${i},${y}`;

          // skip empty cube
          if (
            y < height &&
            (this.deltaMap.get(key) == Chunk.blockTypeAir ||
              !this.isExposed(i, j, y))
          ) {
            continue;
          } else if (
            y >= height &&
            (this.deltaMap.get(key) == undefined ||
              this.deltaMap.get(key) == Chunk.blockTypeAir)
          ) {
            continue;
          }
          this.cubePositionsF32[4 * cubeIdx + 0] = topLeftX + j;
          this.cubePositionsF32[4 * cubeIdx + 1] = y;
          this.cubePositionsF32[4 * cubeIdx + 2] = topLeftZ + i;
          this.cubePositionsF32[4 * cubeIdx + 3] = 0;

          if (this.deltaMap.has(key)) {
            this.cubeTypesF32[cubeIdx] = this.deltaMap.get(key)!;
            this.positionMap.set(key, this.deltaMap.get(key)!);
          } else {
            this.cubeTypesF32[cubeIdx] = this.blockTypeAtHeight(y, height);
            this.positionMap.set(key, this.blockTypeAtHeight(y, height));
          }
          cubeIdx++;
        }
      }
    }
  }

  private blockTypeAtHeight(y: number, columnHeight: number): number {
    // Keep the visible surface earthy and the bulk of the terrain rocky.
    if (y >= columnHeight - 3) {
      return Chunk.blockTypeDirt;
    }
    return Chunk.blockTypeCobble;
  }

  // Makes the assumption that columns are solid up to the height of the column.
  // Change when implementing caves and overhangs!
  private isExposed(i: number, j: number, y: number): boolean {
    // Top face
    if (y >= this.getHeight(i, j) - 1) return true;
    // Bottom face
    if (y === 0) return true;
    // Four cardinal neighbors
    if (this.getHeight(i - 1, j) <= y) return true;
    if (this.getHeight(i + 1, j) <= y) return true;
    if (this.getHeight(i, j - 1) <= y) return true;
    if (this.getHeight(i, j + 1) <= y) return true;
    return false;
  }

  private getHeight(i: number, j: number): number {
    if (i < 0 || i >= this.size || j < 0 || j >= this.size) return 0;
    return this.heightMapData[this.size * i + j];
  }

  public cubePositions(): Float32Array {
    return this.cubePositionsF32;
  }

  public cubeTypes(): Float32Array {
    return this.cubeTypesF32;
  }

  public numCubes(): number {
    return this.cubes;
  }

  public heightMap(): Float32Array {
    return this.heightMapData;
  }

  public topLeftX(): number {
    return this.x - this.size / 2;
  }

  public topLeftZ(): number {
    return this.z - this.size / 2;
  }

  public chunkSize(): number {
    return this.size;
  }

  // Calculates the height of the floor for a given an xz world player coordinate.
  //
  // FIXME: Using this for collisions is not going to work with overhangs.
  // We will likely need to adapt to an API similar to `Player::collidesWithChunk`.
  // I also just don't like the coupling here, but oh well it is a prototype.
  public floorHeight(worldX: number, worldZ: number): number {
    const [topLeftX, topLeftZ] = this.origin();

    const centerX = Math.round(worldX - topLeftX);
    const centerZ = Math.round(worldZ - topLeftZ);

    let floorY = -Infinity;
    for (let dx = -1; dx <= 1; dx += 1) {
      const cubeChunkX = centerX + dx;
      if (cubeChunkX < 0 || cubeChunkX >= this.size) {
        continue;
      }

      for (let dz = -1; dz <= 1; dz += 1) {
        const cubeChunkZ = centerZ + dz;
        if (cubeChunkZ < 0 || cubeChunkZ >= this.size) {
          continue;
        }

        const cubeWorldX = topLeftX + cubeChunkX;
        const cubeWorldZ = topLeftZ + cubeChunkZ;

        // Clamp.
        // https://stackoverflow.com/questions/11409895/whats-the-most-elegant-way-to-cap-a-number-to-a-segment
        const nearX = Math.max(
          cubeWorldX - 0.5,
          Math.min(cubeWorldX + 0.5, worldX),
        );
        const nearZ = Math.max(
          cubeWorldZ - 0.5,
          Math.min(cubeWorldZ + 0.5, worldZ),
        );

        // Radial distance.
        const rdX = worldX - nearX;
        const rdZ = worldZ - nearZ;
        const hbr = Player.hitboxRadius;
        if (rdX * rdX + rdZ * rdZ < hbr * hbr) {
          const cubeWorldY = this.topBlockAt(cubeWorldX, cubeWorldZ);
          if (cubeWorldY !== -Infinity) {
            floorY = Math.max(floorY, cubeWorldY - 0.5);
          }
        }
      }
    }

    return floorY;
  }

  /**
   * Highest occupied block center Y in the world column at (worldX, worldZ).
   * Uses current voxel occupancy (positionMap/cubeType), so mined/built edits
   * are reflected immediately.
   */
  public topBlockAt(
    worldX: number,
    worldZ: number,
    yMaxInclusive: number = 100,
  ): number {
    const [topLeftX, topLeftZ] = this.origin();
    const cubeChunkX = Math.round(worldX - topLeftX);
    const cubeChunkZ = Math.round(worldZ - topLeftZ);
    if (
      cubeChunkX < 0 ||
      cubeChunkX >= this.size ||
      cubeChunkZ < 0 ||
      cubeChunkZ >= this.size
    ) {
      return -Infinity;
    }

    for (let y = yMaxInclusive; y >= 0; y--) {
      if (this.cubeType(worldX, worldZ, y) !== undefined) {
        return y;
      }
    }
    return -Infinity;
  }

  ///// Cylinder-voxel collision

  /**
   *  True if the horizontal circle (radius r) at (px,pz) overlaps the block
   *  column centered at integer (ix, iz).
   */
  public static circleOverlapsBlockColumn(
    px: number,
    pz: number,
    r: number,
    ix: number,
    iz: number,
  ): boolean {
    const nx = Math.max(ix - 0.5, Math.min(ix + 0.5, px));
    const nz = Math.max(iz - 0.5, Math.min(iz + 0.5, pz));
    const dx = px - nx;
    const dz = pz - nz;
    return dx * dx + dz * dz < r * r + 1e-10;
  }

  /**
   * Vertical capsule: y in [headY - height, headY], circular footprint of
   * radius `radius`.
   *
   * Calls solidAt(ix, iy, iz) for integer block centers in the swept bounds.
   */
  public static verticalCapsuleIntersectsSolids(
    solidAt: (ix: number, iy: number, iz: number) => boolean,
    px: number,
    headY: number,
    pz: number,
    radius: number,
    capsuleHeight: number,
  ): boolean {
    const yLow = headY - capsuleHeight;
    const yHigh = headY;
    const iMin = Math.floor(px - radius - 0.5);
    const iMax = Math.ceil(px + radius + 0.5);
    const kMin = Math.floor(pz - radius - 0.5);
    const kMax = Math.ceil(pz + radius + 0.5);
    const iyMin = Math.floor(yLow - 0.5);
    const iyMax = Math.ceil(yHigh + 0.5);

    for (let ix = iMin; ix <= iMax; ix++) {
      for (let iz = kMin; iz <= kMax; iz++) {
        if (!Chunk.circleOverlapsBlockColumn(px, pz, radius, ix, iz)) {
          continue;
        }
        for (let iy = iyMin; iy <= iyMax; iy++) {
          if (!solidAt(ix, iy, iz)) continue;
          const bLow = iy - 0.5;
          const bHigh = iy + 0.5;
          if (yLow < bHigh && yHigh > bLow) return true;
        }
      }
    }
    return false;
  }

  public static worldToChunkAxis(worldVal: number, chunkSize: number): number {
    return Math.floor((worldVal + chunkSize / 2) / chunkSize) * chunkSize;
  }

  public static isSolidBlockWorldWide(
    getChunk: Chunk.ColumnProvider,
    wx: number,
    wy: number,
    wz: number,
  ): boolean {
    const ix = Math.round(wx);
    const iy = Math.round(wy);
    const iz = Math.round(wz);
    const chunk = getChunk(ix, iz);
    if (!chunk) return false;
    return chunk.isSolidBlockAtWorld(ix, iy, iz);
  }

  public static cylinderIntersectsSolidWorld(
    getChunk: Chunk.ColumnProvider,
    px: number,
    headY: number,
    pz: number,
    radius: number,
    capsuleHeight: number,
  ): boolean {
    return Chunk.verticalCapsuleIntersectsSolids(
      (ix, iy, iz) => Chunk.isSolidBlockWorldWide(getChunk, ix, iy, iz),
      px,
      headY,
      pz,
      radius,
      capsuleHeight,
    );
  }

  public static supportedHeadYWorld(
    getChunk: Chunk.ColumnProvider,
    px: number,
    pz: number,
    feetY: number,
    radius: number,
    capsuleHeight: number,
    footSlack: number,
  ): number {
    let supportTop = -Infinity;
    const iMin = Math.floor(px - radius - 0.5);
    const iMax = Math.ceil(px + radius + 0.5);
    const kMin = Math.floor(pz - radius - 0.5);
    const kMax = Math.ceil(pz + radius + 0.5);

    for (let ix = iMin; ix <= iMax; ix++) {
      for (let iz = kMin; iz <= kMax; iz++) {
        if (!Chunk.circleOverlapsBlockColumn(px, pz, radius, ix, iz)) {
          continue;
        }
        const chunk = getChunk(ix, iz);
        const colMax = chunk
          ? chunk.supportTopUnderFeet(ix, iz, feetY, footSlack)
          : -Infinity;
        if (colMax === -Infinity) continue;
        supportTop = Math.max(supportTop, colMax);
      }
    }
    if (supportTop === -Infinity) return -Infinity;
    return supportTop + capsuleHeight;
  }

  public static separateVerticalCapsuleFromSolids(
    getChunk: Chunk.ColumnProvider,
    px: number,
    py: number,
    pz: number,
    radius: number,
    capsuleHeight: number,
    vy: number,
  ): number {
    const solid = (hx: number, hy: number, hz: number) =>
      Chunk.cylinderIntersectsSolidWorld(
        getChunk,
        hx,
        hy,
        hz,
        radius,
        capsuleHeight,
      );

    if (!solid(px, py, pz)) return py;
    const step = 0.025;
    const maxSteps = 400;

    let downY = py;
    let s = 0;
    while (solid(px, downY, pz) && s < maxSteps) {
      downY -= step;
      s++;
    }
    const downClear = !solid(px, downY, pz);

    let upY = py;
    s = 0;
    while (solid(px, upY, pz) && s < maxSteps) {
      upY += step;
      s++;
    }
    const upClear = !solid(px, upY, pz);

    if (!downClear && !upClear) return py;
    if (!downClear) return upY;
    if (!upClear) return downY;

    const downDist = py - downY;
    const upDist = upY - py;

    if (vy > 1e-4) {
      return downY;
    }
    if (vy < -1e-4) {
      return upY;
    }
    if (downDist < upDist) return downY;
    if (upDist < downDist) return upY;
    return downY;
  }

  /**
   * Step down until the vertical capsule is clear (ceiling / upward
   * penetration).
   */
  public static resolveUpwardPenetration(
    getChunk: Chunk.ColumnProvider,
    px: number,
    py: number,
    pz: number,
    radius: number,
    capsuleHeight: number,
  ): number {
    if (
      !Chunk.cylinderIntersectsSolidWorld(
        getChunk,
        px,
        py,
        pz,
        radius,
        capsuleHeight,
      )
    ) {
      return py;
    }
    const sepStep = 0.025;
    let y = py;
    let guard = 0;
    while (
      Chunk.cylinderIntersectsSolidWorld(
        getChunk,
        px,
        y,
        pz,
        radius,
        capsuleHeight,
      ) &&
      guard < 400
    ) {
      y -= sepStep;
      guard++;
    }
    return y;
  }

  public static tryHorizontalCylinderMove(
    getChunk: Chunk.ColumnProvider,
    px: number,
    py: number,
    pz: number,
    dx: number,
    dz: number,
    radius: number,
    capsuleHeight: number,
  ): { ax: number; az: number } {
    const solid = (x: number, z: number) =>
      Chunk.cylinderIntersectsSolidWorld(
        getChunk,
        x,
        py,
        z,
        radius,
        capsuleHeight,
      );

    if (!solid(px + dx, pz + dz)) return { ax: dx, az: dz };
    if (dx !== 0 && !solid(px + dx, pz)) return { ax: dx, az: 0 };
    if (dz !== 0 && !solid(px, pz + dz)) return { ax: 0, az: dz };
    return { ax: 0, az: 0 };
  }

  /**
   * Samples head positions along a short jump arc; false if any sample
   * intersects solid.
   */
  public static verticalCapsuleHasHeadroomForJump(
    getChunk: Chunk.ColumnProvider,
    px: number,
    headY: number,
    pz: number,
    radius: number,
    capsuleHeight: number,
  ): boolean {
    for (let dh = 0; dh <= 1; dh += 0.35) {
      if (
        Chunk.cylinderIntersectsSolidWorld(
          getChunk,
          px,
          headY + dh,
          pz,
          radius,
          capsuleHeight,
        )
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Solid voxel at integer block center (world coords); false if empty or out
   * of this chunk.
   */
  public isSolidBlockAtWorld(wx: number, wy: number, wz: number): boolean {
    return this.cubeType(wx, wz, wy) !== undefined;
  }

  /**
   * Highest block top (iy + 0.5) in this column at/below feetY + footSlack, or
   * -Infinity if none. Only columns owned by this chunk contribute; others
   * should query the owning chunk.
   */
  public supportTopUnderFeet(
    columnWorldX: number,
    columnWorldZ: number,
    feetY: number,
    footSlack: number,
    yMaxInclusive: number = 100,
  ): number {
    let colMax = -Infinity;
    for (let iy = 0; iy <= yMaxInclusive; iy++) {
      if (this.cubeType(columnWorldX, columnWorldZ, iy) === undefined) {
        continue;
      }
      const top = iy + 0.5;
      if (top <= feetY + footSlack) {
        colMax = Math.max(colMax, top);
      }
    }
    return colMax;
  }

  /**
   * Gets the type of the cube located at a given position in world coordinates.
   * Returns undefined for an empty cube.
   */
  public cubeType(
    worldX: number,
    worldZ: number,
    worldY: number,
  ): number | undefined {
    const [topLeftX, topLeftZ] = this.origin();
    const cubeChunkX = Math.round(worldX - topLeftX);
    const cubeChunkZ = Math.round(worldZ - topLeftZ);
    const cubeChunkY = Math.round(worldY);

    if (
      cubeChunkX < 0 ||
      cubeChunkX >= this.size ||
      cubeChunkZ < 0 ||
      cubeChunkZ >= this.size
    ) {
      return undefined;
    }

    const key = `${cubeChunkX},${cubeChunkZ},${cubeChunkY}`;
    return this.positionMap.get(key);
  }

  /**
   * Changes the type of the cube at the given world coordinates and returns the chunks
   * new delta map.
   */
  public changeCubeType(
    worldX: number,
    worldZ: number,
    worldY: number,
    newType: number,
  ): Map<string, number> {
    const [topLeftX, topLeftZ] = this.origin();
    const cubeChunkX = Math.round(worldX - topLeftX);
    const cubeChunkZ = Math.round(worldZ - topLeftZ);
    const cubeChunkY = Math.round(worldY);

    const key = `${cubeChunkX},${cubeChunkZ},${cubeChunkY}`;

    if (newType == Chunk.blockTypeAir) {
      this.positionMap.delete(key);
      this.numCubesAdded--;
    } else {
      this.numCubesAdded++;
    }
    this.deltaMap.set(key, newType);
    this.generateCubes(); // re-generate cubes with the modification
    return this.deltaMap;
  }
}

// Check if the chunk is defined
export namespace Chunk {
  export type ColumnProvider = (ix: number, iz: number) => Chunk | undefined;
}
