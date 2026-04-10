export const blankCubeVSText = `
    precision mediump float;

    uniform vec4 uLightPos;    
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aNorm;
    attribute vec4 aVertPos;
    attribute vec4 aOffset;
    attribute vec2 aUV;
    attribute float aBlockType;
    
    varying float vBlockType;
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;

    void main () {

        gl_Position = uProj * uView * (aVertPos + aOffset);
        wsPos = aVertPos + aOffset;
        normal = normalize(aNorm);
        uv = aUV;
        vBlockType = aBlockType;
    }
`;

const noiseUtils = `
     float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      vec2 hash2(vec2 p) {
        return vec2(hash(p), hash(p + vec2(37.0, 17.0)));
      }

      vec3 hash3(vec3 p) {
        return vec3(hash(p.xy), hash(p.yz), hash(p.zx));
      }

      float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);  // smoothstep
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p, int octaves) {
          float val = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
              if (i >= octaves) break;
              val += amp * valueNoise(p);
              p *= 2.0;
              amp *= 0.5;
          }
          return val;
      }

      float fbm3(vec3 p, int octaves) {
          vec2 twoD = p.xy + p.yz * vec2(0.5, 1.0); // combine 3D coords into 2D for noise
          return fbm(twoD, octaves);
      }

      float voronoi(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        float minDist = 1.0;
        for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
                for (int z = -1; z <= 1; z++) {
                    vec3 neighbor = vec3(float(x), float(y), float(z));
                    vec3 cellCenter = hash3(i + neighbor); // random point in cell
                    float d = length(neighbor + cellCenter - f);
                    minDist = min(minDist, d);
                }
            }
        }
        return minDist;
      }
`;

const dirtTexture = `
    vec3 makeDirt(vec2 uv) {
        // dirt block: add some noise to brown
        vec3 baseColor = vec3(0.545, 0.271, 0.075);
        float noise = fbm(floor(uv * 16.0), 4);
        vec3 textureColor = baseColor * noise + baseColor * 0.8; // add subtle noise
        if (noise < 0.2) textureColor -= vec3(0.14, 0.08, 0.04); // add some darker spots
        if (noise > 0.85) textureColor += vec3(0.2, 0.3, 0.4); // add some lighter spots
        return textureColor;
    }
`;

const waterTexture = `
    vec3 makeWater(vec2 uv, vec3 world, float scale) {
      vec3 p = vec3(world.xy, world.z * 0.1) * 3.0;          // scale controls stone size
      float v = voronoi(p);              // cell distance → grooves
      float groove = smoothstep(0.05, 0.45, v * 1.6);  // dark at edges
      float noise = fbm3(vec3(world.xy, 0.0) * 22.0, 3);     // surface variation
      vec3 baseColor = vec3(0.25, 0.33, 0.8);
      return baseColor * groove * (0.8 + noise * 0.4);
    }
`;

const cobbleTexture = `
    vec3 makeCobble(vec2 uv, vec3 world, float scale) {
      vec3 pixelatedWorld = floor(world * 16.0) / 16.0; // snap world coords to a grid for pixelated texture
      vec3 p = pixelatedWorld.xyz * (3.0);          // scale controls stone size
      float v = 0.3 * voronoi(p);              // cell distance → grooves
      float groove = smoothstep(0.35, -0.55, v * 0.5);  // dark at edges
      float noise = fbm(pixelatedWorld.xz * 8.0, 2);     // surface variation
      vec3 baseColor = vec3(0.65, 0.63, 0.6);
      return baseColor * (0.31 + 1.8 * groove + 0.42 * noise);
    }
`;

// const cellsTexture = `
//       vec3 makeCobble(vec2 uv, vec3 world, float scale) {

//           uv = floor(uv * 16.0) / 16.0; // snap UVs to a grid to make pixelated texture
//           float gridOffset = valueNoise(world.xz) - 0.75; // random offset for grid to avoid perfect alignment
//           vec2 gridUV = uv * scale + vec2(gridOffset);
//           vec2 cell = fract(gridUV);
//           vec2 dist = cell - vec2(0.5, 0.5);
//           float edgeDist = length(dist) + 0.3 * valueNoise(uv);

//           float edgeDarkening = 0.5 - cos(edgeDist * 4.0)/2.0; // darken near edges
//           edgeDarkening = pow(edgeDarkening, 2.0) * 0.5; // make edges darker

//         //   edgeDarkening = clamp(edgeDarkening * 2.0, 0.0, 1.0); // ensure edgeDarkening is between 0 and 1

//           return vec3(0.7, 0.7, 0.7) - edgeDarkening + valueNoise(uv * scale * scale) * 0.2;
//       }
//   `;

// const bedrockTexture = `
//       vec3 makeCobble(vec2 uv, vec3 world, float scale) {

//           float gridOffset = valueNoise(world.xz / scale) * 1.5 - 0.75; // random offset for grid to avoid perfect alignment
//           vec2 gridUV = uv * scale + vec2(gridOffset);
//           vec2 cell = fract(gridUV);
//           vec2 dist = cell - vec2(0.5, 0.5);
//           float edgeDist = length(dist) + valueNoise(uv);

//           float edgeDarkening = 0.5 - cos(edgeDist - 0.2)/2.0; // darken near edges
//           edgeDarkening = pow(edgeDarkening, 2.0); // make edges darker

//           return vec3(0.5, 0.5, 0.5) * edgeDarkening + valueNoise(uv * scale * scale) * 0.3;
//       }
//   `;

export const blankCubeFSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying float vBlockType;

    ${noiseUtils}

    ${dirtTexture}

    ${cobbleTexture}

    ${waterTexture}
    
    void main() {
        vec3 kd = vec3(1.0, 1.0, 1.0);
        vec3 ka = vec3(0.1, 0.1, 0.1);

        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), normalize(normal));
	    dot_nl = clamp(dot_nl, 0.0, 1.0);

        vec3 textureColor;

        if (vBlockType == 0.0) {
            textureColor = makeDirt(uv);
        } else if (vBlockType == 1.0) {
            textureColor = makeCobble(uv, wsPos.xyz, 3.5);
        } else if (vBlockType == 2.0) {
            textureColor = makeWater(uv, wsPos.xyz, 3.5);
        }
        else {
            textureColor = vec3(1.0);
        }

        gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0) * textureColor, 1.0);
    }
`;
