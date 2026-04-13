export const blankCubeVSText = `
    precision mediump float;

    uniform vec4 uLightPos;    
    uniform mat4 uView;
    uniform mat4 uProj;
    uniform vec4 uSelectedCubePos;

    attribute vec4 aNorm;
    attribute vec4 aVertPos;
    attribute vec4 aOffset;
    attribute vec2 aUV;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying float selected;

    void main () {

        gl_Position = uProj * uView * (aVertPos + aOffset);
        wsPos = aVertPos + aOffset;
        normal = normalize(aNorm);
        uv = aUV;
        selected = uSelectedCubePos == aOffset ? 1.0 : 0.0;
    }
`;

export const blankCubeFSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying float selected;
    
    void main() {
        vec3 kd = vec3(1.0, 1.0, 1.0);
        vec3 ka = vec3(0.1, 0.1, 0.1);

        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), normalize(normal));
	    dot_nl = clamp(dot_nl, 0.0, 1.0);
	
        float highlight = selected == 1.0 ? 1.1 : 1.0;
        gl_FragColor = vec4(clamp((ka + dot_nl * kd) * highlight, 0.0, 1.0), 1.0);
    }
`;
