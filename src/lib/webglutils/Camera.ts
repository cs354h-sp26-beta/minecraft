import { Mat4, Mat3, Vec3 } from "../TSM.js";
import { Quat } from "../tsm/Quat.js";
//import { Ray } from "../../ray/Ray"

export class RayCamera {
  public position: Vec3;
  public look: Vec3;
  public aspect: number;
  public rotationMatrix: Mat3;
  private normalizedHeight: number;
  private u: Vec3;
  private v: Vec3;

  constructor(position?: Vec3, look?: Vec3) {
    if (!position) { position = new Vec3(); }
    if (!look) { look = new Vec3(); }
    this.position = position;
    let fov = 45 / (180 / Math.PI);
    this.normalizedHeight = 2 * Math.tan(fov / 2);
    this.aspect = 800 / 600;

    let zDir = look;
    let yDir = new Vec3([0, 1, 0]);
    let xDir = Vec3.cross(yDir, zDir);
    this.rotationMatrix = new Mat3((xDir.xyz as number[]).concat(yDir.xyz as number[]).concat(zDir.xyz));
    this.u = this.rotationMatrix.multiplyVec3(new Vec3([this.normalizedHeight*this.aspect, 0, 0]));
    this.v = this.rotationMatrix.multiplyVec3(new Vec3([0, this.normalizedHeight, 0]), this.v);
    this.look = this.rotationMatrix.multiplyVec3(new Vec3([0, 0, -1]));

  }

 /* public rayThrough(x: number, y: number): Ray {
    x -= .5;
    y -= .5;
    let dir = Vec3.sum(this.look, Vec3.sum(this.u.copy().scale(x), this.v.copy().scale(y)));
    return new Ray(this.position, dir.normalize());
  }*/
}

// Camera - defines a camera to be used in an OpenGL app
export class Camera {
  // View Matrix parameters
  private _eye: Vec3; // position of the camera
  private _forward: Vec3; // forward direction of the camera
  private _up: Vec3; // up direction of the camera
  private _right: Vec3; // right direction of the camera
  private _dist: number; // distance to the focus

  private _initial_forward: Vec3;
  private _initial_up: Vec3;
  private _orientation: Quat;

  // Projection matrix parameters
  private _fov: number; // field of view in degrees
  private _aspect: number; // aspect ratio
  private _zNear: number; // near plane distance
  private _zFar: number; // far plane distance

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
  constructor(
    pos: Vec3,
    target: Vec3,
    upDir: Vec3,
    fov: number,
    aspect: number,
    zNear: number,
    zFar: number
  ) {
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

  public setKeyFrame(p: Vec3, o: Quat, d: number) {
    this._eye = p.copy();
    this._orientation = o.copy();
    this._forward = o.multiplyVec3(this._initial_forward);
    this._up = o.multiplyVec3(this._initial_up);
    this._right = Vec3.cross(this._up, this._forward);
    this._dist = d;
  }

  public orientation(): Quat {
    return this._orientation;
  }

  // Instance Variable Getters. Returns field of view
  public fov(): number {
    return this._fov;
  }
  // Returns aspect ratio
  public aspect(): number {
    return this._aspect;
  }
  // Returns distance to near plane
  public zNear(): number {
    return this._zNear;
  }
  // Returns distance to far plane
  public zFar(): number {
    return this._zFar;
  }
  // Returns distance to target
  public distance(): number {
    return this._dist;
  }
  // Returns position of camera
  public pos(): Vec3 {
    return this._eye.copy();
  }
  // Returns right vector
  public right(): Vec3 {
    return this._right.copy();
  }
  // Returns up vector
  public up(): Vec3 {
    return this._up.copy();
  }
  // Returns forward vector.
  // Note that this vector actually points behind the camera despite its name.
  // Just a convention.
  public forward(): Vec3 {
    return this._forward.copy();
  }

  // Instance Variable Setters
  // sets field of view
  public setFov(f: number): void {
    console.assert(f != null);
    this._fov = f;
  }

  // sets aspect ratio
  public setAspect(a: number): void {
    console.assert(a != null);
    this._aspect = a;
  }

  // sets the near plane
  public setZNear(z: number): void {
    console.assert(z != null);
    this._zNear = z;
  }

  // sets the far plane
  public setZFar(z: number): void {
    console.assert(z != null);
    this._zFar = z;
  }

  // sets the camera position
  public setPos(pos: Vec3): void {
    console.assert(pos != null);
    this._eye = pos.copy();
  }

  // Sets the position of the target
  public setTarget(targetPos: Vec3): void {
    console.assert(targetPos != null);
    this._forward = Vec3.difference(this._eye, targetPos).normalize();
    this._right = Vec3.cross(this._up, this._forward).normalize();
    this._up = Vec3.cross(this._forward, this._right).normalize();
    this._dist = Vec3.difference(this._eye, targetPos).length();
  }

  // Returns the position of the target
  public target(): Vec3 {
    return this.pos()
      .copy()
      .add(
        this.forward()
          .copy()
          .scale(-this._dist)
      );
  }

  public offsetTarget(dir: Vec3): void {
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
  public offsetDist(dt: number): void {
    console.assert(dt != null);
    this.offset(this.forward(), dt, false);
  }

  // Camera::offset - Offsets the camera
  // @param dir - the direction to offset the camera
  // @param dt - the distance to offset the camera
  // @param offsetTarget - if true, also offsets the target position,
  //                       otherwise keeps original target
  public offset(dir: Vec3, dt: number, offsetTarget?: boolean): void {
    console.assert(dir != null);
    console.assert(dt != null);
    // Offset the camera position
    dir.normalize();
    dir.scale(dt);

    const target: Vec3 = this.target();
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
  public roll(radians: number, cw?: boolean): void {
    console.assert(radians != null);
    const axis: Vec3 = this.forward();
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
  public pitch(radians: number, down?: boolean): void {
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
  public yaw(radians: number, right?: boolean): void {
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
  public orbitTarget(axis: Vec3, radians: number): void {
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
  public rotate(axis: Vec3, radians: number, pos?: Vec3): void {
    // TODO: add preconditions and checks for small angles or axis
    console.assert(axis != null);
    console.assert(radians != null);
    axis.normalize();

    // Compute rotation matrix
    const rotMat: Mat4 = new Mat4().setIdentity();
    rotMat.rotate(radians, axis);

    // Compute new basis vectors
    this._up = rotMat.multiplyVec3(this._up);
    this._forward = rotMat.multiplyVec3(this._forward);
    this._right = rotMat.multiplyVec3(this._right);

    const rotQuat = Quat.fromAxisAngle(axis, radians);
    this._orientation = Quat.product(rotQuat, this._orientation);

    if (pos != null) {
      let posToEye: Vec3 = Vec3.difference(this._eye, pos);
      posToEye = rotMat.multiplyPt3(posToEye);
      this._eye = Vec3.sum(pos, posToEye);
    }
  }

  // Camera::viewMatrix - returns the view matrix
  public viewMatrix(): Mat4 {
    const m: Mat4 = Mat4.lookAt(this._eye, this.target(), this._up);
    console.assert(m != null);
    return m;
  }

  // Camera::projMatrix - returns the projection matrix
  public projMatrix(): Mat4 {
    const m: Mat4 = Mat4.perspective(
      this._fov,
      this._aspect,
      this._zNear,
      this._zFar
    );
    console.assert(m != null);
    return m;
  }
}
