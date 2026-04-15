import { Mat4, Vec3, Vec4 } from "../lib/TSM.js";

export class Portal {
  public position: Vec3; // world position of portal center
  public normal: Vec3; // which way the portal faces (unit vector)
  public up: Vec3; // up direction of the portal plane
  public width: number; // portal width in blocks
  public height: number; // portal height in blocks
  public linked: Portal | null = null;

  constructor(
    position: Vec3,
    normal: Vec3,
    up: Vec3,
    width: number,
    height: number,
  ) {
    this.position = position;
    this.normal = normal;
    this.up = up;
    this.width = width;
    this.height = height;
  }

  public link(other: Portal): void {
    this.linked = other;
    other.linked = this;
  }

  // Compute the view matrix for looking through this portal's linked destination.
  // Mirrors the player camera across the source portal and transforms to the destination.
  public computePortalView(playerPos: Vec3): Mat4 | null {
    if (!this.linked) return null;

    const src = this;
    const dst = this.linked;

    // Player position relative to source portal
    const relPos = new Vec3([
      playerPos.x - src.position.x,
      playerPos.y - src.position.y,
      playerPos.z - src.position.z,
    ]);

    // Mirror across source portal plane (reflect along normal)
    const dotN = Vec3.dot(relPos, src.normal);
    const mirrored = new Vec3([
      relPos.x - 2 * dotN * src.normal.x,
      relPos.y - 2 * dotN * src.normal.y,
      relPos.z - 2 * dotN * src.normal.z,
    ]);

    // 3. Build rotation from source's local frame to destination's local frame
    const srcRight = Vec3.cross(src.up, src.normal);
    const dstRight = Vec3.cross(dst.up, dst.normal);

    const srcBasis = new Mat4([
      // RIGHT
      srcRight.x,
      srcRight.y,
      srcRight.z,
      0,
      // UP
      src.up.x,
      src.up.y,
      src.up.z,
      0,
      // NORMAL
      src.normal.x,
      src.normal.y,
      src.normal.z,
      0,
      // translation
      0,
      0,
      0,
      1,
    ]);

    // Destination basis matrix (columns: -right, up, -normal) — flipped to face into the portal
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

    // Rotation = dstBasis * srcBasis^T (srcBasis is orthonormal, so inverse = transpose)
    const srcBasisT = srcBasis.copy().transpose();
    const rotation = dstBasis.copy().multiply(srcBasisT);

    // 4. Rotate the mirrored offset and translate to destination
    const rotatedOffset = rotation.multiplyVec3(mirrored);
    const portalCamPos = new Vec3([
      dst.position.x + rotatedOffset.x,
      dst.position.y + rotatedOffset.y,
      dst.position.z + rotatedOffset.z,
    ]);

    // 5. Portal camera looks toward the destination portal center (window behavior).
    //    Parallax comes from the eye position offset, not from head rotation.
    const portalCenter = new Vec3([
      dst.position.x + dst.up.x * (dst.height / 2),
      dst.position.y + dst.up.y * (dst.height / 2),
      dst.position.z + dst.up.z * (dst.height / 2),
    ]);

    return Mat4.lookAt(portalCamPos, portalCenter, dst.up);
  }

  // Compute an oblique projection matrix that clips at the destination portal plane.
  // This prevents rendering geometry behind the portal.
  // math follows https://terathon.com/lengyel/Lengyel-Oblique.pdf
  public computeObliqueProj(projMatrix: Mat4, viewMatrix: Mat4): Mat4 {
    if (!this.linked) return projMatrix.copy();

    const dst = this.linked;

    const d = Vec3.dot(dst.normal, dst.position);
    // clip plane equation in world space: ax + by + cz + d = 0
    const planeWorld = new Vec4([dst.normal.x, dst.normal.y, dst.normal.z, -d]);

    const viewInvT = viewMatrix.copy().inverse().transpose();
    // plane equation in view space: ax + by + cz + d = 0
    const planeView = viewInvT.multiplyVec4(planeWorld);

    const proj = projMatrix.copy();
    const projVals = proj.all();

    // Take 3rd row and replace values with scaled values from clip plane
    const qx = (Math.sign(planeView.x) + projVals[8]) / projVals[0];
    const qy = (Math.sign(planeView.y) + projVals[9]) / projVals[5];
    const qz = -1.0;
    const qw = (1.0 + projVals[10]) / projVals[14];

    const dotQC =
      planeView.x * qx + planeView.y * qy + planeView.z * qz + planeView.w * qw;
    const scale = 2.0 / dotQC;

    projVals[2] = planeView.x * scale;
    projVals[6] = planeView.y * scale;
    projVals[10] = planeView.z * scale + 1.0;
    projVals[14] = planeView.w * scale;

    return new Mat4(projVals);
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
