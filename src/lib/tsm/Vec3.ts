import { epsilon } from "./Constants.js";
import { Mat3 } from "./Mat3.js";
import { Quat } from "./Quat.js";

/**
 * A 3x1 Vector of numbers.
 */
export class Vec3 {

  /**
   * Swizzle operators.
   */

  set x(value: number) {
    this.values[0] = value;
  }

  get x(): number {
    return this.values[0];
  }

  set y(value: number) {
    this.values[1] = value;
  }

  get y(): number {
    return this.values[1];
  }

  set z(value: number) {
    this.values[2] = value;
  }

  get z(): number {
    return this.values[2];
  }

  set xy(values: [number, number]) {
    this.values[0] = values[0];
    this.values[1] = values[1];
  }

  get xy(): [number, number] {
    return [this.values[0], this.values[1]];
  }

  set xyz(values: [number, number, number]) {
    this.values[0] = values[0];
    this.values[1] = values[1];
    this.values[2] = values[2];
  }

  get xyz(): [number, number, number] {
    return [this.values[0], this.values[1], this.values[2]];
  }

  /** Every element is 0. */
  public static readonly zero = new Vec3([0, 0, 0]);
  /** Every element is 1. */
  public static readonly one = new Vec3([1, 1, 1]);

  /** y element is 1. */
  public static readonly up = new Vec3([0, 1, 0]);
  /** x element is 1. */
  public static readonly right = new Vec3([1, 0, 0]);
  /** z element is 1. */
  public static readonly forward = new Vec3([0, 0, 1]);

  /**
   * Computes the cross product of the vectors: vector x vector2.
   * The result is placed in dest. If dest is not supplied then 
   * a new Vec3 is created and returned with the result.
   */
  public static cross(vector: Vec3, vector2: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    const x2 = vector2.x;
    const y2 = vector2.y;
    const z2 = vector2.z;

    dest.x = y * z2 - z * y2;
    dest.y = z * x2 - x * z2;
    dest.z = x * y2 - y * x2;

    return dest;
  }

  /**
   * Computes the dot product of the two vectors: vector * vector2. 
   */
  public static dot(vector: Vec3, vector2: Vec3): number {
    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    const x2 = vector2.x;
    const y2 = vector2.y;
    const z2 = vector2.z;

    return x * x2 + y * y2 + z * z2;
  }

  /**
   * Computes the head to head distance between the vectors. 
   */
  public static distance(vector: Vec3, vector2: Vec3): number {
    return Math.sqrt(this.squaredDistance(vector, vector2));
  }

  /**
   * Computes the square of the head to head distance between the vectors. 
   */
  public static squaredDistance(vector: Vec3, vector2: Vec3): number {
    const x = vector2.x - vector.x;
    const y = vector2.y - vector.y;
    const z = vector2.z - vector.z;

    return x * x + y * y + z * z;
  }

  /**
   * Returns a unit vector in the direction from vector2 to vector and puts
   * the result in dest. If dest is not provided then a new Vec3 is created
   * and returned.
   */
  public static direction(vector: Vec3, vector2: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    const x = vector.x - vector2.x;
    const y = vector.y - vector2.y;
    const z = vector.z - vector2.z;

    let length = Math.sqrt(x * x + y * y + z * z);

    if (length === 0) {
      dest.x = 0;
      dest.y = 0;
      dest.z = 0;

      return dest;
    }

    length = 1 / length;

    dest.x = x * length;
    dest.y = y * length;
    dest.z = z * length;

    return dest;
  }

  /**
   * Performs a linear interpolation between the two vectors.
   * If time == 0, you get the equivalent of vector. 
   * If time == 1, you get the equivalent of vector2.
   * Otherwise, it is an interpolation from vector to vector2.
   * The result is put into dest. If dest is not provided then
   * a new Vec4 is created and returned.
   */
  public static lerp(
    vector: Vec3,
    vector2: Vec3,
    time: number,
    dest?: Vec3
  ): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    dest.x = vector.x + time * (vector2.x - vector.x);
    dest.y = vector.y + time * (vector2.y - vector.y);
    dest.z = vector.z + time * (vector2.z - vector.z);

    return dest;
  }

  /**
   * Computes the sum of the two vectors and puts the result in dest.
   * If dest is not provided then a new Vec3 is created and returned.
   */
  public static sum(vector: Vec3, vector2: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    dest.x = vector.x + vector2.x;
    dest.y = vector.y + vector2.y;
    dest.z = vector.z + vector2.z;

    return dest;
  }

  /**
   * Computes the difference of the two vectors and puts the result in dest.
   * If dest is not provided then a new Vec3 is created and returned.
   */
  public static difference(vector: Vec3, vector2: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    dest.x = vector.x - vector2.x;
    dest.y = vector.y - vector2.y;
    dest.z = vector.z - vector2.z;

    return dest;
  }

  /**
   * Computes the element wise product and puts the result in dest.
   * If dest is not provided then a new Vec3 is created and returned.
   */
  public static product(vector: Vec3, vector2: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    dest.x = vector.x * vector2.x;
    dest.y = vector.y * vector2.y;
    dest.z = vector.z * vector2.z;

    return dest;
  }

  /**
   * Computes the element wise quotient and puts the result in dest.
   * If dest is not provided then a new Vec3 is created and returned.
   */
  public static quotient(vector: Vec3, vector2: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    dest.x = vector.x / vector2.x;
    dest.y = vector.y / vector2.y;
    dest.z = vector.z / vector2.z;

    return dest;
  }

  private values = new Float32Array(3);

  /** 
   * Creates a new Vec3. If values is provided then the Vec3
   * is initialized to those values, otherwise, the Vec3 is
   * initialized with all zeros. 
   */
  constructor(values?: [number, number, number]) {
    if (values !== undefined) {
      this.xyz = values;
    }
  }

  /**
   * Returns the element at the given index.
   */
  public at(index: number): number {
    return this.values[index];
  }

  /**
   * Sets all elements to 0.
   */
  public reset(): void {
    this.x = 0;
    this.y = 0;
    this.z = 0;
  }

  /**
   * Copies the calling Vec3 into dest.
   * If dest is not provided then a new Vec3 is created.
   * Returns the copied Vec3.
   */
  public copy(dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    dest.x = this.x;
    dest.y = this.y;
    dest.z = this.z;

    return dest;
  }

  /**
   * Negates every element.
   * If dest is provided then the result is placed into dest. 
   * Otherwise, the calling Vec3 is modified.
   */
  public negate(dest?: Vec3): Vec3 {
    if (!dest) {
      dest = this;
    }

    dest.x = -this.x;
    dest.y = -this.y;
    dest.z = -this.z;

    return dest;
  }

  /**
   * Returns a boolean if each element of the given vector
   * is within the threshold of the calling vector.
   * Threshold defaults to the library's epsilon constant. 
   */
  public equals(vector: Vec3, threshold = epsilon): boolean {
    if (Math.abs(this.x - vector.x) > threshold) {
      return false;
    }

    if (Math.abs(this.y - vector.y) > threshold) {
      return false;
    }

    if (Math.abs(this.z - vector.z) > threshold) {
      return false;
    }

    return true;
  }

  /**
   * Returns the length of the vector.
   */
  public length(): number {
    return Math.sqrt(this.squaredLength());
  }

  /**
   * Returns the square of the length of the vector.
   */
  public squaredLength(): number {
    const x = this.x;
    const y = this.y;
    const z = this.z;

    return x * x + y * y + z * z;
  }

  /**
   * Adds the given vector to the calling vector.
   * If dest is not provided then the calling vector is modified.
   */
  public add(vector: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x + vector.x;
    dest.y = this.y + vector.y;
    dest.z = this.z + vector.z;

    return dest;
  }

  /**
   * Subtracts the given vector from the calling vector.
   * If dest is not provided then the calling vector is modified.
   */
  public subtract(vector: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x - vector.x;
    dest.y = this.y - vector.y;
    dest.z = this.z - vector.z;

    return dest;
  }

  /**
   * Element wise product.
   * If dest is not provided then the calling vector is modified.
   */
  public multiply(vector: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x * vector.x;
    dest.y = this.y * vector.y;
    dest.z = this.z * vector.z;

    return dest;
  }

  /**
   * Element wise division.
   * If dest is not provided then the calling vector is modified.
   */
  public divide(vector: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x / vector.x;
    dest.y = this.y / vector.y;
    dest.z = this.z / vector.z;

    return dest;
  }

  /**
   * Scales this vector by multiplying each element
   * by the given value. If dest is provided then
   * the result is placed in dest and the calling Vec3
   * is not modified.
   */
  public scale(value: number, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x * value;
    dest.y = this.y * value;
    dest.z = this.z * value;

    return dest;
  }

  /**
   * Normalizes the Vec3 so that the length is 1.
   * If dest is provided then the result is placed
   * in dest and the calling Vec3 is not modified.
   */
  public normalize(dest?: Vec3): Vec3 {
    if (!dest) {
      dest = this;
    }

    let length = this.length();

    if (length === 1) {
      dest.xyz = this.xyz;
      return dest;
    }

    if (length === 0) {
      dest.x = 0;
      dest.y = 0;
      dest.z = 0;

      return dest;
    }

    length = 1.0 / length;

    dest.x = this.x * length;
    dest.y = this.y * length;
    dest.z = this.z * length;

    return dest;
  }

  /**
   * Multiplies the vector as such: M * this.
   * If dest is not provided then the calling vector is modified
   */
  public multiplyMat3(matrix: Mat3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = this;
    }

    return matrix.multiplyVec3(this, dest);
  }

  /**
   * Performs the operation q x v x q* where q is this quaternion, v
   * is the given vector and q* is the conjugate of this quaternion.
   * This uses the Hamiltonian product where successive rotations are
   * with respect to fixed space, not relative to rotating space.
   * The result is put into dest. If dest is not provided then
   * the calling Vec3 is used as the dest.
   */
  public multiplyByQuat(Quaternion: Quat, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = this;
    }

    return Quaternion.multiplyVec3(this, dest);
  }

  // Commented out due to ambiguity.
  // /**
  //  * Converts the vector to a quaternion and places
  //  * the result in dest. If dest is not provided then
  //  * a new Quat is created and returned.
  //  */
  // public toQuat(dest?: Quat): Quat {
  //   // TODO - figure out what exactly is going on here
  //   if (!dest) {
  //     dest = new Quat();
  //   }

  //   const cx: number = Math.cos(this.x * 0.5);
  //   const sx: number = Math.sin(this.x * 0.5);

  //   const cy = Math.cos(this.y * 0.5);
  //   const sy = Math.sin(this.y * 0.5);

  //   const cz = Math.cos(this.z * 0.5);
  //   const sz = Math.sin(this.z * 0.5);

  //   dest.x = sx * cy * cz - cx * sy * sz;
  //   dest.y = cx * sy * cz + sx * cy * sz;
  //   dest.z = cx * cy * sz - sx * sy * cz;
  //   dest.w = cx * cy * cz + sx * sy * sz;

  //   return dest;
  // }
}
