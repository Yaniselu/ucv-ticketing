// Iarba terenului, de aproape: fire 3D prin „shell texturing” — 20 de straturi suprapuse între sol
// și vârful firelor (3 cm, ca gazonul de competiție). Fiecare fir e o celulă de 6 mm cu înălțime
// și poziție aleatoare, care se subțiază spre vârf; firele sunt culcate după dunga de tuns, deci
// dungile se schimbă cu direcția din care privești. Culoarea vine din textura gazonului (marcajele,
// uzura, emblema pictată), așa că vopseaua stă pe fire. Straturile se desenează doar pe o bucată
// de ~24 m din fața camerei și doar când camera e aproape de teren (în rest, gazonul plat ajunge).
import * as THREE from 'three'
import { G } from '../data/layout.js'

const LAYERS = 20
const BLADE_H = 0.03
const CELL = 0.006
const FADE_R = 11 // m: până unde se văd firele (mai departe sunt sub un pixel)
const STRIPE = 105 / 16

export function createGrassShells(turf, logos, { lowSpec = false } = {}) {
  if (lowSpec) return null
  const SIZE = FADE_R * 2 + 2
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1).rotateX(-Math.PI / 2)
  const uniforms = {
    turfMap: { value: turf.material.map },
    turfHalf: { value: new THREE.Vector2(G.hx, G.hz) },
    logoMap: { value: null },
    logoSize: { value: new THREE.Vector2(1, 1) },
    logoZ: { value: 20.75 },
    logoOn: { value: 0 },
  }
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 })
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLayer;\nvarying float vL;\nvarying vec3 vGW;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vL = aLayer;
        vec3 gw0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
        // firele sunt culcate în sensul tunsului (alternativ pe dungi), mai mult spre vârf
        float band = mod(floor((gw0.z + 52.5) / ${STRIPE.toFixed(4)}), 2.0) * 2.0 - 1.0;
        transformed.y += aLayer * ${BLADE_H.toFixed(3)};
        transformed.z += band * aLayer * aLayer * 0.011;`,
      )
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vL;
        varying vec3 vGW;
        uniform sampler2D turfMap;
        uniform vec2 turfHalf;
        uniform sampler2D logoMap;
        uniform vec2 logoSize;
        uniform float logoZ;
        uniform float logoOn;
        float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 tuv = vec2((vGW.x + turfHalf.x) / (2.0 * turfHalf.x), 1.0 - (vGW.z + turfHalf.y) / (2.0 * turfHalf.y));
        if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) discard;
        float dcam = distance(cameraPosition.xz, vGW.xz);
        float fade = 1.0 - smoothstep(${(FADE_R * 0.55).toFixed(1)}, ${FADE_R.toFixed(1)}, dcam);
        vec2 p = vGW.xz / ${CELL.toFixed(4)};
        vec2 cell = floor(p);
        vec2 f = fract(p) - 0.5;
        float h = mix(0.45, 1.0, gh(cell)) * fade;
        if (vL > h) discard;
        vec2 off = (vec2(gh(cell + 17.0), gh(cell + 31.0)) - 0.5) * 0.35;
        float rad = 0.5 * (1.0 - vL / max(h, 1e-3)) + 0.05;
        if (length(f - off) > rad) discard;
        vec4 tc = texture2D(turfMap, tuv);
        if (logoOn > 0.5) {
          float zc = vGW.z > 0.0 ? logoZ : -logoZ;
          vec2 luv = vec2((vGW.z - zc) / logoSize.x + 0.5, vGW.x / logoSize.y + 0.5);
          if (luv.x >= 0.0 && luv.x <= 1.0 && luv.y >= 0.0 && luv.y <= 1.0) {
            vec4 lc = texture2D(logoMap, luv);
            tc.rgb = mix(tc.rgb, lc.rgb, lc.a * 0.92);
          }
        }
        // umbră la baza firelor, vârfurile mai deschise și ușor gălbui, variație de la fir la fir
        vec3 col = tc.rgb * mix(0.58, 1.1, vL) * mix(0.88, 1.1, gh(cell + 5.0));
        col = mix(col, col * vec3(1.08, 1.06, 0.86), smoothstep(0.7, 1.0, vL / max(h, 1e-3)));
        diffuseColor.rgb = col;`,
      )
  }
  const mesh = new THREE.InstancedMesh(geo, mat, LAYERS)
  const layer = new Float32Array(LAYERS)
  const m4 = new THREE.Matrix4()
  for (let k = 0; k < LAYERS; k++) {
    layer[k] = (k + 1) / LAYERS
    mesh.setMatrixAt(k, m4)
  }
  geo.setAttribute('aLayer', new THREE.InstancedBufferAttribute(layer, 1))
  mesh.frustumCulled = false
  mesh.receiveShadow = true
  mesh.visible = false
  mesh.renderOrder = 2
  const fwd = new THREE.Vector3()

  // mută bucata de fire în fața camerei; întoarce true dacă s-a schimbat vizibilitatea
  function update(camera) {
    const logo = logos?.userData.logo
    if (logo && !uniforms.logoOn.value) {
      uniforms.logoMap.value = logo.tex
      uniforms.logoSize.value.set(logo.w, logo.h)
      uniforms.logoOn.value = 1
    }
    const c = camera.position
    const nx = Math.max(-G.hx, Math.min(G.hx, c.x))
    const nz = Math.max(-G.hz, Math.min(G.hz, c.z))
    const near = Math.hypot(c.x - nx, c.z - nz)
    const show = c.y < 30 && Math.hypot(near, c.y) < FADE_R + 6
    const changed = show !== mesh.visible
    mesh.visible = show
    if (show) {
      camera.getWorldDirection(fwd)
      fwd.y = 0
      if (fwd.lengthSq() > 1e-6) fwd.normalize()
      mesh.position.set(Math.round((c.x + fwd.x * FADE_R * 0.45) * 4) / 4, 0.002, Math.round((c.z + fwd.z * FADE_R * 0.45) * 4) / 4)
    }
    return changed
  }
  return { mesh, update }
}
