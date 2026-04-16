import { Vec3, Vec4 } from "../lib/TSM.js";
export class Billboard {
    constructor() {
        const verts = [
            new Vec4([-0.5, 0.0, 0.0, 1.0]),
            new Vec4([0.5, 0.0, 0.0, 1.0]),
            new Vec4([0.5, 1.0, 0.0, 1.0]),
            new Vec4([-0.5, 1.0, 0.0, 1.0]),
            new Vec4([0.0, 0.0, -0.5, 1.0]),
            new Vec4([0.0, 0.0, 0.5, 1.0]),
            new Vec4([0.0, 1.0, 0.5, 1.0]),
            new Vec4([0.0, 1.0, -0.5, 1.0]),
        ];
        this.positions = new Float32Array(verts.length * 4);
        verts.forEach((v, i) => this.positions.set(v.xyzw, i * 4));
        const tex = [
            new Vec3([0.0, 0.0, 0.0]),
            new Vec3([1.0, 0.0, 0.0]),
            new Vec3([1.0, 1.0, 0.0]),
            new Vec3([0.0, 1.0, 0.0]),
            new Vec3([0.0, 0.0, 0.0]),
            new Vec3([1.0, 0.0, 0.0]),
            new Vec3([1.0, 1.0, 0.0]),
            new Vec3([0.0, 1.0, 0.0]),
        ];
        this.uv = new Float32Array(tex.length * 2);
        tex.forEach((v, i) => this.uv.set(v.xy, i * 2));
        this.indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    }
    positionsFlat() {
        return this.positions;
    }
    uvFlat() {
        return this.uv;
    }
    indicesFlat() {
        return this.indices;
    }
}
//# sourceMappingURL=Billboard.js.map