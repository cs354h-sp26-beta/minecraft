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

      vec2 gradient(vec2 p) {
        float h = hash(p) * 6.2831853;  // angle in [0, 2π]
        return vec2(cos(h), sin(h));
      }

      float perlin(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);

        // Smooth interpolation curve (quintic — Perlin's improved version)
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

        // Dot products of gradients with offset vectors at 4 corners
        float a = dot(gradient(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
        float b = dot(gradient(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
        float c = dot(gradient(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
        float d = dot(gradient(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

        // Bilinear blend. Perlin returns values in ~[-0.7, 0.7], remap to [0, 1]
        float n = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        return n * 0.5 + 0.5;
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
              val += amp * perlin(p);
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

        vec2 pixelUV = floor(uv * 16.0) / 16.0; // snap UVs to a grid for pixelated texture

        vec3 baseColor = vec3(0.545, 0.271, 0.075);
        float noise = fbm(pixelUV * 6.0 + vec2(0.5), 1) * 0.8 + hash(pixelUV) * 0.3;
        vec3 textureColor = baseColor * noise; // add subtle noise
        if (noise < 0.2) textureColor -= vec3(0.14, 0.08, 0.04); // add some darker spots
        if (noise > 0.85) textureColor += vec3(0.2, 0.3, 0.4); // add some lighter spots
        return textureColor;
    }
`;

const waterTexture = `
    vec3 makeWater(vec2 uv, vec3 world, float scale) {

      vec3 pixelWorld = floor(world * 16.0) / 16.0; // snap world coords to a grid for pixelated texture

      vec2 p = pixelWorld.xz * 2.0 + pixelWorld.xy * 0.1 + pixelWorld.zy * 0.1; // combine world coords for noise input, with some scaling

      // Two noise layers scrolling in different directions
      float wave1 = perlin(p + vec2(uTime * 0.3, uTime * 0.1));
      float wave2 = perlin(p * 2.5 + vec2(-uTime * 0.2, uTime * 0.25));
      float wave = (wave1 + wave2) * 0.6;

      float glint = wave * 0.9 * wave;

      wave = clamp(pow(wave, 4.5), 0.0, 1.0); // amplify waves and clamp

      //highlights

      float bubble = valueNoise(vec2((pixelWorld.x - pixelWorld.y) * 20.0 - pixelWorld.z * 2.0, pixelWorld.z * 2.0 + uTime * 0.5)); // bubble pattern
      
      float specular = clamp((bubble * 12.0) - 11.0, 0.0, 1.0); // threshold to create bright spots

      vec3 deepColor = vec3(0.1, 0.2, 0.5);
      vec3 shallowColor = vec3(0.2, 0.4, 0.7);
      vec3 bubbleColor = vec3(0.9, 0.95, 1.0);

      return mix(mix(deepColor, shallowColor, wave), bubbleColor, specular) + glint * 0.3;
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
    uniform float uTime;
    
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

        vec3 textureColor = vec3(1.0, 0.5, 1.0);

        if (vBlockType == 0.0) {
            textureColor = makeDirt(uv);
        } else if (vBlockType == 1.0) {
            textureColor = makeCobble(uv, wsPos.xyz, 3.5);
        } else if (vBlockType == 2.0) {
            textureColor = makeWater(uv, wsPos.xyz, 3.5);
        }

        gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0) * textureColor, 1.0);
    }
`;

export const skyboxVSText = `
    precision highp float;

    uniform mat4 uView;
    uniform mat4 uProj;

    attribute vec4 aVertPos;

    varying vec3 vDirection;

    void main() {
        vDirection = aVertPos.xyz;

        vec4 clipPos = uProj * uView * aVertPos;
        gl_Position = clipPos.xyww;
    }
`;

export const skyboxFSText = `
    precision highp float;

    uniform float uTime;

    varying vec3 vDirection;

    const float CLOUD_BOTTOM = 6.2;
    const float CLOUD_TOP = 20.0;
    const float CLOUD_RANGE_START = 0.0;
    const float CLOUD_RANGE_END = 25.0;
    const float CLOUD_BASE_SCALE = 0.05;
    const float CLOUD_DETAIL_SCALE = 0.22;
    const float CLOUD_COVERAGE = 0.57;
    const float CLOUD_DENSITY = 0.33;
    const int CLOUD_STEPS = 2;
    const float DAY_DURATION = 1440.0;
    const float TAU = 6.28318530718;
    const float SUNSET_TIME = 18.0 / 24.0;
    const float SUNRISE_TIME = 6.0 / 24.0;
    const float TWILIGHT_DURATION = 1.5 / 24.0;

    vec3 fade(vec3 t) {
        return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    }

    vec3 permute(vec3 x) {
        return mod(((x * 34.0) + 1.0) * x, 289.0);
    }

    float grad(vec3 cell, vec3 offset) {
        vec3 hashed = permute(permute(permute(cell) + cell.yzx) + cell.zxy);
        vec3 direction = fract(hashed * 0.1031) * 2.0 - 1.0;
        return dot(normalize(direction), offset);
    }

    float perlinNoise(vec3 p) {
        vec3 cell = floor(p);
        vec3 local = fract(p);
        vec3 weights = fade(local);

        float n000 = grad(cell + vec3(0.0, 0.0, 0.0), local - vec3(0.0, 0.0, 0.0));
        float n100 = grad(cell + vec3(1.0, 0.0, 0.0), local - vec3(1.0, 0.0, 0.0));
        float n010 = grad(cell + vec3(0.0, 1.0, 0.0), local - vec3(0.0, 1.0, 0.0));
        float n110 = grad(cell + vec3(1.0, 1.0, 0.0), local - vec3(1.0, 1.0, 0.0));
        float n001 = grad(cell + vec3(0.0, 0.0, 1.0), local - vec3(0.0, 0.0, 1.0));
        float n101 = grad(cell + vec3(1.0, 0.0, 1.0), local - vec3(1.0, 0.0, 1.0));
        float n011 = grad(cell + vec3(0.0, 1.0, 1.0), local - vec3(0.0, 1.0, 1.0));
        float n111 = grad(cell + vec3(1.0, 1.0, 1.0), local - vec3(1.0, 1.0, 1.0));

        float nx00 = mix(n000, n100, weights.x);
        float nx10 = mix(n010, n110, weights.x);
        float nx01 = mix(n001, n101, weights.x);
        float nx11 = mix(n011, n111, weights.x);
        float nxy0 = mix(nx00, nx10, weights.y);
        float nxy1 = mix(nx01, nx11, weights.y);

        return mix(nxy0, nxy1, weights.z);
    }

    float fbm(vec3 p) {
        float amplitude = 0.5;
        float value = 0.0;

        // Rotate each octave a bit so the noise feels less grid-aligned.
        mat3 octaveRotation = mat3(
             0.00,  0.80,  0.60,
            -0.80,  0.36, -0.48,
            -0.60, -0.48,  0.64
        );

        for (int i = 0; i < 4; i++) {
            value += amplitude * perlinNoise(p);
            p = octaveRotation * p * 2.02 + vec3(17.1, 9.2, 13.7);
            amplitude *= 0.5;
        }

        return value;
    }

    float cloudHeightProfile(float h) {
        float bottom = smoothstep(0.02, 0.20, h);
        float top = 1.0 - smoothstep(0.60, 1.00, h);
        return bottom * top;
    }

    vec3 cloudStepSeed(float stepIndex) {
        float n = stepIndex + 1.0;
        return vec3(19.19 * n, 7.73 * n, 13.47 * n);
    }

    float sampleCloudDensity(vec3 p, float h, vec3 seedOffset) {
        // Make the cloud field broad horizontally and thinner vertically.
        vec3 q = p;
        q.xz += vec2(uTime * 0.7, uTime * 0.2);
        q.y *= 0.30;
        q += seedOffset;

        float base = fbm(q * CLOUD_BASE_SCALE) * 0.5 + 0.5;
        float detail = fbm(q * CLOUD_DETAIL_SCALE + vec3(13.7, 4.2, 9.1)) * 0.5 + 0.5;

        float density = base * 0.88 + detail * 0.32;
        density = smoothstep(CLOUD_COVERAGE, CLOUD_COVERAGE + 0.12, density);
        density *= cloudHeightProfile(h);

        return density;
    }

    float cloudDistanceFade(float radial) {
        // Exponential falloff removes the visible outer ring from the cloud slab.
        float radialOffset = max(radial - CLOUD_RANGE_START, 0.0);
        return exp(-radialOffset / CLOUD_RANGE_END);
    }

    vec3 rotateAroundAxis(vec3 v, vec3 axis, float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
    }

    float wrappedPhaseDistance(float a, float b) {
        float d = abs(a - b);
        return min(d, 1.0 - d);
    }

    float twilightWindow(float progress, float center, float duration) {
        float halfWidth = duration * 0.5;
        float dist = wrappedPhaseDistance(progress, center);
        return 1.0 - smoothstep(halfWidth * 0.35, halfWidth, dist);
    }

    float hash13(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
    }

    float starField(vec3 dir) {
        dir = normalize(dir);

        // Use spherical coordinates so star placement feels sky-like instead of box-cell-like.
        float azimuth = atan(dir.z, dir.x);
        float elevation = asin(clamp(dir.y, -1.0, 1.0));
        vec2 skyUv = vec2(azimuth / TAU + 0.5, elevation / 3.14159265359 + 0.5);

        // Large-scale Perlin mask controls where stars appear.
        // This creates natural sparse and dense regions instead of even distribution.
        vec2 clusterUv = skyUv * vec2(10.0, 5.0);
        float clusterA = fbm(vec3(clusterUv * 1.4, 3.7)) * 0.5 + 0.5;
        float clusterB = perlinNoise(vec3(clusterUv * 3.0 + vec2(8.2, 1.7), -4.3)) * 0.5 + 0.5;
        float clusterMask = smoothstep(0.4, 0.72, clusterA * 0.72 + clusterB * 0.28);

        // Fine grid for candidate stars.
        vec2 starGridUv = skyUv * vec2(220.0, 110.0);
        vec2 cell = floor(starGridUv);
        vec2 local = fract(starGridUv) - 0.5;

        float cellHash = hash13(vec3(cell, 17.3));
        float presence = step(0.672 - clusterMask * 0.10, cellHash) * clusterMask;

        // Star center inside the cell.
        vec2 starOffset = vec2(
            hash13(vec3(cell, 4.1)),
            hash13(vec3(cell, 9.7))
        ) - 0.5;

        vec2 d = local - starOffset * 0.72;
        float r = length(d);

        // Size distribution: many tiny stars, few large stars.
        float sizeSeed = hash13(vec3(cell, 23.9));
        float size = mix(0.007, 0.025, pow(sizeSeed, 3.0));

        // Bright core + soft glow.
        float core = 1.0 - smoothstep(size * 0.45, size * 1.25, r);
        float glow = 1.0 - smoothstep(size * 1.2, size * 4.0, r);

        // Cross flare for prettier bright stars.
        float flareX = exp(-abs(d.x) / max(size * 0.22, 0.0008));
        float flareY = exp(-abs(d.y) / max(size * 0.22, 0.0008));
        float flare = max(flareX, flareY) * glow;

        // Rare bright stars get stronger sparkle.
        float giant = smoothstep(0.94, 0.995, sizeSeed);
        flare *= mix(0.14, 1.0, giant);

        // Soft twinkle so stars feel alive, but not noisy.
        float twinkleSeed = hash13(vec3(cell, 31.4));
        float twinkle = 0.82 + 0.18 * sin(uTime * (0.7 + twinkleSeed * 1.8) + twinkleSeed * TAU);

        float brightness = mix(0.65, 2.2, pow(sizeSeed, 4.0));
        float star = core * 1.5 + glow * 0.30 + flare * 0.55;

        return presence * star * brightness * twinkle;
    }

    void main() {
        vec3 dir = normalize(vDirection);
        float skyHeight = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

        vec3 dayHorizonColor = vec3(0.70, 0.86, 0.98);
        vec3 dayZenithColor = vec3(0.18, 0.48, 0.90);
        vec3 daySkyColor = mix(dayHorizonColor, dayZenithColor, pow(skyHeight, 0.65));
        vec3 nightHorizonColor = vec3(0.03, 0.06, 0.14);
        vec3 nightZenithColor = vec3(0.0, 0.0, 0.03);
        vec3 nightSkyColor = mix(nightHorizonColor, nightZenithColor, pow(skyHeight, 0.78));

        vec3 orbitStartDirection = normalize(vec3(-0.35, 0.82, -0.45));
        vec3 orbitHorizonDirection = normalize(vec3(orbitStartDirection.x, 0.0, orbitStartDirection.z));
        vec3 orbitNormal = normalize(cross(vec3(0.0, 1.0, 0.0), orbitHorizonDirection));
        float dayProgress = mod(uTime, DAY_DURATION) / DAY_DURATION;
        float solarArc = dayProgress * TAU;
        vec3 sunDirection = normalize(
            orbitHorizonDirection * sin(solarArc) + vec3(0.0, 1.0, 0.0) * -cos(solarArc)
        );
        vec3 moonDirection = -sunDirection;
        float dayMix = smoothstep(-0.06, 0.18, sunDirection.y);
        dayMix = smoothstep(0.04, 0.96, dayMix);
        float sunriseStrength = twilightWindow(dayProgress, SUNRISE_TIME, TWILIGHT_DURATION);
        float sunsetStrength = twilightWindow(dayProgress, SUNSET_TIME, TWILIGHT_DURATION);
        float twilightStrength = max(sunriseStrength, sunsetStrength);
        float sunAmount = max(dot(dir, sunDirection), 0.0);
        float sunDisk = smoothstep(0.9983, 0.99945, sunAmount);
        float sunGlow = pow(sunAmount, 54.0);
        float sunSideWide = pow(sunAmount, 1.35);
        float sunSideCore = pow(sunAmount, 10.0);
        float horizonBand = 1.0 - smoothstep(0.01, 0.24, max(dir.y, 0.0));
        horizonBand *= 1.0 - smoothstep(0.24, 0.48, max(dir.y, 0.0));
        float twilightBlend = twilightStrength * sunSideWide * (0.18 + 0.82 * horizonBand);
        vec3 sunriseColor = vec3(1.0, 0.48, 0.12);
        vec3 sunsetColor = vec3(0.96, 0.22, 0.05);
        vec3 twilightColor = mix(sunriseColor, sunsetColor, sunsetStrength / max(twilightStrength, 0.0001));
        float solarGlowStrength = mix(0.02, 0.12, smoothstep(-0.02, 0.24, sunDirection.y));
        vec3 sunGlowColor = mix(twilightColor, vec3(1.0, 0.92, 0.72), smoothstep(-0.04, 0.20, sunDirection.y));
        vec3 sunDiskColor = mix(vec3(1.0, 0.68, 0.22), vec3(1.0, 0.94, 0.80), smoothstep(-0.02, 0.16, sunDirection.y));

        vec3 moonRight = normalize(cross(orbitNormal, moonDirection));
        vec3 moonUp = normalize(cross(moonDirection, moonRight));
        vec2 moonUv = vec2(dot(dir, moonRight), dot(dir, moonUp));
        float moonRadius = 0.020;
        float moonFeather = 0.0025;
        float moonDisk = 1.0 - smoothstep(moonRadius, moonRadius + moonFeather, length(moonUv));
        float crescentShadow = 1.0 - smoothstep(
            moonRadius,
            moonRadius + moonFeather,
            length(moonUv + vec2(moonRadius * 0.62, 0.0))
        );
        float moonCrescent = moonDisk * (1.0 - crescentShadow);
        float moonHalo = (1.0 - smoothstep(moonRadius * 1.4, moonRadius * 3.0, length(moonUv))) * 0.18;
        vec3 moonBodyColor = vec3(0.72, 0.78, 0.84);
        vec3 moonLightColor = vec3(0.98, 0.99, 1.0);
        float nightMix = smoothstep(0.04, 0.86, 1.0 - dayMix);
        float starVisibility = nightMix * (1.0 - smoothstep(0.02, 0.42, twilightStrength));
        starVisibility *= smoothstep(-0.10, 0.05, dir.y);
        starVisibility *= mix(0.55, 1.0, skyHeight);
        float stars = starField(dir) * starVisibility;
        float starTint = fbm(dir * 28.0 + vec3(8.4, -2.6, 14.1)) * 0.5 + 0.5;
        vec3 starColor = mix(
            vec3(0.72, 0.82, 1.0),
            vec3(1.0, 0.93, 0.82),
            smoothstep(0.25, 0.85, starTint)
        );
        vec3 skyBackground = mix(nightSkyColor, daySkyColor, dayMix);
        skyBackground = mix(skyBackground, mix(skyBackground, twilightColor, 0.72), twilightBlend * 0.34);
        skyBackground = mix(skyBackground, twilightColor, twilightStrength * horizonBand * sunSideWide * 0.10);
        skyBackground += twilightColor * sunSideCore * twilightStrength * 0.025;
        skyBackground = mix(skyBackground, moonBodyColor, moonDisk * 0.06 * (1.0 - dayMix));
        skyBackground = mix(skyBackground, moonLightColor, moonCrescent * (1.0 - dayMix * 0.85));
        skyBackground += moonLightColor * moonHalo * (1.0 - dayMix * 0.9);
        skyBackground += sunGlowColor * sunGlow * solarGlowStrength;
        skyBackground += sunDiskColor * sunDisk;

        vec3 starBackground = starColor * stars * 3.2;

        vec3 color = skyBackground + starBackground;

        // Seam-free cloud sampling:
        // intersect the ray with a flat cloud slab and sample 3D noise there.
        // This avoids the 2D cloudUV projection that causes cube-edge distortion.
        if (dir.y > 0.0) {
            float cloudRayY = max(dir.y, 0.008);
            float tEnter = CLOUD_BOTTOM / cloudRayY;
            float tExit = CLOUD_TOP / cloudRayY;
            float stepCount = float(CLOUD_STEPS);
            float stepSize = (tExit - tEnter) / stepCount;

            float transmittance = 1.0;
            vec3 cloudAccum = vec3(0.0);

            float forwardScatter = pow(sunAmount, 8.0);
            float horizonFade = smoothstep(0.0, 0.06, dir.y);

            for (int i = 0; i < CLOUD_STEPS; i++) {
                float f = (float(i) + 0.5) / stepCount;
                float t = mix(tEnter, tExit, f);

                vec3 samplePos = dir * t;
                vec3 stepSeed = cloudStepSeed(float(i));
                float h = (samplePos.y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM);
                float radial = length(samplePos.xz);
                float rangeFade = cloudDistanceFade(radial);

                float density = sampleCloudDensity(samplePos, h, stepSeed) * rangeFade * horizonFade;
                density *= mix(0.35, 1.0, dayMix);

                if (density > 0.0001) {
                    float extinction = density * stepSize * CLOUD_DENSITY;
                    float alpha = 1.0 - exp(-extinction);

                    vec3 cloudBase = mix(vec3(0.10, 0.12, 0.18), vec3(0.92, 0.95, 0.98), dayMix);
                    vec3 cloudLit = mix(vec3(0.18, 0.21, 0.30), vec3(1.00, 0.99, 0.97), dayMix);

                    float directLight = mix(0.16, 0.35, dayMix) + 0.65 * pow(sunAmount, 2.0) * dayMix;
                    float lightTransmittance = exp(-density * 1.15);

                    vec3 sampleColor = mix(cloudBase, cloudLit, directLight * lightTransmittance);
                    sampleColor += vec3(1.0, 0.94, 0.82) * forwardScatter * alpha * 0.25;

                    cloudAccum += transmittance * alpha * sampleColor;
                    transmittance *= (1.0 - alpha);
                }
            }

            float starTransmittance = mix(transmittance, pow(transmittance, 0.45), nightMix);
            color = cloudAccum + transmittance * skyBackground + starTransmittance * starBackground;
        }

        gl_FragColor = vec4(color, 1.0);
    }
`;



export const enemyVSText = `
    precision mediump float;

    attribute vec3 aNorm;
    attribute vec4 skinIndices;
    attribute vec4 skinWeights;
	
	//vertices used for bone weights (assumes up to four weights per vertex)
    attribute vec4 v0;
    attribute vec4 v1;
    attribute vec4 v2;
    attribute vec4 v3;
    
    attribute vec4 aOffset;
    // attribute vec4 aRot;
    
    varying vec4 normal;
    varying vec4 wsPos;
    
    uniform vec4 uLightPos;    
    uniform mat4 uView;
    uniform mat4 uProj;

	//Joint translations and rotations to determine weights (assumes up to 64 joints per rig)
    uniform vec3 jTrans[64];
    uniform vec4 jRots[64];

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
    }

    void main () {
    
        vec3 weightedPos = vec3(0.0, 0.0, 0.0);
        vec3 weightedNormal = vec3(0.0, 0.0, 0.0);
        
        for (int i = 0; i < 4; i++) {
            float weight = skinWeights[i];
            
            if (weight > 0.0) {
                int index = int(skinIndices[i]);
                
                vec3 v = vec3(0.0, 0.0, 0.0);
                if (i == 0) { v = v0.xyz; }
                else if (i == 1) { v = v1.xyz; }
                else if (i == 2) { v = v2.xyz; }
                else if (i == 3) { v = v3.xyz; }
                
                weightedPos += weight * (jTrans[index] + qtrans(jRots[index], v));
                weightedNormal += weight * qtrans(jRots[index], aNorm);
            }
        }
        	
        wsPos = aOffset + vec4(weightedPos, 1.0);
        normal = normalize(vec4(weightedNormal, 0.0));	

        gl_Position = uProj * uView * wsPos;
    }

`;

export const enemyFSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    uniform float uTime;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;

    void main () {
        vec3 kd = vec3(1.0, 1.0, 1.0);
        vec3 ka = vec3(0.1, 0.1, 0.1);
        
        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), normalize(normal));
	    dot_nl = clamp(dot_nl, 0.0, 1.0);

        vec3 textureColor = vec3(0.4, 0.1, 0.1);

        gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0) * textureColor, 1.0);
        
        //gl_FragColor = vec4((normal.x + 1.0)/2.0, (normal.y + 1.0)/2.0, (normal.z + 1.0)/2.0,1.0);
    }
`;
