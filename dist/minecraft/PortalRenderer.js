import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { portalVSText, portalFSText } from "./Shaders.js";
export class PortalRenderer {
    constructor(gl, cubeGeometry, width, height) {
        this.portals = [];
        // Per-portal FBO resources (parallel arrays with this.portals)
        this.fbos = [];
        this.colorTextures = [];
        this.depthRBs = [];
        this.cachedFlipU = [];
        this.gl = gl;
        this.width = width;
        this.height = height;
        this.renderPass = new RenderPass(gl, portalVSText, portalFSText);
        this.initRenderPass(cubeGeometry);
    }
    initRenderPass(cubeGeometry) {
        const gl = this.gl;
        this.renderPass.setIndexBufferData(cubeGeometry.indicesFlat());
        this.renderPass.addAttribute("aVertPos", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, cubeGeometry.positionsFlat());
        this.renderPass.addInstancedAttribute("aOffset", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
        // These uniforms get overridden per-draw, but need initial values for setup
        this.renderPass.addUniform("uProj", (_gl, _loc) => { });
        this.renderPass.addUniform("uView", (_gl, _loc) => { });
        this.renderPass.addUniform("uSrcOrigin", (_gl, _loc) => { });
        this.renderPass.addUniform("uSrcRight", (_gl, _loc) => { });
        this.renderPass.addUniform("uSrcUp", (_gl, _loc) => { });
        this.renderPass.addUniform("uPortalSize", (_gl, _loc) => { });
        this.renderPass.addUniform("uFlipU", (_gl, _loc) => { });
        this.renderPass.addUniform("uPortalTex", (gl, loc) => {
            gl.uniform1i(loc, 0);
        });
        this.renderPass.setDrawData(gl.TRIANGLES, cubeGeometry.indicesFlat().length, gl.UNSIGNED_INT, 0);
        this.renderPass.setup();
    }
    createFBO() {
        const gl = this.gl;
        const colorTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, colorTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const depthRB = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthRB);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.width, this.height);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRB);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error("Portal FBO incomplete:", status);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        return { fbo, colorTex, depthRB };
    }
    /**
     * Register a linked pair of portals. Each gets its own FBO.
     */
    addPortalPair(a, b) {
        a.link(b);
        this.portals.push(a);
        const fboA = this.createFBO();
        this.fbos.push(fboA.fbo);
        this.colorTextures.push(fboA.colorTex);
        this.depthRBs.push(fboA.depthRB);
        this.portals.push(b);
        const fboB = this.createFBO();
        this.fbos.push(fboB.fbo);
        this.colorTextures.push(fboB.colorTex);
        this.depthRBs.push(fboB.depthRB);
    }
    /**
     * Render all portal FBOs. Call this BEFORE the main scene draw.
     * drawScene is called once per portal with the portal's view/proj matrices.
     */
    renderPortalFBOs(playerPos, drawScene, dimension) {
        const gl = this.gl;
        for (let i = 0; i < this.portals.length; i++) {
            const portal = this.portals[i];
            if (dimension && portal.dimension !== dimension)
                continue;
            const cam = portal.computeFramingCamera(playerPos);
            if (!cam)
                continue;
            this.cachedFlipU[i] = cam.flipU;
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[i]);
            gl.clearColor(0.6, 0.2, 0.3, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            drawScene(cam.view, cam.proj);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    /**
     * Draw all portal block surfaces, sampling their respective FBO textures.
     * Call this AFTER the main scene draw.
     */
    drawPortalBlocks(viewMatrix, projMatrix, dimension) {
        const gl = this.gl;
        for (let i = 0; i < this.portals.length; i++) {
            const portal = this.portals[i];
            if (dimension && portal.dimension !== dimension)
                continue;
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.colorTextures[i]);
            // Player camera (screen position of portal blocks)
            this.renderPass.addUniform("uProj", (gl, loc) => {
                gl.uniformMatrix4fv(loc, false, new Float32Array(projMatrix.all()));
            });
            this.renderPass.addUniform("uView", (gl, loc) => {
                gl.uniformMatrix4fv(loc, false, new Float32Array(viewMatrix.all()));
            });
            // Portal geometry (for UV computation)
            const srcRight = portal.right();
            this.renderPass.addUniform("uSrcOrigin", (gl, loc) => {
                gl.uniform3f(loc, portal.position.x, portal.position.y, portal.position.z);
            });
            this.renderPass.addUniform("uSrcRight", (gl, loc) => {
                gl.uniform3f(loc, srcRight.x, srcRight.y, srcRight.z);
            });
            this.renderPass.addUniform("uSrcUp", (gl, loc) => {
                gl.uniform3f(loc, portal.up.x, portal.up.y, portal.up.z);
            });
            this.renderPass.addUniform("uPortalSize", (gl, loc) => {
                gl.uniform2f(loc, portal.width, portal.height);
            });
            const flip = this.cachedFlipU[i] ? 1.0 : 0.0;
            this.renderPass.addUniform("uFlipU", (gl, loc) => {
                gl.uniform1f(loc, flip);
            });
            const positions = portal.getBlockPositions();
            this.renderPass.updateAttributeBuffer("aOffset", positions);
            this.renderPass.drawInstanced(portal.numBlocks());
        }
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}
//# sourceMappingURL=PortalRenderer.js.map