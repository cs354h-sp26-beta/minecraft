import { Camera } from "../lib/webglutils/Camera.js";
import { Mat4, Vec3, Vec4 } from "../lib/TSM.js";
/**
 * Handles Mouse and Button events along with
 * the the camera.
 */
export class GUI {
    /**
     *
     * @param canvas required to get the width and height of the canvas
     * @param animation required as a back pointer for some of the controls
     */
    constructor(canvas, animation) {
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
        this._mouseX = 0;
        this._mouseY = 0;
        this.animation = animation;
        this.reset();
        this.registerEventListeners(canvas);
    }
    /**
     * Resets the state of the GUI
     */
    reset() {
        this.camera = new Camera(new Vec3([0, 100, 0]), new Vec3([0, 100, -1]), new Vec3([0, 1, 0]), 45, this.width / this.height, 0.1, 1000.0);
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
    setCamera(pos, target, upDir, fov, aspect, zNear, zFar) {
        this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
    }
    /**
     * Returns the view matrix of the camera
     */
    viewMatrix() {
        return this.camera.viewMatrix();
    }
    /**
     * Returns the projection matrix of the camera
     */
    projMatrix() {
        return this.camera.projMatrix();
    }
    getCamera() {
        return this.camera;
    }
    get pointerLocked() {
        return this._pointerLocked;
    }
    get isSpaceDown() {
        return this.spaceDown;
    }
    get mouseX() {
        return this._mouseX;
    }
    get mouseY() {
        return this._mouseY;
    }
    dragStart(mouse) {
        if (this.animation.isPlayerDead()) {
            return;
        }
        if (this.animation.isInventoryOpen()) {
            this.animation.inventoryClick(mouse.offsetX, mouse.offsetY, mouse.button);
            return;
        }
        if (!this._pointerLocked) {
            return;
        }
        if (mouse.button === 0) {
            this.animation.leftClick(this.cubeSelected);
        }
        else if (mouse.button === 2) {
            this.animation.rightClick(this.cubeSelected);
        }
        // Re-raycast after block updates
        this.raycastFromScreenPos(this.width / 2, this.height / 2);
    }
    dragEnd(mouse) {
        // nothing for now
    }
    /**
     * The callback function for a drag event.
     * This event happens after dragStart and
     * before dragEnd.
     * @param mouse
     */
    drag(mouse) {
        this._mouseX = mouse.offsetX;
        this._mouseY = mouse.offsetY;
        if (this.animation.isPlayerDead()) {
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
    raycastFromScreenPos(x, y) {
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
        this.cubeSelected = this.animation.pickTarget(cameraPos, rayDir);
    }
    walkDir() {
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
        if (this.Wdown)
            answer.add(forward);
        if (this.Adown)
            answer.add(right.negate());
        if (this.Sdown)
            answer.add(forward.negate());
        if (this.Ddown)
            answer.add(right);
        answer.normalize();
        return answer;
    }
    /**
     * Callback function for a key press event
     * @param key
     */
    onKeydown(key) {
        if (this.animation.isPlayerDead() && key.code !== "KeyR") {
            return;
        }
        if (this.animation.isInventoryOpen()) {
            switch (key.code) {
                case "ArrowUp": {
                    this.animation.inventory.selectCraftingRecipe(-1);
                    return;
                }
                case "ArrowDown": {
                    this.animation.inventory.selectCraftingRecipe(1);
                    return;
                }
                case "Enter": {
                    this.animation.inventory.craftSelectedRecipe();
                    return;
                }
                default: {
                }
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
                this.animation.inventory.selectedHotbarIdx = 0;
                break;
            }
            case "Digit2": {
                this.animation.inventory.selectedHotbarIdx = 1;
                break;
            }
            case "Digit3": {
                this.animation.inventory.selectedHotbarIdx = 2;
                break;
            }
            case "Digit4": {
                this.animation.inventory.selectedHotbarIdx = 3;
                break;
            }
            case "Digit5": {
                this.animation.inventory.selectedHotbarIdx = 4;
                break;
            }
            case "Digit6": {
                this.animation.inventory.selectedHotbarIdx = 5;
                break;
            }
            case "Digit7": {
                this.animation.inventory.selectedHotbarIdx = 6;
                break;
            }
            case "Digit8": {
                this.animation.inventory.selectedHotbarIdx = 7;
                break;
            }
            case "Digit9": {
                this.animation.inventory.selectedHotbarIdx = 8;
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
            case "KeyE": {
                this.animation.toggleInventory();
                break;
            }
            case "Escape": {
                this.animation.toggleInventory(false);
                return;
            }
            case "KeyQ": {
                this.animation.inventory.dropHeldItem();
                break;
            }
            case "KeyP": {
                this.animation.giveAllItems();
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
    onKeyup(key) {
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
    registerEventListeners(canvas) {
        /* Event listener for key controls */
        window.addEventListener("keydown", (key) => this.onKeydown(key));
        window.addEventListener("keyup", (key) => this.onKeyup(key));
        /* Event listener for mouse controls */
        canvas.addEventListener("mousedown", (mouse) => this.dragStart(mouse));
        canvas.addEventListener("mousemove", (mouse) => this.drag(mouse));
        canvas.addEventListener("mouseup", (mouse) => this.dragEnd(mouse));
        canvas.addEventListener("click", () => {
            if (!this._pointerLocked && !this.animation.isInventoryOpen()) {
                canvas.requestPointerLock();
            }
        });
        document.addEventListener("pointerlockchange", () => {
            this._pointerLocked = document.pointerLockElement === canvas;
        });
        /* Event listener to stop the right click menu */
        canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    }
}
GUI.rotationSpeed = 0.01;
GUI.walkSpeed = 1;
GUI.rollSpeed = 0.1;
GUI.panSpeed = 0.1;
//# sourceMappingURL=Gui.js.map