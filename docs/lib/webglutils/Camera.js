import { Mat4, Mat3, Vec3 } from "../TSM.js";
import { Quat } from "../tsm/Quat.js";
//import { Ray } from "../../ray/Ray"
export class RayCamera {
    constructor(position, look) {
        if (!position) {
            position = new Vec3();
        }
        if (!look) {
            look = new Vec3();
        }
        this.position = position;
        let fov = 45 / (180 / Math.PI);
        this.normalizedHeight = 2 * Math.tan(fov / 2);
        this.aspect = 800 / 600;
        let zDir = look;
        let yDir = new Vec3([0, 1, 0]);
        let xDir = Vec3.cross(yDir, zDir);
        this.rotationMatrix = new Mat3(xDir.xyz.concat(yDir.xyz).concat(zDir.xyz));
        this.u = this.rotationMatrix.multiplyVec3(new Vec3([this.normalizedHeight * this.aspect, 0, 0]));
        this.v = this.rotationMatrix.multiplyVec3(new Vec3([0, this.normalizedHeight, 0]));
        this.look = this.rotationMatrix.multiplyVec3(new Vec3([0, 0, -1]));
    }
}
// Camera - defines a camera to be used in an OpenGL app
export class Camera {
    /**
     * Camera::constructor
     * @param pos    - the position of the camera
     * @param target - the position to look at
     * @param upDir  - the up direction of the camera
     * @param fov    - field of view in radians
     * @param aspect - the aspect ratio
     * @param zNear  - distance to the near plane
     * @param zFar   - distance to the far plane
     */
    constructor(pos, target, upDir, fov, aspect, zNear, zFar) {
        // TODO: error checking parameters
        console.assert(target != null);
        this._eye = pos;
        console.assert(this._eye != null);
        this._forward = Vec3.difference(pos, target).normalize();
        console.assert(this._forward != null);
        this._right = Vec3.cross(upDir, this._forward).normalize();
        console.assert(this._right != null);
        this._up = Vec3.cross(this._forward, this._right).normalize();
        console.assert(this._up != null);
        this._dist = Vec3.difference(pos, target).length();
        console.assert(this._dist != null);
        this._initial_forward = this._forward.copy();
        this._initial_up = this._up.copy();
        this._orientation = new Quat().setIdentity();
        // TODO: error checking parameters
        this._fov = fov;
        console.assert(this._fov != null);
        this._aspect = aspect;
        console.assert(this._aspect != null);
        this._zNear = zNear;
        console.assert(this._zNear != null);
        this._zFar = zFar;
        console.assert(this._zFar != null);
    }
    setKeyFrame(p, o, d) {
        this._eye = p.copy();
        this._orientation = o.copy();
        this._forward = o.multiplyVec3(this._initial_forward);
        this._up = o.multiplyVec3(this._initial_up);
        this._right = Vec3.cross(this._up, this._forward);
        this._dist = d;
    }
    orientation() {
        return this._orientation;
    }
    // Instance Variable Getters. Returns field of view
    fov() {
        return this._fov;
    }
    // Returns aspect ratio
    aspect() {
        return this._aspect;
    }
    // Returns distance to near plane
    zNear() {
        return this._zNear;
    }
    // Returns distance to far plane
    zFar() {
        return this._zFar;
    }
    // Returns distance to target
    distance() {
        return this._dist;
    }
    // Returns position of camera
    pos() {
        return this._eye.copy();
    }
    // Returns right vector
    right() {
        return this._right.copy();
    }
    // Returns up vector
    up() {
        return this._up.copy();
    }
    // Returns forward vector.
    // Note that this vector actually points behind the camera despite its name.
    // Just a convention.
    forward() {
        return this._forward.copy();
    }
    // Instance Variable Setters
    // sets field of view
    setFov(f) {
        console.assert(f != null);
        this._fov = f;
    }
    // sets aspect ratio
    setAspect(a) {
        console.assert(a != null);
        this._aspect = a;
    }
    // sets the near plane
    setZNear(z) {
        console.assert(z != null);
        this._zNear = z;
    }
    // sets the far plane
    setZFar(z) {
        console.assert(z != null);
        this._zFar = z;
    }
    // sets the camera position
    setPos(pos) {
        console.assert(pos != null);
        this._eye = pos.copy();
    }
    // Sets the position of the target
    setTarget(targetPos) {
        console.assert(targetPos != null);
        this._forward = Vec3.difference(this._eye, targetPos).normalize();
        this._right = Vec3.cross(this._up, this._forward).normalize();
        this._up = Vec3.cross(this._forward, this._right).normalize();
        this._dist = Vec3.difference(this._eye, targetPos).length();
    }
    // Returns the position of the target
    target() {
        return this.pos()
            .copy()
            .add(this.forward()
            .copy()
            .scale(-this._dist));
    }
    offsetTarget(dir) {
        // TODO
        console.assert(dir != null);
        throw new Error("offsetTarget not complete");
    }
    // Translation Methods
    /**
     * Camera::offsetDist - Offsets the distance between the camera and target
     *                      by moving the camera.
     * @param dt - the change in distance between the camera and target.
     *             Positve dt moves the camera farther from target.
     *             Negative dt moves the camera closer to targert.
     */
    offsetDist(dt) {
        console.assert(dt != null);
        this.offset(this.forward(), dt, false);
    }
    // Camera::offset - Offsets the camera
    // @param dir - the direction to offset the camera
    // @param dt - the distance to offset the camera
    // @param offsetTarget - if true, also offsets the target position,
    //                       otherwise keeps original target
    offset(dir, dt, offsetTarget) {
        console.assert(dir != null);
        console.assert(dt != null);
        // Offset the camera position
        dir.normalize();
        dir.scale(dt);
        const target = this.target();
        this._eye.add(dir);
        if (offsetTarget === true) {
            target.add(dir);
        }
        this.setTarget(target);
    }
    // Camera::roll - rolls the camera
    // @param radians - the number of radians to spin roll the camera
    // @param cw - if true, spins clockwise relative to viewer, otherwise
    //             spins counter clockwise
    roll(radians, cw) {
        console.assert(radians != null);
        const axis = this.forward();
        radians = Math.abs(radians);
        if (cw === true) {
            radians = -radians;
        }
        this.rotate(axis, radians);
    }
    // Camera::pitch    - pitches the camera up or down
    // @param radians   - the number of radians to rotate the camera
    // @param down      - if true, pitches the camera down relative to the
    //                    viewer, otherwise pitches down
    pitch(radians, down) {
        console.assert(radians != null);
        radians = Math.abs(radians);
        if (down === true) {
            radians = -radians;
        }
        this.rotate(this.right(), radians);
    }
    // Camera::yaw      - rotates left or right
    // @param radians   - the number of radians to rotate the camera
    // @param right     - if true, rotates to the rigth relative to the viewer,
    //                    otherwise rotates to the left.
    yaw(radians, right) {
        console.assert(radians != null);
        radians = Math.abs(radians);
        if (right === true) {
            radians = -radians;
        }
        this.rotate(this.up(), radians);
    }
    // Camera::orbitTarget - rotates about the given axis at the target object
    // @param axis      - a vec3 spcifying the axis to rotate about. This axis
    //                    passes through the camera's target.
    // @param radians   - the number of radians to rotate the camera. The sign
    //                    of the number affects rotation direction
    orbitTarget(axis, radians) {
        console.assert(axis != null);
        console.assert(radians != null);
        this.rotate(axis, radians, this.target());
    }
    // Camera::rotate   - rotates the camera about any arbitrary axis to the
    //                    camera
    // @param axis      - a vec3 specify the axis to rotate about
    // @param radians   - the number of radians to rotate the camera,
    //                    the sign of the number affects rotation direction
    // @param pos       - position of the axis of rotation. If not given, the
    //                    axis is assumed to pass through the camera
    rotate(axis, radians, pos) {
        // TODO: add preconditions and checks for small angles or axis
        console.assert(axis != null);
        console.assert(radians != null);
        axis.normalize();
        // Compute rotation matrix
        const rotMat = new Mat4().setIdentity();
        rotMat.rotate(radians, axis);
        // Compute new basis vectors
        this._up = rotMat.multiplyVec3(this._up);
        this._forward = rotMat.multiplyVec3(this._forward);
        this._right = rotMat.multiplyVec3(this._right);
        const rotQuat = Quat.fromAxisAngle(axis, radians);
        this._orientation = Quat.product(rotQuat, this._orientation);
        if (pos != null) {
            let posToEye = Vec3.difference(this._eye, pos);
            posToEye = rotMat.multiplyPt3(posToEye);
            this._eye = Vec3.sum(pos, posToEye);
        }
    }
    // Camera::viewMatrix - returns the view matrix
    viewMatrix() {
        const m = Mat4.lookAt(this._eye, this.target(), this._up);
        console.assert(m != null);
        return m;
    }
    // Camera::projMatrix - returns the projection matrix
    projMatrix() {
        const m = Mat4.perspective(this._fov, this._aspect, this._zNear, this._zFar);
        console.assert(m != null);
        return m;
    }
}
//# sourceMappingURL=Camera.js.map