import { Debugger } from "./Debugging.js";
export class WebGLUtilities {
    /**
     * Creates and compiles a WebGL Shader from given source
     * @param ctx a WebGL rendering context. This has methods for compiling the shader.
     * @param shaderType can only be ctx.VERTEX_SHADER or ctx.FRAGMENT_SHADER.
     * @param source the shader source code as a string.
     * @return a WebGL shader
     */
    static createShader(ctx, shaderType, source) {
        /* TODO: error checking */
        const shader = ctx.createShader(shaderType);
        ctx.shaderSource(shader, source);
        ctx.compileShader(shader);
        /* Check for Compilation Errors */
        if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
            console.error("ERROR compiling shader!", ctx.getShaderInfoLog(shader));
        }
        return shader;
    }
    /**
     * Creates a shader program from the given vertex shader and fragment shader
     * @param vsSource the vertex shader source as a string
     * @param fsSource the fragment shader source as a string
     * @return a WebGLProgram
     */
    static createProgram(ctx, vsSource, fsSource) {
        /* TODO: error checking */
        const shaderProgram = ctx.createProgram();
        const vertexShader = WebGLUtilities.createShader(ctx, ctx.VERTEX_SHADER, vsSource);
        ctx.attachShader(shaderProgram, vertexShader);
        const fragmentShader = WebGLUtilities.createShader(ctx, ctx.FRAGMENT_SHADER, fsSource);
        ctx.attachShader(shaderProgram, fragmentShader);
        ctx.linkProgram(shaderProgram);
        /* Check for Linker Errors */
        if (!ctx.getProgramParameter(shaderProgram, ctx.LINK_STATUS)) {
            console.error("ERROR linking program!", ctx.getProgramInfoLog(shaderProgram));
        }
        /* While debugging Validate Program */
        ctx.validateProgram(shaderProgram);
        if (!ctx.getProgramParameter(shaderProgram, ctx.VALIDATE_STATUS)) {
            console.error("ERROR validating program!", ctx.getProgramInfoLog(shaderProgram));
        }
        return shaderProgram;
    }
    /**
     * Returns a WebGL context for the given Canvas
     * @param canvas any HTML canvas element
     * @return the WebGL rendering context for the canvas
     */
    static requestWebGLContext(canvas) {
        /* Request WebGL Context */
        let ctx = canvas.getContext("webgl2", {
            preserveDrawingBuffer: true
        });
        if (!ctx) {
            console.log("Your browser does not support WebGL, falling back", "to Experimental WebGL");
            ctx = canvas.getContext("experimental-webgl");
        }
        if (!ctx) {
            throw new Error("Your browser does not support WebGL or Experimental-WebGL");
        }
        return ctx;
    }
}
/**
 * An abstract class that defines the interface for any
 * animation class.
 */
export class CanvasAnimation {
    constructor(canvas, debugMode = false, stopOnError = false, glErrorCallback = Debugger.throwOnError, glCallback = Debugger.throwErrorOnUndefinedArg) {
        // Create webgl rendering context
        this.c = canvas;
        this.ctx = WebGLUtilities.requestWebGLContext(this.c);
        if (debugMode) {
            this.ctx = Debugger.makeDebugContext(this.ctx, glErrorCallback, glCallback);
        }
    }
    /**
     * Draws and then requests a draw for the next frame.
     */
    drawLoop() {
        this.draw();
        window.requestAnimationFrame(() => this.drawLoop());
    }
    /**
     * Starts the draw loop of the animation
     */
    start() {
        window.requestAnimationFrame(() => this.drawLoop());
    }
}
//# sourceMappingURL=CanvasAnimation.js.map