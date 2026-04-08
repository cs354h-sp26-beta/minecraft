import { Debugger } from "../webglutils/Debugging.js";

import { Mat4 } from "./Mat4.js";
import { Quat } from "./Quat.js";
import { Vec2 } from "./Vec2.js";
import { Vec3 } from "./Vec3.js";
import { epsilon } from "./Constants.js";

/**
 * A 3x3 Matrix of numbers.
 */
export class Mat3 {
  /** 
   * The identity matrix where the diagonal is 1s
   * and the off diagonals are 0s
   */
  public static readonly identity = new Mat3().setIdentity();

  /**
   * Computes the matrix product m1 * m2 and puts the result
   * in dest. If dest is not provided then a new Mat3 is created
   * and returned 
   */
  public static product(m1: Mat3, m2: Mat3, dest?: Mat3): Mat3 {
    if (! dest) {
      dest = new Mat3();
    }

    const a00 = m1.values[0];
    const a01 = m1.values[3];
    const a02 = m1.values[6];
    const a10 = m1.values[1];
    const a11 = m1.values[4];
    const a12 = m1.values[7];
    const a20 = m1.values[2];
    const a21 = m1.values[5];
    const a22 = m1.values[8];

    const b00 = m2.values[0];
    const b01 = m2.values[3];
    const b02 = m2.values[6];
    const b10 = m2.values[1];
    const b11 = m2.values[4];
    const b12 = m2.values[7];
    const b20 = m2.values[2];
    const b21 = m2.values[5];
    const b22 = m2.values[8];

    dest.init([
      a00 * b00 + a01 * b10 + a02 * b20,
      a10 * b00 + a11 * b10 + a12 * b20,
      a20 * b00 + a21 * b10 + a22 * b20,

      a00 * b01 + a01 * b11 + a02 * b21,
      a10 * b01 + a11 * b11 + a12 * b21,
      a20 * b01 + a21 * b11 + a22 * b21,

      a00 * b02 + a01 * b12 + a02 * b22,
      a10 * b02 + a11 * b12 + a12 * b22,
      a20 * b02 + a21 * b12 + a22 * b22,
    ]);

    return dest;
  }

  private values = new Float32Array(9);

  /**
   * Creates a new Mat3 initialized to the given
   * values. If values is not provided then the Mat3
   * is initialized to all zeros.
   */
  constructor(values?: number[]) {
    if (values !== undefined) {
      this.init(values);
    }
  }

  /**
   * Returns the element at the given index.
   * The matrix layout:
   * +-----------+
   * | 0 | 3 | 6 |
   * +-----------+
   * | 1 | 4 | 7 |
   * +-----------+
   * | 2 | 5 | 8 |
   * +-----------+
   */
  public at(index: number): number {
    return this.values[index];
  }

  /**
   * Sets the elements of the matrix to 
   * the given values.
   */
  public init(values: number[]): Mat3 {
    for (let i = 0; i < 9; i++) {
      this.values[i] = values[i];
    }

    return this;
  }

  /**
   * Sets the elements of the matrix
   * to all 0s.
   */
  public reset(): void {
    for (let i = 0; i < 9; i++) {
      this.values[i] = 0;
    }
  }

  /**
   * Copies the matrix into dest. If dest
   * is not provided then a new Mat3 is created
   * and returned.
   */
  public copy(dest?: Mat3): Mat3 {
    if (!dest) {
      dest = new Mat3();
    }

    for (let i = 0; i < 9; i++) {
      dest.values[i] = this.values[i];
    }

    return dest;
  }

  /**
   * Returns a flat array of all the elements.
   */
  public all(): number[] {
    const data: number[] = [];
    for (let i = 0; i < 9; i++) {
      data[i] = this.values[i];
    }

    return data;
  }

  /**
   * Returns the i'th row.
   */
  public row(index: number): number[] {
    return [
      this.values[index],
      this.values[index + 3],
      this.values[index + 6]
    ];
  }

  /**
   * Returns the i'th column.
   */
  public col(index: number): number[] {
    return [
      this.values[index * 3], 
      this.values[index * 3 + 1], 
      this.values[index * 3 + 2]
    ];
  }

  /**
   * Returns true if the given matrix is within the
   * threshold of this matrix. The default threshold
   * is the library's epsilon constant.
   */
  public equals(matrix: Mat3, threshold = epsilon): boolean {
    for (let i = 0; i < 9; i++) {
      if (Math.abs(this.values[i] - matrix.at(i)) > threshold) {
        return false;
      }
    }

    return true;
  }

  /**
   * Computes the determinant of the matrix.
   */
  public determinant(): number {
    const a00 = this.values[0];
    const a01 = this.values[3];
    const a02 = this.values[6];
    const a10 = this.values[1];
    const a11 = this.values[4];
    const a12 = this.values[7];
    const a20 = this.values[2];
    const a21 = this.values[5];
    const a22 = this.values[8];

    const det01 = a22 * a11 - a12 * a21;
    const det11 = -a22 * a10 + a12 * a20;
    const det21 = a21 * a10 - a11 * a20;

    return a00 * det01 + a01 * det11 + a02 * det21;
  }

  /**
   * Sets the matrix to an identity matrix.
   */
  public setIdentity(): Mat3 {
    this.values[0] = 1;
    this.values[1] = 0;
    this.values[2] = 0;
    this.values[3] = 0;
    this.values[4] = 1;
    this.values[5] = 0;
    this.values[6] = 0;
    this.values[7] = 0;
    this.values[8] = 1;

    return this;
  }

  /**
   * Computes the transpose of the matrix and puts
   * the result in dest. If dest is not provided
   * then the calling matrix is modified.
   */
  public transpose(dest?: Mat3): Mat3 {
    if (!dest) {
      dest = this;
    }

    const temp01 = this.values[1];
    const temp02 = this.values[2];
    const temp12 = this.values[5];

    dest.values[0] = this.values[0];
    dest.values[1] = this.values[3];
    dest.values[2] = this.values[6];
    dest.values[3] = temp01;
    dest.values[4] = this.values[4];
    dest.values[5] = this.values[7];
    dest.values[6] = temp02;
    dest.values[7] = temp12;
    dest.values[8] = this.values[8];

    return dest;
  }

  /**
   * Computes the inverse of the matrix.
   * If dest is not provided then the calling
   * matrix is modified
   */
  public inverse(dest?: Mat3): Mat3 {
    if (!dest) {
      dest = this;
    }

    const a00 = this.values[0];
    const a01 = this.values[3];
    const a02 = this.values[6];
    const a10 = this.values[1];
    const a11 = this.values[4];
    const a12 = this.values[7];
    const a20 = this.values[2];
    const a21 = this.values[5];
    const a22 = this.values[8];

    const det01 = a22 * a11 - a12 * a21;
    const det11 = -a22 * a10 + a12 * a20;
    const det21 = a21 * a10 - a11 * a20;

    const det = 1.0 / (a00 * det01 + a01 * det11 + a02 * det21);

    dest.values[0] = det01 * det;
    dest.values[3] = (-a22 * a01 + a02 * a21) * det;
    dest.values[6] = (a12 * a01 - a02 * a11) * det;
    dest.values[1] = det11 * det;
    dest.values[4] = (a22 * a00 - a02 * a20) * det;
    dest.values[7] = (-a12 * a00 + a02 * a10) * det;
    dest.values[2] = det21 * det;
    dest.values[5] = (-a21 * a00 + a01 * a20) * det;
    dest.values[8] = (a11 * a00 - a01 * a10) * det;

    return dest;
  }

  /**
   * Computes the matrix multiplication of this * matrix.
   * If dest is not provided then the calling matrix
   * is modified.
   */
  public multiply(matrix: Mat3, dest?: Mat3): Mat3 {
    if (!dest) {
      dest = this;
    }

    const a00 = this.values[0];
    const a01 = this.values[3];
    const a02 = this.values[6];
    const a10 = this.values[1];
    const a11 = this.values[4];
    const a12 = this.values[7];
    const a20 = this.values[2];
    const a21 = this.values[5];
    const a22 = this.values[8];

    const b00 = matrix.values[0];
    const b01 = matrix.values[3];
    const b02 = matrix.values[6];
    const b10 = matrix.values[1];
    const b11 = matrix.values[4];
    const b12 = matrix.values[7];
    const b20 = matrix.values[2];
    const b21 = matrix.values[5];
    const b22 = matrix.values[8];

    dest.values[0] = a00 * b00 + a01 * b10 + a02 * b20;
    dest.values[1] = a10 * b00 + a11 * b10 + a12 * b20;
    dest.values[2] = a20 * b00 + a21 * b10 + a22 * b20;
    
    dest.values[3] = a00 * b01 + a01 * b11 + a02 * b21;
    dest.values[4] = a10 * b01 + a11 * b11 + a12 * b21;
    dest.values[5] = a20 * b01 + a21 * b11 + a22 * b21;

    dest.values[6] = a00 * b02 + a01 * b12 + a02 * b22;
    dest.values[7] = a10 * b02 + a11 * b12 + a12 * b22;
    dest.values[8] = a20 * b02 + a21 * b12 + a22 * b22;

    return dest;
  }

  /**
   * Mutliplies the vector as such: M * v
   * Puts the result into dest. If dest is not provided
   * then a new Vec2 is created and returned.
   * Treats the Vec2 as a Vec3 but with a 1 as the third component.
   * Only returns the Vec2 portion of the result.
   */
  public multiplyVec2(vector: Vec2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = new Vec2();
    }

    const x = vector.x;
    const y = vector.y;

    dest.xy = [
      x * this.values[0] + y * this.values[3] + this.values[6],
      x * this.values[1] + y * this.values[4] + this.values[7]
    ];

    return dest;
  }

  /**
   * Mutliplies the vector as such: M * v
   * Puts the result into dest. If dest is not provided
   * then a new Vec3 is created and returned.
   */
  public multiplyVec3(vector: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    dest.xyz = [
      x * this.values[0] + y * this.values[3] + z * this.values[6],
      x * this.values[1] + y * this.values[4] + z * this.values[7],
      x * this.values[2] + y * this.values[5] + z * this.values[8]
    ];

    return dest;
  }

  /**
   * Creates a Mat4 from this Mat3 and puts the result
   * in dest. If dest is not provided then a new Mat4 is
   * created and returned. All extra elements in the new 
   * Mat4 are zero except for the bottom right element which
   * is 1. 
   */
  public toMat4(dest?: Mat4): Mat4 {
    if (!dest) {
      dest = new Mat4();
    }

    dest.init([
      this.values[0],
      this.values[1],
      this.values[2],
      0,
      this.values[3],
      this.values[4],
      this.values[5],
      0,
      this.values[6],
      this.values[7],
      this.values[8],
      0,
      0,
      0,
      0,
      1
    ]);

    return dest;
  }

  // TODO - why not toMat2?

  /**
   * Computes the equivalent quaternion.
   * If dest is not provided then a new Quat
   * is created and returned.
   */
  public toQuat(dest?: Quat): Quat {
    if (!dest) {
      dest = new Quat();
    }

    const m00 = this.values[0];
    const m01 = this.values[3];
    const m02 = this.values[6];
    const m10 = this.values[1];
    const m11 = this.values[4];
    const m12 = this.values[7];
    const m20 = this.values[2];
    const m21 = this.values[5];
    const m22 = this.values[8];

    const fourXSquaredMinus1 = m00 - m11 - m22;
    const fourYSquaredMinus1 = m11 - m00 - m22;
    const fourZSquaredMinus1 = m22 - m00 - m11;
    const fourWSquaredMinus1 = m00 + m11 + m22;

    let biggestIndex = 0;

    let fourBiggestSquaredMinus1 = fourWSquaredMinus1;

    if (fourXSquaredMinus1 > fourBiggestSquaredMinus1) {
      fourBiggestSquaredMinus1 = fourXSquaredMinus1;
      biggestIndex = 1;
    }

    if (fourYSquaredMinus1 > fourBiggestSquaredMinus1) {
      fourBiggestSquaredMinus1 = fourYSquaredMinus1;
      biggestIndex = 2;
    }

    if (fourZSquaredMinus1 > fourBiggestSquaredMinus1) {
      fourBiggestSquaredMinus1 = fourZSquaredMinus1;
      biggestIndex = 3;
    }

    const biggestVal = Math.sqrt(fourBiggestSquaredMinus1 + 1) * 0.5;
    const mult = 0.25 / biggestVal;

    switch (biggestIndex) {
      case 0:
        dest.w = biggestVal;
        dest.x = (m21 - m12) * mult;
        dest.y = (m02 - m20) * mult;
        dest.z = (m10 - m01) * mult;
        break;

      case 1:
        dest.w = (m21 - m12) * mult;
        dest.x = biggestVal;
        dest.y = (m01 + m10) * mult;
        dest.z = (m20 + m02) * mult;
        break;

      case 2:
        dest.w = (m02 - m20) * mult;
        dest.x = (m01 + m10) * mult;
        dest.y = biggestVal;
        dest.z = (m12 + m21) * mult;
        break;

      case 3:
        dest.w = (m10 - m01) * mult;
        dest.x = (m20 + m02) * mult;
        dest.y = (m12 + m21) * mult;
        dest.z = biggestVal;
        break;
    }

    return dest;
  }

  /**
   * Rotates the matrix about the given axis.
   * Angle is in radians.
   * Equivalent to: this * R, where R is a pure rotation matrix from axis/angle
   * If dest is not provided then the calling matrix is modified
   */
  public rotate(angle: number, axis: Vec3, dest?: Mat3): Mat3 {
    if (!dest) {
      dest = this;
    }

    let x = axis.x;
    let y = axis.y;
    let z = axis.z;

    let length = Math.sqrt(x * x + y * y + z * z);

    if (length !== 1) {
      length = 1 / length;
      x *= length;
      y *= length;
      z *= length;
    }

    const s = Math.sin(angle);
    const c = Math.cos(angle);

    const t = 1.0 - c;

    const a00 = this.values[0];
    const a10 = this.values[1];
    const a20 = this.values[2];
    const a01 = this.values[3];
    const a11 = this.values[4];
    const a21 = this.values[5];
    const a02 = this.values[6];
    const a12 = this.values[7];
    const a22 = this.values[8];

    const b00 = x * x * t + c;
    const b01 = y * x * t - z * s;
    const b02 = z * x * t + y * s;
    const b10 = x * y * t + z * s;
    const b11 = y * y * t + c;
    const b12 = z * y * t - x * s;
    const b20 = x * z * t - y * s;
    const b21 = y * z * t + x * s;
    const b22 = z * z * t + c;

    dest.values[0] = a00 * b00 + a01 * b10 + a02 * b20;
    dest.values[1] = a10 * b00 + a11 * b10 + a12 * b20;
    dest.values[2] = a20 * b00 + a21 * b10 + a22 * b20;
    
    dest.values[3] = a00 * b01 + a01 * b11 + a02 * b21;
    dest.values[4] = a10 * b01 + a11 * b11 + a12 * b21;
    dest.values[5] = a20 * b01 + a21 * b11 + a22 * b21;

    dest.values[6] = a00 * b02 + a01 * b12 + a02 * b22;
    dest.values[7] = a10 * b02 + a11 * b12 + a12 * b22;
    dest.values[8] = a20 * b02 + a21 * b12 + a22 * b22;
    
    return dest;
  }

  /**
   * Scales the matrix by the given vector.
   * Equivalent to this * S, where S is a pure scale matrix with diagonal
   * elements from vector.
   * If dest is not provided then the calling matrix is modified.
   */
  public scale(vector: Vec3, dest?: Mat3): Mat3 {
    if (!dest) {
      dest = this;
    }

    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    dest.values[0] = this.values[0] * x;
    dest.values[1] = this.values[1] * x;
    dest.values[2] = this.values[2] * x;

    dest.values[3] = this.values[3] * y;
    dest.values[4] = this.values[4] * y;
    dest.values[5] = this.values[5] * y;

    dest.values[6] = this.values[6] * z;
    dest.values[7] = this.values[7] * z;
    dest.values[8] = this.values[8] * z;

    return dest;
  }
}
