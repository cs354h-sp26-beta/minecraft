import { Vec2 } from "./Vec2.js";
import { epsilon } from "./Constants.js";

/**
 * A 2x2 Matrix of numbers.
 */
export class Mat2 {
  /** 
   * The identity matrix where the diagonal is 1s
   * and the off diagonals are 0s
   */
  public static readonly identity = new Mat2().setIdentity();

  /**
   * Computes the matrix product m1 * m2 and puts the result
   * in result.
   */
  public static product(m1: Mat2, m2: Mat2, dest?: Mat2): Mat2 {
    if (!dest) {
      dest = new Mat2();
    }

    const a00 = m1.at(0);
    const a01 = m1.at(2);
    const a10 = m1.at(1);
    const a11 = m1.at(3);

    dest.init([
      a00 * m2.at(0) + a01 * m2.at(1),
      a10 * m2.at(0) + a11 * m2.at(1),
      a00 * m2.at(2) + a01 * m2.at(3),
      a10 * m2.at(2) + a11 * m2.at(3)
    ]);

    return dest;
  }

  private values = new Float32Array(4);

  /**
   * Creates a new Mat2 initialized to the given
   * values. If values is not provided then the Mat2
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
   * +-------+
   * | 0 | 2 |
   * +-------+
   * | 1 | 3 |
   * +-------+
   */
  public at(index: number): number {
    return this.values[index];
  }

  /**
   * Sets the elements of the matrix to 
   * the given values.
   */
  public init(values: number[]): Mat2 {
    for (let i = 0; i < 4; i++) {
      this.values[i] = values[i];
    }

    return this;
  }

  /**
   * Sets the elements of the matrix
   * to all 0s.
   */
  public reset(): void {
    for (let i = 0; i < 4; i++) {
      this.values[i] = 0;
    }
  }

  /**
   * Copies the matrix into dest. If dest
   * is not provided then a new Mat2 is created
   * and returned.
   */
  public copy(dest?: Mat2): Mat2 {
    if (!dest) {
      dest = new Mat2();
    }

    for (let i = 0; i < 4; i++) {
      dest.values[i] = this.values[i];
    }

    return dest;
  }

  /**
   * Returns a flat array of all the elements.
   */
  public all(): number[] {
    const data: number[] = [];
    for (let i = 0; i < 4; i++) {
      data[i] = this.values[i];
    }

    return data;
  }

  /**
   * Returns the i'th row.
   */
  public row(index: number): number[] {
    return [this.values[index], this.values[index + 2]];
  }

  /**
   * Returns the i'th column.
   */
  public col(index: number): number[] {
    return [this.values[index * 2 + 0], this.values[index * 2 + 1]];
  }

  /**
   * Returns true if the given matrix is within the
   * threshold of this matrix. The default threshold
   * is the library's epsilon constant.
   */
  public equals(matrix: Mat2, threshold: number = epsilon): boolean {
    // TODO - why a for loop?
    for (let i = 0; i < 4; i++) {
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
    return this.values[0] * this.values[3] - this.values[2] * this.values[1];
  }

  /**
   * Sets the matrix to an identity matrix.
   */
  public setIdentity(): Mat2 {
    this.values[0] = 1;
    this.values[1] = 0;
    this.values[2] = 0;
    this.values[3] = 1;

    return this;
  }

  /**
   * Computes the transpose of the matrix.
   * If dest is not provided, then the calling 
   * matrix is modified.
   */
  public transpose(dest?: Mat2): Mat2 {
    if (!dest) {
      dest = this;
    }

    const temp = this.values[1];

    dest.values[1] = this.values[2];
    dest.values[2] = temp;
    dest.values[0] = this.values[0];
    dest.values[3] = this.values[3];

    return dest;
  }

  /**
   * Computes the inverse of the matrix.
   * If dest is not provided, then the calling matrix
   * is modified.
   */
  public inverse(dest?: Mat2): Mat2 {
    if (!dest) {
      dest = this;
    }

    const det = 1.0 / this.determinant();

    // temp var for swapping
    const temp = this.values[0];

    dest.values[0] = det * this.values[3];
    dest.values[1] = det * -this.values[1];
    dest.values[2] = det * -this.values[2];
    dest.values[3] = det * temp;

    return dest;
  }

  /**
   * A post multiply of the given matrix.
   * i.e. this * matrix
   * If dest is not provided, then the calling matrix is
   * modified such that: this = this * matrix
   */
  public multiply(matrix: Mat2, dest?: Mat2): Mat2 {
    if (!dest) {
      dest = this;
    }

    const a00 = this.values[0];
    const a01 = this.values[2];
    const a10 = this.values[1];
    const a11 = this.values[3];

    dest.values[0] = a00 * matrix.at(0) + a01 * matrix.at(1);
    dest.values[1] = a10 * matrix.at(0) + a11 * matrix.at(1);
    dest.values[2] = a00 * matrix.at(2) + a01 * matrix.at(3);
    dest.values[3] = a10 * matrix.at(2) + a11 * matrix.at(3);

    return dest;
  }

  /**
   * Multiplies this vector by the Matrix such as M * v.
   * If dest is not provided, then a new Vec2 is created
   * and returned. 
   */
  public multiplyVec2(vector: Vec2, dest?: Vec2): Vec2 {
    if (!dest) {
      dest = new Vec2();
    }

    const x = vector.x;
    const y = vector.y;

    dest.xy = [
      x * this.values[0] + y * this.values[2],
      x * this.values[1] + y * this.values[3]
    ];
    
    return dest;
  }

  /**
   * Rotates the matrix by the given radians.
   * Equivalent to: this * R, where R is a pure rotation matrix from axis/angle.
   */
  public rotate(angle: number, dest?: Mat2): Mat2 {
    if (!dest) {
      dest = this;
    }

    const a00 = this.values[0];
    const a01 = this.values[2];
    const a10 = this.values[1];
    const a11 = this.values[3];

    const sin = Math.sin(angle);
    const cos = Math.cos(angle);

    dest.values[0] = a00 *  cos + a01 * sin;
    dest.values[1] = a10 *  cos + a11 * sin;
    dest.values[2] = a00 * -sin + a01 * cos;
    dest.values[3] = a10 * -sin + a11 * cos;

    return dest;
  }

  /**
   * Scales the matrix such that 1st column is scaled
   * by the first element of the vector etc.
   * Equivalent to: this * S, where S is a pure scale matrix with diagonal values from vector
   */
  public scale(vector: Vec2, dest?: Mat2): Mat2 {
    if (!dest) {
      dest = this;
    }
    
    const a00 = this.values[0];
    const a10 = this.values[1];
    const a01 = this.values[2];
    const a11 = this.values[3];

    const x = vector.x;
    const y = vector.y;

    dest.values[0] = a00 * x;
    dest.values[1] = a10 * x;
    dest.values[2] = a01 * y;
    dest.values[3] = a11 * y;

    return dest;
  }
}
