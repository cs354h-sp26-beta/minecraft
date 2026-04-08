import { Mat4 } from "./Mat4.js";
import { epsilon } from "./Constants.js";

/**
 * A 4x1 Vector of numbers.
 */
export class Vec4 {
  /**
   * Swizzle operators.  
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

  get r(): number {
    return this.values[0];
  }

  get g(): number {
    return this.values[1];
  }

  get b(): number {
    return this.values[2];
  }

  get a(): number {
    return this.values[3];
  }

  get rg(): [number, number] {
    return [this.values[0], this.values[1]];
  }

  get rgb(): [number, number, number] {
    return [this.values[0], this.values[1], this.values[2]];
  }

  get rgba(): [number, number, number, number] {
    return [this.values[0], this.values[1], this.values[2], this.values[3]];
  }

  set r(value: number) {
    this.values[0] = value;
  }

  set g(value: number) {
    this.values[1] = value;
  }

  set b(value: number) {
    this.values[2] = value;
  }

  set a(value: number) {
    this.values[3] = value;
  }

  set rg(values: [number, number]) {
    this.values[0] = values[0];
    this.values[1] = values[1];
  }

  set rgb(values: [number, number, number]) {
    this.values[0] = values[0];
    this.values[1] = values[1];
    this.values[2] = values[2];
  }

  set rgba(values: [number, number, number, number]) {
    this.values[0] = values[0];
    this.values[1] = values[1];
    this.values[2] = values[2];
    this.values[3] = values[3];
  }

  /** All elements are 0 except the last element which is 1. */
  public static readonly zero = new Vec4([0, 0, 0, 1]);
  /** All elements are 1. */
  public static readonly one = new Vec4([1, 1, 1, 1]);

  /**
   * Performs a linear interpolation between the two vectors.
   * If time == 0, you get the equivalent of vector. 
   * If time == 1, you get the equivalent of vector2.
   * Otherwise, it is an interpolation from vector to vector2.
   * The result is put into dest. If dest is not provided then
   * a new Vec4 is created and returned.
   */
  public static mix(
    vector: Vec4,
    vector2: Vec4,
    time: number,
    dest?: Vec4
  ): Vec4 {
    if (!dest) {
      dest = new Vec4();
    }

    dest.x = vector.x + time * (vector2.x - vector.x);
    dest.y = vector.y + time * (vector2.y - vector.y);
    dest.z = vector.z + time * (vector2.z - vector.z);
    dest.w = vector.w + time * (vector2.w - vector.w);

    return dest;
  }

  /**
   * Computes the sum of the two vectors and puts the result into dest.
   * If dest is not provided then a new Vec4 is created.
   * Returns dest.
   */
  public static sum(vector: Vec4, vector2: Vec4, dest?: Vec4): Vec4 {
    if (!dest) {
      dest = new Vec4();
    }

    dest.x = vector.x + vector2.x;
    dest.y = vector.y + vector2.y;
    dest.z = vector.z + vector2.z;
    dest.w = vector.w + vector2.w;

    return dest;
  }

  /**
   * Finds the difference of the two vectors and puts the result in dest.
   * If dest is not provided then a new Vec4 is created.
   * Returns dest.
   */
  public static difference(vector: Vec4, vector2: Vec4, dest?: Vec4): Vec4 {
    if (!dest) {
      dest = new Vec4();
    }

    dest.x = vector.x - vector2.x;
    dest.y = vector.y - vector2.y;
    dest.z = vector.z - vector2.z;
    dest.w = vector.w - vector2.w;

    return dest;
  }

  /**
   * Finds the element wise product of the two vectors and puts the
   * result in dest. If dest is not provided then a new Vec4 is created.
   * Returns dest.
   */
  public static product(vector: Vec4, vector2: Vec4, dest?: Vec4): Vec4 {
    if (!dest) {
      dest = new Vec4();
    }

    dest.x = vector.x * vector2.x;
    dest.y = vector.y * vector2.y;
    dest.z = vector.z * vector2.z;
    dest.w = vector.w * vector2.w;

    return dest;
  }

  /**
   * Finds the element wise quotient of the two vectors and puts the
   * result in dest. If dest is not provided then a new Vec4 is created.
   * Returns dest.
   */
  public static quotient(vector: Vec4, vector2: Vec4, dest?: Vec4): Vec4 {
    if (!dest) {
      dest = new Vec4();
    }

    dest.x = vector.x / vector2.x;
    dest.y = vector.y / vector2.y;
    dest.z = vector.z / vector2.z;
    dest.w = vector.w / vector2.w;

    return dest;
  }

  private values = new Float32Array(4);

  /** 
   * Creates a new Vec4. If values is provided then the Vec4
   * is initialized to those values, otherwise, the Vec4 is
   * initialized with all zeros. 
   */
  constructor(values?: [number, number, number, number]) {
    if (values !== undefined) {
      this.xyzw = values;
    }
  }

  /** 
   * Returns the value at the given index.
   * Index must be 0, 1, 2, or 3.
   */
  public at(index: number): number {
    return this.values[index];
  }

  /**
   * Sets the Vec4 to have all zeros.
   */
  public reset(): void {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 0;
  }

  /**
   * Copies the calling Vec4 into dest.
   * If dest is not provided then a new Vec4 is created.
   * Returns the copied Vec4.
   */
  public copy(dest?: Vec4): Vec4 {
    if (!dest) {
      dest = new Vec4();
    }

    dest.x = this.x;
    dest.y = this.y;
    dest.z = this.z;
    dest.w = this.w;

    return dest;
  }

  /**
   * Negates every element.
   * If dest is provided then the result is placed into dest. 
   * Otherwise, the calling Vec4 is modified.
   */
  public negate(dest?: Vec4): Vec4 {
    if (!dest) {
      dest = this;
    }

    dest.x = -this.x;
    dest.y = -this.y;
    dest.z = -this.z;
    dest.w = -this.w;

    return dest;
  }

  /**
   * Returns a boolean if each element of the given vector
   * is within the threshold of the calling vector.
   * Threshold defaults to the library's epsilon constant. 
   */
  public equals(vector: Vec4, threshold = epsilon): boolean {
    if (Math.abs(this.x - vector.x) > threshold) {
      return false;
    }

    if (Math.abs(this.y - vector.y) > threshold) {
      return false;
    }

    if (Math.abs(this.z - vector.z) > threshold) {
      return false;
    }

    if (Math.abs(this.w - vector.w) > threshold) {
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
    const w = this.w;

    return x * x + y * y + z * z + w * w;
  }

  /**
   * Adds the given vector to the calling vector.
   * If dest is not provided then the calling vector is modified
   */
  public add(vector: Vec4 , dest?: Vec4): Vec4 {
    if (!dest) {
      dest = this;
    }

    // TODO - getters/setters are really inefficient
    dest.x = this.x + vector.x;
    dest.y = this.y + vector.y;
    dest.z = this.z + vector.z;
    dest.w = this.w + vector.w;

    return dest;
  }

  /**
   * Subtracts the given vector from the calling vector.
   * If dest is not provided then the calling vector is modified
   */
  public subtract(vector: Vec4, dest?: Vec4): Vec4 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x - vector.x;
    dest.y = this.y - vector.y;
    dest.z = this.z - vector.z;
    dest.w = this.w - vector.w;

    return dest;
  }

  /**
   * Element wise product.
   * If dest is not provided then the calling vector is modified
   */
  public multiply(vector: Vec4, dest?: Vec4): Vec4 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x * vector.x;
    dest.y = this.y * vector.y;
    dest.z = this.z * vector.z;
    dest.w = this.w * vector.w;

    return dest;
  }

  /**
   * Element wise division.
   * If dest is not provided then the calling vector is modified
   */
  public divide(vector: Vec4, dest?: Vec4): Vec4 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x / vector.x;
    dest.y = this.y / vector.y;
    dest.z = this.z / vector.z;
    dest.w = this.w / vector.w;

    return dest;
  }

  /**
   * Scales this vector by multiplying each element
   * by the given value. If dest is provided then
   * the result is placed in dest and the calling Vec4
   * is not modified.
   */
  public scale(value: number, dest?: Vec4): Vec4 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x * value;
    dest.y = this.y * value;
    dest.z = this.z * value;
    dest.w = this.w * value;

    return dest;
  }

  /**
   * Normalizes the Vec4 so that the length is 1.
   * If dest is provided then the result is placed
   * in dest and the calling Vec4 is not modified.
   */
  public normalize(dest?: Vec4): Vec4 {
    if (!dest) {
      dest = this;
    }

    let length = this.length();

    if (length === 1) {
      dest.xyzw = this.xyzw;
      return dest;
    }

    if (length === 0) {
      dest.x = 0;
      dest.y = 0;
      dest.z = 0;
      dest.w = 0;

      return dest;
    }

    length = 1.0 / length;

    dest.x = this.x * length;
    dest.y = this.y * length;
    dest.z = this.z * length;
    dest.w = this.w * length;

    return dest;
  }

  /**
   * Multiplies the vector as such: M * this.
   * If dest is not provided then the calling vector is modified
   */
  public multiplyMat4(matrix: Mat4, dest?: Vec4): Vec4 {
    if (!dest) {
      dest = this;
    }

    return matrix.multiplyVec4(this, dest);
  }
}
