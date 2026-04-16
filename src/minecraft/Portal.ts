import { Mat4, Vec3 } from "../lib/TSM.js";

export class Portal {
  public position: Vec3; // world position of portal center
  public normal: Vec3; // which way the portal faces (unit vector)
  public up: Vec3; // up direction of the portal plane
  public width: number; // portal width in blocks
  public height: number; // portal height in blocks
  public linked: Portal | null = null;
  public dimension: "overworld" | "nether";

  constructor(
    position: Vec3,
    normal: Vec3,
    up: Vec3,
    width: number,
    height: number,
    dimension: "overworld" | "nether",
  ) {
    this.position = position;
    this.normal = normal;
    this.up = up;
    this.width = width;
    this.height = height;
    this.dimension = dimension;
  }

  public link(other: Portal): void {
    this.linked = other;
    other.linked = this;
  }

  /**
   * Compute the camera position for looking through this portal.
   * Mirrors the player position across the source portal and transforms to destination space.
   */
  private computePortalCamPos(playerPos: Vec3): Vec3 | null {
    if (!this.linked) return null;

    const src = this;
    const dst = this.linked;

    const relPos = new Vec3([
      playerPos.x - src.position.x,
      playerPos.y - src.position.y,
      playerPos.z - src.position.z,
    ]);

    const dotN = Vec3.dot(relPos, src.normal);
    const mirrored = new Vec3([
      relPos.x - 2 * dotN * src.normal.x,
      relPos.y - 2 * dotN * src.normal.y,
      relPos.z - 2 * dotN * src.normal.z,
    ]);

    const srcRight = Vec3.cross(src.up, src.normal);
    const dstRight = Vec3.cross(dst.up, dst.normal);

    const srcBasis = new Mat4([
      srcRight.x,
      srcRight.y,
      srcRight.z,
      0,
      src.up.x,
      src.up.y,
      src.up.z,
      0,
      src.normal.x,
      src.normal.y,
      src.normal.z,
      0,
      0,
      0,
      0,
      1,
    ]);
    const dstBasis = new Mat4([
      -dstRight.x,
      -dstRight.y,
      -dstRight.z,
      0,
      dst.up.x,
      dst.up.y,
      dst.up.z,
      0,
      -dst.normal.x,
      -dst.normal.y,
      -dst.normal.z,
      0,
      0,
      0,
      0,
      1,
    ]);

    const rotation = dstBasis.copy().multiply(srcBasis.copy().transpose());
    const rotatedOffset = rotation.multiplyVec3(mirrored);

    return new Vec3([
      dst.position.x + rotatedOffset.x,
      dst.position.y + rotatedOffset.y,
      dst.position.z + rotatedOffset.z,
    ]);
  }

  /**
   * Compute view + projection matrices using an off-axis frustum that exactly
   * frames the destination portal. The FBO rendered with these matrices will
   * have the portal filling the entire texture, so portal-local UVs map
   * directly to [0,1] FBO coordinates.
   */
  public computeFramingCamera(
    playerPos: Vec3,
  ): { view: Mat4; proj: Mat4 } | null {
    const eyePos = this.computePortalCamPos(playerPos);
    if (!eyePos || !this.linked) return null;

    const dst = this.linked;
    const dstRight = dst.right();

    // Bottom-left corner of the full portal rectangle (including half-block margins)
    const bl = new Vec3([
      dst.position.x - dstRight.x * 0.5 - dst.up.x * 0.5,
      dst.position.y - dstRight.y * 0.5 - dst.up.y * 0.5,
      dst.position.z - dstRight.z * 0.5 - dst.up.z * 0.5,
    ]);

    // Vector from eye to bottom-left corner
    const va = new Vec3([bl.x - eyePos.x, bl.y - eyePos.y, bl.z - eyePos.z]);

    // Distance from eye to portal plane. If negative, eye is on the back side —
    // flip the view normal so we look through from the other direction.
    let d = -Vec3.dot(va, dst.normal);
    let viewNormal = dst.normal.copy();
    let viewRight = dstRight.copy();
    if (d < 0) {
      d = -d;
      viewNormal = new Vec3([-dst.normal.x, -dst.normal.y, -dst.normal.z]);
      viewRight = new Vec3([-dstRight.x, -dstRight.y, -dstRight.z]);
    }

    // Clamp minimum distance to avoid extreme wide-angle distortion up close
    d = Math.max(d, 1.0);

    const near = d;
    const far = 1000.0;

    // Frustum extents: project portal corners onto the near plane
    // Since near == d, scale factor is 1.0
    const l = Vec3.dot(va, viewRight);
    const r = l + dst.width;
    const b = Vec3.dot(va, dst.up);
    const t = b + dst.height;

    // Build frustum projection matrix (column-major)
    const p = new Float32Array(16);
    p[0] = (2 * near) / (r - l);
    p[5] = (2 * near) / (t - b);
    p[8] = (r + l) / (r - l);
    p[9] = (t + b) / (t - b);
    p[10] = -(far + near) / (far - near);
    p[11] = -1;
    p[14] = (-2 * far * near) / (far - near);
    const proj = new Mat4(Array.from(p));

    // Build view matrix: camera axes aligned with portal frame
    // x = right, y = up, z = normal (toward viewer)
    const view = new Mat4([
      viewRight.x,
      dst.up.x,
      viewNormal.x,
      0,
      viewRight.y,
      dst.up.y,
      viewNormal.y,
      0,
      viewRight.z,
      dst.up.z,
      viewNormal.z,
      0,
      -Vec3.dot(viewRight, eyePos),
      -Vec3.dot(dst.up, eyePos),
      -Vec3.dot(viewNormal, eyePos),
      1,
    ]);

    return { view, proj };
  }

  public right(): Vec3 {
    return Vec3.cross(this.up, this.normal);
  }

  // Returns the positions of all blocks that make up this portal's interior
  // as a Float32Array suitable for instanced rendering (4 floats per block).
  public getBlockPositions(): Float32Array {
    const right = Vec3.cross(this.up, this.normal);
    const positions = new Float32Array(this.width * this.height * 4);
    let idx = 0;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        positions[idx++] = this.position.x + right.x * x + this.up.x * y;
        positions[idx++] = this.position.y + right.y * x + this.up.y * y;
        positions[idx++] = this.position.z + right.z * x + this.up.z * y;
        positions[idx++] = 0;
      }
    }
    return positions;
  }

  // Returns block count for this portal's interior.
  public numBlocks(): number {
    return this.width * this.height;
  }
}
