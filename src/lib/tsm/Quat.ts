import { Mat3 } from "./Mat3.js";
import { Mat4 } from "./Mat4.js";
import { Vec3 } from "./Vec3.js";
import { epsilon } from "./Constants.js";

// TODO - getter/setters are slow!

/**
 * A 4x1 vector that represents a quaternion.
 * This library uses the convention of the scalar element
 * as the last element.
 */
export class Quat {

  /**
   * Swizzle operators
   */

  get x(): number {
    return this.values[0];
  }

  get y(): number {
    return this.values[1];
  }

  get z(): number {
    return this.values[2];
  }

  get w(): number {
    return this.values[3];
  }

  get xy(): [number, number] {
    return [this.values[0], this.values[1]];
  }

  get xyz(): [number, number, number] {
    return [this.values[0], this.values[1], this.values[2]];
  }

  get xyzw(): [number, number, number, number] {
    return [this.values[0], this.values[1], this.values[2], this.values[3]];
  }

  set x(value: number) {
    this.values[0] = value;
  }

  set y(value: number) {
    this.values[1] = value;
  }

  set z(value: number) {
    this.values[2] = value;
  }

  set w(value: number) {
    this.values[3] = value;
  }

  set xy(values: [number, number]) {
    this.values[0] = values[0];
    this.values[1] = values[1];
  }

  set xyz(values: [number, number, number]) {
    this.values[0] = values[0];
    this.values[1] = values[1];
    this.values[2] = values[2];
  }

  set xyzw(values: [number, number, number, number]) {
    this.values[0] = values[0];
    this.values[1] = values[1];
    this.values[2] = values[2];
    this.values[3] = values[3];
  }

  /**
   * The identity quaternion. The last element is a 1
   * and the other elements are 0.
   */
  public static readonly identity = new Quat().setIdentity();

  /**
   * Computes the dot product between two quaternions.
   */
  public static dot(q1: Quat, q2: Quat): number {
    return q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w;
  }

  /**
   * Computes the element wise sum between the two quaternion
   * and puts the result in dest. If dest is not provided then
   * a new quaternion is created and returned. 
   */
  public static sum(q1: Quat, q2: Quat, dest?: Quat): Quat {
    if (!dest) {
      dest = new Quat();
    }

    dest.x = q1.x + q2.x;
    dest.y = q1.y + q2.y;
    dest.z = q1.z + q2.z;
    dest.w = q1.w + q2.w;

    return dest;
  }

  /**
   * Computes the quaternion product and puts the result in dest.
   * If dest is not provided then a new quaternion is created and returned.
   */
  public static product(q1: Quat, q2: Quat, dest?: Quat): Quat {
    // TODO This is extrensic rotation but the variables are confusing.
    // Might suggest switching the variable names
    if (!dest) {
      dest = new Quat();
    }

    const q1x = q1.x;
    const q1y = q1.y;
    const q1z = q1.z;
    const q1w = q1.w;

    const q2x = q2.x;
    const q2y = q2.y;
    const q2z = q2.z;
    const q2w = q2.w;

    dest.x = q1x * q2w + q1w * q2x + q1y * q2z - q1z * q2y;
    dest.y = q1y * q2w + q1w * q2y + q1z * q2x - q1x * q2z;
    dest.z = q1z * q2w + q1w * q2z + q1x * q2y - q1y * q2x;
    dest.w = q1w * q2w - q1x * q2x - q1y * q2y - q1z * q2z;

    return dest;
  }

  // Commented out as I am not sure what it is 
  // /**
  //  * TODO - what is the difference between multiply and cross?
  //  * @param q1 
  //  * @param q2 
  //  * @param dest 
  //  */
  // public static cross(q1: Quat, q2: Quat, dest?: Quat): Quat {
  //   if (!dest) {
  //     dest = new Quat();
  //   }

  //   const q1x = q1.x;
  //   const q1y = q1.y;
  //   const q1z = q1.z;
  //   const q1w = q1.w;

  //   const q2x = q2.x;
  //   const q2y = q2.y;
  //   const q2z = q2.z;
  //   const q2w = q2.w;

  //   dest.x = q1w * q2z + q1z * q2w + q1x * q2y - q1y * q2x;
  //   dest.y = q1w * q2w - q1x * q2x - q1y * q2y - q1z * q2z;
  //   dest.z = q1w * q2x + q1x * q2w + q1y * q2z - q1z * q2y;
  //   dest.w = q1w * q2y + q1y * q2w + q1z * q2x - q1x * q2z;

  //   return dest;
  // }

  /**
   * Performs a Spherical Linear Interpolation between the two quaternions.
   * For shortest path slerp use slerpShort.
   * @param q1 first quat
   * @param q2 second quat
   * @param time interpolation amount, from 0 to 1
   * @param dest optional destination. If not provided, a new Quat is created and returned.
   */
  public static slerp(q1: Quat, q2: Quat, time: number, dest?: Quat): Quat {
    if (!dest) {
      dest = new Quat();
    }

    const cosHalfTheta = q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w;

    if (Math.abs(cosHalfTheta) >= 1.0) {
      dest.xyzw = q1.xyzw;

      return dest;
    }

    const halfTheta = Math.acos(cosHalfTheta);
    const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

    if (Math.abs(sinHalfTheta) < 0.001) {
      dest.x = q1.x * 0.5 + q2.x * 0.5;
      dest.y = q1.y * 0.5 + q2.y * 0.5;
      dest.z = q1.z * 0.5 + q2.z * 0.5;
      dest.w = q1.w * 0.5 + q2.w * 0.5;

      return dest;
    }

    const ratioA = Math.sin((1 - time) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(time * halfTheta) / sinHalfTheta;

    dest.x = q1.x * ratioA + q2.x * ratioB;
    dest.y = q1.y * ratioA + q2.y * ratioB;
    dest.z = q1.z * ratioA + q2.z * ratioB;
    dest.w = q1.w * ratioA + q2.w * ratioB;

    return dest;
  }

  /**
   * Performs a Spherical Linear Interpolation between the two quaternions.
   * Uses the shortest path between the two quaternions.
   * @param q1 first quat
   * @param q2 second quat
   * @param time interpolation amount, from 0 to 1
   * @param dest optional destination. If not provided, a new Quat is created and returned.
   */
  public static slerpShort(q1: Quat, q2: Quat, time: number, dest?: Quat): Quat {
    if (!dest) {
      dest = new Quat();
    }

    if (time <= 0.0) {
      dest.xyzw = q1.xyzw;

      return dest;
    } else if (time >= 1.0) {
      dest.xyzw = q2.xyzw;

      return dest;
    }

    let cos = Quat.dot(q1, q2);
    const q2a = q2.copy();

    if (cos < 0.0) {
      q2a.x = -q2a.x;
      q2a.y = -q2a.y;
      q2a.z = -q2a.z;
      q2a.w = -q2a.w;
      cos = -cos;
    }

    let k0: number;
    let k1: number;

    if (cos > 0.9999) {
      k0 = 1 - time;
      k1 = 0 + time;
    } else {
      const sin: number = Math.sqrt(1 - cos * cos);
      const angle: number = Math.atan2(sin, cos);

      const oneOverSin: number = 1 / sin;

      k0 = Math.sin((1 - time) * angle) * oneOverSin;
      k1 = Math.sin((0 + time) * angle) * oneOverSin;
    }

    dest.x = k0 * q1.x + k1 * q2a.x;
    dest.y = k0 * q1.y + k1 * q2a.y;
    dest.z = k0 * q1.z + k1 * q2a.z;
    dest.w = k0 * q1.w + k1 * q2a.w;

    return dest;
  }

  /**
   * Computes a quaternion from the given axis and angle.
   * If dest is not provided then a new quaternion is created and returned.
   */
  public static fromAxisAngle(axis: Vec3, angle: number, dest?: Quat): Quat {
    if (!dest) {
      dest = new Quat();
    }

    angle *= 0.5;
    const sin = Math.sin(angle);

    dest.x = axis.x * sin;
    dest.y = axis.y * sin;
    dest.z = axis.z * sin;
    dest.w = Math.cos(angle);

    return dest;
  }

  private values = new Float32Array(4);

  /**
   * Creates a new Quat initialized to the given values.
   * If values are not given then the Quat is initialized to
   * all zeros.
   */
  constructor(values?: [number, number, number, number]) {
    if (values !== undefined) {
      this.xyzw = values;
    }
  }

  /**
   * Returns the element at the given index.
   */
  public at(index: number): number {
    return this.values[index];
  }

  /**
   * Sets all the elements to zero.
   */
  public reset(): void {
    for (let i = 0; i < 4; i++) {
      this.values[i] = 0;
    }
  }

  /**
   * Copies the Quat into dest. If dest is not provided,
   * then a new Quat is created and returned.
   */
  public copy(dest?: Quat): Quat {
    if (!dest) {
      dest = new Quat();
    }

    // TODO - why a for loop when others dont have a loop?
    for (let i = 0; i < 4; i++) {
      dest.values[i] = this.values[i];
    }

    return dest;
  }

  // /**
  //  * Returns the roll angle, the angle about the z-axis, of the orientation
  //  */
  // public roll(): number {
  //   const x = this.x;
  //   const y = this.y;
  //   const z = this.z;
  //   const w = this.w;

  //   return Math.atan2(2.0 * (x * y + w * z), w * w + x * x - y * y - z * z);
  // }

  // /**
  //  * Returns the pitch, the angle about the x-axis, of the orientation
  //  */
  // public pitch(): number {
  //   const x = this.x;
  //   const y = this.y;
  //   const z = this.z;
  //   const w = this.w;

  //   return Math.atan2(2.0 * (y * z + w * x), w * w - x * x - y * y + z * z);
  // }

  // /**
  //  * Returns the yaw, the angle about the y-axs, of the orientation
  //  */
  // public yaw(): number {
  //   return Math.asin(2.0 * (this.x * this.z - this.w * this.y));
  // }

  /**
   * Returns a ture if each element of the given quaternion
   * is within the threshold of the calling quaternion.
   * Threshold defaults to the library's epsilon constant. 
   */
  public equals(vector: Quat, threshold = epsilon): boolean {
    // TODO - why a loop?
    for (let i = 0; i < 4; i++) {
      if (Math.abs(this.values[i] - vector.at(i)) > threshold) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sets the elements to zero except for the last element which
   * is 1.
   */
  public setIdentity(): Quat {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 1;

    return this;
  }

  /**
   * Computes and changes the last element based on the first three elements
   */
  public calculateW(): Quat {
    const x = this.x;
    const y = this.y;
    const z = this.z;

    this.w = Math.sqrt(Math.abs(1.0 - x * x - y * y - z * z));

    return this;
  }

  /**
   * Computes the inverse of the quaternion.
   * If dest is not provided then the calling Quat is modified
   */
  public inverse(dest?: Quat): Quat {
    if (!dest) {
      dest = this;
    }

    const dot = Quat.dot(this, this);

    if (!dot) {
      dest.xyzw = [0, 0, 0, 0];

      return dest;
    }

    const invDot = dot ? 1.0 / dot : 0;

    dest.x = this.x * -invDot;
    dest.y = this.y * -invDot;
    dest.z = this.z * -invDot;
    dest.w = this.w * invDot;

    return dest;
  }

  /**
   * Computes the conjugate of the quaternion.
   * If dest is not provided then the calling Quat
   * is modified.
   */
  public conjugate(dest?: Quat): Quat {
    if (!dest) {
      dest = this;
    }

    dest.values[0] = this.values[0] * -1;
    dest.values[1] = this.values[1] * -1;
    dest.values[2] = this.values[2] * -1;
    dest.values[3] = this.values[3];

    return dest;
  }

  /**
   * Computes the length as if it is a Vec4.
   */
  public length(): number {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    return Math.sqrt(x * x + y * y + z * z + w * w);
  }

  /**
   * Normalizes the quaternion so that the length is 1.
   * The result is placed in dest. If dest is not provided
   * then the calling vector is modified.
   */
  public normalize(dest?: Quat): Quat {
    if (!dest) {
      dest = this;
    }

    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    let length = Math.sqrt(x * x + y * y + z * z + w * w);

    if (!length) {
      dest.x = 0;
      dest.y = 0;
      dest.z = 0;
      dest.w = 0;

      return dest;
    }

    length = 1 / length;

    dest.x = x * length;
    dest.y = y * length;
    dest.z = z * length;
    dest.w = w * length;

    return dest;
  }

  /**
   * Element wise addition.
   * If dest is not provided then the calling Quat
   * is modified.
   */
  public add(other: Quat, dest?: Quat): Quat {
    if (!dest) {
      dest = this;
    }

    // TODO - why a loop?
    for (let i = 0; i < 4; i++) {
      dest.values[i] = this.values[i] + other.at(i);
    }

    return dest;
  }

  /**
   * Computes the quaternion product this * other.
   * If dest is not provided then the calling Quat is modified.
   */
  public multiply(other: Quat, dest?: Quat): Quat {
    if (!dest) {
      dest = this;
    }

    // TODO this is extrinsic rotation composition
    // but variable names confuse me. Might want to switch variable names.
    const q1x = this.values[0];
    const q1y = this.values[1];
    const q1z = this.values[2];
    const q1w = this.values[3];

    const q2x = other.x;
    const q2y = other.y;
    const q2z = other.z;
    const q2w = other.w;

    dest.x = q1x * q2w + q1w * q2x + q1y * q2z - q1z * q2y;
    dest.y = q1y * q2w + q1w * q2y + q1z * q2x - q1x * q2z;
    dest.z = q1z * q2w + q1w * q2z + q1x * q2y - q1y * q2x;
    dest.w = q1w * q2w - q1x * q2x - q1y * q2y - q1z * q2z;

    return dest;
  }

  /**
   * Performs the operation q x v x q* where q is this quaternion, v
   * is the given vector and q* is the conjugate of this quaternion.
   * This uses the Hamiltonian product where successive rotations are
   * with respect to fixed space, not relative to rotating space.
   * The result is put into dest. If dest is not provided then
   * a new Vec3 is created and returned.
   */
  public multiplyVec3(vector: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    const qx = this.x;
    const qy = this.y;
    const qz = this.z;
    const qw = this.w;

    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    dest.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    dest.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    dest.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

    return dest;
  }

  /**
   * Computes the Mat3 equivalent of this quaternion
   * and puts the result in dest. If dest is not provided
   * then a new Mat3 is created and returned.
   */
  public toMat3(dest?: Mat3): Mat3 {
    if (!dest) {
      dest = new Mat3();
    }

    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;

    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;

    dest.init([
      1 - (yy + zz),
      xy + wz,
      xz - wy,

      xy - wz,
      1 - (xx + zz),
      yz + wx,

      xz + wy,
      yz - wx,
      1 - (xx + yy)
    ]);

    return dest;
  }

  /**
   * Computes the Mat4 equivalent of this quaternion
   * and puts the result in dest. If dest is not provided
   * then a new Mat4 is created and returned.
   */
  public toMat4(dest?: Mat4): Mat4 {
    if (!dest) {
      dest = new Mat4();
    }

    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;

    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;

    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;

    dest.init([
      1 - (yy + zz),
      xy + wz,
      xz - wy,
      0,

      xy - wz,
      1 - (xx + zz),
      yz + wx,
      0,

      xz + wy,
      yz - wx,
      1 - (xx + yy),
      0,

      0,
      0,
      0,
      1
    ]);

    return dest;
  }
}
