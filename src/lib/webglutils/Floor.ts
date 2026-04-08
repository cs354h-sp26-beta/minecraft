import { MaterialObject } from "./Objects.js";
import { Mat3, Mat4, Vec3, Vec4 } from "../TSM.js";

export class Floor implements MaterialObject {
  private floorY: GLfloat = -2;
  private vertices: Vec4[];
  private ind: Vec3[];
  private norms: Vec4[];

  private verticesF32: Float32Array;
  private indicesU32: Uint32Array;
  private normalsF32: Float32Array;

  constructor() {
    /* Set default position. */
    this.vertices = [
      new Vec4([0, this.floorY, 0, 1]),
      new Vec4([1, 0, 0, 0]),
      new Vec4([0, 0, 1, 0]),
      new Vec4([-1, 0, 0, 0]),
      new Vec4([0, 0, -1, 0])
    ];
    console.assert(this.vertices != null);
    console.assert(this.vertices.length === 5);
    
    /* Flatten Position. */
    this.verticesF32 = new Float32Array(this.vertices.length*4);
    this.vertices.forEach((v: Vec4, i: number) => {this.verticesF32.set(v.xyzw, i*4)});
    console.assert(this.verticesF32 != null);
    console.assert(this.verticesF32.length === 5 * 4);
    
    /* Set indices. */
    this.ind = [
      new Vec3([0, 2, 1]),
      new Vec3([0, 3, 2]),
      new Vec3([0, 4, 3]),
      new Vec3([0, 1, 4])
    ];
    console.assert(this.ind != null);
    console.assert(this.ind.length === 4);
    
    /* Flatten Indices. */
    this.indicesU32 = new Uint32Array(this.ind.length*3);
    this.ind.forEach((v: Vec3, i: number) => {this.indicesU32.set(v.xyz, i*3)});
    console.assert(this.indicesU32 != null);
    console.assert(this.indicesU32.length === 4 * 3);

    /* Set Normals. */
    this.norms = [
      new Vec4([0.0, 1.0, 0.0, 0.0]),
      new Vec4([0.0, 1.0, 0.0, 0.0]),
      new Vec4([0.0, 1.0, 0.0, 0.0]),
      new Vec4([0.0, 1.0, 0.0, 0.0])
    ];
    this.normalsF32 = new Float32Array(this.norms.length*4);
    this.norms.forEach((v: Vec4, i: number) => {this.normalsF32.set(v.xyzw, i*4)});
  }

  public positions(): Vec4[] {
    console.assert(this.vertices.length === 5);
    return this.vertices;
  }

  public positionsFlat(): Float32Array {
    console.assert(this.verticesF32.length === 5 * 4);
    return this.verticesF32;
  }

  public colors(): Vec4[] {
    throw new Error("Floor::colors() incomplete method");
    return [];
  }

  public colorsFlat(): Float32Array {
    throw new Error("Floor::colorsFlat() incomplete method");
    return new Float32Array([]);
  }

  public setColors(colors: Vec4[]): void {
    throw new Error("Floor::setColors() incomplete method");
  }

  public indices(): Vec3[] {
    console.assert(this.ind.length === 4);
    return this.ind;
  }

  public indicesFlat(): Uint32Array {
    console.assert(this.indicesU32.length === 4 * 3);
    return this.indicesU32;
  }

  public uMatrix(): Mat4 {
    throw new Error("Floor::uMatrix() incomplete method");
    return new Mat4();
  }

  public scale(s: GLfloat): void {
    throw new Error("Floor::scale() incomplete method");
  }

  public translate(p: Vec3): void {
    throw new Error("Floor::translate() incomplete method");
  }

  public normals(): Vec4[] {
    return this.norms;
  }

  public normalsFlat(): Float32Array {
    return this.normalsF32;
  }
}
