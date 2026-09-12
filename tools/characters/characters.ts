// ── Vendored into aumos-catalogue ───────────────────────────────────────────
//
// Copied byte-for-byte from `untilled/aumos`,
// `apps/web/landing/lib/characters.ts` @ 8e72f2e7 (MetroCity CC0 parts, a3fa8eee)
// (untilled/aumos#938, PR5), which is itself generated from
// `packages/characters/` by `apps/web/site/characters-vendor.ts`.
//
// ⛔ **Do not edit it here**, for `tools/lint/VENDORED.md`'s reason: a
// hand-patched copy is neither the old bytes nor the generated ones, and the
// face this repository publishes would stop being the face Aumos draws. Fix the
// package over there, regenerate, and copy the whole file again.
//
// It has no imports and no dependencies on purpose — that is what lets
// `tools/check-characters.ts` run it under `node --experimental-strip-types`
// with nothing installed.
/**
 * **Vendored from `@aumos/characters` — do not edit.** (#938)
 *
 * Written by `apps/web/site/characters-vendor.ts`, because this app is built
 * by Vercel in a tree that holds no `packages/`. Edit the package and run:
 *
 *     pnpm --filter @aumos/web characters:generate
 *
 * `site/characters.test.ts` fails if this drifts, and fails again if the two
 * copies ever draw one seed two ways.
 *
 * The package's modules follow in dependency order with their imports removed;
 * nothing else is rewritten, so any block below can be diffed against the file
 * named above it.
 */

// ── packages/characters/src/hash.ts ─────────────────────────────────────────

/**
 * The one source of randomness in this package — and it is not random.
 *
 * FNV-1a 32 over UTF-8 bytes. No `Math.random`, no `Date`, no `crypto`: the same
 * seed has to produce the same face in a Tauri webview, in a cross-origin iframe,
 * in Next's server render and in Node, and the only way to owe nothing to the
 * environment is to compute everything from the string.
 *
 * ── Why one stream per attribute ───────────────────────────────────────────
 *
 * A single stream advanced twelve times would couple every choice to every list
 * length before it: add a ninth shirt and every hair, face and pair of eyes after
 * it in the order moves. #938 asks for the opposite — that adding outfit parts
 * leaves faces alone — so each attribute hashes its own string and no attribute
 * can see another's list. `hash.test.ts` grows the clothing lists and measures
 * that the face picks do not move.
 *
 * ── Why NUL and not a space ────────────────────────────────────────────────
 *
 * The fields are joined with `\0`, a byte no legal seed can contain (seeds are
 * printable ASCII, `appearance.ts`). A space would be ambiguous: the seed
 * `a hair` with attribute `x` and the seed `a` with attribute `hair x` would
 * hash the same bytes. The design document's prose said NUL and its code sample
 * said space; the prose is what is implemented.
 */

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

/** FNV-1a, 32-bit, unsigned. `Math.imul` keeps the multiply in 32 bits. */
export const fnv1a32 = (bytes: Uint8Array): number => {
  let hash = FNV_OFFSET
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, FNV_PRIME)
  }
  return hash >>> 0
}

const encoder = new TextEncoder()

/** UTF-8 bytes. `TextEncoder` is a standard global in both runtimes we ship to. */
export const utf8 = (text: string): Uint8Array => encoder.encode(text)

/**
 * The stream for one attribute of one seed, under one generator.
 *
 * The generator id is inside the hashed string, so a future `aumos-pixel-v2` that
 * reuses this function produces different faces for the same seeds — which is the
 * point of versioning the generator at all.
 */
export const stream = (generator: string, seed: string, attribute: string): number =>
  fnv1a32(utf8(`${generator}\0${seed}\0${attribute}`))

/** 2³². The stream is an unsigned 32-bit value, so this is its exclusive bound. */
const RANGE = 0x1_0000_0000

/**
 * The member of `list` this seed's `attribute` stream names — scaled from the
 * **top** of the word, never `% list.length`.
 *
 * ⚠️ **Measured, and the reason this is not a modulo.** FNV-1a's low bits are
 * weak: for nearby inputs they move almost linearly with the input, so twelve
 * moduli of a family of near-identical seeds correlate. Over the thousand fixed
 * seeds `seed-0 … seed-999`, taking the low bits produced **850** distinct
 * face-visible combinations where 207,360 were available and ~998 were expected;
 * scaling from the high bits produces **1,000**. Same hash, same bytes, and the
 * bound `uniqueness.test.ts` holds is the one this buys.
 */
export const pick = <T>(
  list: readonly T[],
  generator: string,
  seed: string,
  attribute: string,
): T => {
  const index = Math.floor((stream(generator, seed, attribute) / RANGE) * list.length)
  const chosen = list[index]
  if (chosen === undefined) throw new Error(`pick from an empty list: ${attribute}`)
  return chosen
}

/** A short, stable hex digest of a string — used for portrait fingerprints. */
export const digest = (text: string): string => fnv1a32(utf8(text)).toString(16).padStart(8, '0')

// ── packages/characters/src/grid.ts ─────────────────────────────────────────

/**
 * The grid every part is drawn on, and the role alphabet that stands in for colour.
 *
 * ── Why the art is text, when the source is a PNG ──────────────────────────
 *
 * A manager's face has to be produced identically in four places that share no
 * runtime: the desktop shell (a Tauri webview), the office frame (a *different*
 * origin, reached only by `postMessage`), the landing page (which cannot even
 * declare `workspace:*`), and Node — where the golden vectors in this package's
 * tests are the only mechanical evidence that the other three agree. Three of
 * those four have no `zlib`, so shipping the sheets would mean shipping a PNG
 * decoder into a browser. The sheets are therefore converted **once**, by
 * `scripts/import-metrocity.mjs`, into the rows of characters in `parts/` — and
 * a diff of a hairstyle shows the hairstyle.
 *
 * Each character names a **role** rather than a colour. The colour arrives later,
 * from the ramps in `palette.ts`, chosen by the seed. That is what lets six skin
 * tones and eight hair colours multiply against one drawing of a bob, and it is
 * why the pack's own palette survives nowhere in this package except the four
 * fixed colours an accessory carries.
 */

/** Columns in one frame. The office engine's sprite is 16 wide (`assets.ts`). */
export const FRAME_WIDTH = 16
/** Rows in one frame. The office engine's sprite is 32 tall (`assets.ts`). */
export const FRAME_HEIGHT = 32
/** Frames per direction: 0,1,2 walk · 3,4 typing · 5,6 reading. See `render.ts`. */
export const FRAMES_PER_DIRECTION = 7

/** The three directions the sheet carries. `left` is the engine's mirror of `right`. */
export type Direction = 'down' | 'up' | 'right'
export const DIRECTIONS: readonly Direction[] = ['down', 'up', 'right']

/**
 * One frame, or one crop of one. `''` is transparent; anything else is `#RRGGBB`
 * uppercase. Structurally identical to the office engine's `SpriteData`, so the
 * desktop turns one into the other with `rows.map((r) => [...r])`.
 */
export type PixelRows = readonly (readonly string[])[]

/** The full sheet the office engine consumes: three directions of seven frames. */
export interface CharacterSheet {
  readonly down: readonly PixelRows[]
  readonly up: readonly PixelRows[]
  readonly right: readonly PixelRows[]
}

/**
 * The role alphabet. Fixed by `aumos-pixel-v1` — adding a letter is a new
 * generator version, because every part already converted is read through this
 * table.
 *
 * Five steps of skin and four of everything else is not a taste: it is what the
 * pack draws. Its figures are modelled with a highlight, a base, a shade, a deep
 * shade and a **line of their own material** — the last of which is why nothing
 * here derives an outline. The ring is in the art, one tone of the thing it rings,
 * and a derived one would have had to be *removed* from every shape first.
 *
 * ⛔ There is no text role, and that is not an oversight: the engine draws a
 * left-facing character by reversing each row of the right-facing art, so any
 * glyph would come out mirrored. Nothing here can carry one.
 */
export type Role =
  | '.' // transparent
  | 'S' // skin, highlight
  | 's' // skin, lit — most of the figure
  | 'Z' // skin, shaded
  | 'z' // skin, deep shade — under the chin, inside an elbow
  | 'L' // skin, line — the drawn outline of the body
  | 'E' // eye, pupil
  | 'e' // eye, shade — the lash line under it
  | 'W' // eye, white
  | 'G' // hair, highlight
  | 'H' // hair, lit
  | 'h' // hair, shaded
  | 'g' // hair, line
  | 'T' // top, highlight
  | 't' // top, lit
  | 'u' // top, shaded
  | 'U' // top, line
  | 'B' // bottom, highlight
  | 'b' // bottom, lit
  | 'v' // bottom, shaded
  | 'V' // bottom, line
  | 'K' // shoes, lit
  | 'k' // shoes, shaded
  | 'j' // shoes, line
  | 'A' // accessory, highlight
  | 'a' // accessory, lit
  | 'n' // accessory, shaded
  | 'N' // accessory, line
  | 'P' // prop, lit — the pages of the book the reading frames hold
  | 'p' // prop, dark — its cover

const ROLES = new Set<string>([
  '.',
  'S',
  's',
  'Z',
  'z',
  'L',
  'E',
  'e',
  'W',
  'G',
  'H',
  'h',
  'g',
  'T',
  't',
  'u',
  'U',
  'B',
  'b',
  'v',
  'V',
  'K',
  'k',
  'j',
  'A',
  'a',
  'n',
  'N',
  'P',
  'p',
])

/** Art as authored: one string per row, every row `FRAME_WIDTH` characters wide. */
export type ArtRows = readonly string[]

/** Art placed on the frame: the rows above, plus the row they start at. */
export interface Art {
  /** Row of the frame the first row lands on, before the frame's offset. */
  readonly top: number
  readonly rows: ArtRows
}

/** One drawing per direction — a hairstyle, a hat. */
export interface DirectionalArt {
  readonly down: Art
  readonly up: Art
  readonly right: Art
}

/** Three walk drawings per direction — a body, a garment. */
export interface DirectionalFrames {
  readonly down: readonly Art[]
  readonly up: readonly Art[]
  readonly right: readonly Art[]
}

/** Nothing drawn. `bald` hair and the `none` accessory are this, not a special case. */
export const NO_ART: Art = { top: 0, rows: [] }

/**
 * Every row is exactly `FRAME_WIDTH` wide and uses only known roles.
 *
 * This runs at module load rather than in a test because a mis-typed row is a
 * silent one-pixel shift of everything to its right, and the golden vectors would
 * then pin the mistake instead of catching it. It is also the check that a
 * re-import of the pack has not started emitting a role this build cannot colour.
 */
export const checkArt = (name: string, art: Art): Art => {
  for (const [index, line] of art.rows.entries()) {
    if (line.length !== FRAME_WIDTH) {
      throw new Error(`${name}: row ${index} is ${line.length} wide, expected ${FRAME_WIDTH}`)
    }
    for (const ch of line) {
      if (!ROLES.has(ch)) throw new Error(`${name}: row ${index} has unknown role ${ch}`)
    }
  }
  return art
}

/** `checkArt` over all three directions. */
export const checkDirectional = (name: string, art: DirectionalArt): DirectionalArt => {
  checkArt(`${name}.down`, art.down)
  checkArt(`${name}.up`, art.up)
  checkArt(`${name}.right`, art.right)
  return art
}

/**
 * One drawing, checked. The generated part files call this rather than each
 * declaring a helper of their own: the landing's vendored copy concatenates
 * every module into one file, and one top-level name per module is what lets
 * that copy exist (`apps/web/site/characters-vendor.ts` refuses a duplicate).
 */
export const art = (name: string, top: number, rows: readonly string[]): Art =>
  checkArt(name, { top, rows })

// ── packages/characters/src/palette.ts ──────────────────────────────────────

/**
 * The colour ramps, and the table that turns a role character into `#RRGGBB`.
 *
 * The shapes come from the pack (`vendor/metrocity/`); **the colours are this
 * file**. That division is the whole reason the conversion maps colours onto
 * roles rather than keeping them: one drawing of a bob is eight hair colours, one
 * drawing of a shirt is eight shirts, and the pack's own palette survives only
 * where an object would stop being itself without it — a police cap, in
 * `parts/accessories.ts`.
 *
 * Every ramp carries as many steps as the pack's art uses: five for skin, four for
 * hair and cloth, three for leather. The last step of each is the **line** — the
 * art draws its own outline in a dark tone of its own material, which is why
 * nothing in this package derives one.
 *
 * ⚠️ **These values are part of `aumos-pixel-v1`.** Nudging one changes every
 * published face, so a new palette is a new generator id, not an edit here.
 * Uppercase hex is the contract the office engine's `SpriteData` already carries
 * and what `render.test.ts` pins.
 */

/** Five steps: the light on the cheek, the skin, its shade, its deep shade, its line. */
export interface SkinRamp {
  readonly light: string
  readonly base: string
  readonly shade: string
  readonly deep: string
  readonly line: string
}
/** Hair, cloth and anything worn: lit, shaded, and the line the art draws itself in. */
export interface Ramp {
  readonly light: string
  readonly base: string
  readonly shade: string
  readonly line: string
}
/** Leather is three steps, because that is all the pack's shoes spend. */
export interface ShoeRamp {
  readonly base: string
  readonly shade: string
  readonly line: string
}
/** The pupil and the lash line under it. The white is the same on every face. */
export interface EyeRamp {
  readonly pupil: string
  readonly shade: string
}
/** Hair spends the same four steps cloth does. */
export type HairRamp = Ramp
/** An accessory keeps its own four steps — see `parts/accessories.ts`. */
export type AccessoryRamp = Ramp

/**
 * Six skin tones, light to dark.
 *
 * ⚠️ **Three of these are the pack's own**, ranked out of its three body rows by
 * the converter and pasted here: `porcelain`, `blush` and `umber`. The other three
 * are this file's, mixed along the line between the palest and the darkest at
 * 0.35, 0.7 and 1.3 — which is a stated transform and not an eye-balled swatch, so
 * a seventh tone has an obvious place to come from. Two pack rows that differ only
 * in the base step (`porcelain` and `blush`) are kept as two: they are two tones an
 * artist drew, and at 16px the base step is most of the face.
 */
export const SKIN_RAMPS = {
  porcelain: {
    light: '#FFF7F4',
    base: '#FFD3AA',
    shade: '#E1AA91',
    deep: '#9B7462',
    line: '#705E56',
  },
  blush: { light: '#FFF7F4', base: '#FCD6C4', shade: '#E1AA91', deep: '#9B7462', line: '#705E56' },
  sand: { light: '#FFDBCA', base: '#F4BA92', shade: '#D2977B', deep: '#966A56', line: '#605049' },
  honey: { light: '#FFBFA0', base: '#E9A279', shade: '#C38465', deep: '#90604A', line: '#50433D' },
  umber: { light: '#FFA77C', base: '#E08D64', shade: '#B67352', deep: '#8C583F', line: '#423732' },
  ebony: { light: '#FF8F58', base: '#D7784F', shade: '#A9623F', deep: '#885034', line: '#342B27' },
} as const satisfies Record<string, SkinRamp>

/** Eight hair colours. `slate` and `plum` are here so the row is not six browns. */
export const HAIR_RAMPS = {
  ink: { light: '#4A4442', base: '#2B2624', shade: '#1A1615', line: '#0B0A0A' },
  espresso: { light: '#6B4A36', base: '#4A3124', shade: '#301E15', line: '#1A0F0A' },
  chestnut: { light: '#9A6438', base: '#6B4226', shade: '#4A2C18', line: '#2B180D' },
  amber: { light: '#D08A42', base: '#A9662E', shade: '#7A451D', line: '#4C2910' },
  wheat: { light: '#F0CC84', base: '#D8A85B', shade: '#A87C3A', line: '#6E4C1F' },
  flax: { light: '#F8EFC8', base: '#E2CF9A', shade: '#B49F6C', line: '#7A6840' },
  slate: { light: '#9BA0A8', base: '#6B6F76', shade: '#474B51', line: '#2A2D31' },
  plum: { light: '#96548A', base: '#6E3A5E', shade: '#4A2440', line: '#2A1424' },
} as const satisfies Record<string, HairRamp>

/** Eight garment colours for the top. */
export const TOP_RAMPS = {
  navy: { light: '#4A6E9A', base: '#2E4A6E', shade: '#1F3450', line: '#122034' },
  wine: { light: '#A8434F', base: '#7E2B36', shade: '#5A1C25', line: '#3A1018' },
  pine: { light: '#469074', base: '#2F6B52', shade: '#1F4A38', line: '#123024' },
  ochre: { light: '#E4A44C', base: '#C8802F', shade: '#97601F', line: '#653D11' },
  chalk: { light: '#F6F4EF', base: '#E4E1DA', shade: '#BAB6AE', line: '#807C74' },
  graphite: { light: '#585C66', base: '#3A3D44', shade: '#26282D', line: '#15171A' },
  iris: { light: '#AC91D0', base: '#8A6FB0', shade: '#63508A', line: '#3E305A' },
  lagoon: { light: '#6FB4CE', base: '#4C8FA8', shade: '#35687C', line: '#1F4251' },
} as const satisfies Record<string, Ramp>

/** Six garment colours for the bottom. Deliberately duller than the tops. */
export const BOTTOM_RAMPS = {
  charcoal: { light: '#4C525A', base: '#33383F', shade: '#22262B', line: '#131619' },
  denim: { light: '#587BA8', base: '#3C5A85', shade: '#2A3F60', line: '#18263C' },
  khaki: { light: '#8A7860', base: '#6B5C48', shade: '#4C4133', line: '#2D261D' },
  mulberry: { light: '#7A5C6E', base: '#5A4250', shade: '#3E2D38', line: '#241921' },
  stone: { light: '#B0B3B8', base: '#8C8F96', shade: '#666A70', line: '#3F4247' },
  midnight: { light: '#3A4A5A', base: '#24303C', shade: '#16202A', line: '#0B1118' },
} as const satisfies Record<string, Ramp>

/** Four shoe colours, for the shoes a pair of trousers arrives with. */
export const SHOE_RAMPS = {
  ink: { base: '#2A2A2E', shade: '#17171A', line: '#0A0A0C' },
  leather: { base: '#6A4630', shade: '#49301F', line: '#2A1B10' },
  canvas: { base: '#DAD7D0', shade: '#A9A69F', line: '#6E6B65' },
  brick: { base: '#8C2F3A', shade: '#63202A', line: '#3A1118' },
} as const satisfies Record<string, ShoeRamp>

/**
 * Six eye colours — two pixels of pupil and the lash line under them.
 *
 * ⚠️ **This is the cheapest diversity in the package and the argument for it is
 * arithmetic.** The pack draws one face: the eyes are in the body art and no
 * amount of hair changes them. Without this attribute a 16px portrait is skin ×
 * hair × hair colour × accessory, and the catalogue would be running twelve seeds
 * through three thousand faces. It costs no art at all.
 */
export const EYE_RAMPS = {
  ink: { pupil: '#181C22', shade: '#4F4F4F' },
  cocoa: { pupil: '#4A2E1E', shade: '#6B5040' },
  hazel: { pupil: '#7A5A22', shade: '#6E5C3E' },
  moss: { pupil: '#2E5236', shade: '#4E6250' },
  sea: { pupil: '#245A6E', shade: '#4A6470' },
  violet: { pupil: '#4A2E62', shade: '#5A4A6E' },
} as const satisfies Record<string, EyeRamp>

/** The white of an eye, on every face. */
export const EYE_WHITE = '#FFFFFF'
/**
 * The book the reading frames hold. Two fixed colours and not a seeded ramp: the
 * prop is the same object in everyone's hands, and an attribute for the cover of a
 * book the office never draws (`readingTools: []`) would spend a hash stream on
 * nothing.
 */
export const PROP_LIGHT = '#E8E6E0'
export const PROP_DARK = '#391624'

export type SkinId = keyof typeof SKIN_RAMPS
export type HairColourId = keyof typeof HAIR_RAMPS
export type TopColourId = keyof typeof TOP_RAMPS
export type BottomColourId = keyof typeof BOTTOM_RAMPS
export type ShoesId = keyof typeof SHOE_RAMPS
export type EyeColourId = keyof typeof EYE_RAMPS

/** The role → colour table for one appearance. */
export const roleColours = (
  appearance: Appearance,
  accessory: AccessoryRamp,
): Readonly<Record<Role, string>> => {
  const skin = SKIN_RAMPS[appearance.skin]
  const eye = EYE_RAMPS[appearance.eyeColour]
  const hair = HAIR_RAMPS[appearance.hairColour]
  const top = TOP_RAMPS[appearance.topColour]
  const bottom = BOTTOM_RAMPS[appearance.bottomColour]
  const shoes = SHOE_RAMPS[appearance.shoes]
  return {
    '.': '',
    S: skin.light,
    s: skin.base,
    Z: skin.shade,
    z: skin.deep,
    L: skin.line,
    E: eye.pupil,
    e: eye.shade,
    W: EYE_WHITE,
    G: hair.light,
    H: hair.base,
    h: hair.shade,
    g: hair.line,
    T: top.light,
    t: top.base,
    u: top.shade,
    U: top.line,
    B: bottom.light,
    b: bottom.base,
    v: bottom.shade,
    V: bottom.line,
    K: shoes.base,
    k: shoes.shade,
    j: shoes.line,
    A: accessory.light,
    a: accessory.base,
    n: accessory.shade,
    N: accessory.line,
    P: PROP_LIGHT,
    p: PROP_DARK,
  }
}

// ── packages/characters/src/parts/garments.ts ───────────────────────────────

/**
 * Tops and bottoms — the pack draws an outfit, and the waist is where it is cut.
 *
 * ⛔ **Generated by `scripts/import-metrocity.mjs` — do not edit.** The source is
 * `vendor/metrocity/` (JIK-A-4's CC0 pack, `vendor/metrocity/NOTICE.md`); the
 * converter and its argument are in that script. An edit here is lost on the next
 * run, and a shape that needs changing is a change to the converter or a different
 * row of the pack.
 */

/**
 * ⚠️ **The pack draws top and bottom as one outfit; this cuts them at row 25.**
 *
 * The alternative was one `outfit` attribute, and it was measured against the
 * sheets rather than argued: the pack has torso-only rows (a blouse, a polo) and a
 * legs-only row (shorts), so an outfit attribute would have had to drop them or
 * dress three quarters of a manager. Cut at the waist, every row is usable and a
 * shirt multiplies against every pair of trousers. The seam is safe because every
 * row is drawn on the *same* body: tops end at row 24 and bottoms start at 25 on
 * every frame of every direction.
 *
 * A bottom carries the shoes. Which colours are shoes is decided once per outfit
 * over every frame and never by the row a pixel lands on — see the converter.
 */
export const TOPS = {
  pinafore: {
    down: [
      art('top.pinafore.down.0', 17, [
        '....U......U....',
        '....TtuuuutT....',
        '....TttttttT....',
        '....Tttttt......',
        '....Utuuuu......',
        '....UtTttTt.....',
        '....UuttttuU....',
        '...UTttttttTU...',
      ]),
      art('top.pinafore.down.1', 18, [
        '....U......U....',
        '....TtuuuutT....',
        '....TttttttT....',
        '....TttttttT....',
        '....UtuuuutU....',
        '....UtTttTtU....',
        '....UuttttuU....',
      ]),
      art('top.pinafore.down.2', 17, [
        '....U......U....',
        '....TtuuuutT....',
        '....TttttttT....',
        '......tttttT....',
        '......uuuutU....',
        '.....tTttTtU....',
        '....UuttttuU....',
        '...UTttttttTU...',
      ]),
    ],
    right: [
      art('top.pinafore.right.0', 17, [
        '.......tt.......',
        '.....Utt.U......',
        '.....tttt.......',
        '....Utut........',
        '....Utut........',
        '....Utttt.......',
        '...UttttttuU....',
        '..UututtuttuU...',
      ]),
      art('top.pinafore.right.1', 18, [
        '.......tt.......',
        '.........U......',
        '.........U......',
        '....U....uU.....',
        '....U....uU.....',
        '....U....tU.....',
        '...Utt..ttuU....',
      ]),
      art('top.pinafore.right.2', 17, [
        '.......tt.......',
        '.........U......',
        '.........U......',
        '.........uU.....',
        '........tuU.....',
        '.......tttU.....',
        '...U..ttttuU....',
        '..UututtuttuU...',
      ]),
    ],
    up: [
      art('top.pinafore.up.0', 17, [
        '....UtuuuutU....',
        '....TttttttT....',
        '....TttttttT....',
        '....TttttttT....',
        '....UtuuuutU....',
        '....UtTttTtU....',
        '....UuttttuU....',
        '...UTttttttTU...',
      ]),
      art('top.pinafore.up.1', 18, [
        '....UtuuuutU....',
        '....TttttttT....',
        '....TttttttT....',
        '....TttttttT....',
        '....UtuuuutU....',
        '....UtTttTtU....',
        '....UuttttuU....',
      ]),
      art('top.pinafore.up.2', 17, [
        '....UtuuuutU....',
        '....TttttttT....',
        '....TttttttT....',
        '....TttttttT....',
        '....UtuuuutU....',
        '....UtTttTtU....',
        '....UuttttuU....',
        '...UTttttttTU...',
      ]),
    ],
  },
  blouse: {
    down: [
      art('top.blouse.down.0', 17, [
        '...UT......TU...',
        '..UTttu..uttTU..',
        '..UTttt..tttTU..',
        '..UTtut..t......',
        '....UTu..u......',
        '....UTt..tT.....',
        '....UUU..UUU....',
      ]),
      art('top.blouse.down.1', 18, [
        '...UT......TU...',
        '..UTttu..uttTU..',
        '..UTttt..tttTU..',
        '.UTttut..tuttTU.',
        '....UTu..uTU....',
        '....UTt..tTU....',
        '....UUU..UUU....',
      ]),
      art('top.blouse.down.2', 17, [
        '...UT......TU...',
        '..UTttu..uttTU..',
        '..UTttt..tttTU..',
        '......t..tutTU..',
        '......u..uTU....',
        '.....Tt..tTU....',
        '....UUU..UUU....',
      ]),
    ],
    right: [
      art('top.blouse.right.0', 17, [
        '.......T........',
        '.....UttT.......',
        '.....UttTU......',
        '....UttttT......',
        '....Uttttt......',
        '....UttttU......',
        '....Utttt.......',
      ]),
      art('top.blouse.right.1', 18, [
        '.......T........',
        '.....UTtU.......',
        '.....UTtU.......',
        '....UUTtU.......',
        '....U...........',
        '....U...........',
        '....UT..t.......',
      ]),
      art('top.blouse.right.2', 17, [
        '.......T........',
        '.....UTtt.U.....',
        '.....UTttUT.....',
        '......ttU.......',
        '........t.......',
        '.......tt.......',
        '......ttt.......',
      ]),
    ],
    up: [
      art('top.blouse.up.0', 17, [
        '...UTuuuuuuTU...',
        '..UTttttttttTU..',
        '..UTttttttttTU..',
        '..UTtuttttutTU..',
        '....UTuttuTU....',
        '....UTttttTU....',
        '....UUUUUUUU....',
      ]),
      art('top.blouse.up.1', 18, [
        '...UTuuuuuuTU...',
        '..UTttttttttTU..',
        '..UTttttttttTU..',
        '.UTttuttttuttTU.',
        '....UTuttuTU....',
        '....UTttttTU....',
        '....UUUUUUUU....',
      ]),
      art('top.blouse.up.2', 17, [
        '...uTuuuuuuTu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '..uTtuttttutTu..',
        '....uTuttuTu....',
        '....uTttttTu....',
        '....uuuuuuuu....',
      ]),
    ],
  },
  polo: {
    down: [
      art('top.polo.down.0', 17, [
        '...UT......TU...',
        '..UTttu..uttTU..',
        '..UTttt..tttTU..',
        '..UTtut..t......',
        '....UTu..u......',
        '....UTt..tT.....',
        '....UUU..UUU....',
      ]),
      art('top.polo.down.1', 18, [
        '...UT......TU...',
        '..UTttu..uttTU..',
        '..UTttt..tttTU..',
        '.UTttut..tuttTU.',
        '....UTu..uTU....',
        '....UTt..tTU....',
        '....UUU..UUU....',
      ]),
      art('top.polo.down.2', 17, [
        '...UT......TU...',
        '..UTttu..uttTU..',
        '..UTttt..tttTU..',
        '......t..tutTU..',
        '......u..uTU....',
        '.....Tt..tTU....',
        '....UUU..UUU....',
      ]),
    ],
    right: [
      art('top.polo.right.0', 17, [
        '.......T........',
        '.....UttT.......',
        '.....UttTU......',
        '....UttttT......',
        '....Uttttt......',
        '....UttttU......',
        '....Utttt.......',
      ]),
      art('top.polo.right.1', 18, [
        '.......T........',
        '.....UTtU.......',
        '.....UTtU.......',
        '....UUTtU.......',
        '....U...........',
        '....U...........',
        '....UT..t.......',
      ]),
      art('top.polo.right.2', 17, [
        '.......T........',
        '.....UTtt.U.....',
        '.....UTttUT.....',
        '......ttU.......',
        '........t.......',
        '.......tt.......',
        '......ttt.......',
      ]),
    ],
    up: [
      art('top.polo.up.0', 17, [
        '...UTuuuuuuTU...',
        '..UTttttttttTU..',
        '..UTttttttttTU..',
        '..UTtuttttutTU..',
        '....UTuttuTU....',
        '....UTttttTU....',
        '....UUUUUUUU....',
      ]),
      art('top.polo.up.1', 18, [
        '...UTuuuuuuTU...',
        '..UTttttttttTU..',
        '..UTttttttttTU..',
        '.UTttuttttuttTU.',
        '....UTuttuTU....',
        '....UTttttTU....',
        '....UUUUUUUU....',
      ]),
      art('top.polo.up.2', 17, [
        '...UTuuuuuuTU...',
        '..UTttttttttTU..',
        '..UTttttttttTU..',
        '..UTtuttttutTU..',
        '....UTuttuTU....',
        '....UTttttTU....',
        '....UUUUUUUU....',
      ]),
    ],
  },
  tee: {
    down: [
      art('top.tee.down.0', 17, [
        '...uT......Tu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '..uTtttttt......',
        '....uTtttt......',
        '....uTttttT.....',
        '....uuuuuuuu....',
        '....UuuuuuuU....',
      ]),
      art('top.tee.down.1', 18, [
        '...uT......Tu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '.uTttttttttttTu.',
        '....uTttttTu....',
        '....uTttttTu....',
        '....uuuuuuuu....',
      ]),
      art('top.tee.down.2', 17, [
        '...uT......Tu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '......ttttttTu..',
        '......ttttTu....',
        '.....TttttTu....',
        '....uuuuuuuu....',
        '....UuuuuuuU....',
      ]),
    ],
    right: [
      art('top.tee.right.0', 17, [
        '.......t........',
        '.....uttTu......',
        '.....uttTu......',
        '....uttttt......',
        '....uttttt......',
        '....uttttu......',
        '....uttttTu.....',
        '....UuuuuUUU....',
      ]),
      art('top.tee.right.1', 18, [
        '.......t........',
        '.....uttuu......',
        '.....uttuu......',
        '....uuttuTu.....',
        '....u....Tu.....',
        '....u....Tu.....',
        '....ut..tTu.....',
      ]),
      art('top.tee.right.2', 17, [
        '.......t........',
        '.....uttuuu.....',
        '.....uttuut.....',
        '......ttuTu.....',
        '........tTu.....',
        '.......ttTu.....',
        '......tttTu.....',
        '....UuuuuU......',
      ]),
    ],
    up: [
      art('top.tee.up.0', 17, [
        '...uTttttttTu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '....uTtttt......',
        '....uTtttt......',
        '....uuuuuuu.....',
        '....UuuuUuuU....',
      ]),
      art('top.tee.up.1', 18, [
        '...uTttttttTu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '.uTttttttttttTu.',
        '....uTttttTu....',
        '....uTttttTu....',
        '....uuuuuuuu....',
      ]),
      art('top.tee.up.2', 17, [
        '...uTttttttTu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '......ttttTu....',
        '......ttttTu....',
        '.....uuuuuuu....',
        '....UuuUuuuU....',
      ]),
    ],
  },
  raglan: {
    down: [
      art('top.raglan.down.0', 17, [
        '...uT......Tu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '..uTtttttt......',
        '....uTtttt......',
        '....uTttttT.....',
        '....uuuuuuuu....',
        '....uTttttTu....',
      ]),
      art('top.raglan.down.1', 18, [
        '...uT......Tu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '.uTttttttttttTu.',
        '....uTttttTu....',
        '....uTttttTu....',
        '....uuuuuuuu....',
      ]),
      art('top.raglan.down.2', 17, [
        '...uT......Tu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '......ttttttTu..',
        '......ttttTu....',
        '.....TttttTu....',
        '....uuuuuuuu....',
        '....uTttttTu....',
      ]),
    ],
    right: [
      art('top.raglan.right.0', 17, [
        '.......t........',
        '.....uttTu......',
        '.....uttTu......',
        '....uttttt......',
        '....uttttt......',
        '....uttttu......',
        '....uttttTu.....',
        '....utttTuUU....',
      ]),
      art('top.raglan.right.1', 18, [
        '.......t........',
        '.....uttuu......',
        '.....uttuu......',
        '....uuttuTu.....',
        '....u....Tu.....',
        '....u....Tu.....',
        '....ut..tTu.....',
      ]),
      art('top.raglan.right.2', 17, [
        '.......t........',
        '.....uttuuu.....',
        '.....uttuut.....',
        '......ttuTu.....',
        '........tTu.....',
        '.......ttTu.....',
        '......tttTu.....',
        '....utttTu......',
      ]),
    ],
    up: [
      art('top.raglan.up.0', 17, [
        '...uTttttttTu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '....uTtttt......',
        '....uTtttt......',
        '....uuuuuuu.....',
        '....uTttutTu....',
      ]),
      art('top.raglan.up.1', 18, [
        '...uTttttttTu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '.uTttttttttttTu.',
        '....uTttttTu....',
        '....uTttttTu....',
        '....uuuuuuuu....',
      ]),
      art('top.raglan.up.2', 17, [
        '...uTttttttTu...',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '..uTttttttttTu..',
        '......ttttTu....',
        '......ttttTu....',
        '.....uuuuuuu....',
        '....uTtuttTu....',
      ]),
    ],
  },
  uniform: {
    down: [
      art('top.uniform.down.0', 17, [
        '...Ut......tU...',
        '..UtuuuUUuuutU..',
        '..UtuTuUUuTutU..',
        '..UtuuuUUu......',
        '....UuuUUu......',
        '....UuuTTuu.....',
        '....UUUTTUUU....',
        '....UuuUUUUU....',
      ]),
      art('top.uniform.down.1', 18, [
        '...Ut......tU...',
        '..UtuuuUUuuutU..',
        '..UtuTuUUuTutU..',
        '.UtuuuuUUuuuutU.',
        '....UuuUUuuU....',
        '....UuuTTuuU....',
        '....UUUTTUUU....',
      ]),
      art('top.uniform.down.2', 17, [
        '...Ut......tU...',
        '..UtuuuUUuuutU..',
        '..UtuTuUUuTutU..',
        '......uUUuuutU..',
        '......uUUuuU....',
        '.....uuTTuuU....',
        '....UUUTTUUU....',
        '....UUUUUuuU....',
      ]),
    ],
    right: [
      art('top.uniform.right.0', 17, [
        '.......u........',
        '.....UtuuU......',
        '.....UtuTU......',
        '....Utuuuu......',
        '....Utuuuu......',
        '....Utuuuu......',
        '....UUUUUUT.....',
        '....UuuuuUUU....',
      ]),
      art('top.uniform.right.1', 18, [
        '.......u........',
        '.....UtuuU......',
        '.....UtuTU......',
        '....UUtuuuU.....',
        '....UUtuuuU.....',
        '....U....uT.....',
        '....UU..UUT.....',
      ]),
      art('top.uniform.right.2', 17, [
        '.......u........',
        '.....UtuUUU.....',
        '.....UtuUUu.....',
        '......tuUuU.....',
        '........uuU.....',
        '.......uuuT.....',
        '......UUUUT.....',
        '....UuuuuU......',
      ]),
    ],
    up: [
      art('top.uniform.up.0', 17, [
        '...UtuuuuuutU...',
        '..UtuuuuuuuutU..',
        '..UtuuuuuuuutU..',
        '..UtuuuuuuuutU..',
        '....Uuuuuu......',
        '....Uuuuuu......',
        '....UUUUUUU.....',
        '....UuuUUUUU....',
      ]),
      art('top.uniform.up.1', 18, [
        '...UtuuuuuutU...',
        '..UtuuuuuuuutU..',
        '..UtuuuuuuuutU..',
        '.UtuuuuuuuuuutU.',
        '....UuuuuuuU....',
        '....UuuuuuuU....',
        '....UUUUUUUU....',
      ]),
      art('top.uniform.up.2', 17, [
        '...UtuuuuuutU...',
        '..UtuuuuuuuutU..',
        '..UtuuuuuuuutU..',
        '..UtuuuuuuuutU..',
        '......uuuuuU....',
        '......uuuuuU....',
        '.....UUUUUUU....',
        '....UUUUUuuU....',
      ]),
    ],
  },
  livery: {
    down: [
      art('top.livery.down.0', 17, [
        '...Ut......tU...',
        '..UtuutTTtuutU..',
        '..UtTTttttTTtU..',
        '..UtuttTTt......',
        '....Uutttt......',
        '....UutTTtu.....',
        '....UuttttuU....',
        '....UutTUTTU....',
      ]),
      art('top.livery.down.1', 18, [
        '...Ut......tU...',
        '..UtuutTTtuutU..',
        '..UtTTttttTTtU..',
        '.UtutttTTtttutU.',
        '....UuttttuU....',
        '....UutTTtuU....',
        '....UuttttuU....',
      ]),
      art('top.livery.down.2', 17, [
        '...Ut......tU...',
        '..UtuutTTtuutU..',
        '..UtTTttttTTtU..',
        '......tTTttutU..',
        '......ttttuU....',
        '.....utTTtuU....',
        '....UuttttuU....',
        '....UTTUTtuU....',
      ]),
    ],
    right: [
      art('top.livery.right.0', 17, [
        '.......t........',
        '.....UttTU......',
        '.....UtttU......',
        '....UutttT......',
        '....Uutttt......',
        '....UutttT......',
        '....UuttttU.....',
        '....UuttTUUU....',
      ]),
      art('top.livery.right.1', 18, [
        '.......t........',
        '.....UttTU......',
        '.....UttUU......',
        '....UU..UTU.....',
        '....UU..UtU.....',
        '....UU..UTU.....',
        '....UuUUttU.....',
      ]),
      art('top.livery.right.2', 17, [
        '.......t........',
        '.....UttTU......',
        '.....UtttU......',
        '....UttttTU.....',
        '......tUttU.....',
        '......UttTU.....',
        '......ttttU.....',
        '....UuttTU......',
      ]),
    ],
    up: [
      art('top.livery.up.0', 17, [
        '...UttttttttU...',
        '..UtuttttttutU..',
        '..UttttttttttU..',
        '..UtuttttttutU..',
        '....Uutttt......',
        '....Uutttt......',
        '....Uuttttu.....',
        '....UuttUTTU....',
      ]),
      art('top.livery.up.1', 18, [
        '...UttttttttU...',
        '..UtuttttttutU..',
        '..UttttttttttU..',
        '.UtuttttttttutU.',
        '....UuttttuU....',
        '....UuttttuU....',
        '....UuttttuU....',
      ]),
      art('top.livery.up.2', 17, [
        '...UttttttttU...',
        '..UtuttttttutU..',
        '..UttttttttttU..',
        '..UtuttttttutU..',
        '......ttttuU....',
        '......ttttuU....',
        '.....uttttuU....',
        '....UTTUttuU....',
      ]),
    ],
  },
  waistcoat: {
    down: [
      art('top.waistcoat.down.0', 17, [
        '...Uu......uU...',
        '..UuuuTUUTuuuU..',
        '..UuuuTUUTuTTt..',
        '..tTuuTUUT......',
        '....UuTUUT......',
        '....UuTUUTu.....',
        '....UuTTTTuU....',
        '....UUUUUUUU....',
      ]),
      art('top.waistcoat.down.1', 18, [
        '...Uu......uU...',
        '..UuuuTUUTuuuU..',
        '..UuuuTUUTuuuU..',
        '.tTTuuTUUTuuTTt.',
        '....UuTUUTuU....',
        '....UuTUUTuU....',
        '....UuTTTTuU....',
      ]),
      art('top.waistcoat.down.2', 17, [
        '...Uu......uU...',
        '..UuuuTUUTuuuU..',
        '..tTTuTUUTuuuU..',
        '......TUUTuuTt..',
        '......TUUTuU....',
        '.....uTUUTuU....',
        '....UuTTTTuU....',
        '....UUUUUUUU....',
      ]),
    ],
    right: [
      art('top.waistcoat.right.0', 17, [
        '.......u........',
        '.....UuuuU......',
        '.....UuuuU......',
        '....UuuuuT......',
        '....UuuuuT......',
        '....UuuuuU......',
        '....UuuuuTU.....',
        '....UUUUUUUU....',
      ]),
      art('top.waistcoat.right.1', 18, [
        '.......u........',
        '.....UuuTU......',
        '.....UuuTU......',
        '....UtTTtUU.....',
        '....U....UU.....',
        '....U....UU.....',
        '....Uu..uTU.....',
      ]),
      art('top.waistcoat.right.2', 17, [
        '.......u........',
        '.....UuuTU......',
        '.....UuuTU......',
        '....UtuuUUU.....',
        '......TUuUU.....',
        '......UuuUU.....',
        '......uuuTU.....',
        '....UUUUUU......',
      ]),
    ],
    up: [
      art('top.waistcoat.up.0', 17, [
        '...UuuuuuuuuU...',
        '..UuuuuuuuuuuU..',
        '..UuuuuuuuuuuU..',
        '..tTuuuuuuuuTt..',
        '....UuuuuuuU....',
        '....UuuuuuuU....',
        '....UuuuuuuU....',
        '....UUUUUUUU....',
      ]),
      art('top.waistcoat.up.1', 18, [
        '...UuuuuuuuuU...',
        '..UuuuuuuuuuuU..',
        '..UuuuuuuuuuuU..',
        '.tTTuuuuuuuuTTt.',
        '....UuuuuuuU....',
        '....UuuuuuuU....',
        '....UuuuuuuU....',
      ]),
      art('top.waistcoat.up.2', 17, [
        '...UuuuuuuuuU...',
        '..UuuuuuuuuuuU..',
        '..UuuuuuuuuuuU..',
        '..tTuuuuuuuuTt..',
        '....UuuuuuuU....',
        '....UuuuuuuU....',
        '....UuuuuuuU....',
        '....UUUUUUUU....',
      ]),
    ],
  },
  coverall: {
    down: [
      art('top.coverall.down.0', 17, [
        '...uT......Tu...',
        '..utTTttttTTtu..',
        '..uttTTttTTttu..',
        '..uttTTttT......',
        '....uTTttT......',
        '....uTTttTT.....',
        '....uTTttTTu....',
        '....UUUUUUUU....',
      ]),
      art('top.coverall.down.1', 18, [
        '...uT......Tu...',
        '..utTTttttTTtu..',
        '..uttTTttTTttu..',
        '....tTTttTTt....',
        '....uTTttTTu....',
        '....uTTttTTu....',
        '....uTTttTTu....',
      ]),
      art('top.coverall.down.2', 17, [
        '...uT......Tu...',
        '..utTTttttTTtu..',
        '..uttTTttTTttu..',
        '......TttTTttu..',
        '......TttTTu....',
        '.....TTttTTu....',
        '....uTTttTTu....',
        '....UUUUUUUU....',
      ]),
    ],
    right: [
      art('top.coverall.right.0', 17, [
        '.......T........',
        '.....tTTTu......',
        '.....tTTTu......',
        '....tTTTTt......',
        '....tTTTTt......',
        '....tTTTTu......',
        '....tTTTTtu.....',
        '.....UUUU.......',
      ]),
      art('top.coverall.right.1', 18, [
        '.......T........',
        '.....ttttu......',
        '.....ttttu......',
        '....ttttttu.....',
        '....t....tu.....',
        '....t....tu.....',
        '....tT..Ttu.....',
      ]),
      art('top.coverall.right.2', 17, [
        '.......T........',
        '.....ttTTu......',
        '.....ttTTu......',
        '....tttTTtu.....',
        '......tuTtu.....',
        '......uTTtu.....',
        '......TTTtu.....',
        '.....UUUU.......',
      ]),
    ],
    up: [
      art('top.coverall.up.0', 17, [
        '...utTTTTTTtu...',
        '..uttTTTTTTttu..',
        '..uttTTTTTTttu..',
        '....tTTTTTTt....',
        '....uTTTTT......',
        '....uTTTTT......',
        '....uTTTTTT.....',
        '....UUUUUUUU....',
      ]),
      art('top.coverall.up.1', 18, [
        '...utTTTTTTtu...',
        '..uttTTTTTTttu..',
        '..uttTTTTTTttu..',
        '....tTTTTTTt....',
        '....uTTTTTTu....',
        '....uTTTTTTu....',
        '....uTTTTTTu....',
      ]),
      art('top.coverall.up.2', 17, [
        '...utTTTTTTtu...',
        '..uttTTTTTTttu..',
        '..uttTTTTTTttu..',
        '....tTTTTTTt....',
        '......TTTTTu....',
        '......TTTTTu....',
        '.....TTTTTTu....',
        '....UUUUUUUU....',
      ]),
    ],
  },
  crew: {
    down: [
      art('top.crew.down.0', 17, [
        '...ut......tu...',
        '..utTttttttTtu..',
        '..utTTTTTTTTtu..',
        '....TTTTTT......',
        '....uTTTTT......',
        '....utTTTTt.....',
        '....utTTTTtu....',
        '....UUUUUUUU....',
      ]),
      art('top.crew.down.1', 18, [
        '...ut......tu...',
        '..utTttttttTtu..',
        '..utTTTTTTTTtu..',
        '.utTTTTTTTTTTtu.',
        '....uTTTTTTu....',
        '....utTTTTtu....',
        '....utTTTTtu....',
      ]),
      art('top.crew.down.2', 17, [
        '...ut......tu...',
        '..utTttttttTtu..',
        '..utTTTTTTTTtu..',
        '......TTTTTT....',
        '......TTTTTu....',
        '.....tTTTTtu....',
        '....utTTTTtu....',
        '....UUUUUUUU....',
      ]),
    ],
    right: [
      art('top.crew.right.0', 18, [
        '.....utttu......',
        '.....uTTTuu.....',
        '....uTTTTTT.....',
        '....uTTTTTT.....',
        '....uTTTTuu.....',
        '....uTTTTu......',
        '....UUUUUUUU....',
      ]),
      art('top.crew.right.1', 19, [
        '.....utttu......',
        '.....uTTTu......',
        '....uuTTuTu.....',
        '....u....Tu.....',
        '....u....Tu.....',
        '....uT..TTu.....',
      ]),
      art('top.crew.right.2', 18, [
        '.....utttuu.....',
        '.....uTTTuT.....',
        '....uTTTuTu.....',
        '......TuTTu.....',
        '......uTTTu.....',
        '......TTTTu.....',
        '....UUUUUU......',
      ]),
    ],
    up: [
      art('top.crew.up.0', 17, [
        '...utT....Ttu...',
        '..utTTttttTTtu..',
        '..utTTTTTTTTtu..',
        '....TTTTTTTTtu..',
        '....uTTTTT......',
        '....utTTTT......',
        '....utTTTTt.....',
        '....UUUUUUUU....',
      ]),
      art('top.crew.up.1', 18, [
        '...utT....Ttu...',
        '..utTTttttTTtu..',
        '..utTTTTTTTTtu..',
        '.utTTTTTTTTTTtu.',
        '....uTTTTTTu....',
        '....utTTTTtu....',
        '....utTTTTtu....',
      ]),
      art('top.crew.up.2', 17, [
        '...utT....Ttu...',
        '..utTTttttTTtu..',
        '..utTTTTTTTTtu..',
        '..utTTTTTTTT....',
        '......TTTTTu....',
        '......TTTTtu....',
        '.....tTTTTtu....',
        '....UUUUUUUU....',
      ]),
    ],
  },
  cardigan: {
    down: [
      art('top.cardigan.down.0', 17, [
        '...uu......uu...',
        '..uuttuuuuttuu..',
        '..uutTTttTTtuu..',
        '....tTTTTT......',
        '....uTTTTT......',
        '....utTTTTt.....',
        '....utTTTTtu....',
        '....UUuuuuUU....',
      ]),
      art('top.cardigan.down.1', 18, [
        '...uu......uu...',
        '..uuttuuuuttuu..',
        '..uutTTttTTtuu..',
        '.uutTTTTTTTTtuu.',
        '....uTTTTTTu....',
        '....utTTTTtu....',
        '....utTTTTtu....',
      ]),
      art('top.cardigan.down.2', 17, [
        '...uu......uu...',
        '..uuttuuuuttuu..',
        '..uutTTttTTtuu..',
        '......TTTTTt....',
        '......TTTTTu....',
        '.....tTTTTtu....',
        '....utTTTTtu....',
        '....UUuuuuUU....',
      ]),
    ],
    right: [
      art('top.cardigan.right.0', 18, [
        '.....uttuu......',
        '.....uTTtuu.....',
        '....utTTTtT.....',
        '....utTTTtT.....',
        '....utTTTuu.....',
        '....utTTTu......',
        '....UUuuuU.U....',
      ]),
      art('top.cardigan.right.1', 19, [
        '.....utuuu......',
        '.....uTTtu......',
        '....uuTTutu.....',
        '....uuTTutu.....',
        '....u....tu.....',
        '....uT..Ttu.....',
      ]),
      art('top.cardigan.right.2', 18, [
        '.....utuuu......',
        '.....uTTtu......',
        '....uTTTutu.....',
        '......TuTtu.....',
        '.......TTtu.....',
        '......TTTtu.....',
        '....UUuuuU......',
      ]),
    ],
    up: [
      art('top.cardigan.up.0', 17, [
        '...uut....tuu...',
        '..uuttTTTTttuu..',
        '..uutTTTTTTtuu..',
        '....tTTTTTTtuu..',
        '....uTTTTT......',
        '....utTTTT......',
        '....utTTTTt.....',
        '....UUuuuuUU....',
      ]),
      art('top.cardigan.up.1', 18, [
        '...uut....tuu...',
        '..uuttTTTTttuu..',
        '..uutTTTTTTtuu..',
        '.uutTTTTTTTTtuu.',
        '....uTTTTTTu....',
        '....utTTTTtu....',
        '....utTTTTtu....',
      ]),
      art('top.cardigan.up.2', 17, [
        '...uut....tuu...',
        '..uuttTTTTttuu..',
        '..uutTTTTTTtuu..',
        '..uutTTTTTTt....',
        '......TTTTTu....',
        '......TTTTtu....',
        '.....tTTTTtu....',
        '....UUuuuuUU....',
      ]),
    ],
  },
  jersey: {
    down: [
      art('top.jersey.down.0', 17, [
        '...Ut......tU...',
        '..UtTTUTTUTTtU..',
        '..UTTTUUUUTTTU..',
        '....TTTTTT......',
        '....UTTUUT......',
        '....UTUTTUT.....',
        '....UUUUUUUU....',
        '....UUuuuuUU....',
      ]),
      art('top.jersey.down.1', 18, [
        '...Ut......tU...',
        '..UtTTUTTUTTtU..',
        '..UTTTUUUUTTTU..',
        '.U..TTTTTTTT..U.',
        '....UTTUUTTU....',
        '....UTUTTUTU....',
        '....UUUUUUUU....',
      ]),
      art('top.jersey.down.2', 17, [
        '...Ut......tU...',
        '..UtTTUTTUTTtU..',
        '..UTTTUUUUTTTU..',
        '......TTTTTT....',
        '......TUUTTU....',
        '.....TUTTUTU....',
        '....UUUUUUUU....',
        '....UUuuuuUU....',
      ]),
    ],
    right: [
      art('top.jersey.right.0', 18, [
        '.....UtTUT......',
        '.....UtTTU......',
        '....UtTTTT......',
        '....UtTTTT......',
        '....UtTTTU......',
        '....UtTTTU......',
        '....UUuuuUUU....',
      ]),
      art('top.jersey.right.1', 19, [
        '.....UtTUT......',
        '.....UtTUU......',
        '....UUtTUTU.....',
        '....U....UU.....',
        '....U....TU.....',
        '....UU..UUU.....',
      ]),
      art('top.jersey.right.2', 18, [
        '.....UtTUTU.....',
        '.....UtTUUT.....',
        '....UtTTUTU.....',
        '......TUTUU.....',
        '.......TTTU.....',
        '......UUUUU.....',
        '....UUtuuU......',
      ]),
    ],
    up: [
      art('top.jersey.up.0', 17, [
        '...UtT....TtU...',
        '..UtUTTTTTTUtU..',
        '..UTTUUUUUUTTU..',
        '....TTTTTTTT....',
        '....UTTTTT......',
        '....UTTTTT......',
        '....UUUUUUU.....',
        '....UUuuuuUU....',
      ]),
      art('top.jersey.up.1', 18, [
        '...UtT....TtU...',
        '..UtUTTTTTTUtU..',
        '..UTTUUUUUUTTU..',
        '.U..TTTTTTTT..U.',
        '....UTTTTTTU....',
        '....UTTTTTTU....',
        '....UUUUUUUU....',
      ]),
      art('top.jersey.up.2', 17, [
        '...UtT....TtU...',
        '..UtUTTTTTTUtU..',
        '..UTTUUUUUUTTU..',
        '....TTTTTTTT....',
        '......TTTTTU....',
        '......TTTTTU....',
        '.....UUUUUUU....',
        '....UUuuuuUU....',
      ]),
    ],
  },
  henley: {
    down: [
      art('top.henley.down.0', 17, [
        '...Ut......tU...',
        '..UTTttttttTTU..',
        '..UTTtuUUutTTU..',
        '..UTTtUttU......',
        '....UtUUUU......',
        '....Ututtut.....',
        '....UUUUUUUU....',
        '....UttttttU....',
      ]),
      art('top.henley.down.1', 18, [
        '...Ut......tU...',
        '..UTTttttttTTU..',
        '..UTTtuUUutTTU..',
        '.UTTTtUttUtTTTU.',
        '....UtUUUUtU....',
        '....UtuttutU....',
        '....UUUUUUUU....',
      ]),
      art('top.henley.down.2', 17, [
        '...Ut......tU...',
        '..UTTttttttTTU..',
        '..UTTtuUUutTTU..',
        '......UttUtTTU..',
        '......UUUUtU....',
        '.....tuttutU....',
        '....UUUUUUUU....',
        '....UttttttU....',
      ]),
    ],
    right: [
      art('top.henley.right.0', 18, [
        '.....UtttU......',
        '.....UttUUU.....',
        '....UttttTT.....',
        '....UttttTT.....',
        '....UtttUUU.....',
        '....UUUUUU......',
        '....UttttUUU....',
      ]),
      art('top.henley.right.1', 19, [
        '.....UtttU......',
        '.....UTTUU......',
        '....UUTTUtU.....',
        '....U....UU.....',
        '....U....tU.....',
        '....UU..UUU.....',
      ]),
      art('top.henley.right.2', 18, [
        '.....UtttU......',
        '.....UTTUU......',
        '......TTUtU.....',
        '........tUU.....',
        '.......tttU.....',
        '......UUUUU.....',
        '....UttttU......',
      ]),
    ],
    up: [
      art('top.henley.up.0', 17, [
        '...Utt....ttU...',
        '..UTTttttttTTU..',
        '..UTTttttttTTU..',
        '....TttttttT....',
        '....Uttttt......',
        '....Uttttt......',
        '....UUUUUUU.....',
        '....UttttttU....',
      ]),
      art('top.henley.up.1', 18, [
        '...Utt....ttU...',
        '..UTTttttttTTU..',
        '..UTTttttttTTU..',
        '.UTTTttttttTTTU.',
        '....UttttttU....',
        '....UttttttU....',
        '....UUUUUUUU....',
      ]),
      art('top.henley.up.2', 17, [
        '...Utt....ttU...',
        '..UTTttttttTTU..',
        '..UTTttttttTTU..',
        '....TttttttT....',
        '......tttttU....',
        '......tttttU....',
        '.....UUUUUUU....',
        '....UttttttU....',
      ]),
    ],
  },
  tunic: {
    down: [
      art('top.tunic.down.0', 17, [
        '...UU......UU...',
        '..UuUuuUUuuUuU..',
        '..UuuUUuuUUuuU..',
        '..Uutuuttu......',
        '....Uttttt......',
        '....Uuttttu.....',
        '....UuttttuU....',
        '....UTTTTTTU....',
      ]),
      art('top.tunic.down.1', 18, [
        '...UU......UU...',
        '..UuUuuUUuuUuU..',
        '..UuuUUuuUUuuU..',
        '.UuutuuttuutuuU.',
        '....UttttttU....',
        '....UuttttuU....',
        '....UuttttuU....',
      ]),
      art('top.tunic.down.2', 17, [
        '...UU......UU...',
        '..UuUuuUUuuUuU..',
        '..UuuUUuuUUuuU..',
        '......uttuutuU..',
        '......tttttU....',
        '.....uttttuU....',
        '....UuttttuU....',
        '....UTTTTTTU....',
      ]),
    ],
    right: [
      art('top.tunic.right.0', 18, [
        '.....UtuU.......',
        '.....UUUUU......',
        '....UUtttu......',
        '....Uutttu......',
        '....UutttU......',
        '....UutttU......',
        '....UTTTTUUU....',
      ]),
      art('top.tunic.right.1', 19, [
        '.....UtuU.......',
        '.....UUUUU......',
        '....UUtuUuU.....',
        '....U....uU.....',
        '....U....uU.....',
        '....Uu..tuU.....',
      ]),
      art('top.tunic.right.2', 18, [
        '.....UtuU.......',
        '.....UUUUU......',
        '....UttuUuU.....',
        '........tuU.....',
        '.......ttuU.....',
        '......tttuU.....',
        '....UTTTTU......',
      ]),
    ],
    up: [
      art('top.tunic.up.0', 17, [
        '...UUu....uUU...',
        '..UuUuuuuuUuuU..',
        '..UuuUUUUUuuuU..',
        '..UuuuuuuuuuuU..',
        '....Uttttt......',
        '....Uutttt......',
        '....Uuttttu.....',
        '....UTTTTTTU....',
      ]),
      art('top.tunic.up.1', 18, [
        '...UUu....uUU...',
        '..UuUuuuuuuUuU..',
        '..UuuUUUUUUuuU..',
        '.UuutuuuuuutuuU.',
        '....UttttttU....',
        '....UuttttuU....',
        '....UuttttuU....',
      ]),
      art('top.tunic.up.2', 17, [
        '...UUu....uUU...',
        '..UuuUuuuuuUuU..',
        '..UuuuUUUUUuuU..',
        '..UuuuuuuuuuuU..',
        '......tttttU....',
        '......ttttuU....',
        '.....uttttuU....',
        '....UTTTTTTU....',
      ]),
    ],
  },
} as const satisfies Record<string, DirectionalFrames>

export const BOTTOMS = {
  pinafore: {
    down: [
      art('bottom.pinafore.down.0', 25, [
        '..VBbbbvvbbbBV..',
        '..VbbbBBBBbbbV..',
        '...VVVVVVVVVV...',
      ]),
      art('bottom.pinafore.down.1', 25, [
        '...VBbbbbbbBV...',
        '..VBbbbvvbbbBV..',
        '..VbbbBBBBbbbV..',
        '...VVVVVVVVVV...',
      ]),
      art('bottom.pinafore.down.2', 25, [
        '..VBbbbvvbbbBV..',
        '..VbbbBBBBbbbV..',
        '...VVVVVVVVVV...',
      ]),
    ],
    right: [
      art('bottom.pinafore.right.0', 25, ['..VbBBBBBBBbV...', '..VVVVVVVVVVV...']),
      art('bottom.pinafore.right.1', 25, [
        '..VvbvbbvbbvV...',
        '..VbBBBBBBBbV...',
        '..VVVVVVVVVVV...',
      ]),
      art('bottom.pinafore.right.2', 25, ['..VbBBBBBBBbV...', '..VVVVVVVVVVV...']),
    ],
    up: [
      art('bottom.pinafore.up.0', 25, ['..VBbbbvvbbbBV..', '..VbbbBBBBbbbV..', '...VVVVVVVVVV...']),
      art('bottom.pinafore.up.1', 25, [
        '...VBbbbbbbBV...',
        '..VBbbbvvbbbBV..',
        '..VbbbBBBBbbbV..',
        '...VVVVVVVVVV...',
      ]),
      art('bottom.pinafore.up.2', 25, ['..VBbbbvvbbbBV..', '..VbbbBBBBbbbV..', '...VVVVVVVVVV...']),
    ],
  },
  shorts: {
    down: [
      art('bottom.shorts.down.0', 25, ['....VBbb........', '....VBvV........']),
      art('bottom.shorts.down.1', 25, ['....VBvbbvBV....', '....VBbbbbBV....', '....VBvVVvBV....']),
      art('bottom.shorts.down.2', 25, ['........bbBV....', '........VvBV....']),
    ],
    right: [
      art('bottom.shorts.right.0', 25, ['...VbbbBV.......']),
      art('bottom.shorts.right.1', 25, [
        '.....VBBbV......',
        '.....VBbV.......',
        '.....VBbV.......',
      ]),
      art('bottom.shorts.right.2', 25, ['.....bbbBV......', '......BBV.......']),
    ],
    up: [
      art('bottom.shorts.up.0', 25, ['....VBbb........', '....VBvV........']),
      art('bottom.shorts.up.1', 25, ['....VBvbbvBV....', '....VBbbbbBV....', '....VBvVVvBV....']),
      art('bottom.shorts.up.2', 25, ['........bbBV....', '........VvBV....']),
    ],
  },
  tee: {
    down: [
      art('bottom.tee.down.0', 25, [
        '....VBbbkvbk....',
        '....VBbVkbKk....',
        '....kbvk.kk.....',
        '....kKbk........',
        '.....kk.........',
      ]),
      art('bottom.tee.down.1', 25, [
        '....VBbbbbBV....',
        '....VBbbbbBV....',
        '....VBbVVbBV....',
        '....kbvkkvbk....',
        '....kKbkkbKk....',
        '.....kk..kk.....',
      ]),
      art('bottom.tee.down.2', 25, [
        '....kbvkbbBV....',
        '....kKbkVbBV....',
        '.....kk.kvbk....',
        '........kbKk....',
        '.........kk.....',
      ]),
    ],
    right: [
      art('bottom.tee.right.0', 25, [
        '...VbbbBVvvbk...',
        '...kvbk..kbKk...',
        '...kbKk...kk....',
        '....kk..........',
      ]),
      art('bottom.tee.right.1', 25, [
        '.....VbbBV......',
        '.....VbBV.......',
        '.....VbBV.......',
        '.....kvbk.......',
        '.....kbKk.......',
        '......kk........',
      ]),
      art('bottom.tee.right.2', 25, [
        '...kvbbbBVkk....',
        '..kvbkBBVvvbk...',
        '..kbKk...kbKk...',
        '...kk.....kk....',
      ]),
    ],
    up: [
      art('bottom.tee.up.0', 25, [
        '....VBbbkvbk....',
        '....VBbVkbKk....',
        '....kbvk.kk.....',
        '....kKbk........',
        '.....kk.........',
      ]),
      art('bottom.tee.up.1', 25, [
        '....VBbbbbBV....',
        '....VBbbbbBV....',
        '....VBbVVbBV....',
        '....kbvkkvbk....',
        '....kKbkkbKk....',
        '.....kk..kk.....',
      ]),
      art('bottom.tee.up.2', 25, [
        '....kbvkbbBV....',
        '....kKbkVbBV....',
        '.....kk.kvbk....',
        '........kbKk....',
        '.........kk.....',
      ]),
    ],
  },
  uniform: {
    down: [
      art('bottom.uniform.down.0', 25, [
        '....VbBVVvvV....',
        '....VVVVVvKV....',
        '....VvvV.VV.....',
        '....VKvV........',
        '.....VV.........',
      ]),
      art('bottom.uniform.down.1', 25, [
        '....VbBVVBbV....',
        '....VbBVVBbV....',
        '....VVVVVVVV....',
        '....VvvVVvvV....',
        '....VKvVVvKV....',
        '.....VV..VV.....',
      ]),
      art('bottom.uniform.down.2', 25, [
        '....VvvVVBbV....',
        '....VKvVVVVV....',
        '.....VV.VvvV....',
        '........VvKV....',
        '.........VV.....',
      ]),
    ],
    right: [
      art('bottom.uniform.right.0', 25, [
        '...VbbBVVvvvV...',
        '...VvvV..VvKV...',
        '...VKvV...VV....',
        '....VV..........',
      ]),
      art('bottom.uniform.right.1', 25, [
        '.....VbBBV......',
        '.....VbBV.......',
        '.....VVVV.......',
        '.....VvvV.......',
        '.....VKvV.......',
        '......VV........',
      ]),
      art('bottom.uniform.right.2', 25, [
        '...VvBBBBVVV....',
        '..VvvVVVVvvvV...',
        '..VKvV...VvKV...',
        '...VV.....VV....',
      ]),
    ],
    up: [
      art('bottom.uniform.up.0', 25, [
        '....VbBVVvvV....',
        '....VVVVVvKV....',
        '....VvvV.VV.....',
        '....VKvV........',
        '.....VV.........',
      ]),
      art('bottom.uniform.up.1', 25, [
        '....VbBVVBbV....',
        '....VbBVVBbV....',
        '....VVVVVVVV....',
        '....VvvVVvvV....',
        '....VKvVVvKV....',
        '.....VV..VV.....',
      ]),
      art('bottom.uniform.up.2', 25, [
        '....VvvVVBbV....',
        '....VKvVVVVV....',
        '.....VV.VvvV....',
        '........VvKV....',
        '.........VV.....',
      ]),
    ],
  },
  livery: {
    down: [
      art('bottom.livery.down.0', 25, [
        '....VvbVVVVV....',
        '....VBBVVVKV....',
        '....VVVV.VV.....',
        '....VKVV........',
        '.....VV.........',
      ]),
      art('bottom.livery.down.1', 25, [
        '....VvbBBbvV....',
        '....VvbVVbvV....',
        '....VBBVVBBV....',
        '....VVVVVVVV....',
        '....VKVVVVKV....',
        '.....VV..VV.....',
      ]),
      art('bottom.livery.down.2', 25, [
        '....VVVVVbvV....',
        '....VKVVVBBV....',
        '.....VV.VVVV....',
        '........VVKV....',
        '.........VV.....',
      ]),
    ],
    right: [
      art('bottom.livery.right.0', 25, [
        '....VvbbVVVVV...',
        '...VVVVVVVVKV...',
        '...VKVV...VV....',
        '....VV..........',
      ]),
      art('bottom.livery.right.1', 25, [
        '.....VvbBV......',
        '.....VvbV.......',
        '.....VBBV.......',
        '.....VVVV.......',
        '.....VKVV.......',
        '......VV........',
      ]),
      art('bottom.livery.right.2', 25, [
        '...VVVbbbVVV....',
        '..VVVVVVVVVVV...',
        '..VKVV...VVKV...',
        '...VV.....VV....',
      ]),
    ],
    up: [
      art('bottom.livery.up.0', 25, [
        '....VvbVVVVV....',
        '....VBBVVVKV....',
        '....VVVV.VV.....',
        '....VKVV........',
        '.....VV.........',
      ]),
      art('bottom.livery.up.1', 25, [
        '....VvbbbbvV....',
        '....VvbVVbvV....',
        '....VBBVVBBV....',
        '....VVVVVVVV....',
        '....VKVVVVKV....',
        '.....VV..VV.....',
      ]),
      art('bottom.livery.up.2', 25, [
        '....VVVVVbvV....',
        '....VKVVVBBV....',
        '.....VV.VVVV....',
        '........VVKV....',
        '.........VV.....',
      ]),
    ],
  },
  waistcoat: {
    down: [
      art('bottom.waistcoat.down.0', 25, [
        '....VbBBBBbk....',
        '....VbBVkbKk....',
        '....kbvk.kk.....',
        '....kKbk........',
        '.....kk.........',
      ]),
      art('bottom.waistcoat.down.1', 25, [
        '....VVVVVVVV....',
        '....VbBBBBbV....',
        '....VbBVVBbV....',
        '....kbvkkvbk....',
        '....kKbkkbKk....',
        '.....kk..kk.....',
      ]),
      art('bottom.waistcoat.down.2', 25, [
        '....kbBBBBbV....',
        '....kKbkVBbV....',
        '.....kk.kvbk....',
        '........kbKk....',
        '.........kk.....',
      ]),
    ],
    right: [
      art('bottom.waistcoat.right.0', 25, [
        '....VbBBBvvbk...',
        '...kbvkVVkbKk...',
        '...kKbk...kk....',
        '....kk..........',
      ]),
      art('bottom.waistcoat.right.1', 25, [
        '.....VVVVk......',
        '.....VbBV.......',
        '.....VbBV.......',
        '.....kbvk.......',
        '.....kKbk.......',
        '......kk........',
      ]),
      art('bottom.waistcoat.right.2', 25, [
        '...VbBBBBBkk....',
        '..kbvBkkkBvbk...',
        '..kKbk...kbKk...',
        '...kk.....kk....',
      ]),
    ],
    up: [
      art('bottom.waistcoat.up.0', 25, [
        '....VbBBBBbk....',
        '....VbBVkbKk....',
        '....kbvk.kk.....',
        '....kKbk........',
        '.....kk.........',
      ]),
      art('bottom.waistcoat.up.1', 25, [
        '....VVVVVVVV....',
        '....VbBBBBbV....',
        '....VbBVVBbV....',
        '....kbvkkvbk....',
        '....kKbkkbKk....',
        '.....kk..kk.....',
      ]),
      art('bottom.waistcoat.up.2', 25, [
        '....kbBBBBbV....',
        '....kKbkVBbV....',
        '.....kk.kvbk....',
        '........kbKk....',
        '.........kk.....',
      ]),
    ],
  },
  crew: {
    down: [
      art('bottom.crew.down.0', 25, [
        '....VvbbbbvV....',
        '....VvbVVvbV....',
        '....VbbV.VV.....',
        '....VbvV........',
        '.....VV.........',
      ]),
      art('bottom.crew.down.1', 25, [
        '....VvbbbbvV....',
        '....VvbbbbvV....',
        '....VvbVVbvV....',
        '....VbbVVbbV....',
        '....VbvVVvbV....',
        '.....VV..VV.....',
      ]),
      art('bottom.crew.down.2', 25, [
        '....VvbbbbvV....',
        '....VbvVVbvV....',
        '.....VV.VbbV....',
        '........VvbV....',
        '.........VV.....',
      ]),
    ],
    right: [
      art('bottom.crew.right.0', 25, [
        '....VvbbbbbbV...',
        '...VbbVVVVbvV...',
        '...VbvV...VV....',
        '....VV..........',
      ]),
      art('bottom.crew.right.1', 25, [
        '.....VvbbV......',
        '.....VvbV.......',
        '.....VvbV.......',
        '.....VbbV.......',
        '.....VbvV.......',
        '......VV........',
      ]),
      art('bottom.crew.right.2', 25, [
        '...VvbbbBBVV....',
        '..VbbVVVVvbbV...',
        '..VbvV...VbvV...',
        '...VV.....VV....',
      ]),
    ],
    up: [
      art('bottom.crew.up.0', 25, [
        '....VvbbbbvV....',
        '....VvbVVvbV....',
        '....VbbV.VV.....',
        '....VbvV........',
        '.....VV.........',
      ]),
      art('bottom.crew.up.1', 25, [
        '....VvbbbbvV....',
        '....VvbbbbvV....',
        '....VvbVVbvV....',
        '....VbbVVbbV....',
        '....VbvVVvbV....',
        '.....VV..VV.....',
      ]),
      art('bottom.crew.up.2', 25, [
        '....VvbbbbvV....',
        '....VbvVVbvV....',
        '.....VV.VbbV....',
        '........VvbV....',
        '.........VV.....',
      ]),
    ],
  },
  cardigan: {
    down: [
      art('bottom.cardigan.down.0', 25, [
        '....VbBBBBbV....',
        '....Vvbbbbvj....',
        '.........jj.....',
        '....jkKj........',
        '.....jj.........',
      ]),
      art('bottom.cardigan.down.1', 25, [
        '....VvbbbbvV....',
        '....VbBBBBbV....',
        '....VvbbbbvV....',
        '................',
        '....jkKjjKkj....',
        '.....jj..jj.....',
      ]),
      art('bottom.cardigan.down.2', 25, [
        '....VbBBBBbV....',
        '....jvbbbbvV....',
        '.....jj.........',
        '........jKkj....',
        '.........jj.....',
      ]),
    ],
    right: [
      art('bottom.cardigan.right.0', 25, [
        '....VvbbbV.Kj...',
        '...jK.bbVjKkj...',
        '...jkKj...jj....',
        '....jj..........',
      ]),
      art('bottom.cardigan.right.1', 25, [
        '.....VvbbV......',
        '.....VbBV.......',
        '.....VvbV.......',
        '................',
        '.....jkKj.......',
        '......jj........',
      ]),
      art('bottom.cardigan.right.2', 25, [
        '...VvbbBBV.j....',
        '..jK...VV..Kj...',
        '..jkKj...jKkj...',
        '...jj.....jj....',
      ]),
    ],
    up: [
      art('bottom.cardigan.up.0', 25, [
        '....VbBBBBbV....',
        '....Vvbbbbvj....',
        '.........jj.....',
        '....jkKj........',
        '.....jj.........',
      ]),
      art('bottom.cardigan.up.1', 25, [
        '....VvbbbbvV....',
        '....VbBBBBbV....',
        '....VvbbbbvV....',
        '................',
        '....jkKjjKkj....',
        '.....jj..jj.....',
      ]),
      art('bottom.cardigan.up.2', 25, [
        '....VbBBBBbV....',
        '....jvbbbbvV....',
        '.....jj.........',
        '........jKkj....',
        '.........jj.....',
      ]),
    ],
  },
  jersey: {
    down: [
      art('bottom.jersey.down.0', 25, [
        '....VvbbbbvV....',
        '....VvbVVKBk....',
        '....kBBk.kk.....',
        '....kBKk........',
        '.....kk.........',
      ]),
      art('bottom.jersey.down.1', 25, [
        '....VvbbbbvV....',
        '....VvbbbbvV....',
        '....VvbVVbvV....',
        '....kBBkkBBk....',
        '....kBKkkKBk....',
        '.....kk..kk.....',
      ]),
      art('bottom.jersey.down.2', 25, [
        '....VvbbbbvV....',
        '....kBKVVbvV....',
        '.....kk.kBBk....',
        '........kKBk....',
        '.........kk.....',
      ]),
    ],
    right: [
      art('bottom.jersey.right.0', 25, [
        '....kvbbVBBBk...',
        '...kBBkVVkBKk...',
        '...kBKk...kk....',
        '....kk..........',
      ]),
      art('bottom.jersey.right.1', 25, [
        '.....VvbbV......',
        '.....VvbV.......',
        '.....VvbV.......',
        '.....kBBk.......',
        '.....kBKk.......',
        '......kk........',
      ]),
      art('bottom.jersey.right.2', 25, [
        '...kBVvbbVkk....',
        '..kBBBkVVBBBk...',
        '..kBKk...kBKk...',
        '...kk.....kk....',
      ]),
    ],
    up: [
      art('bottom.jersey.up.0', 25, [
        '....VvbbbbvV....',
        '....VvbVVKBk....',
        '....kBBk.kk.....',
        '....kBKk........',
        '.....kk.........',
      ]),
      art('bottom.jersey.up.1', 25, [
        '....VvbbbbvV....',
        '....VvbbbbvV....',
        '....VvbVVbvV....',
        '....kBBkkBBk....',
        '....kBKkkKBk....',
        '.....kk..kk.....',
      ]),
      art('bottom.jersey.up.2', 25, [
        '....VvbbbbvV....',
        '....kBKVVbvV....',
        '.....kk.kBBk....',
        '........kKBk....',
        '.........kk.....',
      ]),
    ],
  },
  henley: {
    down: [
      art('bottom.henley.down.0', 25, [
        '....VbvvvvbV....',
        '....VbvVVBKk....',
        '....kBBk.kk.....',
        '....kKBk........',
        '.....kk.........',
      ]),
      art('bottom.henley.down.1', 25, [
        '....VbvvvvbV....',
        '....VbvvvvbV....',
        '....VbvVVvb.....',
        '....kBBkkBBk....',
        '....kKBkkBKk....',
        '.....kk..kk.....',
      ]),
      art('bottom.henley.down.2', 25, [
        '....VbvvvvbV....',
        '....kKBVVvbV....',
        '.....kk.kBBk....',
        '........kBKk....',
        '.........kk.....',
      ]),
    ],
    right: [
      art('bottom.henley.right.0', 25, [
        '....kVbvvVBBk...',
        '...kBBkVVkBKk...',
        '...kKBk...kk....',
        '....kk..........',
      ]),
      art('bottom.henley.right.1', 25, [
        '.....VbvvV......',
        '.....VbvV.......',
        '.....VbvV.......',
        '.....kBBk.......',
        '.....kKBk.......',
        '......kk........',
      ]),
      art('bottom.henley.right.2', 25, [
        '...kBBVvvVkk....',
        '..kBBBkVVBBBk...',
        '..kKBk...kBKk...',
        '...kk.....kk....',
      ]),
    ],
    up: [
      art('bottom.henley.up.0', 25, [
        '....VbvvvvbV....',
        '....VbvVVBKk....',
        '....kBBkkkk.....',
        '....kKBk........',
        '.....kk.........',
      ]),
      art('bottom.henley.up.1', 25, [
        '....VbvvvvbV....',
        '....VbvvvvbV....',
        '....VbvVVvb.....',
        '....kBBkkBBk....',
        '....kKBkkBKk....',
        '.....kk..kk.....',
      ]),
      art('bottom.henley.up.2', 25, [
        '....VbvvvvbV....',
        '....kKBVVvbV....',
        '.....kkkkBBk....',
        '........kBKk....',
        '.........kk.....',
      ]),
    ],
  },
  tunic: {
    down: [
      art('bottom.tunic.down.0', 25, [
        '....VbBBBBbV....',
        '....VbBVkKvk....',
        '....kvvk.kk.....',
        '....kvKk........',
        '.....kk.........',
      ]),
      art('bottom.tunic.down.1', 25, [
        '....VbBBBBbV....',
        '....VbBBBBbV....',
        '....VbBVVBbV....',
        '....kvvkkvvk....',
        '....kvKkkKvk....',
        '.....kk..kk.....',
      ]),
      art('bottom.tunic.down.2', 25, [
        '....VbBBBBbV....',
        '....kvKkVBbV....',
        '.....kk.kvvk....',
        '........kKvk....',
        '.........kk.....',
      ]),
    ],
    right: [
      art('bottom.tunic.right.0', 25, [
        '....VVbBVkvvk...',
        '...kvvkVVkvKk...',
        '...kvKk...kk....',
        '....kk..........',
      ]),
      art('bottom.tunic.right.1', 25, [
        '.....VbBBV......',
        '.....VbBV.......',
        '.....VbBV.......',
        '.....kvvk.......',
        '.....kvKk.......',
        '......kk........',
      ]),
      art('bottom.tunic.right.2', 25, [
        '...VvvVBBkkk....',
        '..kvvvVVVvvvk...',
        '..kvKk...kvKk...',
        '...kk.....kk....',
      ]),
    ],
    up: [
      art('bottom.tunic.up.0', 25, [
        '....VbBBBBbV....',
        '....VbBVVKvk....',
        '....kvvk.kk.....',
        '....kvKk........',
        '.....kk.........',
      ]),
      art('bottom.tunic.up.1', 25, [
        '....VbBBBBbV....',
        '....VbBBBBbV....',
        '....VbBVVBbV....',
        '....kvvkkvvk....',
        '....kvKkkKvk....',
        '.....kk..kk.....',
      ]),
      art('bottom.tunic.up.2', 25, [
        '....VbBBBBbV....',
        '....kvKVVBbV....',
        '.....kk.kvvk....',
        '........kKvk....',
        '.........kk.....',
      ]),
    ],
  },
} as const satisfies Record<string, DirectionalFrames>

export type TopId = keyof typeof TOPS
export type BottomId = keyof typeof BOTTOMS

// ── packages/characters/src/parts/hair.ts ───────────────────────────────────

/**
 * The hairstyles, one drawing each, worn on the head anchor.
 *
 * ⛔ **Generated by `scripts/import-metrocity.mjs` — do not edit.** The source is
 * `vendor/metrocity/` (JIK-A-4's CC0 pack, `vendor/metrocity/NOTICE.md`); the
 * converter and its argument are in that script. An edit here is lost on the next
 * run, and a shape that needs changing is a change to the converter or a different
 * row of the pack.
 */

/**
 * `bald` is a member of the list and not an absence of one: one manager in
 * 14 wears no hair, which is what makes the rest read as a choice.
 *
 * A style is **one** drawing per direction. The walk frames move the whole head up
 * a pixel and the seated frames move it down — measured, by comparing the pack's
 * own hair cells against its standing one — so what a frame needs is an offset and
 * not a second drawing of the same hair.
 */
export const HAIR = {
  bald: { down: NO_ART, up: NO_ART, right: NO_ART },
  cap: {
    down: art('hair.cap.down', 1, [
      '....gggggggg....',
      '..ggHHHHHHHHgg..',
      '.ghHHHHHHHHHHhg.',
      'ghhHHHHHHHHHHhhg',
      'ghhHHHHHHHHHHhhg',
      'ghhhHHHHHHHHhhhg',
      'ghhhhhhGGhhhhhhg',
      'ghhhhhGGGGhhhhhg',
      'ghhhhhGGGGhhhhhg',
      '.ghhhhhGGhhhhhg.',
      '..gggggggggggg..',
      '...ghHHHHHHhg...',
      '...ghHHHHHHhg...',
      '...ghHHHHHHhg...',
      '....gggggggg....',
    ]),
    right: art('hair.cap.right', 3, [
      '....gggggggg....',
      '..ggHHHHHHHHgg..',
      '.ghHHHHHHHHHHhg.',
      'ghhHHHHHHHHHHhhg',
      'ghhHHHHHHHHHHGhg',
      'ghhhHHHHHHHHhGGg',
      'ghhhhhhhhhhhhGGg',
      'ghhhhhhhhhhhhGhg',
      'ghhhhhhhhhhhhhhg',
      '.ghhhhhhhhhhhhgh',
      '..gggggggggggggg',
    ]),
    up: art('hair.cap.up', 2, [
      '....gggggggg....',
      '..ggHHHHHHHHgg..',
      '.ghHHHHHHHHHHhg.',
      'ghhHHHHHHHHHHhhg',
      'ghhHHHHHHHHHHhhg',
      'ghhHHHHHHHHHHhhg',
      'ghhhHHHHHHHHhhhg',
      'ghhhhhhhhhhhhhhg',
      'ghhhhhhhhhhhhhhg',
      'gghhhhhhhhhhhhgg',
      '.ghhhhhhhhhhhhg.',
      '..gggggggggggg..',
    ]),
  },
  crop: {
    down: art('hair.crop.down', 1, [
      '.....g...g......',
      '....gGgHgHg.....',
      '....gGHHgHg.....',
      '...ggHggHHhgg...',
      '..gGgHHHHHHGGg..',
      '.gGHgHhhhhhHHHg.',
      'gGHHgHhhhhhHHHg.',
      'gGHHgHhhhhHHHHg.',
      'gGHHgHhhhhHHHHg.',
      'gGHHHhhhhhHHHhg.',
      'GHHhhhgghggHHhg.',
      'ghhghg..g..gggg.',
      '.gg.gg.......hg.',
      '..g.g........h..',
    ]),
    right: art('hair.crop.right', 3, [
      '........g.gg....',
      '....ggggGHGhg...',
      '...ghHhhHgHHhg..',
      '..gGhhhhHgHHHg..',
      '.gGHgHhhghhHHg..',
      '.gGHHhhhhhHHhg..',
      '.gGHhhhhhhHHhg..',
      '.gGHhhhhhhHHhg..',
      '.gHhhhgghggHhg..',
      '.ghghg..g..ggg..',
      '..gghgg....g....',
      '..ghHg..........',
      '...hHg..........',
      '...gg...........',
    ]),
    up: art('hair.crop.up', 1, [
      '......g...g.....',
      '.....gHgHgGg....',
      '.....gHgHHGg....',
      '...gghHHggHgg...',
      '..gGGHHHHHHHGg..',
      '.gHHHhhHHHHHHGg.',
      '.gHHHhhhHHHHHHGg',
      '.gHHHHhhhHHHHHGg',
      '.gHHHHhhhhHHHHGg',
      '.ghHHHhhhhhHHHGg',
      '.ghHhhhhhhhhhHHG',
      '.ghhhhhhhhhhhhhg',
      '.ghhhhhhhhhhhgg.',
      '..ghhhhhhhhhhg..',
      '...ghhhhhhhhg...',
      '....ghhhhhhg....',
    ]),
  },
  bob: {
    down: art('hair.bob.down', 3, [
      '....ggggggg.....',
      '...gggHGGGGgg...',
      '..gGHHgGHHHGGg..',
      '..gGHHgGHHHGGg..',
      '.gGHGGgGGGHHHGg.',
      '.gGGHHgGHHGHHGg.',
      '.gGHHHgGHHHHHGg.',
      '.gGHgggghhhHHGg.',
      '.gGg....ggghhGg.',
      '.gGg.......ggGg.',
      '.gGg.......ggGg.',
      '..g..........g..',
    ]),
    right: art('hair.bob.right', 3, [
      '.....ggggggg....',
      '...ggGGGGHggg...',
      '..gGGHHHGgHHGg..',
      '..gGGHHHGgHHGg..',
      '.gGHHHGGgHGGHGg.',
      '.gGHHGHgGHHHGGg.',
      '.gGHHHgHGHHHHGg.',
      '.gGHHHgHHHHHHGg.',
      '.gGhhHgHHHHHHGg.',
      '.gGhhh.....HHg..',
      '.gGhhh......g...',
      '..ghhhh.........',
      '....hhh.........',
      '....ghh.........',
    ]),
    up: art('hair.bob.up', 3, [
      '.....ggggggg....',
      '...ggGGGGHggg...',
      '..gGGHHHGgHHGg..',
      '..gGGHHHGgHHGg..',
      '.gGHHHGGGgGGHGg.',
      '.gGHHGHHGgHHGGg.',
      '.gGHHHHHGgHHHGg.',
      '.gGHHHHHgHgHHGg.',
      '.gGHHHHHHHHHHGg.',
      '.gGhhhhhhhhhhGg.',
      '.gGhhhhhhhhhgGg.',
      '..ghhhhhhhhhhg..',
      '....hhhhhhhh....',
      '....hhhhhhhh....',
      '.......hh.......',
    ]),
  },
  braids: {
    down: art('hair.braids.down', 3, [
      '.....gggggg.....',
      '...ggggggGGgg...',
      '..gggghhHggggg..',
      '..ghhggggGGHHg..',
      '.ghggghhHgggggg.',
      '.gghhggggGGHHHg.',
      '.ghggghhHgggggg.',
      '.gghhggggGGHHHg.',
      'gHhggg.gHggggHhg',
      'gHggg...g.gggghg',
      'ggghg......ghggg',
      'gHhhg......ghhHg',
      'gHhh........hhHg',
      'gHhhg......ghhHg',
      'gHhg........ghHg',
      '.gg..........gg.',
    ]),
    right: art('hair.braids.right', 3, [
      '.....gggggg.....',
      '...ggGGggggg....',
      '..gggggHhhggg...',
      '..gHHGGgggghhg..',
      '.ggggggHhhgggg..',
      '.gHHHGGgggghhg..',
      '.ggggggHghhggg..',
      '.gHHHGGgggghhg..',
      'ghHggggHhhhggg..',
      'ghggggGhhhhhhg..',
      'gggHHGhhhhhhg...',
      'gHhhhhhhhh......',
      'gHhhhhhhh.......',
      'gHhhg.ghhg......',
      'gHhg............',
      '.gg.............',
    ]),
    up: art('hair.braids.up', 3, [
      '.....gggggg.....',
      '...ggGGgggggg...',
      '..gggggHhhgggg..',
      '..gHHGGgggghhg..',
      '.ggggggHhhggghg.',
      '.gHHHGGgggghhgg.',
      '.ggggggHhhggghg.',
      '.gHHHGGgggghhgg.',
      'ghHggggHghggghHg',
      'ghggggGHhghhhgHg',
      'gggHHGggghhhhggg',
      'gHhhhhhhhhhhhhHg',
      'gHhhhhhhhhhhhhHg',
      'gHhhg.ghhg.ghhHg',
      'gHhg........ghHg',
      '.gg..........gg.',
    ]),
  },
  bowl: {
    down: art('hair.bowl.down', 3, [
      '.....ggggggg....',
      '...gghHgHGGGg...',
      '..ghhHGgHHHHhg..',
      '..gHHGgHhhHHGhg.',
      '.gHGGgHHHHHHHHg.',
      '.gGGGgHHHHHHHHg.',
      '.gGGHgHHHHHHHHg.',
      '.gHHHgHHHHHHHHg.',
      '.gHHHggHgghhHHg.',
      '.ghgg.gHg.gghHg.',
      '..g....g....gg..',
    ]),
    right: art('hair.bowl.right', 3, [
      '.....ggggggg....',
      '...gghHgHGGGg...',
      '..ghhHGgHHHHhg..',
      '..gHHGgHhhHHGhg.',
      '.gHGGgHHHHHHHHg.',
      '.gGGGgHHHHHHHHg.',
      '.gGGHgHHHHHHHHg.',
      '.gHHHgHHHHHHHHg.',
      '.gHhhghhhhhhHHg.',
      '.ghhhh..hhhhhHg.',
      '..ghhh.......g..',
      '....hhh.........',
      '.....hh.........',
    ]),
    up: art('hair.bowl.up', 3, [
      '....ggggggg.....',
      '...gGGGHgHhgg...',
      '..ghHHHHgGHhhg..',
      '.ghGHHhhHgGHHg..',
      '.gHHHHHHHHgGGHg.',
      '.gHHHHHHHHgGGGg.',
      '.gHHHHHHHHgHGGg.',
      '.gHHHHHHHHgHHHg.',
      '.gHHhhhhhhghhHg.',
      '.gHhhhhhhghhhhg.',
      '..ghhhhhghhhhg..',
      '....hhhhhhhh....',
      '.....hhhhhh.....',
      '......hhhh......',
    ]),
  },
  parted: {
    down: art('hair.parted.down', 3, [
      '....ggggggg.....',
      '...gGGGHgHhggg..',
      '..ghhhHhgGHhhhg.',
      '.ghGHHhhHgGHHHg.',
      '.ghGHHhHHhghhHg.',
      '.ghGHHHHHHgHHHg.',
      '.ghGHHHHHHgHHHg.',
      '.ghGHHHHHHgHHHg.',
      '.ghHhhGGGHgGGhg.',
      '.ghHhhggHggHHHg.',
      '.gHhgg..g..gghg.',
      '..gg.........g..',
    ]),
    right: art('hair.parted.right', 4, [
      '....ggggggg.....',
      '..gghHgHGGGg....',
      '.ghhHGghHhhhg...',
      '.gHHGgHhhHHGhg..',
      '.gHhghHHHHHGhg..',
      '.gHHgHHHHHHGhg..',
      '.gHHgHHHHHHGhg..',
      '.gHHgHHHHHHGhg..',
      '.ghGgHGGGhhHhg..',
      '.gHHHgHHHhhHhg..',
      '.ghhHHHhhh...g..',
      '..ghhhhh........',
      '....hhhh........',
      '.....hh.........',
    ]),
    up: art('hair.parted.up', 3, [
      '.....ggggggg....',
      '..ggghHgHGGGg...',
      '.ghhhHGghHhhhg..',
      '.gHHHGgHhhHHGhg.',
      '.gHhhghHHhHHGhg.',
      '.gHHHgHHHHHHGhg.',
      '.gHHHgHHHHHHGhg.',
      '.gHHHgHHHHHHGhg.',
      '.ghGGgHGGGhhHhg.',
      '.gHHHggHgghhHhg.',
      '.ghhhhhhhhhhhHg.',
      '..ghhhhhhhhhgg..',
      '.....hhhhhh.....',
      '......hhhh......',
    ]),
  },
  waves: {
    down: art('hair.waves.down', 3, [
      '.....gggggg.....',
      '...gghhhhGGgg...',
      '..ghhgHHGHHhhg..',
      '..gHHghhhGGGGGg.',
      '.gGhhgHHGHHhhhg.',
      '.ghHHgghhGGGGGg.',
      '.gHhhgHHGHHhhhg.',
      '.ghHHHghhGGGGGg.',
      '.gHhhhgHGHHhhhg.',
      'gGhGGg.gGGGGGGHg',
      'gGGgg...gGggghHg',
      'ghh..........ghg',
      '.gg..........gg.',
      '...G........G...',
    ]),
    right: art('hair.waves.right', 3, [
      '.....gggggg.....',
      '...ggGGhhhhgg...',
      '..ghhHHGHHghhg..',
      '.gGGGGGhhhgHHg..',
      '.ghhhHHGHHghhGg.',
      '.gGGGGGhhggHHhg.',
      '.ghhhHHGHHghhHg.',
      '.gGGGGGhhgHHHhg.',
      '.ghhhHHGHghhhHg.',
      '.gGGGGGhhHHGGg..',
      '.ghhhHHHHH...g..',
      'gHGHHHHH........',
      'gHhHHHH.........',
      'ghHH............',
      '.gg.............',
    ]),
    up: art('hair.waves.up', 3, [
      '.....gggggg.....',
      '...ggGGhhhhgg...',
      '..ghhHHGHHghhg..',
      '.gGGGGGhhhgHHg..',
      '.ghhhHHGHHghhGg.',
      '.gGGGGGhhggHHhg.',
      '.ghhhHHGHHghhHg.',
      '.gGGGGGhhgHHHhg.',
      '.ghhhHHGHghhhHg.',
      'gHGGGGGhhHHGGhGg',
      'gHhhhHHHHHHHHGGg',
      'ghHHHHHHHHHHHhhg',
      '.gg..HHHHHHH.gg.',
      '...G..HHHH..G...',
    ]),
  },
  cornrows: {
    down: art('hair.cornrows.down', 3, [
      '.....gggggg.....',
      '...ggHHGGgHgg...',
      '..ghHggggggHhg..',
      '..gggHHGGgHggg..',
      '.ghhHggggggHhhg.',
      '.ggggHHGGgHgggg.',
      '.ghhHggggggHhhg.',
      '.ggggHHGGgHgggg.',
      '.ghhHggggggHhhg.',
      '.ggggggGGgggggg.',
      '.ghhg..gg..ghhg.',
      'gggg...g....ggHg',
      'gHhg........ghHg',
      'ggghg......ggggg',
      'gHhhg......ghhHg',
      'gggg........gggg',
      '.gg..........gg.',
    ]),
    right: art('hair.cornrows.right', 3, [
      '.....gggggg.....',
      '...ggHgGGHHgg...',
      '..ghHggggggHhg..',
      '..gggHgGGHHggg..',
      '.ghhHggggggHhhg.',
      '.ggggHgGGHHgggg.',
      '.ghhHggggggHhhg.',
      '.ggggHgGGHHgggg.',
      '.ghhHggggggHhhg.',
      '.ggggHGGGHHgggg.',
      '.ghhhhhhhhhhhg..',
      '.gHhhhhhhh..hg..',
      '.gHhhhhhh.......',
      '.gHhh.hhh.......',
      '.gHhg.hhh.......',
      '.gHhg...........',
      '..gg............',
    ]),
    up: art('hair.cornrows.up', 3, [
      '.....gggggg.....',
      '...ggHgGGHHgg...',
      '..ghHggggggHhg..',
      '..gggHgGGHHggg..',
      '.ghhHggggggHhhg.',
      '.ggggHgGGHHgggg.',
      '.ghhHggggggHhhg.',
      '.ggggHgGGHHgggg.',
      '.ghhHggggggHhhg.',
      '.ggggHGGGHHgggg.',
      '.ghhhhhhhhhHhhg.',
      'gHhhhhhhhhhhhhgg',
      'gHhhhhhhhhhhhhHg',
      'gHhhg.hhhh.ghhHg',
      'gHhhg.hhhh.ghhHg',
      'gggg........gggg',
      '.gg..........gg.',
    ]),
  },
  sleek: {
    down: art('hair.sleek.down', 1, [
      '.....hhhhhh.....',
      '...hhGGGGGGhh...',
      '..hGGGGGGGGGGh..',
      '.hGGGGGGGGGGGGh.',
      '.hGGGGGGGGGGGGh.',
      '.hGGGGGGGGGGGGh.',
      '.hGGGGGGGGGGGGh.',
      '.hHGGGGGGGGGGHh.',
      '.hHHHGGGGGGHHHh.',
      '.hHHHHHHHHHHHHh.',
      '.hHHHHHHHHHHHHh.',
      '.hHHHHHHHHHHHHh.',
      '.hHHH......HHHh.',
      '..hH........Hh..',
    ]),
    right: art('hair.sleek.right', 1, [
      '.....hhhhh......',
      '...hhGGGGGhh....',
      '..hGGGGGGGGGh...',
      '.hGGGGGGGGGGGh..',
      '.hGGGGGGGGGGGh..',
      '.hGGGGGGGGGGGh..',
      '.hGGGGGGGGGGGh..',
      '.hHGGGGGGGGGHh..',
      '.hHHHGGGGGHHHh..',
      '.hHHHHHHHHHHHh..',
      '.hHHHHHHHHHHHh..',
      '.hHHHHHHHHHHHh..',
      '.hHHHHHHHH......',
      '..hHHHHHH.......',
      '.....HHHH.......',
      '......HH........',
    ]),
    up: art('hair.sleek.up', 1, [
      '.....hhhhhh.....',
      '...hhGGGGGGhh...',
      '..hGGGGGGGGGGh..',
      '.hGGGGGGGGGGGGh.',
      '.hGGGGGGGGGGGGh.',
      '.hGGGGGGGGGGGGh.',
      '.hGGGGGGGGGGGGh.',
      '.hHGGGGGGGGGGHh.',
      '.hHHHGGGGGGHHHh.',
      '.hHHHHHHHHHHHHh.',
      '.hHHHHHHHHHHHHh.',
      '.hHHHHHHHHHHHHh.',
      '.hHHHHHHHHHHHHh.',
      '..hHHHHHHHHHHh..',
      '.....HHHHHH.....',
      '......HHHH......',
    ]),
  },
  mane: {
    down: art('hair.mane.down', 3, [
      '.....gggggg.....',
      '...ggGHHHHGgg...',
      '..gGHGhhhhGHGg..',
      '.ghHGhGGGGhGHhg.',
      'ghGHGGGGGGGGHGhg',
      'gGHGGGGGGGGGGHGg',
      'gGhGghGGGGhgGhGg',
      'gGhHghHGGHhgHhGg',
      'gGghHghHHhgHhgGg',
      'gHHgGGghhgGGgHHg',
      'gGHHgg.gg.ggHHGg',
      'gGGg........gGGg',
      'ghg..........ghg',
      'gGHg........gHGg',
      'gGgG........GgGg',
      'gHg..........gHg',
      '.gH..........Hg.',
      '..g..........g..',
    ]),
    right: art('hair.mane.right', 3, [
      '......gggg......',
      '....gghGGhg.....',
      '...ghGGGGGHg....',
      '..ghGGGghhGhg...',
      '.ghGGGGhGHhGGg..',
      '.gGHGGGGHGGGGg..',
      '.gGhGGGGhGghGg..',
      '.gHhGGGGhHghHg..',
      '.gHgGGGGghHghg..',
      '.gHHGGGHHgGGgg..',
      '.gHHHGHGHHgg.g..',
      '.gGGHHHHGg......',
      '.ghgHHHhg.......',
      '.gHHHHHHHg......',
      '.gHgHggHgG......',
      '.gHgg.gHg.......',
      '..gHg..gH.......',
      '...g....g.......',
    ]),
    up: art('hair.mane.up', 3, [
      '.....gggggg.....',
      '...ggGHHHHGgg...',
      '..gGHGhhhhGHGg..',
      '.ghHGhGGGGhGHhg.',
      'ghGHGGGGGGGGHGhg',
      'gGHGGGGGGGGGGHGg',
      'gGhGGGGGGGGGGhGg',
      'gGhHGGGGGGGGHhGg',
      'gGghHGGGGGGHhgGg',
      'gHHghHGGGGHhgHHg',
      'gGHHghHHHHhgHHGg',
      'gGGghghhhhghgGGg',
      'ghgHHhgggghHHghg',
      'gGHgHHhhhhHHgHGg',
      'gGghHHHHHHHHhgGg',
      'gHghhHHHHHHhhgHg',
      '.ghhhghHHhghhhg.',
      '..ghhhghhghhhg..',
      '...gggggggggg...',
    ]),
  },
  straight: {
    down: art('hair.straight.down', 2, [
      '.....gggggg.....',
      '....ghHggHhg....',
      '...gHGGggGGHg...',
      '..ghGggggggGhg..',
      '..gGgGGggGGgGg..',
      '.ghgGggggggGghg.',
      '.ggHgGGggGGgGgg.',
      '.gHgGhgggghGgHg.',
      '.ggHhgGhhGghHgg.',
      '.gGggHhgghHggGg.',
      '.gGgHgg..ggHgGg.',
      '.ghgg......gghg.',
      '.ghg........ghg.',
      '.ghg........ghg.',
      '.ghg........ghg.',
      '..gH........Hg..',
    ]),
    right: art('hair.straight.right', 4, [
      '......gggg......',
      '....ggHHGGg.....',
      '...ghGgggggg....',
      '..ghggHHGgggg...',
      '..ggGggggGGGhg..',
      '.ghGgGHHGggggg..',
      '.ghgGggggGGGhg..',
      '.ghGgGHHGggggg..',
      '.ghGgGggggHhhg..',
      '..gHgGgGgHggg...',
      '..ghgHgHgg......',
      '..ghghgHg.......',
      '..ghghghg.......',
      '...gggghg.......',
      '.......g........',
    ]),
    up: art('hair.straight.up', 2, [
      '.....gggggg.....',
      '....ghHggHhg....',
      '...gHGGggGGHg...',
      '..ghGggggggGhg..',
      '..gGgGGggGGgGg..',
      '.ghgGggggggGghg.',
      '.ggHgGGggGGgGgg.',
      '.gHgGhgggghGgHg.',
      '.ggHhgGggGghHgg.',
      '.gGggHhgghHggGg.',
      '.gGgGgghhggGgGg.',
      '.ghgGgGggGgGghg.',
      '.ghghgGggGghghg.',
      '.ghghghgghghghg.',
      '.ghghghgghghghg.',
      '..ggghghhghggg..',
      '...ggghgghggg...',
      '......gggg......',
    ]),
  },
  tousled: {
    down: art('hair.tousled.down', 3, [
      '.....gggggg.....',
      '...gghHHHHhgg...',
      '..gHHHGGHHHHHg..',
      '.ghHHGGGGHHGHhg.',
      '.gHHGGGGGHHGGHg.',
      'ghHGGGGGHHHGGGhg',
      'gHHGGGGHHHHHGGHg',
      'gHHGGGHHHHHHHGHg',
      'gHgHHhHHhghHHHHg',
      'ggHhhgHhg.ghhHHg',
      'ghhggHhg...ggHhg',
      '.gggggg....gghg.',
      '..gg........gg..',
      '...g........g...',
    ]),
    right: art('hair.tousled.right', 4, [
      '......gggg......',
      '....gghHHHg.....',
      '...ghhHHGHHg....',
      '..ghHHHGGGHHg...',
      '..ghHHGGGGGHHg..',
      '.ghHHHGGGGGHHg..',
      '.ghHHHGGGGHHHHg.',
      '.ghHHgHHhHHHHHg.',
      '.ghhgHhhgHHHHhg.',
      '..ghHHggHHHHhg..',
      '...ghHHggHHhg...',
      '....ghH..ggg....',
      '....ghH.........',
      '.....gh.........',
      '......g.........',
    ]),
    up: art('hair.tousled.up', 3, [
      '.....gggggg.....',
      '...gghHHHHhgg...',
      '..gHHHHGGGHHHg..',
      '.ghHGHHGGGGHHhg.',
      '.gHGGHHGGGGGHHg.',
      'ghGGGHHHGGGGGHhg',
      'gHGGHHHHGGGGGHHg',
      'gHGHHHHGGGGGGHHg',
      'gHHHHHHGGGGGHgHg',
      'gHHHHHGGGGGHHHgg',
      'ghHHHHGGGGHHHhhg',
      '.ghHHHHGGHHHHgg.',
      '..gghHHHHHHhgg..',
      '...ghhHHHHhhg...',
      '....gghHHhgg....',
      '......gggg......',
    ]),
  },
  headband: {
    down: art('hair.headband.down', 1, [
      '......gggg......',
      '.....ghHHhg.....',
      '.....gggggg.....',
      '...ggHGGGGHgg...',
      '..ghHggggggHhg..',
      '..gggGGGGGGggg..',
      '.ggGGggggggGGgg.',
      '.gGgghhhhhhggGg.',
      '.gghhHHHHHHhhgg.',
      '.ghHHGgGGgGHHhg.',
      '.ghHGhghhghGHhg.',
      '.ghHhgggggghHhg.',
      '.ggHg......gHgg.',
      '..gHg......gHg..',
      '..gHg......gHg..',
      '...gg......gg...',
    ]),
    right: art('hair.headband.right', 4, [
      '.....ggggg......',
      '...gghhhggg.....',
      '..ghHHGgGGGg....',
      '..gHHGgGgghhg...',
      '.ghHGgGghhHHhg..',
      '.gHHGgGghHHHHg..',
      'ghHHgGghHHGgGg..',
      'ghHHgGghHGhghg..',
      '.gHHgGghHhgggg..',
      '.ghHgGggHg......',
      '..ghHgHgHg......',
      '...gHHHgHg......',
      '...ghHHHgg......',
      '....ghH.........',
    ]),
    up: art('hair.headband.up', 3, [
      '.....gggggg.....',
      '...ggHGGGGHgg...',
      '..ghHggggggHhg..',
      '..gggGGGGGGggg..',
      '.ggGGggggggGGgg.',
      '.gGgghhhhhhggGg.',
      '.gghhGGGGGGhhgg.',
      '.ghGGGGGGGGGGhg.',
      '.ghGGGGGGGGGGhg.',
      '.ghHGGggggGGHhg.',
      '.ggHGghGGhgGHgg.',
      '..gHHgHGGHgHHg..',
      '..gHHgHGGHgHHg..',
      '...gHHgGGgHHg...',
      '....gggGGggg....',
      '......gGGg......',
      '.......gg.......',
    ]),
  },
} as const satisfies Record<string, DirectionalArt>

export type HairId = keyof typeof HAIR

// ── packages/characters/src/parts/accessories.ts ────────────────────────────

/**
 * What is worn on the head, over the hair.
 *
 * ⛔ **Generated by `scripts/import-metrocity.mjs` — do not edit.** The source is
 * `vendor/metrocity/` (JIK-A-4's CC0 pack, `vendor/metrocity/NOTICE.md`); the
 * converter and its argument are in that script. An edit here is lost on the next
 * run, and a shape that needs changing is a change to the converter or a different
 * row of the pack.
 */

export interface AccessoryArt {
  readonly art: DirectionalArt
  readonly colours: AccessoryRamp
}

/**
 * ⚠️ **An accessory carries the pack's own colours** rather than a seeded ramp. A
 * police cap that came out amber would not be a police cap, and the hat sheets are
 * drawn as one object each — the four steps below are that object's own, ranked by
 * the same rule every other layer is ranked by.
 *
 * ⛔ **Nothing here is drawn over the eyes**, which are rows 14–16 of the face.
 * Every hat in the pack stops at row 15 and frames the face; `render.test.ts`
 * measures it, because one accessory that covered them would cost every manager
 * wearing it the one feature a 16px portrait is read by.
 */
export const ACCESSORIES = {
  none: {
    art: { down: NO_ART, up: NO_ART, right: NO_ART },
    colours: { light: '#000000', base: '#000000', shade: '#000000', line: '#000000' },
  },
  earpieces: {
    art: {
      down: art('accessory.earpieces.down', 10, [
        '.n............n.',
        '.na..........an.',
        '.naA........Aan.',
        '.naA........Aan.',
        '..aA........Aa..',
      ]),
      right: art('accessory.earpieces.right', 10, [
        '.naA............',
        '.naAAA..........',
        '.naAAAA.........',
        '.naaAAA.........',
        '...aaa..........',
      ]),
      up: art('accessory.earpieces.up', 10, [
        '.n............n.',
        '.na..........an.',
        '.naA........Aan.',
        '.naAAA....AAAan.',
        '..aAAAAAAAAAAa..',
        '....AAAAAAAA....',
        '......AAAA......',
      ]),
    },
    colours: { light: '#463E42', base: '#3D3438', shade: '#000000', line: '#000000' },
  },
} as const satisfies Record<string, AccessoryArt>

export type AccessoryId = keyof typeof ACCESSORIES

// ── packages/characters/src/parts/body.ts ───────────────────────────────────

/**
 * The body: bare skin, the eyes the pack draws, and the underwear under everything.
 *
 * ⛔ **Generated by `scripts/import-metrocity.mjs` — do not edit.** The source is
 * `vendor/metrocity/` (JIK-A-4's CC0 pack, `vendor/metrocity/NOTICE.md`); the
 * converter and its argument are in that script. An edit here is lost on the next
 * run, and a shape that needs changing is a change to the converter or a different
 * row of the pack.
 */

/**
 * The three walk frames of each direction, as the pack drew them. Frame 1 is
 * standing — the frame the office draws when a manager is idle and the frame the
 * portrait is cropped from — and the seated frames are this one, moved and cut
 * (`render.ts`), because the pack has no seated pose.
 */
export const BODY: DirectionalFrames = {
  down: [
    art('body.down.0', 2, [
      '.....LLLLLL.....',
      '...LLZssssZLL...',
      '..LssssssssssL..',
      '..LssssssssssL..',
      '.LssssssssssssL.',
      '.LssssssssssssL.',
      '.LZssssssssssZL.',
      '.LZZssssssssZZL.',
      '.LZZZZZZZZZZZZL.',
      '.LzZZZZZZZZZZzL.',
      '.LzzZZZZZZZZzzL.',
      '..LzZEEZZEEZzL..',
      '...LsWEZZEWsL...',
      '...LZWeSSeWZL...',
      '....LZsZZsZL....',
      '...LsLLzzLLsL...',
      '..LzZZzzzzZZsL..',
      '..LsZZZZZZZzzL..',
      '..LzZZzZZzLZZL..',
      '..LZLZZzzZLZzL..',
      '..LzLZZZZZZLL...',
      '...LLZZzzZZL....',
      '....vbBBBBbv....',
      '....LvvBBvvL....',
      '....LZZvvZzL....',
      '....LZZL.LL.....',
      '....LzZL........',
      '.....LL.........',
    ]),
    art('body.down.1', 3, [
      '.....LLLLLL.....',
      '...LLZssssZLL...',
      '..LssssssssssL..',
      '..LssssssssssL..',
      '.LssssssssssssL.',
      '.LssssssssssssL.',
      '.LZssssssssssZL.',
      '.LZZssssssssZZL.',
      '.LZZZZZZZZZZZZL.',
      '.LzZZZZZZZZZZzL.',
      '.LzzZZZZZZZZzzL.',
      '..LzZEEZZEEZzL..',
      '...LsWEZZEWsL...',
      '...LZWeSSeWZL...',
      '....LZsZZsZL....',
      '...LsLLzzLLsL...',
      '..LzZZzzzzZZzL..',
      '..LsZZZZZZZZsL..',
      '.LzZZZzZZzZZZzL.',
      '.LZZLZZzzZZLZZL.',
      '.LzZLZZZZZZLZzL.',
      '..LLLZZzzZZLLL..',
      '....vbBBBBbv....',
      '....LvvBBvvL....',
      '....LZzvvzZL....',
      '....LZZLLZZL....',
      '....LzZLLZzL....',
      '.....LL..LL.....',
    ]),
    art('body.down.2', 2, [
      '.....LLLLLL.....',
      '...LLZssssZLL...',
      '..LssssssssssL..',
      '..LssssssssssL..',
      '.LssssssssssssL.',
      '.LssssssssssssL.',
      '.LZssssssssssZL.',
      '.LZZssssssssZZL.',
      '.LZZZZZZZZZZZZL.',
      '.LzZZZZZZZZZZzL.',
      '.LzzZZZZZZZZzzL.',
      '..LzZEEZZEEZzL..',
      '...LsWEZZEWsL...',
      '...LZWeSSeWZL...',
      '....LZsZZsZL....',
      '...LsLLzzLLsL...',
      '..LsZZzzzzZZzL..',
      '..LzzZZZZZZZsL..',
      '..LZZLzZZzZZzL..',
      '..LzZLZzzZZLZL..',
      '...LLZZZZZZLzL..',
      '....LZZzzZZLL...',
      '....vbBBBBbv....',
      '....LvvBBvvL....',
      '....LzZvvZZL....',
      '.....LL.LZZL....',
      '........LZzL....',
      '.........LL.....',
    ]),
  ],
  right: [
    art('body.right.0', 3, [
      '......LLLL......',
      '....LLSSSSL.....',
      '...LZZssssSL....',
      '..LZZZsssssSL...',
      '..LZZZZsssssSL..',
      '.LZZZZZZssssSL..',
      '.LZZZZZZZsssSL..',
      '.LZZZZLZZZssSL..',
      '.LZZZLzZZZZsSL..',
      '..LZZLzzZZZZL...',
      '...LZZLzZZEEL...',
      '....LZZZZsWEsL..',
      '....LZZZZZWvZL..',
      '.....LZZZZZZL...',
      '......LZZZLL....',
      '.....LzZLL......',
      '....LLzZZLLL....',
      '...LLzZZszZZL...',
      '...LLZZZLzZzL...',
      '....LzZZzLLL....',
      '....LZZZZL......',
      '....vbBBbvLL....',
      '....LvBBvZZZL...',
      '...LZZvv.LZzL...',
      '...LzZL...LL....',
      '....LL..........',
    ]),
    art('body.right.1', 4, [
      '......LLLL......',
      '....LLSSSSL.....',
      '...LZZssssSL....',
      '..LZZZsssssSL...',
      '..LZZZZsssssSL..',
      '.LZZZZZZssssSL..',
      '.LZZZZZZZsssSL..',
      '.LZZZZLZZZssSL..',
      '.LZZZLzZZZZsSL..',
      '..LZZLzzZZZZL...',
      '...LZZLzZZEEL...',
      '....LZZZZsWEsL..',
      '....LZZZZZWvZL..',
      '.....LZZZZZZL...',
      '......LZZZLL....',
      '.....LZZLL......',
      '.....LsZLL......',
      '....LLzzLZL.....',
      '....LLZZLzL.....',
      '....LLzZLZL.....',
      '....LZLLZZL.....',
      '.....vbBbv......',
      '.....vBBv.......',
      '.....LvvL.......',
      '.....LZZL.......',
      '.....LZzL.......',
      '......LL........',
    ]),
    art('body.right.2', 3, [
      '......LLLL......',
      '....LLSSSSL.....',
      '...LZZssssSL....',
      '..LZZZsssssSL...',
      '..LZZZZsssssSL..',
      '.LZZZZZZssssSL..',
      '.LZZZZZZZsssSL..',
      '.LZZZZLZZZssSL..',
      '.LZZZLzZZZZsSL..',
      '..LZZLzzZZZZL...',
      '...LZZLzZZEEL...',
      '....LZZZZsWEsL..',
      '....LZZZZZWvZL..',
      '.....LZZZZZZL...',
      '......LZZZLL....',
      '.....LzZZLLL....',
      '.....LsZZLZZL...',
      '....LzZZLZLzL...',
      '...LZZzLZzLL....',
      '...LzZLZZZL.....',
      '....LLZZZZL.....',
      '....vbBBbv......',
      '...LZZvBBvLL....',
      '..LZZZLvvZZZL...',
      '..LzZL...LZzL...',
      '...LL.....LL....',
    ]),
  ],
  up: [
    art('body.up.0', 2, [
      '.....LLLLLL.....',
      '...LLZssssZLL...',
      '..LssssssssssL..',
      '..LssssssssssL..',
      '.LssssssssssssL.',
      '.LssssssssssssL.',
      '.LZssssssssssZL.',
      '.LzZssssssssZzL.',
      '.LzzZZZZZZZZzzL.',
      '.LzzzZZZZZZzzzL.',
      '.LzzzzzZZzzzzzL.',
      '..LzzzzzzzzzzL..',
      '...LzzzzzzzzL...',
      '...LzzzzzzzzL...',
      '....LLzzzzLL....',
      '...LszLzzLzsL...',
      '..LzZZZZZZZZzL..',
      '..LsZZZZZZZZsL..',
      '..LzzzZZzzZzzL..',
      '..LZLZZZZZLZZL..',
      '...LLzZZZZLZzL..',
      '....LzZZZZzLL...',
      '....vbBBBBbv....',
      '....LvvBBvvL....',
      '....LZzvvZzL....',
      '....LZZL.LL.....',
      '....LzZL........',
      '.....LL.........',
    ]),
    art('body.up.1', 3, [
      '.....LLLLLL.....',
      '...LLZssssZLL...',
      '..LssssssssssL..',
      '..LssssssssssL..',
      '.LssssssssssssL.',
      '.LssssssssssssL.',
      '.LZssssssssssZL.',
      '.LzZssssssssZzL.',
      '.LzzZZZZZZZZzzL.',
      '.LzzzZZZZZZzzzL.',
      '.LzzzzzZZzzzzzL.',
      '..LzzzzzzzzzzL..',
      '...LzzzzzzzzL...',
      '...LzzzzzzzzL...',
      '....LLzzzzLL....',
      '...LszLzzLzsL...',
      '..LzZZZZZZZZzL..',
      '..LsZZZZZZZZsL..',
      '.LzzZzzZZzzZzzL.',
      '.LZZLZZZZZZLZZL.',
      '.LzZLzZZZZzLZzL.',
      '..LLLzZZZZzLLL..',
      '....vbBBBBbv....',
      '....LvvBBvvL....',
      '....LZzvvzZL....',
      '....LZZLLZZL....',
      '....LzZLLZzL....',
      '.....LL..LL.....',
    ]),
    art('body.up.2', 2, [
      '.....LLLLLL.....',
      '...LLZssssZLL...',
      '..LssssssssssL..',
      '..LssssssssssL..',
      '.LssssssssssssL.',
      '.LssssssssssssL.',
      '.LZssssssssssZL.',
      '.LzZssssssssZzL.',
      '.LzzZZZZZZZZzzL.',
      '.LzzzZZZZZZzzzL.',
      '.LzzzzzZZzzzzzL.',
      '..LzzzzzzzzzzL..',
      '...LzzzzzzzzL...',
      '...LzzzzzzzzL...',
      '....LLzzzzLL....',
      '...LszLzzLzsL...',
      '..LzZZZZZZZZzL..',
      '..LsZZZZZZZZsL..',
      '..LzzZzzZZzzZL..',
      '..LZZLZZZZZLzL..',
      '..LzZLZZZZzLL...',
      '...LLzZZZZzL....',
      '....vbBBBBbv....',
      '....LvvBBvvL....',
      '....LzZvvzZL....',
      '.....LL.LZZL....',
      '........LZzL....',
      '.........LL.....',
    ]),
  ],
}

// ── packages/characters/src/parts/poses.ts ──────────────────────────────────

/**
 * The seated poses — **the only drawing in this package that is ours.**
 *
 * Everything else in `parts/` is JIK-A-4's MetroCity pack, converted
 * (`scripts/import-metrocity.mjs`). The pack walks and stands in four directions
 * and never sits down, and the office engine indexes four frames past the walk
 * that it does not have: two of a manager typing and two of one reading.
 *
 * So a seated frame is the standing figure, moved down and cut off by
 * `render.ts`, plus one of these — drawn here in the pack's own idiom (four tones,
 * an outline in the material's own dark, nothing wider than the body it belongs
 * to) so that the seam does not show.
 *
 * ── Why they are this small, and this high up ──────────────────────────────
 *
 * Measured against upstream's `char_0.png`, which solved the same problem from
 * the same pack: their seated frames move the figure down three rows and *raise
 * one arm at a time*, alternating. They do not draw a desk, a keyboard or a lap,
 * because the engine draws these frames **six pixels lower again** — the bottom
 * six rows of the cell are behind the desk, and anything drawn there is a change
 * nobody sees. Rows 21–26 are the whole of the visible difference between sitting
 * and standing, and that is where these are.
 *
 * ⛔ **Nothing here is drawn for `up`.** A manager seen from behind has their
 * hands in front of them, and the office's own back-facing seated frames draw
 * exactly the back — `render.ts` still moves and cuts the figure, so a manager
 * facing away is seated; there is simply nothing on this side of them to show.
 *
 * ⚠️ The rows are **absolute frame rows**, not offsets from the body: the seated
 * body has already been moved when these are painted, so a drop that changed
 * would have to move these with it.
 */

const pose = (name: string, top: number, rows: readonly string[]): Art =>
  checkArt(`pose.${name}`, { top, rows })

/**
 * Typing: both forearms come in off the shoulders towards the middle, and the
 * second frame is the first one a row lower. Two frames of one pixel is what an
 * animation is at this size — the same amplitude upstream's alternating arm has.
 */
const TYPING_DOWN_A = pose('typing.down.a', 23, ['..LssL....LssL..', '...LssL..LssL...'])
const TYPING_DOWN_B = pose('typing.down.b', 24, ['..LssL....LssL..', '...LssL..LssL...'])

/**
 * Reading: a book, held up where it can be seen. `P`/`p` is a prop and not skin,
 * so no garment touches it — and its two colours are fixed (`palette.ts`), because
 * it is the same object in everyone's hands.
 */
const READING_DOWN_A = pose('reading.down.a', 22, [
  '...pppppppppp...',
  '...pPPPppPPPp...',
  '.LsPPPPppPPPPsL.',
  '...pPPPppPPPp...',
  '...pppppppppp...',
])
const READING_DOWN_B = pose('reading.down.b', 22, [
  '...pppppppppp...',
  '...pPPPppPPPp...',
  '.LsPPPppPPPPPsL.',
  '...pPPPppPPPp...',
  '...pppppppppp...',
])

/** In profile only the near arm shows, and it reaches forward rather than down. */
const TYPING_RIGHT_A = pose('typing.right.a', 22, ['.......LssL.....'])
const TYPING_RIGHT_B = pose('typing.right.b', 23, ['.......LssL.....'])

const READING_RIGHT_A = pose('reading.right.a', 21, [
  '........pppp....',
  '.......pPPPp....',
  '....LssPPPPp....',
  '.......pppp.....',
])
const READING_RIGHT_B = pose('reading.right.b', 22, [
  '........pppp....',
  '.......pPPPp....',
  '....LssPPPPp....',
  '.......pppp.....',
])

/**
 * The four frames past the walk, in the order the engine indexes them: typing,
 * typing, reading, reading. `undefined` is *nothing to draw*, not a missing frame.
 */
export const POSES: Readonly<Record<Direction, readonly (Art | undefined)[]>> = {
  down: [TYPING_DOWN_A, TYPING_DOWN_B, READING_DOWN_A, READING_DOWN_B],
  up: [undefined, undefined, undefined, undefined],
  right: [TYPING_RIGHT_A, TYPING_RIGHT_B, READING_RIGHT_A, READING_RIGHT_B],
}

// ── packages/characters/src/appearance.ts ───────────────────────────────────

/**
 * Seed → ten choices. The only place a string becomes a face.
 *
 * ── Why the lists are written out ──────────────────────────────────────────
 *
 * Each list below is a literal array rather than `Object.keys` of the part table
 * it indexes. Key order in a generated object literal is stable, but it is not a
 * thing anyone reviews: re-running the converter against a pack row that had
 * changed would silently re-cut every published face, and nothing in a diff would
 * say so. Written out here, that reordering is a line in a file whose whole
 * subject is that it must not move — and `appearance.test.ts` pins each list
 * against the table's keys, so a part that appears in `parts/` and not here fails
 * instead of never being drawn.
 *
 * ⚠️ **Appending to a list moves every seed whose index crosses the new length.**
 * That is what `generator` is for. A new part is `aumos-pixel-v2`, not an edit.
 */

/** The generator this package implements. Part of every hashed string. */
export const GENERATOR_ID = 'aumos-pixel-v1'

/**
 * What a package, a registry entry or a view carries instead of an image.
 *
 * `generator` is a plain `string` and not a literal union on purpose: a
 * descriptor produced by a newer Aumos has to be *readable* by this build so it
 * can fall back, and a parse that refused unknown generators would turn a
 * decoration into an install failure.
 */
export interface CharacterDescriptor {
  readonly generator: string
  readonly seed: string
}

export interface Appearance {
  readonly skin: SkinId
  readonly eyeColour: EyeColourId
  readonly hair: HairId
  readonly hairColour: HairColourId
  readonly accessory: AccessoryId
  readonly top: TopId
  readonly topColour: TopColourId
  readonly bottom: BottomId
  readonly bottomColour: BottomColourId
  readonly shoes: ShoesId
}

export const SKINS: readonly SkinId[] = ['porcelain', 'blush', 'sand', 'honey', 'umber', 'ebony']
export const EYE_COLOURS: readonly EyeColourId[] = [
  'ink',
  'cocoa',
  'hazel',
  'moss',
  'sea',
  'violet',
]
export const HAIR_IDS: readonly HairId[] = [
  'bald',
  'cap',
  'crop',
  'bob',
  'braids',
  'bowl',
  'parted',
  'waves',
  'cornrows',
  'sleek',
  'mane',
  'straight',
  'tousled',
  'headband',
]
export const HAIR_COLOURS: readonly HairColourId[] = [
  'ink',
  'espresso',
  'chestnut',
  'amber',
  'wheat',
  'flax',
  'slate',
  'plum',
]
export const ACCESSORY_IDS: readonly AccessoryId[] = ['none', 'earpieces']
export const TOP_IDS: readonly TopId[] = [
  'pinafore',
  'blouse',
  'polo',
  'tee',
  'raglan',
  'uniform',
  'livery',
  'waistcoat',
  'coverall',
  'crew',
  'cardigan',
  'jersey',
  'henley',
  'tunic',
]
export const TOP_COLOURS: readonly TopColourId[] = [
  'navy',
  'wine',
  'pine',
  'ochre',
  'chalk',
  'graphite',
  'iris',
  'lagoon',
]
export const BOTTOM_IDS: readonly BottomId[] = [
  'pinafore',
  'shorts',
  'tee',
  'uniform',
  'livery',
  'waistcoat',
  'crew',
  'cardigan',
  'jersey',
  'henley',
  'tunic',
]
export const BOTTOM_COLOURS: readonly BottomColourId[] = [
  'charcoal',
  'denim',
  'khaki',
  'mulberry',
  'stone',
  'midnight',
]
export const SHOE_IDS: readonly ShoesId[] = ['ink', 'leather', 'canvas', 'brick']

/** The part table each list indexes — `appearance.test.ts` compares the keys. */
export const PART_TABLES = {
  skin: SKIN_RAMPS,
  eyeColour: EYE_RAMPS,
  hair: HAIR,
  hairColour: HAIR_RAMPS,
  accessory: ACCESSORIES,
  top: TOPS,
  topColour: TOP_RAMPS,
  bottom: BOTTOMS,
  bottomColour: BOTTOM_RAMPS,
  shoes: SHOE_RAMPS,
} as const

/**
 * The ten attribute names, in the order a signature writes them.
 *
 * Each name is also the string hashed for that attribute's stream, so this list
 * is part of the generator: renaming `hairColour` re-cuts every face.
 */
export const ATTRIBUTES = [
  'skin',
  'eyeColour',
  'hair',
  'hairColour',
  'accessory',
  'top',
  'topColour',
  'bottom',
  'bottomColour',
  'shoes',
] as const satisfies readonly (keyof Appearance)[]

/** Longest seed we hash. Long enough for `publisher/package#2`, short enough to bound work. */
export const MAX_SEED_LENGTH = 128

/**
 * Seeds are printable ASCII, 1–`MAX_SEED_LENGTH` characters.
 *
 * The restriction is what removes the "one string, several spellings" problem
 * without a normalisation step: there is no NFC/NFD pair inside this range, so
 * two seeds that look the same hash the same, in every runtime, without anyone
 * having to agree on a Unicode version. A seed outside it is not coerced — it is
 * refused, and the caller falls back to the derived one.
 */
export const isSeed = (seed: string): boolean => {
  if (seed.length < 1 || seed.length > MAX_SEED_LENGTH) return false
  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index)
    if (code < 0x20 || code > 0x7e) return false
  }
  return true
}

const resolved = new Map<string, Appearance | null>()

/**
 * The appearance a descriptor names, or `null` if this build cannot draw it.
 *
 * `null` means *fall back*, never *fail*: an unknown generator and a malformed
 * seed reach the same answer as no descriptor at all, because a face is
 * decoration and decoration must not stop an install or a run (#938).
 */
export const resolveAppearance = (descriptor: CharacterDescriptor): Appearance | null => {
  const key = `${descriptor.generator}\0${descriptor.seed}`
  const cached = resolved.get(key)
  if (cached !== undefined) return cached
  const answer = compose(descriptor)
  resolved.set(key, answer)
  return answer
}

const compose = (descriptor: CharacterDescriptor): Appearance | null => {
  if (descriptor.generator !== GENERATOR_ID) return null
  const seed = descriptor.seed
  if (!isSeed(seed)) return null
  const of = <T>(list: readonly T[], attribute: string): T =>
    pick(list, GENERATOR_ID, seed, attribute)
  return {
    skin: of(SKINS, 'skin'),
    eyeColour: of(EYE_COLOURS, 'eyeColour'),
    hair: of(HAIR_IDS, 'hair'),
    hairColour: of(HAIR_COLOURS, 'hairColour'),
    accessory: of(ACCESSORY_IDS, 'accessory'),
    top: of(TOP_IDS, 'top'),
    topColour: of(TOP_COLOURS, 'topColour'),
    bottom: of(BOTTOM_IDS, 'bottom'),
    bottomColour: of(BOTTOM_COLOURS, 'bottomColour'),
    shoes: of(SHOE_IDS, 'shoes'),
  }
}

/**
 * A stable string for one appearance — the key both caches and the duplicate
 * check use. Two seeds with the same signature draw the same character.
 */
export const appearanceSignature = (appearance: Appearance): string =>
  ATTRIBUTES.map((attribute) => `${attribute}:${appearance[attribute]}`).join('|')

/**
 * The seed a package gets when it does not name one: its package id, and nothing
 * else.
 *
 * ⚠️ **Publisher is deliberately not in here**, against the issue's first
 * suggestion, because of what was measured: `manager_instances` has no publisher
 * column and `ManagerTreeInstanceView` carries none, so a publisher-bearing seed
 * is available in the catalogue and gone by the time the manager is installed —
 * and the face in the sidebar would differ from the face on the card the
 * investor clicked. The cost is that the same package id in two marketplaces
 * draws the same face; the answer to that is an explicit `character.seed`, which
 * #938 asks for anyway. Adding publisher later needs a column first, and then it
 * is a new generator id.
 */
export const defaultSeedFor = ({ packageId }: { packageId: string }): string => packageId

/** The descriptor a package id resolves to when the package names none. */
export const defaultDescriptorFor = (input: { packageId: string }): CharacterDescriptor => ({
  generator: GENERATOR_ID,
  seed: defaultSeedFor(input),
})

/** Exposed so `hash.test.ts` can watch one attribute's stream while others grow. */
export const attributeStream = (seed: string, attribute: string): number =>
  stream(GENERATOR_ID, seed, attribute)

// ── packages/characters/src/render.ts ───────────────────────────────────────

/**
 * Composition: six layers, back to front, into a 16×32 grid of colours.
 *
 * ```
 * 1 body        skin, the eyes the pack draws, and the underwear under everything
 * 2 bottom      trousers or a skirt, and the shoes they arrive with
 * 3 top         over the waistband
 * 4 hair        over the shoulders a long style falls on
 * 5 accessory   over the hair
 * 6 pose        the seated frames only — our own, and the only drawing in here
 *               that is not the pack's
 * ```
 *
 * ⛔ **There is no derived outline layer, and its absence is the point.** The
 * previous, hand-drawn parts were authored as filled shapes and ringed afterwards
 * by a rule, because an authored ring would have had to be re-spelled by every
 * hairstyle and every walk frame. The pack's art already carries its outline, in a
 * dark tone of its own material, on every frame — so the rule would now have to
 * *remove* one before adding its own. Dropping it is the cheaper half of taking
 * somebody else's finished art.
 *
 * ⛔ There is no alpha blending. A layer either writes a cell or leaves it, which
 * is the same rule the office engine's sprites already obey.
 *
 * ── The seated frames, measured off `char_0.png` ───────────────────────────
 *
 * The pack has no seated pose. Upstream made theirs by **moving the standing
 * figure down and cutting it off**, and the numbers below are read out of their
 * sprite rather than guessed: facing down the whole figure drops three rows and
 * the last row is 31; facing up it does not move and stops at row 25; in profile
 * it drops one and stops at 29. What the engine then does with them — drawing
 * them six pixels lower again, so the bottom of the cell is behind the desk — is
 * why the arms in `parts/poses.ts` are drawn high and not on the desktop.
 */

/** The row the portrait crop starts on, and how tall it is. */
export const PORTRAIT_TOP = 2
export const PORTRAIT_SIZE = 16

/** The standing frame: the one the office draws when idle, and the portrait's. */
const STANDING = 1
/** Frames 0–2 are the walk; everything after it is seated. */
const WALK_FRAMES = 3

/**
 * How a seated frame is made out of the standing one. Read off upstream's
 * `char_0.png`, whose sprites came from this same pack.
 */
const SEATED: Readonly<Record<Direction, { readonly drop: number; readonly last: number }>> = {
  down: { drop: 3, last: 31 },
  up: { drop: 0, last: 25 },
  right: { drop: 1, last: 29 },
}

/**
 * The walk lifts the whole head a pixel, and the hair does not know that.
 *
 * The pack draws a hairstyle once per direction; its stride cells are that
 * drawing moved up one row — measured, by comparing every hair cell against the
 * standing one. So the head-worn layers ride an offset instead of carrying two
 * more drawings each, and a hairstyle is three arts rather than nine.
 */
const HEAD_LIFT = -1

type RoleGrid = Role[][]

const blankRoles = (): RoleGrid =>
  Array.from({ length: FRAME_HEIGHT }, () => Array.from({ length: FRAME_WIDTH }, (): Role => '.'))

/**
 * Write every non-transparent cell of `art`, moved down by `dy` and cut at `last`.
 *
 * The loop walks the art rather than the frame: most parts are a few rows, and
 * `uniqueness.test.ts` renders a thousand of these. Cells outside the frame are
 * dropped, which is what lets a seated figure be pushed past the bottom edge and
 * a walk frame lift a hat past the top one without a bounds check at the caller.
 */
const paint = (grid: RoleGrid, art: Art, dy: number, last: number): void => {
  for (const [index, source] of art.rows.entries()) {
    const row = art.top + index + dy
    if (row < 0 || row > last) continue
    const line = grid[row]
    if (line === undefined) continue
    for (let index_ = 0; index_ < source.length; index_ += 1) {
      const role = source[index_] as Role
      if (role === '.') continue
      line[index_] = role
    }
  }
}

interface LayerStep {
  readonly label: string
  readonly draw: (grid: RoleGrid) => void
}

/**
 * The layers of one frame, in the order this module's docblock lists.
 *
 * Split out of `frameRoles` so the order exists **once**. A playground that drew
 * the stack from its own list of parts would be a second composition, free to
 * drift from the one that ships — and the drift would look like art rather than
 * like a bug.
 */
const layerSteps = (
  appearance: Appearance,
  direction: Direction,
  frame: number,
): readonly LayerStep[] => {
  if (frame < 0 || frame >= FRAMES_PER_DIRECTION) throw new Error(`no frame ${frame}`)
  const seated = frame >= WALK_FRAMES
  const source = seated ? STANDING : frame
  const { drop, last } = SEATED[direction]
  const body = seated ? drop : 0
  const head = seated ? drop : frame === STANDING ? 0 : HEAD_LIFT
  const limit = seated ? last : FRAME_HEIGHT - 1
  const at = (frames: { readonly [K in Direction]: readonly Art[] }): Art => {
    const art = frames[direction][source]
    if (art === undefined) throw new Error(`no frame ${source} for ${direction}`)
    return art
  }
  const steps: LayerStep[] = [
    {
      label: `body · ${appearance.skin} skin, ${appearance.eyeColour} eyes`,
      draw: (g) => paint(g, at(BODY), body, limit),
    },
    {
      label: `bottom · ${appearance.bottom} in ${appearance.bottomColour}`,
      draw: (g) => paint(g, at(BOTTOMS[appearance.bottom]), body, limit),
    },
    {
      label: `top · ${appearance.top} in ${appearance.topColour}`,
      draw: (g) => paint(g, at(TOPS[appearance.top]), body, limit),
    },
    {
      label: `hair · ${appearance.hair} in ${appearance.hairColour}`,
      draw: (g) => paint(g, HAIR[appearance.hair][direction], head, limit),
    },
    {
      label: `accessory · ${appearance.accessory}`,
      draw: (g) => paint(g, ACCESSORIES[appearance.accessory].art[direction], head, limit),
    },
  ]
  if (seated) {
    const pose = POSES[direction][frame - WALK_FRAMES]
    steps.push({
      label: frame < WALK_FRAMES + 2 ? 'pose · typing' : 'pose · reading',
      draw: (g) => {
        if (pose !== undefined) paint(g, pose, 0, last)
      },
    })
  }
  return steps
}

const frameRoles = (appearance: Appearance, direction: Direction, frame: number): RoleGrid => {
  const grid = blankRoles()
  for (const step of layerSteps(appearance, direction, frame)) step.draw(grid)
  return grid
}

/**
 * The same frame, snapshotted after each layer — what a reader needs to see
 * *why* a character looks like this, rather than only that it does.
 *
 * Each entry is cumulative: `[0]` is the first layer alone and the last entry is
 * the finished frame, which `render.test.ts` asserts against `renderSheet`. It
 * is exported for tooling (`scripts/playground.mjs`) and costs nothing at
 * runtime — no consumer of a face calls it.
 */
export const renderLayers = (
  appearance: Appearance,
  direction: Direction,
  frame: number,
): readonly { readonly label: string; readonly rows: PixelRows }[] => {
  const colours = roleColours(appearance, ACCESSORIES[appearance.accessory].colours)
  const grid = blankRoles()
  return layerSteps(appearance, direction, frame).map((step) => {
    step.draw(grid)
    return { label: step.label, rows: grid.map((line) => line.map((role) => colours[role])) }
  })
}

const renderFrame = (
  appearance: Appearance,
  direction: Direction,
  frame: number,
  colours: Readonly<Record<Role, string>>,
): PixelRows =>
  frameRoles(appearance, direction, frame).map((line) => line.map((role) => colours[role]))

const sheets = new Map<string, CharacterSheet>()

/** The full sheet: three directions of seven frames, memoised per appearance. */
export const renderSheet = (appearance: Appearance): CharacterSheet => {
  const key = appearanceSignature(appearance)
  const cached = sheets.get(key)
  if (cached !== undefined) return cached
  const colours = roleColours(appearance, ACCESSORIES[appearance.accessory].colours)
  const built = Object.fromEntries(
    DIRECTIONS.map((direction) => [
      direction,
      Array.from({ length: FRAMES_PER_DIRECTION }, (_unused, frame) =>
        renderFrame(appearance, direction, frame, colours),
      ),
    ]),
  ) as unknown as CharacterSheet
  sheets.set(key, built)
  return built
}

const portraits = new Map<string, PixelRows>()

/**
 * The 16×16 face: rows 2–17 of `down[1]`, columns 0–15. That is the whole rule.
 *
 * ⛔ **There is no icon-specific generation.** The frame cropped here is the one
 * the office engine draws when a manager is standing still, so the sidebar and
 * the room cannot disagree about what someone looks like. `render.test.ts`
 * compares this against the crop directly, which is what stops a future "just
 * for the icon" branch being added quietly.
 *
 * The head lands there because the pack drew it there: the figure's crown is row
 * 3 and its chin row 17, which is also where upstream's six wear theirs.
 *
 * ⚠️ It composes the one frame rather than calling `renderSheet`, because a
 * catalogue card wants a face and not twenty other poses. That is a cost
 * decision and not a second rule: the test compares the two, so the shortcut
 * cannot drift into a different drawing.
 */
export const renderPortrait = (appearance: Appearance): PixelRows => {
  const key = appearanceSignature(appearance)
  const cached = portraits.get(key)
  if (cached !== undefined) return cached
  const colours = roleColours(appearance, ACCESSORIES[appearance.accessory].colours)
  const standing = renderFrame(appearance, 'down', STANDING, colours)
  const cropped = standing.slice(PORTRAIT_TOP, PORTRAIT_TOP + PORTRAIT_SIZE)
  portraits.set(key, cropped)
  return cropped
}

/** The sheet for a descriptor, or `null` when this build cannot draw it. */
export const sheetFor = (descriptor: CharacterDescriptor): CharacterSheet | null => {
  const appearance = resolveAppearance(descriptor)
  return appearance === null ? null : renderSheet(appearance)
}

/** The portrait for a descriptor, or `null` when this build cannot draw it. */
export const portraitFor = (descriptor: CharacterDescriptor): PixelRows | null => {
  const appearance = resolveAppearance(descriptor)
  return appearance === null ? null : renderPortrait(appearance)
}

/**
 * A digest of the drawn pixels, not of the choices that produced them.
 *
 * Two managers can pick different shirts and still be the same face at 16px;
 * `appearanceSignature` would call them distinct and this will not. It is the
 * number #938 asks the catalogue to keep unique, which is why it is 64 bits of
 * FNV rather than 32: at a thousand seeds a 32-bit digest collides by birthday
 * often enough to be mistaken for a drawing that repeats.
 */
export const portraitFingerprint = (rows: PixelRows): string => {
  const flat = rows.map((row) => row.join(',')).join(';')
  return `${digest(`aumos-pixel-v1:a:${flat}`)}${digest(`aumos-pixel-v1:b:${flat}`)}`
}

// ── packages/characters/src/svg.ts ──────────────────────────────────────────

/**
 * Pixels → one `<img src>`-safe string.
 *
 * ── Why SVG and not PNG ────────────────────────────────────────────────────
 *
 * A PNG encoder is writable with `node:zlib` alone — `apps/desktop/scripts/`
 * already contains one — but `zlib` is not in a browser, and this string has to
 * come out **byte-identical** in a Tauri webview, in Next's server render and in
 * Node, or the cross-check that says the desktop and the landing page draw the
 * same manager has nothing to compare. SVG needs no encoder at all: it is a list
 * of rectangles and a base64 of ASCII.
 *
 * ⛔ `image-rendering: pixelated` is not needed and not emitted. A rectangle is
 * sharp at any zoom; the hint exists for raster sprites, which this is not.
 *
 * ── Why run-length rows ────────────────────────────────────────────────────
 *
 * One `<rect>` per pixel is 256 of them for a portrait. Merging equal colours
 * along a row cuts a typical face to a few dozen — measured in `svg.test.ts`,
 * which also holds the ceiling this claim would have to survive.
 *
 * `data:` is already allowed by `img-src` in both consumers
 * (`tauri.conf.json`, `apps/web/landing/lib/csp.ts`), so nothing about shipping
 * this needs a policy change — and because it is an `<img src>` rather than
 * inline markup, the containment argument `manager-mark.tsx` already makes about
 * package-supplied logos stands unchanged.
 */

/** `data:image/svg+xml;base64,` — the prefix the registry's icon field also uses. */
export const SVG_DATA_PREFIX = 'data:image/svg+xml;base64,'

/**
 * The portrait as an SVG document.
 *
 * The view box is the pixel grid itself, so a consumer sizes the image with CSS
 * and never has to know how many pixels are in it.
 */
export const portraitSvg = (rows: PixelRows): string => {
  const height = rows.length
  const width = rows[0]?.length ?? 0
  const rects: string[] = []
  for (const [y, row] of rows.entries()) {
    let x = 0
    while (x < row.length) {
      const colour = row[x]
      let run = 1
      while (row[x + run] === colour) run += 1
      if (colour !== undefined && colour !== '') {
        rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${colour}"/>`)
      }
      x += run
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}" shape-rendering="crispEdges">` +
    `${rects.join('')}</svg>`
  )
}

/**
 * The same document as a data URI.
 *
 * Every byte of `portraitSvg` is ASCII — hex colours, digits, and a fixed
 * skeleton — so `btoa`, which is a Latin-1 encoder, is exact here rather than
 * approximately right. `svg.test.ts` pins that with the full character set.
 */
export const portraitDataUri = (rows: PixelRows): string =>
  `${SVG_DATA_PREFIX}${btoa(portraitSvg(rows))}`
