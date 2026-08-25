/* ==========================================================================
 * Escape-From-Larpov · src/sky/index.js
 * Небесный купол: атмосферное рассеивание (Rayleigh + Mie) и объёмные облака.
 * ========================================================================== */

import * as THREE from 'three'

/* --------------------------------------------------------------------------
 * Процедурный тайлящийся шум облаков (RGB = три частоты) c мип-пирамидой,
 * без которой явный LOD не имеет смысла.
 * ------------------------------------------------------------------------ */
export function createCloudNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4)

  const hash = (x, y, seed) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
    return s - Math.floor(s)
  }
  const fade = t => t * t * (3 - 2 * t)

  const valueNoise = (u, v, freq, seed) => {
    const fx = u * freq, fy = v * freq
    const ix = Math.floor(fx), iy = Math.floor(fy)
    const tx = fade(fx - ix), ty = fade(fy - iy)
    const wrap = n => ((n % freq) + freq) % freq
    const x0 = wrap(ix), x1 = wrap(ix + 1)
    const y0 = wrap(iy), y1 = wrap(iy + 1)
    const a = hash(x0, y0, seed), b = hash(x1, y0, seed)
    const c = hash(x0, y1, seed), d = hash(x1, y1, seed)
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty
  }

  const fbm = (u, v, base, seed) => {
    let sum = 0, amp = 0.5, freq = base
    for (let o = 0; o < 4; o++) {
      sum += valueNoise(u, v, freq, seed + o) * amp
      amp *= 0.5
      freq *= 2
    }
    return sum
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size
      const i = (y * size + x) * 4
      data[i + 0] = Math.max(0, Math.min(255, Math.round(fbm(u, v, 4,  11) * 255)))
      data[i + 1] = Math.max(0, Math.min(255, Math.round(fbm(u, v, 8,  23) * 255)))
      data[i + 2] = Math.max(0, Math.min(255, Math.round(fbm(u, v, 16, 37) * 255)))
      data[i + 3] = 255
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

/* --------------------------------------------------------------------------
 * Дополнительные константы, если они запрашиваются конструктором
 * ------------------------------------------------------------------------ */
export const SKY_QUALITY_PRESETS = {
  low:    { STEPS: 16, LIGHT_STEPS: 4,  CLOUDS: 0 },
  medium: { STEPS: 28, LIGHT_STEPS: 6,  CLOUDS: 1 },
  high:   { STEPS: 44, LIGHT_STEPS: 8,  CLOUDS: 1 },
  ultra:  { STEPS: 64, LIGHT_STEPS: 12, CLOUDS: 1 },
}

export const SKY_WEATHER_PRESETS = {
  overcast: { turbidity: 6.5, rayleigh: 1.45, mie: 0.0090, mieG: 0.72, coverage: 0.72, density: 46, exposure: 0.30 },
}

/* ==========================================================================
 * Валидаторы шейдеров и компиляции (Фикс ReferenceError)
 * ========================================================================== */
const LOOP_RE = /for\s*\(\s*int\s+(\w+)\s*=\s*[^;]+;\s*\1\s*<\s*([A-Za-z_][\w.]*)/g;

export function assertStaticLoopBounds(source, label = 'shader') {
  const bad = [];
  let m;
  while ((m = LOOP_RE.exec(source)) !== null) {
    const bound = m[2];
    const isConstant = /^[A-Z0-9_]+$/.test(bound) || /^float\(/.test(bound);
    if (!isConstant) bad.push(bound);
  }
  if (bad.length) {
    const msg = '[X3595] ' + label + ': динамический предел цикла -> ' + bad.join(', ') +
      '. Используйте #define / defines материала.';
    if (typeof console !== 'undefined') console.error(msg);
    throw new Error(msg);
  }
  return true;
}

export function installShaderCompileGuard(renderer) {
  if (!renderer || !renderer.debug) return;
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const dump = s => (gl.getShaderInfoLog(s) || '').trim();
    console.error('[EFL/shader] link failed', {
      program: (gl.getProgramInfoLog(program) || '').trim(),
      vertex: dump(vs),
      fragment: dump(fs),
    });
  };
}

/* ==========================================================================
 * Класс SkySystem
 * ========================================================================== */
export class SkySystem {
  static id = 'sky'
  static deps = ['render']
  // ... дальше ваш конструктор и метод async init(ctx)

  constructor(options = {}) {
    this.options = options
    this.root = null
    this._elapsed = 0
    this.noiseTexture = createCloudNoiseTexture(256) // <-- Теперь отработает успешно!
  }
  
  // ... дальше ваш метод async init(ctx) и все остальные методы без изменений


  /**
   * Метод инициализации вызывается движком автоматически, передавая ctx.
   * Здесь мы безопасно подтягиваем все ресурсы через сервис-локатор.
   */
  async init(ctx) {
    this.ctx = ctx
    this.scene = ctx.scene
    this.camera = ctx.camera
    this.renderer = ctx.get('render')?.renderer || ctx.renderer

    this.quality = ctx.config?.quality || 'high'
    this.weather = 'overcast'
    this.elevation = 22
    this.azimuth = 145
    this.timeScale = 1

    const w = SKY_WEATHER_PRESETS[this.weather]

    this.uniforms = {
      uSunDirection:   { value: new THREE.Vector3(0.3, 0.4, 0.85).normalize() },
      uRayleighCoeff:  { value: new THREE.Vector3(5.8e-6, 13.5e-6, 33.1e-6).multiplyScalar(1e6 * w.rayleigh) },
      uGroundAlbedo:   { value: new THREE.Color(0x2b2a26) },
      uMieCoeff:       { value: w.mie * 1e3 },
      uMieG:           { value: w.mieG },
      uTurbidity:      { value: w.turbidity },
      uSunIntensity:   { value: 20 },
      uExposure:       { value: w.exposure },
      uTime:           { value: 0 },
      uCameraHeight:   { value: 2 },
      uCloudCoverage:  { value: w.coverage },
      uCloudDensity:   { value: w.density },
      uCloudAltitude:  { value: 1400 },
      uCloudSpeed:     { value: 1 },
      uCloudNoiseSize: { value: 12 },
      uCloudNoise:     { value: this.noiseTexture },
    }

    this.sunLight = new THREE.DirectionalLight(0xfff2e0, 2.2)
    this.sunLight.castShadow = true

    assertStaticLoopBounds(SKY_FRAGMENT_SHADER, 'src/sky/index.js#fragment')
    this.material = new THREE.ShaderMaterial({
      name: 'EFL_AtmosphereShader',
      uniforms: this.uniforms,
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      defines: this._defines(),
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      transparent: false,
    })
    this.material.extensions = { shaderTextureLOD: true, derivatives: true }

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.material)
    this.mesh.name = 'EFL_SkyDome'
    this.mesh.scale.setScalar(8000)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1000

    if (this.scene) {
      this.scene.add(this.mesh)
      this.scene.add(this.sunLight)
    }

    installShaderCompileGuard(this.renderer)
    this.setSunAngles(this.elevation, this.azimuth)
  }

  _defines() {
    const preset = SKY_QUALITY_PRESETS[this.quality] || SKY_QUALITY_PRESETS.high
    const defines = {
      STEPS: preset.STEPS,
      LIGHT_STEPS: preset.LIGHT_STEPS,
      CLOUDS: preset.CLOUDS,
    }
    if (this.renderer && this.renderer.outputColorSpace !== THREE.SRGBColorSpace) {
      defines.SRGB_ENCODE = 1
    }
    return defines
  }

  setQuality(name) {
    if (!SKY_QUALITY_PRESETS[name] || name === this.quality) return this
    this.quality = name
    if (this.material) {
      this.material.defines = this._defines()
      this.material.needsUpdate = true
    }
    return this
  }

  setWeather(name, lerp = 1) {
    const w = SKY_WEATHER_PRESETS[name]
    if (!w || !this.uniforms) return this
    this.weather = name
    const u = this.uniforms
    const mix = (a, b) => a + (b - a) * Math.max(0, Math.min(1, lerp))
    u.uTurbidity.value = mix(u.uTurbidity.value, w.turbidity)
    u.uMieCoeff.value = mix(u.uMieCoeff.value, w.mie * 1e3)
    u.uMieG.value = mix(u.uMieG.value, w.mieG)
    u.uCloudCoverage.value = mix(u.uCloudCoverage.value, w.coverage)
    u.uCloudDensity.value = mix(u.uCloudDensity.value, w.density)
    u.uExposure.value = mix(u.uExposure.value, w.exposure)
    u.uRayleighCoeff.value.set(5.8, 13.5, 33.1).multiplyScalar(w.rayleigh)
    return this
  }

  setSunAngles(elevationDeg, azimuthDeg) {
    this.elevation = elevationDeg
    this.azimuth = azimuthDeg
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg)
    const theta = THREE.MathUtils.degToRad(azimuthDeg)
    const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta)
    if (this.uniforms) this.uniforms.uSunDirection.value.copy(dir)
    if (this.sunLight) {
      this.sunLight.position.copy(dir).multiplyScalar(2000)
      this.sunLight.intensity = Math.max(0.05, Math.sin(THREE.MathUtils.degToRad(Math.max(elevationDeg, 0))) * 2.6)
    }
    return this
  }

  // ОБНОВЛЕННАЯ СИГНАТУРА ПОД ФРЕЙМЛУП ДВИЖКА (src/core/engine.js)
  update(dt, ctx) {
    this._elapsed += dt * this.timeScale
    if (this.uniforms) this.uniforms.uTime.value = this._elapsed
    if (this.camera && this.mesh) {
      if (this.uniforms) this.uniforms.uCameraHeight.value = Math.max(1, this.camera.position.y)
      this.mesh.position.copy(this.camera.position)
    }
  }

  dispose() {
    if (this.scene && this.mesh) this.scene.remove(this.mesh)
    if (this.mesh) this.mesh.geometry.dispose()
    if (this.material) this.material.dispose()
    if (this.noiseTexture) this.noiseTexture.dispose()
  }
}

export default SkySystem
