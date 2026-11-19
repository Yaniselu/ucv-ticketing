// Modelul 3D fotorealist al orașului (Google Photorealistic 3D Tiles), aceeași sursă
// ca Google Earth. Se activează doar când există cheia VITE_GOOGLE_MAPS_API_KEY
// (setată în Vercel → Settings → Environment Variables).
// Stadionul din modelul Google este decupat: în locul lui rămâne modelul nostru
// detaliat, cu toate locurile.
import * as THREE from 'three'
import { TilesRenderer } from '3d-tiles-renderer'
import { GoogleCloudAuthPlugin, ReorientationPlugin, TileCompressionPlugin, TilesFadePlugin, GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

export const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

// decupaj eliptic în jurul stadionului (coordonatele scenei)
const CUT = { ax: 116, az: 128, top: 75 }

function clipMaterial(mat) {
  if (mat.userData.ucvClip) return
  mat.userData.ucvClip = true
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUcvWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvUcvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUcvWorld;')
      .replace(
        'void main() {',
        `void main() {
        if (pow(vUcvWorld.x / ${CUT.ax.toFixed(1)}, 2.0) + pow(vUcvWorld.z / ${CUT.az.toFixed(1)}, 2.0) < 1.0 && vUcvWorld.y < ${CUT.top.toFixed(1)}) discard;`,
      )
  }
  mat.needsUpdate = true
}

export function addGoogleTiles(scene, camera, renderer, { origin, onReady } = {}) {
  if (!GOOGLE_KEY) return null
  const tiles = new TilesRenderer()
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: GOOGLE_KEY, autoRefreshToken: true }))
  tiles.registerPlugin(new TileCompressionPlugin())
  tiles.registerPlugin(new TilesFadePlugin())
  const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }))
  tiles.registerPlugin(new ReorientationPlugin({ lat: (origin.lat * Math.PI) / 180, lon: (origin.lon * Math.PI) / 180, height: 0 }))
  tiles.errorTarget = 6
  tiles.setCamera(camera)
  tiles.setResolutionFromRenderer(camera, renderer)

  // cadrul plugin-ului: +Y sus, +Z nord, +X vest → cadrul scenei: x est, z sud, rotit cu terenul
  const holder = new THREE.Group()
  holder.rotation.y = Math.PI + (origin.rotationDeg * Math.PI) / 180
  holder.add(tiles.group)
  scene.add(holder)

  tiles.addEventListener('load-model', ({ scene: model }) => {
    model.traverse((o) => {
      if (o.material) {
        clipMaterial(o.material)
        o.receiveShadow = false
        o.castShadow = false
      }
    })
    alignGround()
  })

  // nivelul solului Google (înălțimea elipsoidală) se află prin raze verticale lângă stadion
  const ray = new THREE.Raycaster()
  let aligned = 0
  let ready = false
  function alignGround() {
    if (aligned > 6) return
    const hs = []
    for (const [x, z] of [[170, 0], [-170, 0], [0, 190], [0, -190], [140, 150], [-140, -150]]) {
      ray.set(new THREE.Vector3(x, 3000, z), new THREE.Vector3(0, -1, 0))
      const hit = ray.intersectObject(tiles.group, true)[0]
      if (hit) hs.push(hit.point.y)
    }
    if (hs.length >= 3) {
      hs.sort((a, b) => a - b)
      holder.position.y -= hs[Math.floor(hs.length / 2)] + 0.1
      holder.updateMatrixWorld(true)
      aligned++
      if (!ready) {
        ready = true
        onReady?.()
      }
    }
  }

  return {
    update() {
      camera.updateMatrixWorld()
      tiles.setResolutionFromRenderer(camera, renderer)
      tiles.update()
    },
    attributions() {
      const out = []
      tiles.getAttributions?.(out)
      return out.map((a) => a.value).filter((v) => typeof v === 'string').join(' · ')
    },
  }
}
