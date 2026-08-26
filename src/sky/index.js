/* ==========================================================================
 * Escape-From-Larpov · src/sky/index.js
 *
 * Sky dome: atmospheric scattering (Rayleigh + Mie + aerosol) and a two-deck
 * cloud layer, drawn as one primitive centred on the camera.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS BROKEN — fatal boot crash, black screen
 * ---------------------------------------------------------------------------
 *   ReferenceError: SKY_FRAGMENT_SHADER is not defined
 *       at SkySystem.init (index.js:171:28)
 *
 * `init()` referenced SKY_VERTEX_SHADER and SKY_FRAGMENT_SHADER, but neither
 * was ever declared or imported in this file: the two GLSL constants were lost
 * in an earlier upload. The stubs left behind in the class body
 * («... дальше ваш конструктор и метод async init(ctx)») are from that same
 * truncated edit. Both shaders are restored below in full and are exported, so
 * the shader guard and any test can reach them.
 *
 * A second, latent black screen is fixed with them. The dome was scaled to 8000
 * while the gameplay camera's far plane is 1200 (src/core/engine.js), so every
 * dome vertex sat outside the frustum and the entire mesh was clipped away.
 * `depthTest: false` does not help — far-plane clipping happens in clip space,
 * before the depth test ever runs. The dome is now sized from `camera.far`, and
 * the vertex shader pins it to the far plane so its radius stops mattering.
 *
 * ---------------------------------------------------------------------------
 * [X3595] LOOP AND DERIVATIVE POLICY — do not regress this
 * ---------------------------------------------------------------------------
 * Every `for` loop in the fragment shader is bounded by a compile-time constant
 * that arrives through THREE.ShaderMaterial.defines (STEPS, LIGHT_STEPS), never
 * by a uniform, and no loop contains a `break`. The step counts are part of the
 * material's permutation key, so changing quality recompiles the program rather
 * than branching per pixel at runtime. `assertStaticLoopBounds` fails the build
 * loudly if that ever regresses.
 *
 * The shader is also completely free of implicit-derivative instructions:
 * texture reads use `textureLod()` with an analytically derived level, and edge
 * antialiasing uses fixed angular widths instead of `fwidth()`. That removes
 * the "gradient instruction used in a loop with varying iteration" class of
 * driver stalls at the root instead of working around it, and it is why the
 * cloud march may branch freely without paying for it.
 *
 * Cost, per pixel, at the `high` preset: STEPS (44) ALU-only atmosphere steps,
 * plus 3 texture reads for the cumulus density, LIGHT_STEPS (8) for its light
 * march and 2 for the cirrus veil. No nested marches, no render targets, no
 * per-frame allocation.
 *
 * ---------------------------------------------------------------------------
 * Registry contract (src/core/registry.js)
 * ---------------------------------------------------------------------------
 *   static id = 'sky'        unique id, fetched by others via ctx.get('sky')
 *   static deps = ['render'] the renderer must exist before we init
 *   async init(ctx)          builds every resource
 *   update(dt, ctx)          once per frame, before render
 *   dispose()                frees GPU resources
 *
 * No sibling subsystem is imported: the renderer is resolved through ctx.
 * ========================================================================== */

import * as THREE from 'three';

/* --------------------------------------------------------------------------
 * Procedural tiling cloud noise.
 *
 * R, G and B hold value-noise FBM at three different base frequencies, so a
 * single texture read is worth three octaves in the shader. The mip pyramid is
 * what makes the shader's explicit LOD meaningful — without it, grazing rays
 * near the horizon alias into a shimmering mess.
 * ------------------------------------------------------------------------ */
export function createCloudNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);

  const hash = (x, y, seed) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
    return s - Math.floor(s);
  };
  const fade = (t) => t * t * (3 - 2 * t);

  const valueNoise = (u, v, freq, seed) => {
    const fx = u * freq;
    const fy = v * freq;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fade(fx - ix);
    const ty = fade(fy - iy);
    const wrap = (n) => ((n % freq) + freq) % freq;
    const x0 = wrap(ix);
    const x1 = wrap(ix + 1);
    const y0 = wrap(iy);
    const y1 = wrap(iy + 1);
    const a = hash(x0, y0, seed);
    const b = hash(x1, y0, seed);
    const c = hash(x0, y1, seed);
    const d = hash(x1, y1, seed);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };

  const fbm = (u, v, base, seed) => {
    let sum = 0;
    let amp = 0.5;
    let freq = base;
    for (let o = 0; o < 4; o++) {
      sum += valueNoise(u, v, freq, seed + o) * amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum;
  };

  const byte = (n) => Math.max(0, Math.min(255, Math.round(n * 255)));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      data[i + 0] = byte(fbm(u, v, 4, 11));
      data[i + 1] = byte(fbm(u, v, 8, 23));
      data[i + 2] = byte(fbm(u, v, 16, 37));
      data[i + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.name = 'EFL_CloudNoise';
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  /* Noise is data, not colour: it must never go through a transfer function. */
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* --------------------------------------------------------------------------
 * Quality presets.
 *
 * These become #defines, i.e. part of the shader permutation key. STEPS is the
 * atmosphere march; LIGHT_STEPS is the in-cloud light march; CLOUDS compiles
 * the whole cloud path in or out.
 * ------------------------------------------------------------------------ */
export const SKY_QUALITY_PRESETS = {
  low:    { STEPS: 16, LIGHT_STEPS: 4,  CLOUDS: 0 },
  medium: { STEPS: 28, LIGHT_STEPS: 6,  CLOUDS: 1 },
  high:   { STEPS: 44, LIGHT_STEPS: 8,  CLOUDS: 1 },
  ultra:  { STEPS: 64, LIGHT_STEPS: 12, CLOUDS: 1 },
};

/* --------------------------------------------------------------------------
 * Weather presets.
 *
 * rayleigh scales the molecular coefficients, mie the aerosol ones (1/Mm, so
 * the uniforms carry 5.8 / 13.5 / 33.1 at rayleigh = 1.0), turbidity the haze
 * on top of that. `overcast` is unchanged and remains the default.
 * ------------------------------------------------------------------------ */
export const SKY_WEATHER_PRESETS = {
  clear:    { turbidity: 2.2, rayleigh: 1.00, mie: 0.0035, mieG: 0.76, coverage: 0.18, density: 22, exposure: 0.34 },
  hazy:     { turbidity: 4.4, rayleigh: 1.20, mie: 0.0065, mieG: 0.74, coverage: 0.42, density: 32, exposure: 0.32 },
  overcast: { turbidity: 6.5, rayleigh: 1.45, mie: 0.0090, mieG: 0.72, coverage: 0.72, density: 46, exposure: 0.30 },
  storm:    { turbidity: 8.5, rayleigh: 1.60, mie: 0.0125, mieG: 0.70, coverage: 0.92, density: 68, exposure: 0.22 },
};

/* ==========================================================================
 * GLSL — restored. GLSL ES 3.00, matching the rest of src/sky/.
 * ========================================================================== */

export const SKY_VERTEX_SHADER = /* glsl */ `
out vec3 vRayDir;

void main() {
  /* The dome is re-centred on the camera every frame, so its object-space
   * position is the view direction once the model rotation and scale are
   * applied. Normalised in the fragment shader. */
  vRayDir = mat3( modelMatrix ) * position;

  vec4 clip = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  /* Pin the dome to the far plane. Without this a dome larger than camera.far
   * is clipped away in clip space and the frame comes back black —
   * depthTest:false cannot save it, because clipping happens before the depth
   * test. With it, the dome radius stops mattering. */
  clip.z = clip.w;
  gl_Position = clip;
}
`;

export const SKY_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

/* ---- compile-time quality knobs -----------------------------------------
 * Real values arrive through THREE.ShaderMaterial.defines (SkySystem._defines).
 * These fallbacks only exist so this source stays compilable standalone.
 * [X3595] They MUST stay #defines: every loop bound below is one of them. */
#ifndef STEPS
  #define STEPS 32
#endif
#ifndef LIGHT_STEPS
  #define LIGHT_STEPS 6
#endif
#ifndef CLOUDS
  #define CLOUDS 1
#endif

const float PI = 3.141592653589793;
const float INV_PI = 0.3183098861837907;
const float INV_4PI = 0.07957747154594767;

/* Planetary shell, metres. */
const float R_GROUND = 6371000.0;
const float R_TOP = 6471000.0;
const float H_RAY = 8000.0;
const float H_MIE = 1200.0;
const float X_RAY = R_GROUND / H_RAY;
const float X_MIE = R_GROUND / H_MIE;

/* Angular radius of the sun, and the factor it is drawn oversize by so it
 * survives TAA and the sharpen filter. Energy is divided by the area factor,
 * so a larger disc is not a brighter sun. */
const float SUN_ANGULAR_R = 0.00465;
const float SUN_DRAW_SCALE = 2.4;
const float SUN_SOLID_ANGLE = 6.7935e-5;

/* Energy returned by second- and higher-order scattering, which a
 * single-scattering integral cannot see. Without it the zenith is too dark and
 * an overcast sky goes grey-black instead of luminous. */
const float MULTI_SCATTER = 0.55;

uniform vec3 uSunDirection;
uniform vec3 uRayleighCoeff;
uniform vec3 uGroundAlbedo;
uniform float uMieCoeff;
uniform float uMieG;
uniform float uTurbidity;
uniform float uSunIntensity;
uniform float uExposure;
uniform float uTime;
uniform float uCameraHeight;
uniform float uCloudCoverage;
uniform float uCloudDensity;
uniform float uCloudAltitude;
uniform float uCloudSpeed;
uniform float uCloudNoiseSize;
uniform sampler2D uCloudNoise;

in vec3 vRayDir;
layout(location = 0) out vec4 fragColor;

/* ---- media ---------------------------------------------------------------
 * The presets carry the coefficients in the conventional 1/Mm units, so they
 * are scaled to 1/m here and nowhere else. */
vec3 betaRayleigh() {
  return max( uRayleighCoeff, vec3( 0.0 ) ) * 1.0e-6;
}

float betaMie() {
  return max( uMieCoeff, 0.0 ) * 1.0e-6 * ( 0.55 + 0.075 * max( uTurbidity, 0.0 ) );
}

/* Aerosol single-scattering albedo is about 0.9, so extinction sits a little
 * above scattering. That difference is what greys a hazy horizon. */
float betaMieExt() {
  return betaMie() / 0.9;
}

/* Nearest positive hit of a ray against a sphere centred on the origin. */
float raySphere( vec3 ro, vec3 rd, float radius ) {
  float b = dot( ro, rd );
  float c = dot( ro, ro ) - radius * radius;
  float d = b * b - c;
  if ( d < 0.0 ) return -1.0;
  d = sqrt( d );
  float t1 = -b + d;
  if ( t1 < 0.0 ) return -1.0;
  float t0 = -b - d;
  return t0 < 0.0 ? t1 : t0;
}

float phaseRayleigh( float mu ) {
  return 3.0 / ( 16.0 * PI ) * ( 1.0 + mu * mu );
}

float phaseHG( float mu, float g ) {
  float g2 = g * g;
  float d = max( 1.0e-4, 1.0 + g2 - 2.0 * g * mu );
  return INV_4PI * ( 1.0 - g2 ) / ( d * sqrt( d ) );
}

/* Chapman function: column density along a ray leaving altitude h (in scale
 * heights) at zenith cosine mu, expressed in scale heights. Correct in both
 * limits that matter — 1.0 straight up, sqrt(pi*X/2) along the horizon — which
 * is what makes a low sun redden properly instead of merely dimming.
 *
 * Only the upward branch exists, deliberately: the analytic continuation for
 * downward rays contains exp(X), which overflows to Inf for a real planet and
 * would poison the frame. Rays that dive into the planet are handled by
 * sunVisibility() instead. */
float chapman( float X, float h, float mu ) {
  float c = sqrt( 0.5 * PI * ( X + h ) );
  return c / ( c * max( mu, 0.0 ) + 1.0 ) * exp( -h );
}

/* Geometric terminator, softened by roughly the atmospheric refraction plus
 * the solar radius. Below it the light ray has crossed the planet. */
float sunVisibility( float mu ) {
  return smoothstep( -0.035, 0.020, mu );
}

/* Transmittance from an altitude out to space along a light ray. */
vec3 lightTransmittance( float altitude, float mu ) {
  float alt = max( altitude, 0.0 );
  float hR = alt / H_RAY;
  float hM = alt / H_MIE;
  vec3 od = betaRayleigh() * ( H_RAY * chapman( X_RAY, hR, mu ) )
          + vec3( betaMieExt() * ( H_MIE * chapman( X_MIE, hM, mu ) ) );
  return exp( -od ) * sunVisibility( mu );
}

/* Sun irradiance reaching a given altitude, in scene light units. */
vec3 sunIrradiance( float altitude, vec3 sunDir ) {
  return vec3( max( uSunIntensity, 0.0 ) ) * lightTransmittance( altitude, sunDir.y );
}

/* ---- atmosphere ---------------------------------------------------------
 * Single scattering along the view ray. The light-ray optical depth comes from
 * chapman() analytically rather than from a nested march, which is what keeps
 * this to one loop: a nested STEPS x LIGHT_STEPS march is 350+ iterations per
 * pixel and is exactly the shape that stalls drivers.
 *
 * [X3595] One loop, bound by the STEPS #define, no break, no texture read, no
 * derivative. */
void atmosphere( vec3 ro, vec3 rd, vec3 sunDir, out vec3 radiance, out vec3 viewTransmittance ) {
  radiance = vec3( 0.0 );
  viewTransmittance = vec3( 1.0 );

  float tTop = raySphere( ro, rd, R_TOP );
  float tGround = raySphere( ro, rd, R_GROUND );
  float tMax = tGround > 0.0 ? tGround : tTop;
  if ( tMax <= 0.0 ) return;

  vec3 betaR = betaRayleigh();
  float betaM = betaMie();
  float betaMe = betaMieExt();

  float mu = dot( rd, sunDir );
  float pR = phaseRayleigh( mu );
  float pM = phaseHG( mu, clamp( uMieG, -0.95, 0.95 ) );

  float dt = tMax / float( STEPS );
  float t = 0.5 * dt;
  float odR = 0.0;
  float odM = 0.0;
  vec3 sumR = vec3( 0.0 );
  vec3 sumM = vec3( 0.0 );

  for ( int i = 0; i < STEPS; i ++ ) {
    vec3 p = ro + rd * t;
    float r = max( length( p ), R_GROUND );
    float alt = r - R_GROUND;
    float dR = exp( -alt / H_RAY );
    float dM = exp( -alt / H_MIE );

    odR += dR * dt;
    odM += dM * dt;

    vec3 tView = exp( -( betaR * odR + vec3( betaMe * odM ) ) );
    vec3 tSun = lightTransmittance( alt, dot( p / r, sunDir ) );
    vec3 w = tView * tSun * dt;

    sumR += w * dR;
    sumM += w * dM;
    t += dt;
  }

  viewTransmittance = exp( -( betaR * odR + vec3( betaMe * odM ) ) );

  float sun = max( uSunIntensity, 0.0 );
  radiance = sun * ( betaR * ( pR * sumR ) + vec3( betaM * pM ) * sumM )
           + sun * ( MULTI_SCATTER * INV_4PI ) * ( betaR * sumR + vec3( betaM ) * sumM );
}

#if CLOUDS

/* One read is worth three octaves: createCloudNoiseTexture packs value noise at
 * frequencies 4, 8 and 16 into R, G and B.
 *
 * textureLod, never texture(): an implicit LOD inside a loop is precisely what
 * makes a driver emit "gradient instruction used in a loop with varying
 * iteration", and it is unnecessary here because the correct filter width is a
 * function of the ray elevation, which we know analytically. */
float cloudTap( vec2 uv, float lod ) {
  vec3 n = textureLod( uCloudNoise, uv, lod ).rgb;
  return n.r * 0.55 + n.g * 0.30 + n.b * 0.15;
}

/* Nine effective octaves from three reads, manually unrolled — cheaper than a
 * loop and immune to it. */
float cloudFbm( vec2 