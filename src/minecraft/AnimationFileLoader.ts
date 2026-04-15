import { ColladaLoader, Collada } from "../lib/threejs/examples/jsm/loaders/ColladaLoader.js";
import { Object3D, Scene, MeshLambertMaterial, SkinnedMesh, BufferGeometry} from "../lib/threejs/src/Three.js";
import { Vec3 } from "../lib/tsm/Vec3.js";
import { Mat4, Vec4 } from "../lib/TSM.js";
import { Quat } from "../lib/tsm/Quat.js";
import { Mesh } from "./Mesh.js";

export class AttributeLoader {
    values: Float32Array;
    count: number;
    itemSize: number;

    constructor(values: Float32Array, count: number, itemSize: number) {
        this.values = values;
        this.count = count;
        this.itemSize = itemSize;
    }
}

export class MeshGeometryLoader {
    position: AttributeLoader;
    normal: AttributeLoader;
    uv: AttributeLoader | null;
    skinIndex: AttributeLoader;
    skinWeight: AttributeLoader;
    v0: AttributeLoader;
    v1: AttributeLoader;
    v2: AttributeLoader;
    v3: AttributeLoader;

    constructor(geometry: BufferGeometry, wMat: Mat4) {
        let gPosition = geometry.attributes.position;
        this.position = new AttributeLoader(gPosition.array as Float32Array, gPosition.count, gPosition.itemSize);
        let gNormal = geometry.attributes.normal;
        this.normal = new AttributeLoader(gNormal.array as Float32Array, gNormal.count, gNormal.itemSize);
        if (geometry.attributes.uv) {
            let gUV = geometry.attributes.uv;
            this.uv = new AttributeLoader(gUV.array as Float32Array, gUV.count, gUV.itemSize);
        } else {
            this.uv = null;
        }
        let gSkinIndex = geometry.attributes.skinIndex;
        this.skinIndex = new AttributeLoader(gSkinIndex.array as Float32Array, gSkinIndex.count, gSkinIndex.itemSize);
        let gSkinWeight = geometry.attributes.skinWeight;
        this.skinWeight = new AttributeLoader(gSkinWeight.array as Float32Array, gSkinWeight.count, gSkinWeight.itemSize);

        this.v0 = new AttributeLoader(new Float32Array(gPosition.array.length), gPosition.count, 4);
        this.v1 = new AttributeLoader(new Float32Array(gPosition.array.length), gPosition.count, 4);
        this.v2 = new AttributeLoader(new Float32Array(gPosition.array.length), gPosition.count, 4);
        this.v3 = new AttributeLoader(new Float32Array(gPosition.array.length), gPosition.count, 4);

        for (let i = 0; i < gPosition.count; i++) {
            let pos = this.position.values.slice(i * 3, i * 3 + 3);
            let vPos = new Vec3([pos[0], pos[1], pos[2]]);
            vPos = wMat.multiplyPt3(vPos);
            this.position.values[i * 3] = vPos.x;
            this.position.values[i * 3 + 1] = vPos.y;
            this.position.values[i * 3 + 2] = vPos.z;

            let normals = this.normal.values.slice(i * 3, i * 3 + 3);
            let vNorm = new Vec3([normals[0], normals[1], normals[2]]);
            vNorm = wMat.multiplyVec3(vNorm);
            this.normal.values[i * 3] = vNorm.x;
            this.normal.values[i * 3 + 1] = vNorm.y;
            this.normal.values[i * 3 + 2] = vNorm.z;

        }
    }

    public setVectorOffsets(bones: BoneLoader[]) {
        for (let i = 0; i < this.position.count; i++) {
            let bonePos = new Vec3();
            let pos = this.position.values.slice(i * 3, i * 3 + 3);
            let vertexPos = new Vec3([pos[0], pos[1], pos[2]]);

            bonePos = bones[this.skinIndex.values[i*4 + 0]].position.copy();
            Vec3.difference(vertexPos, bonePos, bonePos);
            this.v0.values[i * 3] = bonePos.x;
            this.v0.values[i * 3 + 1] = bonePos.y;
            this.v0.values[i * 3 + 2] = bonePos.z;
            this.v0.values[i * 3 + 3] = 0;
            bonePos = bones[this.skinIndex.values[i*4 + 1]].position.copy();
            Vec3.difference(vertexPos, bonePos, bonePos);
            this.v1.values[i * 3] = bonePos.x;
            this.v1.values[i * 3 + 1] = bonePos.y;
            this.v1.values[i * 3 + 2] = bonePos.z;
            this.v1.values[i * 3 + 3] = 0;
            bonePos = bones[this.skinIndex.values[i*4 + 2]].position.copy();
            Vec3.difference(vertexPos, bonePos, bonePos);
            this.v2.values[i * 3] = bonePos.x;
            this.v2.values[i * 3 + 1] = bonePos.y;
            this.v2.values[i * 3 + 2] = bonePos.z;
            this.v2.values[i * 3 + 3] = 0;
            bonePos = bones[this.skinIndex.values[i*4 + 3]].position.copy();
            Vec3.difference(vertexPos, bonePos, bonePos);
            this.v3.values[i * 3] = bonePos.x;
            this.v3.values[i * 3 + 1] = bonePos.y;
            this.v3.values[i * 3 + 2] = bonePos.z;
            this.v3.values[i * 3 + 3] = 0;
        }
    }
}

export class BoneLoader {
    public parent: number;
    public children: number[];
    public position: Vec3;
    public endpoint: Vec3;
    public rotation: Quat;
    public initialPosition: Vec3;
    public initialEndpoint: Vec3;
    public offset: number;
    public initialTransformation: Mat4;

    constructor(parentId: number, childrenIds: number[], offset: number, wmat: Mat4) {
        this.parent = parentId;
        this.children = childrenIds;
        this.position = wmat.multiplyPt3(new Vec3([0, 0, 0]));
        this.initialPosition = this.position.copy();
        this.endpoint = wmat.multiplyPt3(new Vec3([0, offset, 0]));
        this.initialEndpoint = this.endpoint.copy();
        this.rotation = new Quat().setIdentity();
        this.offset = offset;
        this.initialTransformation = wmat.copy();
    }

}
export class MeshLoader {
    public geometry: MeshGeometryLoader;
    public worldMatrix: Mat4;
    public rotation: Vec3;
    public bones: BoneLoader[];
    public materialName: string;

    public boneIndices: number[];
    public bonePositions: Float32Array;
    public boneIndexAttribute: Float32Array;

    public name: String;

    constructor(skinnedMesh: SkinnedMesh) {
        this.name = skinnedMesh.name;

        let x = skinnedMesh.rotation.x;
        let y = skinnedMesh.rotation.y;
        let z = skinnedMesh.rotation.z;
        this.rotation = new Vec3([x, y, z]);
        let rotMat = new Mat4().setIdentity();
        rotMat.rotate(x, new Vec3([1, 0, 0]));
        rotMat.rotate(y, new Vec3([0, 1, 0]));
        rotMat.rotate(z, new Vec3([0, 0, 1]));
        rotMat = rotMat.multiply(new Mat4(skinnedMesh.bindMatrix.elements));
        this.worldMatrix = rotMat;
        this.geometry = new MeshGeometryLoader(skinnedMesh.geometry as BufferGeometry, this.worldMatrix);
        this.bones = [];
        this.boneIndices = [];
        this.bonePositions = new Float32Array([]);
        this.boneIndexAttribute = new Float32Array([]);

        let material = skinnedMesh.material as MeshLambertMaterial;
        this.materialName = material.name;

        skinnedMesh.skeleton.bones.forEach(bone => {
            if (bone.rotation.order !== "XYZ") {
                console.error("BONE ORDER NOT XYZ");
            }
            let parentId: number = -1;
            if (bone.parent?.type !== 'SkinnedMesh') {
                let uuid: string = "";
                if (bone.parent?.uuid) {
                    uuid = bone.parent?.uuid;
                }
                for (let i = 0; i < skinnedMesh.skeleton.bones.length; i++) {
                    if (skinnedMesh.skeleton.bones[i].uuid === uuid) {
                        parentId = i;
                    }
                }
            }
            let children: number[] = [];
            bone.children.forEach(child => {
                let uuid: string = child.uuid;
                for (let i = 0; i < skinnedMesh.skeleton.bones.length; i++) {
                    if (skinnedMesh.skeleton.bones[i].uuid === uuid) {
                        children.push(i);
                    }
                }
            });
            let tMat = bone.matrixWorld.clone();
            let tempMat = new Mat4(tMat.elements);
            let yVal = 1;
            if (children.length > 0) {
                yVal = skinnedMesh.skeleton.bones[children[0]].position.y;
            }
            this.bones.push(new BoneLoader(parentId, children, yVal, tempMat));
        });

        if (this.bones.length > 0) {
            this.initialize();
            this.geometry.setVectorOffsets(this.bones);
        }
    }

    private initialize(): void {
        this.boneIndices = [];
        this.bonePositions = new Float32Array(6 * this.bones.length);
        this.boneIndexAttribute = new Float32Array(2 * this.bones.length);
        this.bones.forEach((bone, index) => {
            this.boneIndices.push(2 * index);
            this.boneIndices.push(2 * index + 1);
            this.boneIndexAttribute[2 * index] = index;
            this.boneIndexAttribute[2 * index + 1] = index;
            this.bonePositions[index * 6] = 0;
            this.bonePositions[index * 6 + 1] = 0;
            this.bonePositions[index * 6 + 2] = 0;
            this.bonePositions[index * 6 + 3] = bone.initialEndpoint.x - bone.initialPosition.x;
            this.bonePositions[index * 6 + 4] = bone.initialEndpoint.y - bone.initialPosition.y;
            this.bonePositions[index * 6 + 5] = bone.initialEndpoint.z - bone.initialPosition.z;
        });
    }

}
class CLoader {
    private fileLocation: string;
    private loader: ColladaLoader;
    private scene: Scene | null;
    private skinnedMeshes: SkinnedMesh[];
    public meshes: Mesh[];

    constructor(location: string) {
        this.fileLocation = location;
        this.loader = new ColladaLoader();
        this.scene = null;
        this.skinnedMeshes = [];
        this.meshes = [];
    }

    public load(callback: Function): void {
        this.loader.load(this.fileLocation, (collada: Collada) => {
            console.log("File loaded successfully");
            collada.scene.updateWorldMatrix(true, true);
            console.log(collada);
            this.scene = collada.scene;
            this.findSkinnedMeshes();
            this.skinnedMeshes.forEach(m => {
                this.meshes.push(new Mesh(new MeshLoader(m)));
            });


            // getting the images
            let lib = collada.library as any;
            let mats = lib.materials;
            let imgs = lib.images;
            let effects = lib.effects;
            let matToTexture = new Map<String, String>();
            for (let property in effects) {
                let matName = "";
                for (let matProp in mats) {
                    if (mats[matProp].url === property) {
                        matName = mats[matProp].name;
                        break;
                    }
                }

                let imgName = "";
                for (let imgProp in effects[property].profile.surfaces) {
                    imgName = effects[property].profile.surfaces[imgProp].init_from;
                }

                let imgSrc = "";
                for (let imgProp in imgs) {
                    if (imgName === imgProp) {
                        imgSrc = imgs[imgProp].init_from;
                        break;
                    }
                }

                if (imgSrc === "" || !imgSrc) {
                    console.log("Image source not found");
                } else {
                    matToTexture.set(matName, imgSrc);
                }

                this.meshes.forEach(mesh => {
                    let imgSrc = matToTexture.get(mesh.materialName);
                    if (imgSrc) {
                        mesh.imgSrc = imgSrc;
                    }
                });
            }
            callback();
        }, undefined, (event: ErrorEvent) => {
            console.error("Loading collada file failed");
            console.error(event);
        });
    }

    private findSkinnedMeshes(element?: Object3D): void {
        if (this.scene == null) {
            console.error('Error loading scene');
            throw new Error('Scene was null when finding skinned meshes');
        }
        let objArr: Object3D[];
        if (element) { objArr = element.children; }
        else { objArr = this.scene.children; }
        objArr.forEach(child => {
            if (element) {
                child.rotateX(element.rotation.x);
                child.rotateY(element.rotation.y);
                child.rotateZ(element.rotation.z);
            } else if (this.scene) {
                child.rotateX(this.scene.rotation.x);
                child.rotateY(this.scene.rotation.y);
                child.rotateZ(this.scene.rotation.z);
            }
            if (child.type === 'SkinnedMesh') {
                this.skinnedMeshes.push(child as SkinnedMesh);
            } else {
                this.findSkinnedMeshes(child);
            }
        });
    }

}

export {
    CLoader as CLoader,
};
