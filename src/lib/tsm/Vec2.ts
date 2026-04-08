import { Mat2 } from "./Mat2.js";
import { Mat3 } from "./Mat3.js";
import { Vec3 } from "./Vec3.js";
import { epsilon } from "./Constants.js";


/**
 * A 2x1 Vector of numbers.
 */
export class Vec2 {
  
  /**
   * Swizzle Operators
   */
  
  get x(): number {
    return this.values[0];
  }

  get y(): number {
    return this.values[1];
  }

  get xy(): [number, number] {
    return [this.values[0], this.values[1]];
  }

  set x(value: number) {
    this.values[0] = value;
  }

  set y(value: number) {
    this.values[1] = value;
  }

  set xy(values: [number, number]) {
    this.values[0] = values[0];
    this.values[1] = values[1];
  }

  /** All elements are 0. */
  public static readonly zero = new Vec2([0, 0]);
  /** All elements are 1. */
  public static readonly one = new Vec2([1, 1]);

  /**
   * Computes the cross product the two vectors as if they were
   * Vec3s with a 0 z component. Places result in dest. If dest
   * is not provided then a new Vec3 is created and returned.
   */
  public static cross(vector: Vec2, vector2: Vec2, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    const x = vector.x;
    const y = vector.y;

    const x2 = vector2.x;
    const y2 = vector2.y;

    const z = x * y2 - y * x2;

    dest.x = 0;
    dest.y = 0;
    dest.z = z;

    return dest;
  }

  /** 
   * Computes the dot product of the two vectors
   */
  public static dot(vector: Vec2, vector2: Vec2): number {
    return vector.x * vector2.x + vector.y * vector2.y;
  }

  /**
   * Computes the head to head distance from vector to vector2 
   */
  public static distance(vector: Vec2, vector2: Vec2): number {
    return Math.sqrt(this.squaredDistance(vector, vector2));
  }

  /**
   * Computes the square of the head to head distance from
   * vector to vector2. 
   */
  public static squaredDistance(vector: Vec2, vector2: Vec2): number {
    const x = vector2.x - vector.x;
    const y = vector2.y - vector.y;

    return x * x + y * y;
  }

  /**
   * Computes a unit vector in the direction from vector2 to vector.
   * Places result in dest. If dest is not provided then a new Vec2
   * is created and returned.
   */
  public static direction(vector: Vec2, vector2: Vec2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = new Vec2();
    }

    const x = vector.x - vector2.x;
    const y = vector.y - vector2.y;

    let length = Math.sqrt(x * x + y * y);

    if (length === 0) {
      dest.x = 0;
      dest.y = 0;

      return dest;
    }

    length = 1 / length;

    dest.x = x * length;
    dest.y = y * length;

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
    vector: Vec2,
    vector2: Vec2,
    time: number,
    dest?: Vec2
  ): Vec2 {
    if (!dest) {
      dest = new Vec2();
    }

    const x = vector.x;
    const y = vector.y;

    const x2 = vector2.x;
    const y2 = vector2.y;

    dest.x = x + time * (x2 - x);
    dest.y = y + time * (y2 - y);

    return dest;
  }

  /**
   * Computes the sum of the two vectors and puts the result in dest.
   * If dest is not provided then a new Vec2 is created and returned.
   */
  public static sum(vector: Vec2, vector2: Vec2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = new Vec2();
    }

    dest.x = vector.x + vector2.x;
    dest.y = vector.y + vector2.y;

    return dest;
  }

  /**
   * Computes the difference of the two vectors and puts the result in dest.
   * If dest is not provided then a new Vec2 is created and returned.
   */
  public static difference(vector: Vec2, vector2: Vec2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = new Vec2();
    }

    dest.x = vector.x - vector2.x;
    dest.y = vector.y - vector2.y;

    return dest;
  }

  /**
   * Computes the element wise product and puts the result in dest.
   * If dest is not provided then a new Vec2 is created and returned.
   */
  public static product(vector: Vec2, vector2: Vec2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = new Vec2();
    }

    dest.x = vector.x * vector2.x;
    dest.y = vector.y * vector2.y;

    return dest;
  }

  /**
   * Computes the element wise quotient and puts the result in dest.
   * If dest is not provided then a new Vec2 is created and returned.
   */
  public static quotient(vector: Vec2, vector2: Vec2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = new Vec2();
    }

    dest.x = vector.x / vector2.x;
    dest.y = vector.y / vector2.y;

    return dest;
  }

  private values = new Float32Array(2);

  /** 
   * Creates a new Vec2. If values is provided then the Vec3
   * is initialized to those values, otherwise, the Vec3 is
   * initialized with all zeros. 
   */
  constructor(values?: [number, number]) {
    if (values !== undefined) {
      this.xy = values;
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
  }

  /**
   * Copies the calling Vec2 into dest.
   * If dest is not provided then a new Vec2 is created.
   * Returns the copied Vec2.
   */
  public copy(dest?: Vec2): Vec2 {
    if (!dest) {
      dest = new Vec2();
    }

    dest.x = this.x;
    dest.y = this.y;

    return dest;
  }

  /**
   * Negates every element.
   * If dest is provided then the result is placed into dest. 
   * Otherwise, the calling Vec2 is modified.
   */
  public negate(dest?: Vec2): Vec2 {
    if (!dest) {
      dest = this;
    }

    dest.x = -this.x;
    dest.y = -this.y;

    return dest;
  }

  /**
   * Returns a boolean if each element of the given vector
   * is within the threshold of the calling vector.
   * Threshold defaults to the library's epsilon constant. 
   */
  public equals(vector: Vec2, threshold = epsilon): boolean {
    if (Math.abs(this.x - vector.x) > threshold) {
      return false;
    }

    if (Math.abs(this.y - vector.y) > threshold) {
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

    return x * x + y * y;
  }

  /**
   * Adds the given vector to the calling vector.
   * If dest is not provided then the calling vector is modified
   */
  public add(vector: Vec2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x + vector.x;
    dest.y = this.y + vector.y;

    return dest;
  }

  /**
   * Subtracts the given vector from the calling vector.
   * If dest is not provided then the calling vector is modified.
   */
  public subtract(vector: Vec2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x - vector.x;
    dest.y = this.y - vector.y;

    return dest;
  }

  /**
   * Element wise product.
   * If dest is not provided then the calling vector is modified.
   */
  public multiply(vector: Vec2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x * vector.x;
    dest.y = this.y * vector.y;

    return dest;
  }

  /**
   * Element wise division.
   * If dest is not provided then the calling vector is modified.
   */
  public divide(vector: Vec2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x / vector.x;
    dest.y = this.y / vector.y;

    return dest;
  }

  /**
   * Scales this vector by multiplying each element
   * by the given value. If dest is provided then
   * the result is placed in dest and the calling Vec2
   * is not modified.
   */
  public scale(value: number, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = this;
    }

    dest.x = this.x * value;
    dest.y = this.y * value;

    return dest;
  }

  /**
   * Normalizes the Vec2 so that the length is 1.
   * If dest is provided then the result is placed
   * in dest and the calling Vec2 is not modified.
   */
  public normalize(dest?: Vec2): Vec2 {
    if (!dest) {
      dest = this;
    }

    let length = this.length();

    if (length === 1) {
      dest.xy = this.xy;
      return dest;
    }

    if (length === 0) {
      dest.x = 0;
      dest.y = 0;

      return dest;
    }

    length = 1.0 / length;

    dest.x = this.x * length;
    dest.y = this.y * length;

    return dest;
  }

  /**
   * Multiplies the vector with the given matrix as such: M * this.
   * If dest is not provided then the calling vector is modified.
   */
  public multiplyMat2(matrix: Mat2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = this;
    }

    return matrix.multiplyVec2(this, dest);
  }

  /**
   * Multiplies the vector with the given matrix as such: M * [this, 1].
   * Only returns the Vec2 portion of the result.
   * If dest is not provided then the calling vector is modified.
   */
  public multiplyMat3(matrix: Mat3, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = this;
    }

    return matrix.multiplyVec2(this, dest);
  }
}
