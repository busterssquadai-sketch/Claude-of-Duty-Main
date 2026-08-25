/* ==========================================================================
 * Escape-From-Larpov · src/render/postfx.js
 * Композитный пост-процессинг: грейдинг (Emilia / Feather / Cognac),
 * резкость, шум, хроматическая аберрация, виньетка, TAA, SSR
 * и режим нашлемной камеры (fisheye + VHS + REC).
 * Важно: в шейдерах НЕТ ни одного цикла — все тапы развёрнуты вручную,
 * поэтому X3595 здесь невозможен в принципе.
 * ========================================================================== */

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js'
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js'

export const COLOR_GRADING_PROFILES = {
  none: {
    saturation: 1.00, contrast: 1.00, temperature: 0.00, tintGreen: 0.00,
    lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], fade: 0,
  },
  emilia: {
    saturation: 0.62, contrast: 1.12, temperature: -0.18, tintGreen: 0.07,
    lift: [0.010, 0.021, 0.017], gamma: [0.98, 1.03, 0.99], gain: [0.90, 1.00, 0.93], fade: 0.06,
  },
  feather: {
    saturation: 0.80, contrast: 0.94, temperature: 0.04, tintGreen: 0.02,
    lift: [0.026, 0.026, 0.030], gamma: [1.04, 1.03, 1.02], gain: [1.02, 1.01, 1.00], fade: 0.14,
  },
  cognac: {
    saturation: 0.92, contrast: 1.08, temperature: 0.22, tintGreen: -0.04,
    lift: [0.020, 0.010, 0.000], gamma: [1.02, 0.99, 0.95], gain: [1.08, 1.00, 0.88], fade: 0.04,
  },
}

const FULLSCREEN_VERTEX = /* glsl */ `<br>varying vec2 vUv;<br>void main() {<br>  vUv = uv;<br>  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);<br>}<br>`

/* ---------------------------- Грейдинг + резкость + шум + аберрация */
export const EFL_GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uEnabled: { value: 1.0 },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    uTime: { value: 0 },
    uBrightness: { value: 0.5 },
    uClarity: { value: 0.42 },
    uLumaSharpen: { value: 0.35 },
    uAdaptiveSharpen: { value: 0.25 },
    uSaturation: { value: 0.62 },
    uContrast: { value: 1.12 },
    uTemperature: { value: -0.18 },
    uTintGreen: { value: 0.07 },
    uLift: { value: new THREE.Vector3(0.010, 0.021, 0.017) },
    uGamma: { value: new THREE.Vector3(0.98, 1.03, 0.99) },
    uGain: { value: new THREE.Vector3(0.90, 1.00, 0.93) },
    uFade: { value: 0.06 },
    uGrain: { value: 0.35 },
    uChroma: { value: 0.0 },
    uVignette: { value: 0.65 },
  },
  vertexShader: FULLSCREEN_VERTEX,
  fragmentShader: /* glsl */ `<br>precision highp float;<br><br>uniform sampler2D tDiffuse;<br>uniform float uEnabled;<br>uniform vec2  uResolution;<br>uniform float uTime;<br>uniform float uBrightness;<br>uniform float uClarity;<br>uniform float uLumaSharpen;<br>uniform float uAdaptiveSharpen;<br>uniform float uSaturation;<br>uniform float uContrast;<br>uniform float uTemperature;<br>uniform float uTintGreen;<br>uniform vec3  uLift;<br>uniform vec3  uGamma;<br>uniform vec3  uGain;<br>uniform float uFade;<br>uniform float uGrain;<br>uniform float uChroma;<br>uniform float uVignette;<br><br>varying vec2 vUv;<br><br>const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);<br><br>float hash12(vec2 p) {<br>  vec3 p3 = fract(vec3(p.xyx) * 0.1031);<br>  p3 += dot(p3, p3.yzx + 33.33);<br>  return fract((p3.x + p3.y) * p3.z);<br>}<br><br>vec3 sampleChroma(vec2 uv, float amount) {<br>  vec2 dir = uv - 0.5;<br>  float r = texture2D(tDiffuse, uv + dir * amount).r;<br>  float g = texture2D(tDiffuse, uv).g;<br>  float b = texture2D(tDiffuse, uv - dir * amount).b;<br>  return vec3(r, g, b);<br>}<br><br>void main() {<br>  vec2 texel = 1.0 / uResolution;<br>  vec3 base = uChroma > 0.0001 ? sampleChroma(vUv, uChroma) : texture2D(tDiffuse, vUv).rgb;<br><br>  if (uEnabled < 0.5) {<br>    gl_FragColor = vec4(base, 1.0);<br>    return;<br>  }<br><br>  /* Резкость: развёрнутое крестовое ядро, без циклов */<br>  vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb;<br>  vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;<br>  vec3 e = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb;<br>  vec3 w = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;<br>  vec3 blur = (n + s + e + w) * 0.25;<br><br>  float localVar = abs(dot(base - blur, LUMA));<br>  float adaptive = mix(1.0, 1.0 - clamp(localVar * 8.0, 0.0, 1.0), uAdaptiveSharpen);<br>  vec3 sharpened = base + (base - blur) * (uLumaSharpen * 1.6 * adaptive);<br><br>  /* Чёткость — мягкий local contrast по яркости */<br>  float lumaBase = dot(sharpened, LUMA);<br>  float lumaBlur = dot(blur, LUMA);<br>  sharpened += (lumaBase - lumaBlur) * uClarity * 0.9;<br><br>  vec3 color = max(sharpened, vec3(0.0));<br><br>  /* Яркость: 0.5 = нейтраль */<br>  color *= mix(0.55, 1.65, clamp(uBrightness, 0.0, 1.0));<br><br>  /* Температура и зелёный tint (тарковский холод) */<br>  color.r *= 1.0 + uTemperature * 0.35;<br>  color.b *= 1.0 - uTemperature * 0.35;<br>  color.g *= 1.0 + uTintGreen * 0.30;<br><br>  /* Lift / Gamma / Gain */<br>  color = color * uGain + uLift;<br>  color = pow(max(color, vec3(1e-5)), vec3(1.0) / uGamma);<br><br>  /* Контраст вокруг среднего серого */<br>  color = (color - 0.18) * uContrast + 0.18;<br><br>  /* Десатурация */<br>  float gray = dot(color, LUMA);<br>  color = mix(vec3(gray), color, uSaturation);<br><br>  /* Fade (поднятие теней в серо-зелёный) */<br>  color = mix(color, vec3(0.055, 0.062, 0.058) + color * 0.86, uFade);<br><br>  /* Зерно */<br>  float grain = (hash12(vUv * uResolution + uTime * 60.0) - 0.5) * uGrain * 0.12;<br>  color += grain;<br><br>  /* Виньетка */<br>  float d = distance(vUv, vec2(0.5));<br>  color *= 1.0 - smoothstep(0.35, 0.95, d) * uVignette * 0.85;<br><br>  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);<br>}<br>`,
}

/* --------------------------------- Нашлемная камера (Bodycam) */
export const EFL_BodycamShader = {
  uniforms: {
    tDiffuse: { value: null },
    uEnabled: { value: 0.0 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    uFisheye: { value: 0.30 },
    uGrain: { value: 0.38 },
    uVhs: { value: 0.45 },
    uRec: { value: 1.0 },
  },
  vertexShader: FULLSCREEN_VERTEX,
  fragmentShader: /* glsl */ `<br>precision highp float;<br><br>uniform sampler2D tDiffuse;<br>uniform float uEnabled;<br>uniform float uTime;<br>uniform vec2  uResolution;<br>uniform float uFisheye;<br>uniform float uGrain;<br>uniform float uVhs;<br>uniform float uRec;<br><br>varying vec2 vUv;<br><br>float hash12(vec2 p) {<br>  vec3 p3 = fract(vec3(p.xyx) * 0.1031);<br>  p3 += dot(p3, p3.yzx + 33.33);<br>  return fract((p3.x + p3.y) * p3.z);<br>}<br><br>void main() {<br>  if (uEnabled < 0.5) {<br>    gl_FragColor = texture2D(tDiffuse, vUv);<br>    return;<br>  }<br><br>  /* Fisheye */<br>  vec2 c = vUv - 0.5;<br>  float r2 = dot(c, c);<br>  vec2 uv = 0.5 + c * (1.0 + uFisheye * r2 * 1.9);<br><br>  /* VHS tracking: горизонтальный сдвиг полосой */<br>  float band = step(0.985, fract(vUv.y * 1.6 - uTime * 0.22));<br>  uv.x += band * uVhs * 0.020 * (hash12(vec2(uTime, vUv.y)) - 0.5);<br><br>  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {<br>    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);<br>    return;<br>  }<br><br>  /* Лёгкая RGB-расстройка по краю кадра */<br>  float ca = 0.0016 + r2 * 0.004;<br>  vec3 color = vec3(<br>    texture2D(tDiffuse, uv + vec2(ca, 0.0)).r,<br>    texture2D(tDiffuse, uv).g,<br>    texture2D(tDiffuse, uv - vec2(ca, 0.0)).b<br>  );<br><br>  /* Сканлайны + шум матрицы */<br>  float scan = 0.94 + 0.06 * sin(vUv.y * uResolution.y * 1.6);<br>  color *= scan;<br>  color += (hash12(uv * uResolution + uTime * 90.0) - 0.5) * uGrain * 0.16;<br><br>  /* Виньетка объектива */<br>  color *= 1.0 - smoothstep(0.28, 0.78, sqrt(r2)) * 0.85;<br><br>  /* Метка REC: красная точка в левом верхнем углу, мигает 1 Гц */<br>  vec2 recPos = vec2(0.055, 0.93);<br>  float dot0 = 1.0 - smoothstep(0.006, 0.009, distance(vUv, recPos));<br>  float blink = step(0.5, fract(uTime));<br>  color = mix(color, vec3(0.95, 0.12, 0.08), dot0 * blink * uRec);<br><br>  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);<br>}<br>`,
}

/* ==========================================================================
 * PostFxPipeline
 * ========================================================================== */
export class PostFxPipeline {
  constructor(ctx, options = {}) {
    this.ctx = ctx
    this.renderer = options.renderer
    this.scene = options.scene
    this.camera = options.camera
    this.enabled = true
    this._time = 0

    this.composer = new EffectComposer(this.renderer)

    this.renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(this.renderPass)

    this.taaPass = new TAARenderPass(this.scene, this.camera)
    this.taaPass.sampleLevel = 2
    this.taaPass.unbiased = false
    this.taaPass.enabled = false
    this.composer.addPass(this.taaPass)

    this.ssrPass = new SSRPass({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      width: window.innerWidth,
      height: window.innerHeight,
      groundReflector: null,
      selects: null,
    })
    this.ssrPass.enabled = false
    this.composer.addPass(this.ssrPass)

    this.gradePass = new ShaderPass(EFL_GradeShader)
    this.composer.addPass(this.gradePass)

    this.bodycamPass = new ShaderPass(EFL_BodycamShader)
    this.composer.addPass(this.bodycamPass)

    this.setSize(window.innerWidth, window.innerHeight)
  }

  _grade() { return this.gradePass.uniforms }
  _body() { return this.bodycamPass.uniforms }

  setSize(width, height) {
    this.composer.setSize(width, height)
    const dpr = this.renderer && this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : 1
    this._grade().uResolution.value.set(width * dpr, height * dpr)
    this._body().uResolution.value.set(width * dpr, height * dpr)
    if (this.ssrPass && typeof this.ssrPass.setSize === 'function') this.ssrPass.setSize(width, height)
    return this
  }

  setEnabled(value) {
    this.enabled = !!value
    this._grade().uEnabled.value = value ? 1 : 0
    return this
  }

  setBrightness(v) { this._grade().uBrightness.value = v; return this }
  setClarity(v) { this._grade().uClarity.value = v; return this }
  setLumaSharpen(v) { this._grade().uLumaSharpen.value = v; return this }
  setAdaptiveSharpen(v) { this._grade().uAdaptiveSharpen.value = v; return this }
  setGrain(v) { this._grade().uGrain.value = v; return this }
  setChromaticAberration(v) { this._grade().uChroma.value = v; return this }
  setVignette(v) { this._grade().uVignette.value = v; return this }
  setBloom(v) { this.bloomStrength = v; return this }

  /* Emilia применяется мгновенно: только uniform-ы, без перекомпиляции */
  setColorGrading(name, preset) {
    const p = preset || COLOR_GRADING_PROFILES[name] || COLOR_GRADING_PROFILES.none
    const u = this._grade()
    u.uSaturation.value = p.saturation
    u.uContrast.value = p.contrast
    u.uTemperature.value = p.temperature
    u.uTintGreen.value = p.tintGreen
    u.uLift.value.set(p.lift[0], p.lift[1], p.lift[2])
    u.uGamma.value.set(p.gamma[0], p.gamma[1], p.gamma[2])
    u.uGain.value.set(p.gain[0], p.gain[1], p.gain[2])
    u.uFade.value = p.fade
    this.gradingName = name
    return this
  }

  setTaa(value) {
    this.taaPass.enabled = !!value
    this.renderPass.enabled = !value
    return this
  }

  setSsr(intensity) {
    const on = intensity > 0
    this.ssrPass.enabled = on
    if (on) {
      this.ssrPass.opacity = intensity
      this.ssrPass.maxDistance = 0.1 + intensity * 0.6
      this.ssrPass.thickness = 0.018
      this.ssrPass.blur = intensity < 0.75
    }
    return this
  }

  setBodycam(value, opts = {}) {
    const u = this._body()
    u.uEnabled.value = value ? 1 : 0
    if (opts.fisheye != null) u.uFisheye.value = opts.fisheye
    if (opts.grain != null) u.uGrain.value = opts.grain
    if (opts.vhs != null) u.uVhs.value = opts.vhs
    if (opts.rec != null) u.uRec.value = opts.rec ? 1 : 0
    return this
  }

  render(dt = 0.016) {
    this._time += dt
    this._grade().uTime.value = this._time
    this._body().uTime.value = this._time
    this.composer.render(dt)
    return this
  }

  dispose() {
    if (this.composer && typeof this.composer.dispose === 'function') this.composer.dispose()
  }
}

export default PostFxPipeline