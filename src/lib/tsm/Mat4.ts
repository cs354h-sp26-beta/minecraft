import { Mat3 } from "./Mat3.js";
import { Vec3 } from "./Vec3.js";
import { Vec4 } from "./Vec4.js";
import { epsilon } from "./Constants.js";

// TODO - define a MatArray type that better protects
// array input sizes. Similar to type of [number, number, number]
// for Vec3

/**
 * A 4x4 Matrix of numbers.
 */
export class Mat4 {
  /** 
   * The identity matrix where the diagonal is 1s
   * and the off diagonals are 0s
   */
  public static readonly identity = new Mat4().setIdentity();

  /**
   * Computes the frustrum matrix
   * @param left coordinate for the left vertical clipping plane
   * @param right coordinate for the right vertical clipping plane
   * @param bottom coordinate for the bottom horizontal clipping plane
   * @param top coordinate for the top horizontal clipping plane
   * @param near distance to the near clipping plane
   * @param far distance to the far clipping plane
   */
  public static frustum(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
    dest?: Mat4
  ): Mat4 {
    if (!dest) {
      dest = new Mat4();
    }

    const rl = right - left;
    const tb = top - bottom;
    const fn = far - near;

    return dest.init([
      (near * 2) / rl,
      0,
      0,
      0,

      0,
      (near * 2) / tb,
      0,
      0,

      (right + left) / rl,
      (top + bottom) / tb,
      -(far + near) / fn,
      -1,

      0,
      0,
      -(far * near * 2) / fn,
      0
    ]);
  }

  /**
   * Computes the perspective matrix from the given inputs.
   * @param fov the field of view in degrees
   * @param aspect the aspect ratio (width/height)
   * @param near distance to the near clipping plane
   * @param far distance to the far clipping plane
   */
  public static perspective(
    fov: number,
    aspect: number,
    near: number,
    far: number,
    dest?: Mat4
  ): Mat4 {
    if (!dest) {
      dest = new Mat4();
    }

    const top = near * Math.tan((fov * Math.PI) / 360.0);
    const right = top * aspect;

    return Mat4.frustum(-right, right, -top, top, near, far, dest);
  }

  /**
   * Creates the orthographic perspective matrix
   * @param left coordinate for the left vertical clipping plane
   * @param right coordinate for the right vertical clipping plane
   * @param bottom coordinate for the bottom horizontal clipping plane
   * @param top coordinate for the top horizontal clipping plane
   * @param near distance to the near clipping plane
   * @param far distance to the far clipping plane
   */
  public static orthographic(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
    dest?: Mat4
  ): Mat4 {
    if (!dest) {
      dest = new Mat4();
    }

    const rl = right - left;
    const tb = top - bottom;
    const fn = far - near;

    return dest.init([
      2 / rl,
      0,
      0,
      0,

      0,
      2 / tb,
      0,
      0,

      0,
      0,
      -2 / fn,
      0,

      -(left + right) / rl,
      -(top + bottom) / tb,
      -(far + near) / fn,
      1
    ]);
  }

  /**
   * Creates a view matrix.
   * @param position a vector from origin to position
   * @param target a vector from origin to target
   * @param up the up vector
   */
  public static lookAt(position: Vec3, target: Vec3, up: Vec3 = Vec3.up, dest?: Mat4): Mat4 {
    if (!dest) {
      dest = new Mat4();
    }
    
    if (position.equals(target)) {
      return dest.setIdentity();
    }

    const z = Vec3.difference(position, target).normalize();

    const x = Vec3.cross(up, z).normalize();
    const y = Vec3.cross(z, x).normalize();

    return dest.init([
      x.x,
      y.x,
      z.x,
      0,

      x.y,
      y.y,
      z.y,
      0,

      x.z,
      y.z,
      z.z,
      0,

      -Vec3.dot(x, position),
      -Vec3.dot(y, position),
      -Vec3.dot(z, position),
      1
    ]);
  }

  /**
   * Computes the matrix product m1 * m2 and puts the 
   * result in result.
   */
  public static product(m1: Mat4, m2: Mat4, dest?: Mat4): Mat4 {
    if (!dest) {
      dest = new Mat4();
    }

    const a00 = m1.at(0);
    const a01 = m1.at(4);
    const a02 = m1.at(8);
    const a03 = m1.at(12);
    const a10 = m1.at(1);
    const a11 = m1.at(5);
    const a12 = m1.at(9);
    const a13 = m1.at(13);
    const a20 = m1.at(2);
    const a21 = m1.at(6);
    const a22 = m1.at(10);
    const a23 = m1.at(14);
    const a30 = m1.at(3);
    const a31 = m1.at(7);
    const a32 = m1.at(11);
    const a33 = m1.at(15);

    const b00 = m2.at(0);
    const b01 = m2.at(4);
    const b02 = m2.at(8);
    const b03 = m2.at(12);
    const b10 = m2.at(1);
    const b11 = m2.at(5);
    const b12 = m2.at(9);
    const b13 = m2.at(13);
    const b20 = m2.at(2);
    const b21 = m2.at(6);
    const b22 = m2.at(10);
    const b23 = m2.at(14);
    const b30 = m2.at(3);
    const b31 = m2.at(7);
    const b32 = m2.at(11);
    const b33 = m2.at(15);

    dest.init([
      a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30,
      a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30,
      a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30,
      a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30,

      a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31,
      a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31,
      a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31,
      a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31,

      a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32,
      a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32,
      a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32,
      a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32,

      a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33,
      a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33,
      a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33,
      a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33
    ]);

    return dest;
  }

  private values = new Float32Array(16);

  /**
   * Creates a new Mat4 initialized to the given
   * values. If values is not provided then the Mat4
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
   * +---------------+
   * | 0 | 4 | 8 | 12|
   * +----------------
   * | 1 | 5 | 9 | 13|
   * +---------------+
   * | 2 | 6 | 10| 14|
   * +---------------+
   * | 3 | 7 | 11| 15|
   * +---------------+
   */
  public at(index: number): number {
    return this.values[index];
  }

  /**
   * Sets the elements of the matrix to 
   * the given values.
   */
  public init(values: number[]): Mat4 {
    for (let i = 0; i < 16; i++) {
      this.values[i] = values[i];
    }

    return this;
  }

  /**
   * Sets the elements of the matrix
   * to all 0s.
   */
  public reset(): void {
    for (let i = 0; i < 16; i++) {
      this.values[i] = 0;
    }
  }

  /**
   * Copies the matrix into dest. If dest
   * is not provided then a new Mat4 is created
   * and returned.
   */
  public copy(dest?: Mat4): Mat4 {
    if (!dest) {
      dest = new Mat4();
    }

    for (let i = 0; i < 16; i++) {
      dest.values[i] = this.values[i];
    }

    return dest;
  }

  /**
   * Returns a flat array of all the elements.
   */
  public all(): number[] {
    const data: number[] = [];
    for (let i = 0; i < 16; i++) {
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
      this.values[index + 4],
      this.values[index + 8],
      this.values[index + 12]
    ];
  }

  /**
   * Returns the i'th column.
   */
  public col(index: number): number[] {
    return [
      this.values[index * 4 + 0],
      this.values[index * 4 + 1],
      this.values[index * 4 + 2],
      this.values[index * 4 + 3]
    ];
  }

  /**
   * Returns true if the given matrix is within the
   * threshold of this matrix. The default threshold
   * is the library's epsilon constant.
   */
  public equals(matrix: Mat4, threshold = epsilon): boolean {
    for (let i = 0; i < 16; i++) {
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
    const a10 = this.values[1];
    const a20 = this.values[2];
    const a30 = this.values[3];
    const a01 = this.values[4];
    const a11 = this.values[5];
    const a21 = this.values[6];
    const a31 = this.values[7];
    const a02 = this.values[8];
    const a12 = this.values[9];
    const a22 = this.values[10];
    const a32 = this.values[11];
    const a03 = this.values[12];
    const a13 = this.values[13];
    const a23 = this.values[14];
    const a33 = this.values[15];

    const det00 = a00 * a11 - a01 * a10;
    const det01 = a00 * a12 - a02 * a10;
    const det02 = a00 * a13 - a03 * a10;
    const det03 = a01 * a12 - a02 * a11;
    const det04 = a01 * a13 - a03 * a11;
    const det05 = a02 * a13 - a03 * a12;
    const det06 = a20 * a31 - a21 * a30;
    const det07 = a20 * a32 - a22 * a30;
    const det08 = a20 * a33 - a23 * a30;
    const det09 = a21 * a32 - a22 * a31;
    const det10 = a21 * a33 - a23 * a31;
    const det11 = a22 * a33 - a23 * a32;

    return (
      det00 * det11 -
      det01 * det10 +
      det02 * det09 +
      det03 * det08 -
      det04 * det07 +
      det05 * det06
    );
  }

  /**
   * Sets the matrix to an identity matrix.
   */
  public setIdentity(): Mat4 {
    this.values[0] = 1;
    this.values[1] = 0;
    this.values[2] = 0;
    this.values[3] = 0;
    this.values[4] = 0;
    this.values[5] = 1;
    this.values[6] = 0;
    this.values[7] = 0;
    this.values[8] = 0;
    this.values[9] = 0;
    this.values[10] = 1;
    this.values[11] = 0;
    this.values[12] = 0;
    this.values[13] = 0;
    this.values[14] = 0;
    this.values[15] = 1;

    return this;
  }

  /**
   * Computes the transpose of the matrix.
   * If dest is not provided then the calling matrix
   * is modified.
   */
  public transpose(dest?: Mat4): Mat4 {
    if (!dest) {
      dest = this;
    }
    
    const temp01 = this.values[1];
    const temp02 = this.values[2];
    const temp03 = this.values[3];
    const temp12 = this.values[6];
    const temp13 = this.values[7];
    const temp23 = this.values[11];

    dest.values[0] = this.values[0];
    dest.values[1] = this.values[4];
    dest.values[2] = this.values[8];
    dest.values[3] = this.values[12];
    dest.values[4] = temp01;
    dest.values[5] = this.values[5];
    dest.values[6] = this.values[9];
    dest.values[7] = this.values[13];
    dest.values[8] = temp02;
    dest.values[9] = temp12;
    dest.values[10] = this.values[10];
    dest.values[11] = this.values[14];
    dest.values[12] = temp03;
    dest.values[13] = temp13;
    dest.values[14] = temp23;
    dest.values[15] = this.values[15];

    return dest;
  }

  /**
   * Computes the inverse of the matrix.
   */
  public inverse(dest?: Mat4): Mat4 {
    if (!dest) {
      dest = this;
    }

    const a00 = this.values[0];
    const a10 = this.values[1];
    const a20 = this.values[2];
    const a30 = this.values[3];
    const a01 = this.values[4];
    const a11 = this.values[5];
    const a21 = this.values[6];
    const a31 = this.values[7];
    const a02 = this.values[8];
    const a12 = this.values[9];
    const a22 = this.values[10];
    const a32 = this.values[11];
    const a03 = this.values[12];
    const a13 = this.values[13];
    const a23 = this.values[14];
    const a33 = this.values[15];

    const det00 = a00 * a11 - a01 * a10;
    const det01 = a00 * a12 - a02 * a10;
    const det02 = a00 * a13 - a03 * a10;
    const det03 = a01 * a12 - a02 * a11;
    const det04 = a01 * a13 - a03 * a11;
    const det05 = a02 * a13 - a03 * a12;
    const det06 = a20 * a31 - a21 * a30;
    const det07 = a20 * a32 - a22 * a30;
    const det08 = a20 * a33 - a23 * a30;
    const det09 = a21 * a32 - a22 * a31;
    const det10 = a21 * a33 - a23 * a31;
    const det11 = a22 * a33 - a23 * a32;

    const det =
      1.0 /
      (det00 * det11 -
        det01 * det10 +
        det02 * det09 +
        det03 * det08 -
        det04 * det07 +
        det05 * det06);

    dest.values[0] = (a11 * det11 - a12 * det10 + a13 * det09) * det;
    dest.values[4] = (-a01 * det11 + a02 * det10 - a03 * det09) * det;
    dest.values[8] = (a31 * det05 - a32 * det04 + a33 * det03) * det;
    dest.values[12] = (-a21 * det05 + a22 * det04 - a23 * det03) * det;
    dest.values[1] = (-a10 * det11 + a12 * det08 - a13 * det07) * det;
    dest.values[5] = (a00 * det11 - a02 * det08 + a03 * det07) * det;
    dest.values[9] = (-a30 * det05 + a32 * det02 - a33 * det01) * det;
    dest.values[13] = (a20 * det05 - a22 * det02 + a23 * det01) * det;
    dest.values[2] = (a10 * det10 - a11 * det08 + a13 * det06) * det;
    dest.values[6] = (-a00 * det10 + a01 * det08 - a03 * det06) * det;
    dest.values[10] = (a30 * det04 - a31 * det02 + a33 * det00) * det;
    dest.values[14] = (-a20 * det04 + a21 * det02 - a23 * det00) * det;
    dest.values[3] = (-a10 * det09 + a11 * det07 - a12 * det06) * det;
    dest.values[7] = (a00 * det09 - a01 * det07 + a02 * det06) * det;
    dest.values[11] = (-a30 * det03 + a31 * det01 - a32 * det00) * det;
    dest.values[15] = (a20 * det03 - a21 * det01 + a22 * det00) * det;

    return dest;
  }

  /**
   * Matrix multiplication of this * matrix
   * If dest is not provided then the calling matrix is modified
   */
  public multiply(matrix: Mat4, dest?: Mat4): Mat4 {
    if (!dest) {
      dest = this;
    }

    const a00 = this.values[0];
    const a10 = this.values[1];
    const a20 = this.values[2];
    const a30 = this.values[3];
    const a01 = this.values[4];
    const a11 = this.values[5];
    const a21 = this.values[6];
    const a31 = this.values[7];
    const a02 = this.values[8];
    const a12 = this.values[9];
    const a22 = this.values[10];
    const a32 = this.values[11];
    const a03 = this.values[12];
    const a13 = this.values[13];
    const a23 = this.values[14];
    const a33 = this.values[15];

    const b00 = matrix.values[0];
    const b10 = matrix.values[1];
    const b20 = matrix.values[2];
    const b30 = matrix.values[3];
    const b01 = matrix.values[4];
    const b11 = matrix.values[5];
    const b21 = matrix.values[6];
    const b31 = matrix.values[7];
    const b02 = matrix.values[8];
    const b12 = matrix.values[9];
    const b22 = matrix.values[10];
    const b32 = matrix.values[11];
    const b03 = matrix.values[12];
    const b13 = matrix.values[13];
    const b23 = matrix.values[14];
    const b33 = matrix.values[15];

    dest.values[0] = a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30;
    dest.values[1] = a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30;
    dest.values[2] = a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30;
    dest.values[3] = a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30;

    dest.values[4] = a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31;
    dest.values[5] = a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31;
    dest.values[6] = a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31;
    dest.values[7] = a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31;

    dest.values[8] = a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32;
    dest.values[9] = a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32;
    dest.values[10] = a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32;
    dest.values[11] = a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32;

    dest.values[12] = a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33;
    dest.values[13] = a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33;
    dest.values[14] = a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33;
    dest.values[15] = a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33;

    return dest;
  }
  
  /**
   * Multiplies the vector as such: this * [vector, 0].
   * i.e. treats the vector as a Vec4 with the last component of 0.
   * Returns only the Vec3 portion of the result.
   * If dest is not provided then a new Vec3 is created and returned.
   */
  public multiplyVec3(vector: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    dest.xyz = [
      this.values[0] * x +
        this.values[4] * y +
        this.values[8] * z,
      this.values[1] * x +
        this.values[5] * y +
        this.values[9] * z,
      this.values[2] * x +
        this.values[6] * y +
        this.values[10] * z
    ];

    return dest;
  }

  /**
   * Multiplies the vector as such: this * [vector, 1].
   * i.e. treats the vector as a Vec4 with the last component of 1.
   * Returns only the Vec3 portion of the result.
   * If dest is not provided then a new Vec3 is created and returned.
   */
  public multiplyPt3(vector: Vec3, dest?: Vec3): Vec3 {
    if (!dest) {
      dest = new Vec3();
    }

    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    dest.xyz = [
      this.values[0] * x +
        this.values[4] * y +
        this.values[8] * z +
        this.values[12],
      this.values[1] * x +
        this.values[5] * y +
        this.values[9] * z +
        this.values[13],
      this.values[2] * x +
        this.values[6] * y +
        this.values[10] * z +
        this.values[14]
    ];

    return dest;
  }

  /**
   * Multiplies the Vector as such: this * v.
   * If dest is not provided then a new Vec4 is created
   * and returned.
   */
  public multiplyVec4(vector: Vec4, dest?: Vec4): Vec4 {
    if (!dest) {
      dest = new Vec4();
    }

    const x = vector.x;
    const y = vector.y;
    const z = vector.z;
    const w = vector.w;

    dest.xyzw = [
      this.values[0] * x +
      this.values[4] * y +
      this.values[8] * z +
      this.values[12] * w,

      this.values[1] * x +
      this.values[5] * y +
      this.values[9] * z +
      this.values[13] * w,

      this.values[2] * x +
      this.values[6] * y +
      this.values[10] * z +
      this.values[14] * w,

      this.values[3] * x +
      this.values[7] * y +
      this.values[11] * z +
      this.values[15] * w
    ];

    return dest;
  }

  /**
   * Returns the Mat3 portion of the matrix.
   * If dest is not provided then a new Mat3 is created
   * and returned.
   */
  public toMat3(dest?: Mat3): Mat3 {
    if (!dest) {
      dest = new Mat3();
    }

    return dest.init([
      this.values[0],
      this.values[1],
      this.values[2],
      this.values[4],
      this.values[5],
      this.values[6],
      this.values[8],
      this.values[9],
      this.values[10]
    ]);
  }

  /**
   * Returns the inverse of the Mat3 portion of the matrix.
   */
  public toInverseMat3(dest?: Mat3): Mat3 {
    if (!dest) {
      dest = new Mat3();
    }

    const a00 = this.values[0];
    const a10 = this.values[1];
    const a20 = this.values[2];
    const a01 = this.values[4];
    const a11 = this.values[5];
    const a21 = this.values[6];
    const a02 = this.values[8];
    const a12 = this.values[9];
    const a22 = this.values[10];

    const det01 = a22 * a11 - a12 * a21;
    const det11 = -a22 * a10 + a12 * a20;
    const det21 = a21 * a10 - a11 * a20;

    const det = 1.0 / (a00 * det01 + a01 * det11 + a02 * det21);

    return dest.init([
      det01 * det,
      det11 * det,
      det21 * det,
      (-a22 * a01 + a02 * a21) * det,
      (a22 * a00 - a02 * a20) * det,
      (-a21 * a00 + a01 * a20) * det,
      (a12 * a01 - a02 * a11) * det,
      (-a12 * a00 + a02 * a10) * det,
      (a11 * a00 - a01 * a10) * det
    ]);
  }

  /**
   * Translates the position by the given vector.
   * Equivalent to this * T, where T is a pure translation
   * matrix from the given vector.
   */
  public translate(vector: Vec3, dest?: Mat4): Mat4 {
    if (!dest) {
      dest = this;
    }

    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    dest.values[0] = this.values[0];
    dest.values[1] = this.values[1];
    dest.values[2] = this.values[2];
    dest.values[3] = this.values[3];
    dest.values[4] = this.values[4];
    dest.values[5] = this.values[5];
    dest.values[6] = this.values[6];
    dest.values[7] = this.values[7];
    dest.values[8] = this.values[8];
    dest.values[9] = this.values[9];
    dest.values[10] = this.values[10];
    dest.values[11] = this.values[11];

    dest.values[12] =
      this.values[0] * x + this.values[4] * y + this.values[8] * z + this.values[12];
    dest.values[13] =
      this.values[1] * x + this.values[5] * y + this.values[9] * z + this.values[13];
    dest.values[14] =
      this.values[2] * x + this.values[6] * y + this.values[10] * z + this.values[14];
    dest.values[15] =
      this.values[3] * x + this.values[7] * y + this.values[11] * z + this.values[15];

    return dest;
  }

  /**
   * Scales the matrix.
   * Equivalent to this * S, where S is a pure scaling matrix.
   * If dest is not provided then the calling matrix is modified.
   */
  public scale(vector: Vec3, dest?: Mat4): Mat4 {
    if (!dest) {
      dest = this;
    }

    const x = vector.x;
    const y = vector.y;
    const z = vector.z;

    dest.values[0] = this.values[0] * x;
    dest.values[1] = this.values[1] * x;
    dest.values[2] = this.values[2] * x;
    dest.values[3] = this.values[3] * x;

    dest.values[4] = this.values[4] * y;
    dest.values[5] = this.values[5] * y;
    dest.values[6] = this.values[6] * y;
    dest.values[7] = this.values[7] * y;

    dest.values[8]  = this.values[8] * z;
    dest.values[9]  = this.values[9] * z;
    dest.values[10] = this.values[10] * z;
    dest.values[11] = this.values[11] * z;

    dest.values[12] = this.values[12];
    dest.values[13] = this.values[13];
    dest.values[14] = this.values[14];
    dest.values[15] = this.values[15];

    return dest;
  }

  /**
   * Rotates the matrix about the given axis.
   * Equivalent to this * R, where R is a pure rotation matrix
   * from the given axis and angle.
   * If dest is not provided then the calling matrix is modified.
   */
  public rotate(angle: number, axis: Vec3, dest?: Mat4): Mat4 {
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
    const a30 = this.values[3];

    const a01 = this.values[4];
    const a11 = this.values[5];
    const a21 = this.values[6];
    const a31 = this.values[7];

    const a02 = this.values[8];
    const a12 = this.values[9];
    const a22 = this.values[10];
    const a32 = this.values[11];

    const b00 = x * x * t + c;
    const b10 = y * x * t + z * s;
    const b20 = z * x * t - y * s;

    const b01 = x * y * t - z * s;
    const b11 = y * y * t + c;
    const b21 = z * y * t + x * s;

    const b02 = x * z * t + y * s;
    const b12 = y * z * t - x * s;
    const b22 = z * z * t + c;

    dest.values[0] = a00 * b00 + a01 * b10 + a02 * b20;
    dest.values[1] = a10 * b00 + a11 * b10 + a12 * b20;
    dest.values[2] = a20 * b00 + a21 * b10 + a22 * b20;
    dest.values[3] = a30 * b00 + a31 * b10 + a32 * b20;

    dest.values[4] = a00 * b01 + a01 * b11 + a02 * b21;
    dest.values[5] = a10 * b01 + a11 * b11 + a12 * b21;
    dest.values[6] = a20 * b01 + a21 * b11 + a22 * b21;
    dest.values[7] = a30 * b01 + a31 * b11 + a32 * b21;

    dest.values[8] = a00 * b02 + a01 * b12 + a02 * b22;
    dest.values[9] = a10 * b02 + a11 * b12 + a12 * b22;
    dest.values[10] = a20 * b02 + a21 * b12 + a22 * b22;
    dest.values[11] = a30 * b02 + a31 * b12 + a32 * b22;

    // TODO - inefficient if dest === this
    dest.values[12] = this.values[12];
    dest.values[13] = this.values[13];
    dest.values[14] = this.values[14];
    dest.values[15] = this.values[15];

    return dest;
  }
}
