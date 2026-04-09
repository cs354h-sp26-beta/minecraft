import { Vec3, Vec4 } from "../lib/TSM.js";
export class Cube {
    constructor() {
        this.positionsRay = [
            /* Top */
            new Vec4([-0.5, 0.5, -0.5, 1.0]),
            new Vec4([-0.5, 0.5, 0.5, 1.0]),
            new Vec4([0.5, 0.5, 0.5, 1.0]),
            new Vec4([0.5, 0.5, -0.5, 1.0]),
            /* Left */
            new Vec4([-0.5, 0.5, 0.5, 1.0]),
            new Vec4([-0.5, -0.5, 0.5, 1.0]),
            new Vec4([-0.5, -0.5, -0.5, 1.0]),
            new Vec4([-0.5, 0.5, -0.5, 1.0]),
            /* Right */
            new Vec4([0.5, 0.5, 0.5, 1.0]),
            new Vec4([0.5, -0.5, 0.5, 1.0]),
            new Vec4([0.5, -0.5, -0.5, 1.0]),
            new Vec4([0.5, 0.5, -0.5, 1.0]),
            /* Front */
            new Vec4([0.5, 0.5, 0.5, 1.0]),
            new Vec4([0.5, -0.5, 0.5, 1.0]),
            new Vec4([-0.5, -0.5, 0.5, 1.0]),
            new Vec4([-0.5, 0.5, 0.5, 1.0]),
            /* Back */
            new Vec4([0.5, 0.5, -0.5, 1.0]),
            new Vec4([0.5, -0.5, -0.5, 1.0]),
            new Vec4([-0.5, -0.5, -0.5, 1.0]),
            new Vec4([-0.5, 0.5, -0.5, 1.0]),
            /* Bottom */
            new Vec4([-0.5, -0.5, -0.5, 1.0]),
            new Vec4([-0.5, -0.5, 0.5, 1.0]),
            new Vec4([0.5, -0.5, 0.5, 1.0]),
            new Vec4([0.5, -0.5, -0.5, 1.0])
        ];
        console.assert(this.positionsRay != null);
        console.assert(this.positionsRay.length === 4 * 6);
        this.positionsF32 = new Float32Array(this.positionsRay.length * 4);
        this.positionsRay.forEach((v, i) => {
            this.positionsF32.set(v.xyzw, i * 4);
        });
        console.assert(this.positionsF32 != null);
        console.assert(this.positionsF32.length === 4 * 6 * 4);
        this.indicesRay = [
            /* Top */
            new Vec3([0, 1, 2]),
            new Vec3([0, 2, 3]),
            /* Left */
            new Vec3([5, 4, 6]),
            new Vec3([6, 4, 7]),
            /* Right */
            new Vec3([8, 9, 10]),
            new Vec3([8, 10, 11]),
            /* Front */
            new Vec3([13, 12, 14]),
            new Vec3([15, 14, 12]),
            /* Back */
            new Vec3([16, 17, 18]),
            new Vec3([16, 18, 19]),
            /* Bottom */
            new Vec3([21, 20, 22]),
            new Vec3([22, 20, 23])
        ];
        console.assert(this.indicesRay != null);
        console.assert(this.indicesRay.length === 12);
        this.indicesU32 = new Uint32Array(this.indicesRay.length * 3);
        this.indicesRay.forEach((v, i) => {
            this.indicesU32.set(v.xyz, i * 3);
        });
        console.assert(this.indicesU32 != null);
        console.assert(this.indicesU32.length === 12 * 3);
        this.normalsRay = [
            /* Top */
            new Vec4([0.0, 1.0, 0.0, 0.0]),
            new Vec4([0.0, 1.0, 0.0, 0.0]),
            new Vec4([0.0, 1.0, 0.0, 0.0]),
            new Vec4([0.0, 1.0, 0.0, 0.0]),
            /* Left */
            new Vec4([-1.0, 0.0, 0.0, 0.0]),
            new Vec4([-1.0, 0.0, 0.0, 0.0]),
            new Vec4([-1.0, 0.0, 0.0, 0.0]),
            new Vec4([-1.0, 0.0, 0.0, 0.0]),
            /* Right */
            new Vec4([1.0, 0.0, 0.0, 0.0]),
            new Vec4([1.0, 0.0, 0.0, 0.0]),
            new Vec4([1.0, 0.0, 0.0, 0.0]),
            new Vec4([1.0, 0.0, 0.0, 0.0]),
            /* Front */
            new Vec4([0.0, 0.0, 1.0, 0.0]),
            new Vec4([0.0, 0.0, 1.0, 0.0]),
            new Vec4([0.0, 0.0, 1.0, 0.0]),
            new Vec4([0.0, 0.0, 1.0, 0.0]),
            /* Back */
            new Vec4([0.0, 0.0, -1.0, 0.0]),
            new Vec4([0.0, 0.0, -1.0, 0.0]),
            new Vec4([0.0, 0.0, -1.0, 0.0]),
            new Vec4([0.0, 0.0, -1.0, 0.0]),
            /* Bottom */
            new Vec4([0.0, -1.0, 0.0, 0.0]),
            new Vec4([0.0, -1.0, 0.0, 0.0]),
            new Vec4([0.0, -1.0, 0.0, 0.0]),
            new Vec4([0.0, -1.0, 0.0, 0.0])
        ];
        console.assert(this.normalsRay != null);
        console.assert(this.normalsRay.length === 4 * 6);
        this.normalsF32 = new Float32Array(this.normalsRay.length * 4);
        this.normalsRay.forEach((v, i) => {
            this.normalsF32.set(v.xyzw, i * 4);
        });
        console.assert(this.normalsF32 != null);
        console.assert(this.normalsF32.length === 4 * 6 * 4);
        this.uvRay = [
            /* Top */
            new Vec3([0.0, 0.0, 0.0]),
            new Vec3([0.0, 1.0, 0.0]),
            new Vec3([1.0, 1.0, 0.0]),
            new Vec3([1.0, 0.0, 0.0]),
            /* Left */
            new Vec3([0.0, 0.0, 0.0]),
            new Vec3([0.0, 1.0, 0.0]),
            new Vec3([1.0, 1.0, 0.0]),
            new Vec3([1.0, 0.0, 0.0]),
            /* Right */
            new Vec3([0.0, 0.0, 0.0]),
            new Vec3([0.0, 1.0, 0.0]),
            new Vec3([1.0, 1.0, 0.0]),
            new Vec3([1.0, 0.0, 0.0]),
            /* Front */
            new Vec3([0.0, 0.0, 0.0]),
            new Vec3([0.0, 1.0, 0.0]),
            new Vec3([1.0, 1.0, 0.0]),
            new Vec3([1.0, 0.0, 0.0]),
            /* Back */
            new Vec3([0.0, 0.0, 0.0]),
            new Vec3([0.0, 1.0, 0.0]),
            new Vec3([1.0, 1.0, 0.0]),
            new Vec3([1.0, 0.0, 0.0]),
            /* Bottom */
            new Vec3([0.0, 0.0, 0.0]),
            new Vec3([0.0, 1.0, 0.0]),
            new Vec3([1.0, 1.0, 0.0]),
            new Vec3([1.0, 0.0, 0.0]),
        ];
        console.assert(this.uvRay != null);
        console.assert(this.uvRay.length === 4 * 6);
        this.uvF32 = new Float32Array(this.uvRay.length * 2);
        this.uvRay.forEach((v, i) => {
            this.uvF32.set(v.xy, i * 2);
        });
        console.assert(this.uvF32 != null);
        console.assert(this.uvF32.length === 4 * 6 * 2);
    }
    positionsFlat() {
        console.assert(this.positionsF32.length === 24 * 4);
        return this.positionsF32;
    }
    indices() {
        console.assert(this.indicesRay.length === 12);
        return this.indicesRay;
    }
    indicesFlat() {
        console.assert(this.indicesU32.length === 12 * 3);
        return this.indicesU32;
    }
    normals() {
        return this.normalsRay;
    }
    normalsFlat() {
        return this.normalsF32;
    }
    uvFlat() {
        return this.uvF32;
    }
}
//# sourceMappingURL=Cube.js.map