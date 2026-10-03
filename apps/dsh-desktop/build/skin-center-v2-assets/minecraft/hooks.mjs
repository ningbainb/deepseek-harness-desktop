/**
 * Minecraft (minecraft) skin hooks — the trusted escape hatch of the v2
 * skin contract (x-org.linxin666.skin-center/v1alpha1), reviewed and
 * released with this repository. Loading this module executes nothing;
 * apply() owns every DOM write and registers its retraction through
 * ctx.onCleanup.
 *
 * Port of the v1 plugin effects
 * (packages/skins/minecraft/src/client/index.ts):
 *  - the panorama skybox: a CSS 3-D cube whose six faces are procedurally
 *    drawn pixel-art scenes (the Mojang panorama itself is copyrighted,
 *    so every scene is drawn here, block by block), plus the dimming
 *    scrim. The cube rotation rides the compiled patches.css keyframes;
 *    the stage/scrim are pure visuals (pointer-events:none in the
 *    stylesheet) and mount on document.body exactly as v1 did.
 *  - the pinned document title (restored on dispose only when the skin's
 *    own title still stands).
 * The face images are deterministic (seeded PRNG), rendered per
 * activation — v1 cached them module-level, which the hooks contract
 * forbids (no module-level mutable state); the render cost is a few
 * milliseconds of string building.
 */

/** The product title the skin pins (captured by the shell's DocumentTitle after settle). */
const SKIN_TITLE = 'Minecraft · DeepSeek 在线'

/* --- Pixel-art panorama scenes --------------------------------------------------
   One "pixel" is PX=8px in the 640x640 canvas — square, so the cube faces
   show the whole scene edge to edge (no cover-cropping). The camera looks
   horizontally at the face centre; the horizon line sits at y=GROUND so
   sky, hills and the meadow top all land in view. */

const PX = 8
const GROUND = 400
const W = 640
const H = 640

/** One rect of the pixel scene. */
function r(x, y, w, h, fill, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`
}

/** Deterministic PRNG (mulberry32) so scattered props are stable per face. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A blocky cloud: three overlapping white slabs with a top cap. */
function cloud(x, y, s) {
  const u = PX * s
  return [
    r(x, y + u, 3 * u, u, '#fdfdfd'),
    r(x + u, y, 2 * u, u, '#fdfdfd'),
    r(x + 3 * u, y + u, 2 * u, u, '#fdfdfd'),
    r(x + u, y + u, u, u, '#e6eef2'),
  ].join('')
}

/** A faint distant cloud slab near the horizon. */
function farCloud(x, y, w) {
  return r(x, y, w, 6, 'rgba(255,255,255,0.55)')
}

/** A stepped blocky hill: layers shrink by two blocks every two rows. */
function hill(x, blocks, height, fill, cap) {
  let out = ''
  for (let i = 0; i < height; i++) {
    const w = Math.max(blocks - Math.floor(i / 2) * 2, 2)
    const color = i === height - 1 && cap ? cap : fill
    out += r(x + ((blocks - w) / 2) * PX, GROUND - (i + 1) * PX, w * PX, PX, color)
  }
  return out
}

/** A blocky tree: brown trunk, layered green crown. */
function tree(x, scale = 1) {
  const u = PX * scale
  return [
    r(x + u, GROUND - 3 * u, 2 * u, 3 * u, '#6b4a2b'),
    r(x, GROUND - 6 * u, 4 * u, 3 * u, '#43ad54'),
    r(x + u, GROUND - 7 * u, 2 * u, u, '#34a046'),
  ].join('')
}

/** A blocky villager house: plank wall, glowing windows, door, stepped roof, chimney. */
function house(x, s) {
  const u = PX * s
  const wall = s >= 2 ? '#c9b28a' : '#b89d7a'
  return [
    r(x, GROUND - 4 * u, 5 * u, 4 * u, wall),
    r(x + u, GROUND - 3 * u, u, u, '#f5e6a0'),
    r(x + 3 * u, GROUND - 3 * u, u, u, '#f5e6a0'),
    r(x + 2 * u, GROUND - 2 * u, u, 2 * u, '#5d3d22'),
    r(x, GROUND - 6 * u, 5 * u, u, '#8a5a3a'),
    r(x + u, GROUND - 7 * u, 3 * u, u, '#7a4f33'),
    r(x + 4 * u, GROUND - 7 * u, u, u, '#7d7d7d'),
  ].join('')
}

/** A lakeside: sandy shore, blue water with light ripples. */
function lake(x, y, w) {
  return [
    r(x, y, w, 4, '#e8d8a0'),
    r(x, y + 4, w, 26, '#3f76e4'),
    r(x + 10, y + 12, Math.round(w * 0.3), 3, 'rgba(255,255,255,0.4)'),
    r(x + Math.round(w * 0.55), y + 20, Math.round(w * 0.28), 3, 'rgba(255,255,255,0.32)'),
  ].join('')
}

/** A red mushroom with white dots. */
function mushroom(x, y) {
  return [
    r(x + 4, y + 8, 8, 8, '#f0e8d8'),
    r(x, y, 16, 8, '#d84545'),
    r(x + 4, y + 2, 4, 4, '#f7f2e8'),
  ].join('')
}

/** A pumpkin with a green stem. */
function pumpkin(x, y) {
  return [
    r(x + 4, y - 4, 8, 4, '#4f8a33'),
    r(x, y, 16, 16, '#e07a2f'),
    r(x + 3, y + 3, 4, 4, '#c96a26'),
  ].join('')
}

/** A small gray rock. */
function rock(x, y) {
  return [
    r(x + 8, y - 4, 8, 4, '#a5a5a5'),
    r(x, y, 20, 12, '#8d8d8d'),
  ].join('')
}

/** A tiny pixel bird: body and swept wing. */
function bird(x, y) {
  return [
    r(x + 4, y - 2, 8, 2, '#2e2e2e'),
    r(x, y, 4, 4, '#2e2e2e'),
  ].join('')
}

/** A tuft of tall grass. */
function tallGrass(x, y) {
  return [
    r(x, y, 3, 10, '#4f9e35'),
    r(x + 3, y + 2, 3, 8, '#5fb23f'),
  ].join('')
}

/** A tiny flower dot sitting on the grass edge. */
function flower(x, y, fill) {
  return r(x, y, 4, 4, fill)
}

/** The shared grass-block ground strip (tall, bright meadow). */
function ground() {
  let tufts = ''
  for (let x = 8; x < W; x += 32) tufts += r(x, GROUND + 12, PX, PX, '#7dc94b')
  return [
    r(0, GROUND, W, 12, '#8ed458'),
    r(0, GROUND + 12, W, H - GROUND - 12, '#96643a'),
    tufts,
  ].join('')
}

/** Render one side-face scene (640x360). */
function renderScene(scene) {
  const body = []
  // Sky: bright daytime gradient, pale near the horizon.
  body.push(r(0, 0, W, GROUND, 'url(#sky)'))
  if (scene.sun) {
    const [sx, sy] = scene.sun
    body.push(r(sx - 12, sy - 12, 36, 36, 'rgba(255,255,255,0.35)'))
    body.push(r(sx, sy, 12, 12, '#ffffff'))
  }
  for (const [x, y, s] of scene.clouds ?? []) body.push(cloud(x, y, s))
  for (const [x, y, w] of scene.farClouds ?? []) body.push(farCloud(x, y, w))
  for (const [x, y] of scene.birds ?? []) body.push(bird(x, y))
  for (const [i, [x, b, h, fill]] of (scene.hills ?? []).entries()) {
    const cap = scene.caps?.includes(i) ? '#dfeaf2' : undefined
    body.push(hill(x, b, h, fill, cap))
  }
  body.push(ground())
  if (scene.lake) body.push(lake(scene.lake[0], GROUND + 2, scene.lake[2]))

  // Populated areas: keep scatter trees off the lake and the village.
  const forbid = []
  if (scene.lake) forbid.push([scene.lake[0] - 48, scene.lake[0] + scene.lake[2] + 48])
  for (const [hx, hs] of scene.houses ?? []) forbid.push([hx - 40, hx + 5 * PX * hs + 40])

  const rnd = mulberry32(scene.seed ?? 7)
  const scatterAt = (count, place) => {
    let placed = 0
    let tries = 0
    while (placed < count && tries < count * 40) {
      tries++
      const x = 24 + Math.floor(rnd() * (W - 96))
      if (forbid.some(([a, b]) => x >= a && x <= b)) continue
      place(x)
      placed++
    }
  }
  if (scene.scatterTrees) {
    const extra = scene.scatterTrees
    scatterAt(extra, (x) => body.push(tree(x, 1 + Math.floor(rnd() * 2))))
  }
  for (const [x, s] of scene.trees ?? []) body.push(tree(x, s))
  for (const [x, s] of scene.houses ?? []) body.push(house(x, s))
  if (scene.scatterProps) scatterAt(scene.scatterProps, (x) => {
    const kind = Math.floor(rnd() * 10)
    if (kind < 3) body.push(flower(x, GROUND + 4, kind === 0 ? '#f5d442' : kind === 1 ? '#e05656' : '#f2f2f2'))
    else if (kind < 5) body.push(mushroom(x, GROUND + 2))
    else if (kind < 7) body.push(pumpkin(x, GROUND + 4))
    else if (kind < 8) body.push(rock(x, GROUND + 4))
    else body.push(tallGrass(x, GROUND + 2))
  })

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">` +
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#84d0f6"/><stop offset="0.62" stop-color="#b4e3f9"/>` +
    `<stop offset="1" stop-color="#f0faf3"/>` +
    `</linearGradient></defs>${body.join('')}</svg>`
  )
}

/** The four side faces, each a different biome (Mojang's panorama has six; ours has four sides). */
const SCENES = [
  {
    // Village: blocky houses left, a dirt path, forest right, distant hills.
    sun: [120, 64],
    clouds: [[300, 90, 1], [470, 150, 1]],
    farClouds: [[200, 378, 90], [420, 386, 120]],
    birds: [[540, 100]],
    hills: [[60, 12, 9, '#8fa8b8'], [380, 16, 11, '#8fa8b8']],
    caps: [1],
    houses: [[30, 1], [110, 1], [190, 2]],
    trees: [[420, 1], [540, 2], [600, 1]],
    scatterTrees: 3,
    scatterProps: 6,
    seed: 11,
  },
  {
    // Lakeside: a lake center-right, pines on the shore, snowy peak behind.
    sun: [480, 90],
    clouds: [[80, 120, 1], [250, 70, 2], [520, 170, 1]],
    farClouds: [[120, 384, 100]],
    birds: [[220, 80], [380, 60]],
    hills: [[30, 10, 7, '#93aabb'], [260, 14, 10, '#7d95a5'], [500, 12, 8, '#93aabb']],
    caps: [1],
    lake: [280, GROUND + 2, 190],
    trees: [[120, 2], [540, 1], [560, 2], [60, 1]],
    scatterTrees: 3,
    scatterProps: 5,
    seed: 23,
  },
  {
    // Dense forest: scattered trees and woodland props.
    sun: [80, 130],
    clouds: [[360, 90, 2], [560, 60, 1]],
    farClouds: [[40, 380, 130], [300, 388, 90]],
    hills: [[150, 18, 13, '#75899a'], [480, 14, 9, '#8fa8b8']],
    caps: [0],
    trees: [[60, 1], [300, 2], [430, 1], [600, 1]],
    scatterTrees: 7,
    scatterProps: 9,
    seed: 37,
  },
  {
    // Mountain range: big peaks with snow caps, treeline below.
    sun: [340, 70],
    clouds: [[90, 80, 1], [200, 160, 2], [500, 120, 1]],
    farClouds: [[160, 382, 110], [430, 388, 90]],
    birds: [[110, 90], [260, 60], [560, 110]],
    hills: [[20, 16, 13, '#7d95a5'], [200, 20, 15, '#6d8398'], [540, 17, 12, '#7d95a5']],
    caps: [1, 2],
    trees: [[140, 1], [330, 2], [480, 1], [600, 1]],
    scatterTrees: 3,
    scatterProps: 7,
    seed: 41,
  },
]

/** Top face: open sky with clouds (512x512). */
function topSvg() {
  const sky = r(0, 0, 512, 512, 'url(#t)')
  const c1 = cloud(96, 160, 2)
  const c2 = cloud(280, 300, 2)
  const c3 = cloud(200, 60, 1)
  const c4 = cloud(380, 120, 1)
  const f1 = farCloud(60, 420, 120)
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" shape-rendering="crispEdges">' +
    '<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#7ec3ee"/><stop offset="1" stop-color="#a9dcf7"/>' +
    `</linearGradient></defs>${sky}${c1}${c2}${c3}${c4}${f1}</svg>`
  )
}

/** Bottom face: grass block field seen from above, with flowers and a mushroom (512x512). */
function bottomSvg() {
  let cells = ''
  for (let gx = 0; gx < 512; gx += 64) {
    for (let gy = 0; gy < 512; gy += 64) {
      const dark = (gx / 64 + gy / 64) % 3 === 0
      cells += r(gx + 16, gy + 16, 16, 16, dark ? '#7dc94b' : '#96da62')
      cells += r(gx + 40, gy + 40, 8, 8, dark ? '#96da62' : '#7dc94b')
    }
  }
  const props = [
    flower(96, 96, '#f5d442'), flower(360, 160, '#e05656'),
    flower(440, 400, '#f5d442'), mushroom(160, 384),
    rock(392, 300),
  ].join('')
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" shape-rendering="crispEdges">' +
    '<rect width="512" height="512" fill="#8ed458"/>' + cells + props + '</svg>'
  )
}

/** One panorama face as a data-URI background image. */
function faceImage(svg) {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

/** The six panorama faces as data-URI background images, rendered per
 *  activation (deterministic scenes, so every render is identical).
 *  Order matches the apply loop: the four side scenes in SCENES order,
 *  then top and bottom. */
function renderFaceImages() {
  return [
    ...SCENES.map((scene) => faceImage(renderScene(scene))),
    faceImage(topSvg()),
    faceImage(bottomSvg()),
  ]
}

/** Compiled css-modules class names (see patches.css). */
const CLS = {
  mcStage: 'QecUDa_mcStage',
  mcSkybox: 'QecUDa_mcSkybox',
  mcFace: 'QecUDa_mcFace',
  mcFace1: 'QecUDa_mcFace1',
  mcFace2: 'QecUDa_mcFace2',
  mcFace3: 'QecUDa_mcFace3',
  mcFace4: 'QecUDa_mcFace4',
  mcFaceTop: 'QecUDa_mcFaceTop',
  mcFaceBottom: 'QecUDa_mcFaceBottom',
  mcScrim: 'QecUDa_mcScrim',
}

export default function defineSkinHooks() {
  return {
    apply(ctx) {
      const body = document.body
      const originalTitle = document.title
      const faceImages = renderFaceImages()

      const stage = document.createElement('div')
      stage.className = CLS.mcStage
      const skybox = document.createElement('div')
      skybox.className = CLS.mcSkybox
      const sideNames = ['front', 'back', 'left', 'right']
      const faceClasses = [CLS.mcFace1, CLS.mcFace2, CLS.mcFace3, CLS.mcFace4, CLS.mcFaceTop, CLS.mcFaceBottom]
      for (let i = 0; i < 6; i++) {
        const face = document.createElement('div')
        face.className = `${CLS.mcFace} ${faceClasses[i]}`
        face.style.backgroundImage = faceImages[i]
        // data-skin-chrome marks every injected element for the apply spec.
        face.dataset.skinChrome = `face-${sideNames[i] ?? (i === 4 ? 'top' : 'bottom')}`
        skybox.append(face)
      }
      stage.append(skybox)

      const scrim = document.createElement('div')
      scrim.className = CLS.mcScrim
      scrim.dataset.skinChrome = 'scrim'
      stage.dataset.skinChrome = 'stage'

      document.title = SKIN_TITLE
      body.append(stage, scrim)

      ctx.onCleanup(() => {
        stage.remove()
        scrim.remove()
        // Only restore when the skin's own title still stands — a session title
        // projected by the shell must not be clobbered by skin teardown.
        if (document.title === SKIN_TITLE) document.title = originalTitle
      })
    },
  }
}
