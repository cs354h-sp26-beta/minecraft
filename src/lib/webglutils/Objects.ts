import { Mat3, Mat4, Vec3, Vec4 } from "../TSM.js";

export interface MaterialObject {
  positions(): Vec4[];
  colors(): Vec4[];
  indices(): Vec3[];
  normals(): Vec4[];

  positionsFlat(): Float32Array;
  colorsFlat(): Float32Array;
  indicesFlat(): Uint32Array;
  normalsFlat(): Float32Array;

  // setColors(cs: Vec4[]): void;
  uMatrix(): Mat4;
  scale(s: GLfloat): void;
  translate(p: Vec3): void;

  // TODO: Rotate
}
