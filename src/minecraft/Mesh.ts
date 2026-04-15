import { Mat4, Quat, Vec3, Vec4 } from "../lib/TSM.js";
import {
  AttributeLoader,
  MeshGeometryLoader,
  BoneLoader,
  MeshLoader,
} from "./AnimationFileLoader.js";
import { MathUtils } from "../lib/threejs/build/three.module.js";

//General class for handling GLSL attributes
export class Attribute {
  values: Float32Array;
  count: number;
  itemSize: number;

  constructor(attr: AttributeLoader) {
    this.values = attr.values;
    this.count = attr.count;
    this.itemSize = attr.itemSize;
  }
}

//Class for handling mesh vertices and skin weights
export class MeshGeometry {
  position: Attribute;
  normal: Attribute;
  uv: Attribute | null = null;
  skinIndex: Attribute; // bones indices that affect each vertex
  skinWeight: Attribute; // weight of associated bone
  v0: Attribute; // position of each vertex of the mesh *in the coordinate system of bone skinIndex[0]'s joint*. Perhaps useful for LBS.
  v1: Attribute;
  v2: Attribute;
  v3: Attribute;

  constructor(mesh: MeshGeometryLoader) {
    this.position = new Attribute(mesh.position);
    this.normal = new Attribute(mesh.normal);
    if (mesh.uv) {
      this.uv = new Attribute(mesh.uv);
    }
    this.skinIndex = new Attribute(mesh.skinIndex);
    this.skinWeight = new Attribute(mesh.skinWeight);
    this.v0 = new Attribute(mesh.v0);
    this.v1 = new Attribute(mesh.v1);
    this.v2 = new Attribute(mesh.v2);
    this.v3 = new Attribute(mesh.v3);
  }
}

//Class for handling bones in the skeleton rig
export class Bone {
  public mesh: Mesh;
  public parent: number;
  public parentBone: Bone | null;
  public children: number[];
  public position: Vec3; // current position of the bone's joint *in world coordinates*. Used by the provided skeleton shader, so you need to keep this up to date.
  public endpoint: Vec3; // current position of the bone's second (non-joint) endpoint, in world coordinates
  public rotation: Quat; // current orientation of the joint *with respect to world coordinates*
  public endpointLocal: Vec3; // direction of the bone in its local coordinate system
  public relativePos: Vec3; // current position of the bone's joint in its parent's coordinate system
  public relativeRot: Quat; // current orientation of the bone's joint with respect to its parent bone

  constructor(bone: BoneLoader | Bone, mesh: Mesh) {
    this.mesh = mesh;
    this.parent = bone.parent;
    this.children = Array.from(bone.children);
    this.position = bone.position.copy();
    this.endpoint = bone.endpoint.copy();
    this.rotation = bone.rotation.copy();

    this.endpointLocal = Vec3.difference(this.endpoint, this.position);

    this.parentBone = null;
    this.relativePos = this.position.copy();
    this.relativeRot = this.rotation.copy();
  }

  public initializeRelativeVals(): void {
    if (this.parent < 0) {
      return;
    }

    this.parentBone = this.mesh.bones[this.parent];
    this.relativePos = Vec3.difference(
      this.position,
      this.parentBone!.position,
    );
    this.relativeRot = new Quat().setIdentity();
  }

  public boneToWorldTransform(): Mat4 {
    return new Mat4()
      .setIdentity()
      .translate(this.position)
      .multiply(this.rotation.toMat4());
  }

  public worldToBoneTransform(): Mat4 {
    return this.rotation
      .toMat4()
      .transpose()
      .translate(this.position.copy().scale(-1));
  }

  public updateRecursively(): void {
    const parentRotation = this.parentBone
      ? this.parentBone!.rotation
      : new Quat().setIdentity();
    const parentPosition = this.parentBone
      ? this.parentBone!.position
      : new Vec3([0, 0, 0]);

    this.rotation = parentRotation.copy().multiply(this.relativeRot);
    this.position = parentRotation
      .multiplyVec3(this.relativePos)
      .add(parentPosition);
    this.endpoint = this.rotation
      .multiplyVec3(this.endpointLocal)
      .add(this.position);

    this.children.forEach((childIndex) => {
      this.mesh.bones[childIndex].updateRecursively();
    });
  }
}

//Class for handling the overall mesh and rig
export class Mesh {
  public geometry: MeshGeometry;
  public worldMatrix: Mat4; // in this project all meshes and rigs have been transformed into world coordinates for you
  public rotation: Vec3;
  public bones: Bone[];
  public materialName: string;
  public imgSrc: String | null;

  constructor(mesh: MeshLoader | Mesh) {
    this.geometry =
      mesh instanceof Mesh ? mesh.geometry : new MeshGeometry(mesh.geometry);
    this.worldMatrix = mesh.worldMatrix.copy();
    this.rotation = mesh.rotation.copy();
    this.bones = [];
    mesh.bones.forEach((bone: BoneLoader | Bone) => {
      this.bones.push(new Bone(bone, this));
    });
    this.bones.forEach((bone) => bone.initializeRelativeVals());
    if (this.bones.length > 64) {
      console.log(
        `Warning: More than 64 bones in rig (${this.bones.length}), shader may not function.`,
      );
    }
    this.materialName = mesh.materialName;
    this.imgSrc = mesh instanceof Mesh ? mesh.imgSrc : null;
  }

  public getBoneTranslationsUi8(): Uint8Array {
    let trans = new Uint8Array(4 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.position.xyz;
      res.push(0);
      for (let i = 0; i < res.length; i++) {
        // res[i] should be in [-1,1]
        trans[4 * index + i] = MathUtils.clamp(
          Math.round((255 * (res[i] + 1)) / 2),
          0,
          255,
        );
      }
    });
    return trans;
  }

  public getBoneRotationsUi8(): Uint8Array {
    let trans = new Uint8Array(4 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.rotation.xyzw;
      for (let i = 0; i < res.length; i++) {
        // res[i] is in [-1,1]
        trans[4 * index + i] = MathUtils.clamp(
          Math.round((255 * (res[i] + 1)) / 2),
          0,
          255,
        );
      }
    });
    return trans;
  }

  public scale(scaling: number) {
    for (let arr of [
      this.geometry.position.values,
      this.geometry.v0.values,
      this.geometry.v1.values,
      this.geometry.v2.values,
      this.geometry.v3.values,
    ]) {
      for (let i = 0; i < arr.length; i++) {
        arr[i] *= scaling;
      }
    }
    this.bones.forEach((bone) => {
      bone.position.scale(scaling);
      bone.endpoint.scale(scaling);
      bone.relativePos.scale(scaling);
      bone.endpointLocal.scale(scaling);
    });
  }

  public setPose(pose: Quat[], blendAmount: number = 0) {
    for (let i = 0; i < this.bones.length; i++) {
      Quat.slerpShort(
        pose[i],
        this.bones[i].relativeRot,
        blendAmount,
        this.bones[i].relativeRot,
      );
    }

    // Recursively update rots starting with roots
    for (let i = 0; i < this.bones.length; i++) {
      if (this.bones[i].parent < 0) {
        this.bones[i].updateRecursively();
      }
    }
  }
}
