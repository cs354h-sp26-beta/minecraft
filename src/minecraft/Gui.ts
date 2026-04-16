import { Camera } from "../lib/webglutils/Camera.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { MinecraftAnimation } from "./App.js";
import { Mat4, Vec3, Vec4, Vec2, Mat2, Quat } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";

/**
 * Might be useful for designing any animation GUI
 */
interface IGUI {
  viewMatrix(): Mat4;
  projMatrix(): Mat4;
  dragStart(me: MouseEvent): void;
  drag(me: MouseEvent): void;
  dragEnd(me: MouseEvent): void;
  onKeydown(ke: KeyboardEvent): void;
}

/**
 * Handles Mouse and Button events along with
 * the the camera.
 */

export class GUI implements IGUI {
  private static readonly rotationSpeed: number = 0.01;
  private static readonly walkSpeed: number = 1;
  private static readonly rollSpeed: number = 0.1;
  private static readonly panSpeed: number = 0.1;

  private camera!: Camera;
  private prevX: number;
  private prevY: number;
  private dragging: boolean;
  private cubeSelected: boolean;

  private height: number;
  private width: number;

  private animation: MinecraftAnimation;

  private Adown: boolean;
  private Wdown: boolean;
  private Sdown: boolean;
  private Ddown: boolean;
  private spaceDown: boolean;

  private _pointerLocked: boolean;
  private canvas: HTMLCanvasElement;

  /**
   *
   * @param canvas required to get the width and height of the canvas
   * @param animation required as a back pointer for some of the controls
   */
  constructor(canvas: HTMLCanvasElement, animation: MinecraftAnimation) {
    this.canvas = canvas;
    this.height = canvas.height;
    this.width = canvas.width;
    this.prevX = 0;
    this.prevY = 0;
    this.dragging = false;
    this.cubeSelected = false;
    this.Adown = false;
    this.Wdown = false;
    this.Sdown = false;
    this.Ddown = false;
    this.spaceDown = false;
    this._pointerLocked = false;

    this.animation = animation;

    this.reset();

    this.registerEventListeners(canvas);
  }

  /**
   * Resets the state of the GUI
   */
  public reset(): void {
    this.camera = new Camera(
      new Vec3([0, 100, 0]),
      new Vec3([0, 100, -1]),
      new Vec3([0, 1, 0]),
      45,
      this.width / this.height,
      0.1,
      1000.0,
    );
    this.Adown = false;
    this.Wdown = false;
    this.Sdown = false;
    this.Ddown = false;
    this.spaceDown = false;
    this.dragging = false;
    this.cubeSelected = false;
  }

  /**
   * Sets the GUI's camera to the given camera
   * @param cam a new camera
   */
  public setCamera(
    pos: Vec3,
    target: Vec3,
    upDir: Vec3,
    fov: number,
    aspect: number,
    zNear: number,
    zFar: number,
  ) {
    this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
  }

  /**
   * Returns the view matrix of the camera
   */
  public viewMatrix(): Mat4 {
    return this.camera.viewMatrix();
  }

  /**
   * Returns the projection matrix of the camera
   */
  public projMatrix(): Mat4 {
    return this.camera.projMatrix();
  }

  public getCamera(): Camera {
    return this.camera;
  }

  public get pointerLocked(): boolean {
    return this._pointerLocked;
  }

  public get isSpaceDown(): boolean {
    return this.spaceDown;
  }

  public releasePointerLock(): void {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  public dragStart(mouse: MouseEvent): void {
    if (this.animation.isPlayerDead()) {
      return;
    }

    if (this.animation.isCraftingOpen()) {
      this.animation.handleInventoryClick(mouse.offsetX, mouse.offsetY);
      return;
    }

    if (!this._pointerLocked) {
      return;
    }

    if (mouse.button === 0) {
      this.animation.leftClick(this.cubeSelected);
    } else if (mouse.button === 2) {
      this.animation.rightClick(this.cubeSelected);
    }

    // Re-raycast after block updates
    this.raycastFromScreenPos(this.width / 2, this.height / 2);
  }

  public dragEnd(mouse: MouseEvent): void {
    // nothing for now
  }

  /**
   * The callback function for a drag event.
   * This event happens after dragStart and
   * before dragEnd.
   * @param mouse
   */
  public drag(mouse: MouseEvent): void {
    if (this.animation.isPlayerDead() || this.animation.isCraftingOpen()) {
      return;
    }
    if (this._pointerLocked) {
      // Pointer lcoked: movementX/Y gives raw delta
      const dx = mouse.movementX;
      const dy = mouse.movementY;
      this.camera.rotate(new Vec3([0, 1, 0]), -GUI.rotationSpeed * dx);
      this.camera.rotate(this.camera.right(), -GUI.rotationSpeed * dy);

      // raycast from crosshair (screen center)
      this.raycastFromScreenPos(this.width / 2, this.height / 2);
      return;
    }
  }

  /**
   * performs a raycast from the camera through the given screen
   * coordinates and updates cubeSelected
   * @param x
   * @param y
   */
  private raycastFromScreenPos(x: number, y: number): void {
    // Create ray in world coordinates using camera position
    let mousePos = new Vec4();
    mousePos.x = (x / this.width) * 2 - 1;
    mousePos.y = 1 - (y / this.height) * 2;
    mousePos.z = -1;
    mousePos.w = 1;

    mousePos = this.projMatrix().inverse(new Mat4()).multiplyVec4(mousePos);
    mousePos.divide(new Vec4([mousePos.w, mousePos.w, mousePos.w, mousePos.w]));
    mousePos = this.viewMatrix().inverse(new Mat4()).multiplyVec4(mousePos);

    let cameraPos = new Vec3([
      this.camera.pos().x,
      this.camera.pos().y,
      this.camera.pos().z,
    ]);
    let rayDir = new Vec3([
      mousePos.x - cameraPos.x,
      mousePos.y - cameraPos.y,
      mousePos.z - cameraPos.z,
    ]);
    rayDir.normalize();

    this.cubeSelected = this.animation.intersectCubes(cameraPos, rayDir);
  }

  public walkDir(): Vec3 {
    const right = this.camera.right();
    right.y = 0;
    if (right.length() > 0) {
      right.normalize();
    }

    // Movement should follow camera yaw only, not pitch.
    const forward = Vec3.cross(Vec3.up, right, new Vec3());
    if (forward.length() > 0) {
      forward.normalize();
    }
    let answer = new Vec3();
    if (this.Wdown) answer.add(forward);
    if (this.Adown) answer.add(right.negate());
    if (this.Sdown) answer.add(forward.negate());
    if (this.Ddown) answer.add(right);
    answer.normalize();
    return answer;
  }

  /**
   * Callback function for a key press event
   * @param key
   */
  public onKeydown(key: KeyboardEvent): void {
    if (this.animation.isPlayerDead() && key.code !== "KeyR") {
      return;
    }

    if (key.code === "KeyC") {
      this.animation.toggleInventory();
      if (this.animation.isCraftingOpen()) {
        this.releasePointerLock();
      }
      return;
    }

    if (this.animation.isCraftingOpen()) {
      switch (key.code) {
        case "ArrowUp": {
          this.animation.selectCraftingRecipe(-1);
          return;
        }
        case "ArrowDown": {
          this.animation.selectCraftingRecipe(1);
          return;
        }
        case "Enter": {
          this.animation.craftSelectedRecipe();
          return;
        }
        case "Escape": {
          this.animation.toggleInventory();
          return;
        }
        default:
          return;
      }
    }

    switch (key.code) {
      case "KeyW": {
        this.Wdown = true;
        break;
      }
      case "KeyA": {
        this.Adown = true;
        break;
      }
      case "KeyS": {
        this.Sdown = true;
        break;
      }
      case "KeyD": {
        this.Ddown = true;
        break;
      }
      case "Digit1": {
        this.animation.setHotbarSlot(0);
        break;
      }
      case "Digit2": {
        this.animation.setHotbarSlot(1);
        break;
      }
      case "Digit3": {
        this.animation.setHotbarSlot(2);
        break;
      }
      case "Digit4": {
        this.animation.setHotbarSlot(3);
        break;
      }
      case "Digit5": {
        this.animation.setHotbarSlot(4);
        break;
      }
      case "Digit6": {
        this.animation.setHotbarSlot(5);
        break;
      }
      case "Digit7": {
        this.animation.setHotbarSlot(6);
        break;
      }
      case "Digit8": {
        this.animation.setHotbarSlot(7);
        break;
      }
      case "Digit9": {
        this.animation.setHotbarSlot(8);
        break;
      }
      case "KeyR": {
        this.animation.reset();
        break;
      }
      case "Semicolon": {
        this.animation.giveRandomItem();
        break;
      }
      case "KeyG": {
        this.animation.toggleAchievements();
        break;
      }
      case "Space": {
        this.spaceDown = true;
        this.animation.jump();
        break;
      }
      default: {
        console.log("Key : '", key.code, "' was pressed.");
        break;
      }
    }
  }

  public onKeyup(key: KeyboardEvent): void {
    switch (key.code) {
      case "KeyW": {
        this.Wdown = false;
        break;
      }
      case "KeyA": {
        this.Adown = false;
        break;
      }
      case "KeyS": {
        this.Sdown = false;
        break;
      }
      case "KeyD": {
        this.Ddown = false;
        break;
      }
      case "Space": {
        this.spaceDown = false;
        break;
      }
    }
  }

  /**
   * Registers all event listeners for the GUI
   * @param canvas The canvas being used
   */
  private registerEventListeners(canvas: HTMLCanvasElement): void {
    /* Event listener for key controls */
    window.addEventListener("keydown", (key: KeyboardEvent) =>
      this.onKeydown(key),
    );

    window.addEventListener("keyup", (key: KeyboardEvent) => this.onKeyup(key));

    /* Event listener for mouse controls */
    canvas.addEventListener("mousedown", (mouse: MouseEvent) =>
      this.dragStart(mouse),
    );

    canvas.addEventListener("mousemove", (mouse: MouseEvent) =>
      this.drag(mouse),
    );

    canvas.addEventListener("mouseup", (mouse: MouseEvent) =>
      this.dragEnd(mouse),
    );

    // TODO: document.exitPointerLock() on inventory open or anything else you need mouse for

    canvas.addEventListener("click", () => {
      if (!this._pointerLocked && !this.animation.isCraftingOpen()) {
        canvas.requestPointerLock();
      }
    });

    document.addEventListener("pointerlockchange", () => {
      this._pointerLocked = document.pointerLockElement === canvas;
    });

    /* Event listener to stop the right click menu */
    canvas.addEventListener("contextmenu", (event: any) =>
      event.preventDefault(),
    );
  }
}
