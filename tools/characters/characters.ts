// ── Vendored into aumos-catalogue ───────────────────────────────────────────
//
// Copied byte-for-byte from `untilled/aumos`,
// `apps/web/landing/lib/characters.ts` @ 9a16a6f8cae2b45b4a0736a1e2fa19221b1c85c9
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
 * The grid every part is authored on, and the role alphabet that stands in for colour.
 *
 * ── Why art is text ────────────────────────────────────────────────────────
 *
 * A manager's face has to be produced identically in three places that share no
 * runtime: the desktop shell (a Tauri webview), the office frame (a *different*
 * origin, reached only by `postMessage`), and Node — where the golden vectors in
 * this package's tests are the only mechanical evidence that the three agree.
 * A binary asset would need a decoder in each of them; a string does not.
 *
 * So every part in `parts/` is rows of characters, one character per pixel, and
 * the character names a **role** rather than a colour. The colour arrives later,
 * from the ramps in `palette.ts`, chosen by the seed. That is what lets six skin
 * tones and eight hair colours multiply against one drawing of a fringe.
 */

/** Columns in one frame. The office engine's sprite is 16 wide (`assets.ts`). */
export const FRAME_WIDTH = 16
/** Rows in one frame. The office engine's sprite is 32 tall (`assets.ts`). */
export const FRAME_HEIGHT = 32
/** Frames per direction: 0,1,2 walk · 3,4 typing · 5,6 reading. See `parts/body.ts`. */
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
 * generator version, because every part already drawn is read through this table.
 *
 * ⛔ There is no text role, and that is not an oversight: the engine draws a
 * left-facing character by reversing each row of the right-facing art, so any
 * glyph would come out mirrored. Nothing here can carry one.
 */
export type Role =
  | '.' // transparent
  | 'S' // skin, lit
  | 's' // skin, shaded
  | 'L' // skin outline
  | 'H' // hair, lit
  | 'h' // hair, shaded
  | 'T' // top, lit
  | 't' // top, shaded
  | 'B' // bottom, lit
  | 'b' // bottom, shaded
  | 'K' // shoes, lit
  | 'k' // shoes, shaded
  | 'E' // eye ink
  | 'W' // eye highlight
  | 'M' // mouth
  | 'A' // accessory, lit
  | 'a' // accessory, shaded

const ROLES = new Set<string>([
  '.',
  'S',
  's',
  'L',
  'H',
  'h',
  'T',
  't',
  'B',
  'b',
  'K',
  'k',
  'E',
  'W',
  'M',
  'A',
  'a',
])

/** Art as authored: one string per row, every row `FRAME_WIDTH` characters wide. */
export type ArtRows = readonly string[]

/** Art placed on the frame: the rows above, plus the row they start at. */
export interface Art {
  /** Row of the frame the first authored row lands on, before anchoring. */
  readonly top: number
  readonly rows: ArtRows
}

/** One drawing per direction. Most parts differ between front, back and profile. */
export interface DirectionalArt {
  readonly down: Art
  readonly up: Art
  readonly right: Art
}

/** The same drawing in all three directions — clothing masks, mostly. */
export const everyDirection = (art: Art): DirectionalArt => ({ down: art, up: art, right: art })

/** Nothing drawn. `bald` hair and `none` accessory are this, not a special case. */
export const NO_ART: Art = { top: 0, rows: [] }

/**
 * Every authored row is exactly `FRAME_WIDTH` wide and uses only known roles.
 *
 * This runs at module load rather than in a test because a mis-typed row is a
 * silent one-pixel shift of everything to its right, and the golden vectors
 * would then pin the mistake instead of catching it.
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

// ── packages/characters/src/palette.ts ──────────────────────────────────────

/**
 * The colour ramps, and the table that turns a role character into `#RRGGBB`.
 *
 * Every ramp is at least two steps — lit and shaded — because a 16×32 figure with
 * one flat colour per material reads as a silhouette rather than a body. Skin
 * carries a third, the outline, for parts that need to close a shape.
 *
 * ⚠️ **These values are part of `aumos-pixel-v1`.** Nudging one changes every
 * published face, so a new palette is a new generator id, not an edit here.
 * Uppercase hex is the contract the office engine's `SpriteData` already carries
 * and what `render.test.ts` pins.
 */

export interface SkinRamp {
  readonly base: string
  readonly shade: string
  readonly line: string
}
export interface Ramp {
  readonly base: string
  readonly shade: string
}

/** Six skin tones, light to dark. Ordering is authored, not derived. */
export const SKIN_RAMPS = {
  porcelain: { base: '#F4D6C1', shade: '#DCB49C', line: '#8C5E49' },
  sand: { base: '#EBC49A', shade: '#D2A478', line: '#7E5233' },
  honey: { base: '#D9A272', shade: '#BC8253', line: '#6E4425' },
  clay: { base: '#B87A50', shade: '#96603B', line: '#5A3620' },
  umber: { base: '#8C5A3C', shade: '#6E442C', line: '#43281A' },
  ebony: { base: '#5E3B28', shade: '#47291A', line: '#2A170E' },
} as const satisfies Record<string, SkinRamp>

/** Eight hair colours. `slate` and `plum` are here so the row is not six browns. */
export const HAIR_RAMPS = {
  ink: { base: '#1E1B1A', shade: '#0E0D0C' },
  espresso: { base: '#3E2A20', shade: '#261811' },
  chestnut: { base: '#6B4226', shade: '#482A17' },
  amber: { base: '#A9662E', shade: '#7A451D' },
  wheat: { base: '#D8A85B', shade: '#A87C3A' },
  flax: { base: '#E8D9A8', shade: '#B8A878' },
  slate: { base: '#6B6F76', shade: '#474B51' },
  plum: { base: '#6E3A5E', shade: '#4A2440' },
} as const satisfies Record<string, Ramp>

/** Eight garment colours for the top. */
export const TOP_RAMPS = {
  navy: { base: '#2E4A6E', shade: '#1F3450' },
  wine: { base: '#7E2B36', shade: '#5A1C25' },
  pine: { base: '#2F6B52', shade: '#1F4A38' },
  ochre: { base: '#C8802F', shade: '#97601F' },
  chalk: { base: '#E4E1DA', shade: '#BAB6AE' },
  graphite: { base: '#3A3D44', shade: '#26282D' },
  iris: { base: '#8A6FB0', shade: '#63508A' },
  lagoon: { base: '#4C8FA8', shade: '#35687C' },
} as const satisfies Record<string, Ramp>

/** Six garment colours for the bottom. Deliberately duller than the tops. */
export const BOTTOM_RAMPS = {
  charcoal: { base: '#33383F', shade: '#22262B' },
  denim: { base: '#3C5A85', shade: '#2A3F60' },
  khaki: { base: '#6B5C48', shade: '#4C4133' },
  mulberry: { base: '#5A4250', shade: '#3E2D38' },
  stone: { base: '#8C8F96', shade: '#666A70' },
  midnight: { base: '#24303C', shade: '#16202A' },
} as const satisfies Record<string, Ramp>

/** Four shoe colours. Shoes carry no shape attribute — the body draws the foot. */
export const SHOE_RAMPS = {
  ink: { base: '#2A2A2E', shade: '#17171A' },
  leather: { base: '#6A4630', shade: '#49301F' },
  canvas: { base: '#DAD7D0', shade: '#A9A69F' },
  brick: { base: '#8C2F3A', shade: '#63202A' },
} as const satisfies Record<string, Ramp>

/** Eye ink is one colour for every face: a near-black that is not the hair's. */
export const EYE_INK = '#1E2228'
/** The highlight inside an eye, and the white of a wide one. */
export const EYE_LIGHT = '#F6F7F8'

export type SkinId = keyof typeof SKIN_RAMPS
export type HairColourId = keyof typeof HAIR_RAMPS
export type TopColourId = keyof typeof TOP_RAMPS
export type BottomColourId = keyof typeof BOTTOM_RAMPS
export type ShoesId = keyof typeof SHOE_RAMPS

/**
 * The role → colour table for one appearance.
 *
 * `A`/`a` are filled by the accessory itself rather than by a seeded attribute:
 * spectacle frames and headphone cups are not a colour anyone chooses, and a
 * thirteenth attribute for them would spend a stream on two pixels.
 */
export const roleColours = (
  appearance: Appearance,
  accessory: Ramp,
): Readonly<Record<Role, string>> => {
  const skin = SKIN_RAMPS[appearance.skin]
  const hair = HAIR_RAMPS[appearance.hairColour]
  const top = TOP_RAMPS[appearance.topColour]
  const bottom = BOTTOM_RAMPS[appearance.bottomColour]
  const shoes = SHOE_RAMPS[appearance.shoes]
  return {
    '.': '',
    S: skin.base,
    s: skin.shade,
    L: skin.line,
    H: hair.base,
    h: hair.shade,
    T: top.base,
    t: top.shade,
    B: bottom.base,
    b: bottom.shade,
    K: shoes.base,
    k: shoes.shade,
    E: EYE_INK,
    W: EYE_LIGHT,
    M: skin.line,
    A: accessory.base,
    a: accessory.shade,
  }
}

// ── packages/characters/src/parts/head.ts ───────────────────────────────────

/**
 * Heads, eyes and mouths — the three parts the 16px portrait lives or dies on.
 *
 * The head occupies rows 3–14 of a 32-row frame. The portrait crop is rows 2–17
 * (`render.ts`), so a whole head plus two rows of shoulder is exactly what an
 * investor sees in a sidebar row, and nothing here may drift outside that band:
 * a hat that starts at row 0 is a hat nobody sees.
 *
 * `up` draws the back of the skull — the same silhouette, no features. The eyes
 * and mouth tables answer `NO_ART` there rather than being skipped by a branch,
 * because "there is nothing to draw" is a drawing and not a special case.
 */

const face = (name: string, down: readonly string[], right: readonly string[]): DirectionalArt =>
  checkDirectional(`face.${name}`, {
    down: { top: 3, rows: down },
    // The back of a head is the same shape as the front of one.
    up: { top: 3, rows: down },
    right: { top: 3, rows: right },
  })

/** Four jaw silhouettes. These are the only shapes that survive being 10px wide. */
export const FACES = {
  round: face(
    'round',
    [
      '.....SSSSSS.....',
      '....SSSSSSSS....',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '.....SSSSSs.....',
    ],
    [
      '.....SSSSS......',
      '....SSSSSSS.....',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSSSs...',
      '....SSSSSSSSs...',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSs.....',
      '.....SSSSSs.....',
      '.....SSSSs......',
      '......SSs.......',
    ],
  ),
  square: face(
    'square',
    [
      '....SSSSSSSS....',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '....SSSSSSSs....',
    ],
    [
      '....SSSSSSS.....',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSSSs...',
      '....SSSSSSSSs...',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSs.....',
      '.....SSSs.......',
    ],
  ),
  narrow: face(
    'narrow',
    [
      '.....SSSSS......',
      '....SSSSSSS.....',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '....SSSSSSSs....',
      '.....SSSSSs.....',
      '.....SSSSSs.....',
      '......SSSs......',
    ],
    [
      '.....SSSS.......',
      '.....SSSSS......',
      '.....SSSSSs.....',
      '.....SSSSSs.....',
      '.....SSSSSSs....',
      '.....SSSSSSs....',
      '.....SSSSSs.....',
      '.....SSSSSs.....',
      '.....SSSSs......',
      '.....SSSSs......',
      '......SSSs......',
      '......SSs.......',
    ],
  ),
  wide: face(
    'wide',
    [
      '....SSSSSSSS....',
      '..SSSSSSSSSSSS..',
      '..SSSSSSSSSSSs..',
      '..SSSSSSSSSSSs..',
      '..SSSSSSSSSSSs..',
      '..SSSSSSSSSSSs..',
      '..SSSSSSSSSSSs..',
      '..SSSSSSSSSSSs..',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '....SSSSSSSs....',
      '.....SSSSSs.....',
    ],
    [
      '....SSSSSS......',
      '...SSSSSSSS.....',
      '...SSSSSSSSs....',
      '...SSSSSSSSs....',
      '...SSSSSSSSSs...',
      '...SSSSSSSSSs...',
      '...SSSSSSSSs....',
      '...SSSSSSSSs....',
      '...SSSSSSSs.....',
      '....SSSSSSs.....',
      '....SSSSSs......',
      '.....SSSs.......',
    ],
  ),
} as const satisfies Record<string, DirectionalArt>

const features = (
  name: string,
  top: number,
  down: readonly string[],
  right: readonly string[],
): DirectionalArt =>
  checkDirectional(name, {
    down: { top, rows: down },
    up: NO_ART,
    right: { top, rows: right },
  })

/** Six pairs of eyes, at rows 8–9. In profile only the near eye is drawn. */
export const EYES = {
  dot: features('eyes.dot', 9, ['.....EE..EE.....'], ['........EE......']),
  wide: features(
    'eyes.wide',
    8,
    ['.....EE..EE.....', '.....EE..EE.....'],
    ['........EE......', '........EE......'],
  ),
  slant: features(
    'eyes.slant',
    8,
    ['.....E....E.....', '.....EE..EE.....'],
    ['........E.......', '........EE......'],
  ),
  closed: features('eyes.closed', 9, ['....EEE..EEE....'], ['.......EEE......']),
  bright: features(
    'eyes.bright',
    8,
    ['.....EW..WE.....', '.....EE..EE.....'],
    ['........EW......', '........EE......'],
  ),
  small: features('eyes.small', 9, ['......E..E......'], ['........E.......']),
} as const satisfies Record<string, DirectionalArt>

/** Three mouths, at rows 11–12. */
export const MOUTHS = {
  neutral: features('mouth.neutral', 12, ['.......MM.......'], ['.........MM.....']),
  smile: features(
    'mouth.smile',
    11,
    ['......M..M......', '.......MM.......'],
    ['.........M......', '.........MM.....'],
  ),
  line: features('mouth.line', 12, ['......MMMM......'], ['........MMM.....']),
} as const satisfies Record<string, DirectionalArt>

export type FaceId = keyof typeof FACES
export type EyesId = keyof typeof EYES
export type MouthId = keyof typeof MOUTHS

// ── packages/characters/src/parts/garments.ts ───────────────────────────────

/**
 * Tops and bottoms — masks, not drawings.
 *
 * A garment here paints only where the body frame already has **skin**
 * (`render.ts`): it recolours the figure rather than adding to it. That is what
 * lets eight tops and four bottoms cover twenty-one poses from one drawing each,
 * seated frames included, with no possibility of a sleeve floating beside an arm
 * or a trouser leg cut off at the hip. `render.test.ts` measures both.
 *
 * The consequence is that a garment cannot add silhouette. A flared skirt is not
 * expressible; a *shorter* skirt is. So the bottoms differ by **length** and the
 * tops by **sleeve length, neckline and shading**, and the README says so rather
 * than claiming a wardrobe this cannot draw.
 *
 * Bottoms are authored full width because legs move sideways between frames and
 * the body silhouette does the clipping. Tops keep their columns, because sleeve
 * length is a column fact and arms stay in their columns across the cycle.
 */

const top = (name: string, rows: readonly string[]): DirectionalArt =>
  everyDirection(checkArt(`top.${name}`, { top: 15, rows }))

const bottom = (name: string, rows: readonly string[]): DirectionalArt =>
  everyDirection(checkArt(`bottom.${name}`, { top: 24, rows }))

export const TOPS = {
  tee: top('tee', [
    '................',
    '....TTTTTTTT....',
    '..TTTTTTTTTTTT..',
    '..ttTTTTTTTTtt..',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....tttttttt....',
  ]),
  shirt: top('shirt', [
    '................',
    '....TTTTTTTT....',
    '..TTTTttttTTTT..',
    '..TTTTtTTtTTTT..',
    '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..',
    '..ttTTTTTTTTtt..',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....tttttttt....',
  ]),
  hoodie: top('hoodie', [
    '......TTTT......',
    '...tTTTTTTTTt...',
    '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..',
    '..ttTTTTTTTTtt..',
    '....TTttttTT....',
    '....TTttttTT....',
    '....tttttttt....',
  ]),
  jacket: top('jacket', [
    '................',
    '....TTTttTTT....',
    '..TTTTTttTTTTT..',
    '..TTTTTttTTTTT..',
    '..TTTTTttTTTTT..',
    '..TTTTTttTTTTT..',
    '..ttTTTttTTTtt..',
    '....TTTttTTT....',
    '....TTTttTTT....',
    '....tttttttt....',
  ]),
  vest: top('vest', [
    '................',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....tttttttt....',
  ]),
  knit: top('knit', [
    '................',
    '....TTTTTTTT....',
    '..TTTTTTTTTTTT..',
    '..tttttttttttt..',
    '..TTTTTTTTTTTT..',
    '..tttttttttttt..',
    '..ttTTTTTTTTtt..',
    '....tttttttt....',
    '....TTTTTTTT....',
    '....tttttttt....',
  ]),
  collar: top('collar', [
    '................',
    '....tTTTTTTt....',
    '..TTTtTTTTtTTT..',
    '..ttTTTTTTTTtt..',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....tttttttt....',
  ]),
  turtleneck: top('turtleneck', [
    '......TTTT......',
    '....TTTTTTTT....',
    '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..',
    '..ttTTTTTTTTtt..',
    '....TTTTTTTT....',
    '....TTTTTTTT....',
    '....tttttttt....',
  ]),
} as const satisfies Record<string, DirectionalArt>

export const BOTTOMS = {
  trousers: bottom('trousers', [
    'BBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBB',
    'bbbbbbbbbbbbbbbb',
  ]),
  jeans: bottom('jeans', [
    'BBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBB',
    'bbbbbbbbbbbbbbbb',
    'bbbbbbbbbbbbbbbb',
  ]),
  skirt: bottom('skirt', [
    'BBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBB',
    'bbbbbbbbbbbbbbbb',
  ]),
  shorts: bottom('shorts', ['BBBBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBB', 'bbbbbbbbbbbbbbbb']),
} as const satisfies Record<string, DirectionalArt>

export type TopId = keyof typeof TOPS
export type BottomId = keyof typeof BOTTOMS

// ── packages/characters/src/parts/hair.ts ───────────────────────────────────

/**
 * Ten hairstyles, each in two layers.
 *
 * Hair is the attribute that carries the portrait. At 16 pixels a shirt is a
 * coloured rectangle and a jaw is three pixels of difference, but a silhouette —
 * a bun, a bob, a bush of curls, a shaved head — survives at any size. That is
 * why `hair` has the longest list (ten) and why its colour ramp has eight steps:
 * `uniqueness.test.ts` measures how much of the portrait's spread comes from here.
 *
 * ── Two layers, not one ────────────────────────────────────────────────────
 *
 * `back` is drawn before the body, `front` after the head. A ponytail needs to
 * pass behind a shoulder; a fringe needs to sit in front of a forehead. One layer
 * cannot do both, and alpha blending is not available — composition is
 * back-to-front overwrite and nothing else.
 *
 * ⚠️ **`ponytail` is asymmetric**, and the engine draws a left-facing character
 * by reversing the right-facing rows, so the tail swaps sides when the manager
 * turns around. That is accepted rather than fixed: drawing it on both sides
 * would make it a headband, and drawing a fourth direction would double the art
 * for one style. Recorded in the README as a known gap.
 */

export interface HairArt {
  readonly back: DirectionalArt
  readonly front: DirectionalArt
}

const NONE: DirectionalArt = { down: NO_ART, up: NO_ART, right: NO_ART }

const art = (top: number, rows: readonly string[]): Art => ({ top, rows })

// The back of a head is all hair, whatever the style does at the front. These
// three fills differ only in how far down and how wide the mass goes.
const SKULL_CROPPED = [
  '.....HHHHHH.....',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '....HHHHHHHH....',
  '....HHHHHHHH....',
  '.....HHHHHH.....',
]

const SKULL_FULL = [
  '.....HHHHHH.....',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '...HHHHHHHHHH...',
  '...HHHHHHHHHH...',
  '....HHHHHHHH....',
  '.....HHHHHH.....',
]

const SKULL_BOB = [
  '.....HHHHHH.....',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '...HHHHHHHHHH...',
  '....hHHHHHHh....',
]

const SKULL_LONG = [
  ...SKULL_BOB.slice(0, 12),
  '.hHHHHHHHHHHHHh.',
  '.hHHHHHHHHHHHHh.',
  '.hHHHHHHHHHHHHh.',
  '.hHHHHHHHHHHHHh.',
  '.hHHHHHHHHHHHHh.',
  '..hHHHHHHHHHHh..',
  '...hHHHHHHHHh...',
]

const PROFILE_LONG_SIDE = [
  '...HHHh.........',
  '...HHh..........',
  '...HHh..........',
  '...HHh..........',
  '...HHh..........',
  '...HHh..........',
  '...HHh..........',
  '...HHh..........',
  '....Hh..........',
]

const hair = (name: string, back: DirectionalArt, front: DirectionalArt): HairArt => ({
  back: checkDirectional(`hair.${name}.back`, back),
  front: checkDirectional(`hair.${name}.front`, front),
})

export const HAIR = {
  /** No hair at all. The hair colour is still drawn — nowhere. */
  bald: hair('bald', NONE, NONE),

  buzz: hair('buzz', NONE, {
    down: art(2, ['.....HHHHHH.....', '...HHHHHHHHHH...', '...HHHHHHHHHH...', '...Hhh....hhH...']),
    up: art(2, SKULL_CROPPED),
    right: art(2, ['....HHHHHH......', '...HHHHHHHHH....', '...HHHHHHHHH....', '...HHHh.........']),
  }),

  short: hair('short', NONE, {
    down: art(2, [
      '....HHHHHHHH....',
      '..HHHHHHHHHHHH..',
      '..HHHHHHHHHHHH..',
      '..HHhh....hhHH..',
      '..Hh........hH..',
    ]),
    up: art(2, SKULL_FULL),
    right: art(2, [
      '....HHHHHH......',
      '...HHHHHHHHH....',
      '...HHHHHHHHH....',
      '...HHHh.........',
      '...HHh..........',
    ]),
  }),

  parted: hair('parted', NONE, {
    down: art(2, [
      '....HHHHHHHH....',
      '..HHHHHHHHHHHH..',
      '..HHHHHhhHHHHH..',
      '..HHh....hhhHH..',
      '..Hh.......hhH..',
    ]),
    up: art(2, [
      '.....HHHHHH.....',
      '..HHHHHhhHHHHH..',
      '..HHHHHhhHHHHH..',
      '..HHHHHhhHHHHH..',
      ...SKULL_FULL.slice(4),
    ]),
    right: art(2, [
      '....HHHHHH......',
      '...HHHHHHHHH....',
      '...HHHHhhHHH....',
      '...HHHh....h....',
      '...HHh..........',
    ]),
  }),

  fringe: hair('fringe', NONE, {
    down: art(2, [
      '....HHHHHHHH....',
      '..HHHHHHHHHHHH..',
      '..HHHHHHHHHHHH..',
      '..HHHHHHHHHHHH..',
      '..Hhhhhhhhhhhh..',
      '..Hh........hH..',
    ]),
    up: art(2, SKULL_FULL),
    right: art(2, [
      '....HHHHHH......',
      '...HHHHHHHHH....',
      '...HHHHHHHHH....',
      '...HHHHHHHHHh...',
      '...HHh......h...',
    ]),
  }),

  bob: hair('bob', NONE, {
    down: art(2, [
      '....HHHHHHHH....',
      '..HHHHHHHHHHHH..',
      '..HHHHHHHHHHHH..',
      '..HHHh....hHHH..',
      '..HHh......hHH..',
      '..HHh......hHH..',
      '..HHh......hHH..',
      '..HHh......hHH..',
      '..HHh......hHH..',
      '..HHh......hHH..',
      '..HHh......hHH..',
      '...Hh......hH...',
    ]),
    up: art(2, SKULL_BOB),
    right: art(2, [
      '....HHHHHH......',
      '...HHHHHHHHH....',
      '...HHHHHHHHH....',
      ...PROFILE_LONG_SIDE,
    ]),
  }),

  long: hair(
    'long',
    {
      down: art(14, [
        '.hHHHHHHHHHHHHh.',
        '.hHHHHHHHHHHHHh.',
        '.hHHHHHHHHHHHHh.',
        '.hHHHHHHHHHHHHh.',
        '.hHHHHHHHHHHHHh.',
        '..hHHHHHHHHHHh..',
        '...hHHHHHHHHh...',
      ]),
      up: NO_ART,
      right: art(12, [
        '..hHHHHHh.......',
        '..hHHHHHh.......',
        '..hHHHHHh.......',
        '..hHHHHHh.......',
        '..hHHHHh........',
        '...hHHh.........',
      ]),
    },
    {
      down: art(2, [
        '....HHHHHHHH....',
        '..HHHHHHHHHHHH..',
        '..HHHHHHHHHHHH..',
        '..HHHh....hHHH..',
        '..HHh......hHH..',
        '..HHh......hHH..',
        '..HHh......hHH..',
        '..HHh......hHH..',
        '..HHh......hHH..',
        '..HHh......hHH..',
        '..HHh......hHH..',
        '..HHh......hHH..',
        '..HHh......hHH..',
        '..HHh......hHH..',
        '..HH........HH..',
        '..Hh........hH..',
      ]),
      up: art(2, SKULL_LONG),
      right: art(2, [
        '....HHHHHH......',
        '...HHHHHHHHH....',
        '...HHHHHHHHH....',
        ...PROFILE_LONG_SIDE,
      ]),
    },
  ),

  ponytail: hair(
    'ponytail',
    {
      down: art(4, [
        '.............HH.',
        '............HHh.',
        '............HHh.',
        '............HHh.',
        '............HHh.',
        '............HHh.',
        '............HHh.',
        '.............Hh.',
      ]),
      up: art(4, [
        '.............HH.',
        '............HHh.',
        '............HHh.',
        '............HHh.',
        '............HHh.',
        '............HHh.',
        '............HHh.',
        '.............Hh.',
      ]),
      right: art(4, [
        '...HH...........',
        '..hHH...........',
        '..hHH...........',
        '..hHH...........',
        '..hHH...........',
        '..hHH...........',
        '..hHH...........',
        '..hH............',
      ]),
    },
    {
      down: art(2, [
        '....HHHHHHHH....',
        '..HHHHHHHHHHHH..',
        '..HHHHHHHHHHHH..',
        '..HHhh....hhHH..',
        '..Hh........hH..',
      ]),
      up: art(2, SKULL_FULL),
      right: art(2, [
        '....HHHHHH......',
        '...HHHHHHHHH....',
        '...HHHHHHHHH....',
        '...HHHh.........',
        '...HHh..........',
      ]),
    },
  ),

  bun: hair('bun', NONE, {
    down: art(1, [
      '......HHHH......',
      '.....HHHHHH.....',
      '..HHHHHHHHHHHH..',
      '..HHHHHHHHHHHH..',
      '..HHhh....hhHH..',
      '..Hh........hH..',
    ]),
    up: art(1, ['......HHHH......', ...SKULL_FULL]),
    right: art(1, [
      '......HHHH......',
      '.....HHHHHH.....',
      '...HHHHHHHHH....',
      '...HHHHHHHHH....',
      '...HHHh.........',
      '...HHh..........',
    ]),
  }),

  curly: hair('curly', NONE, {
    down: art(1, [
      '...HH.HHHH.HH...',
      '..HHHHHHHHHHHH..',
      '.HHHHHHHHHHHHHH.',
      '.HHhHHHhhHHHhHH.',
      '.HHh........hHH.',
      '.Hh..........hH.',
      '.Hh..........hH.',
    ]),
    up: art(1, [
      '...HH.HHHH.HH...',
      '..HHHHHHHHHHHH..',
      '.HHHHHHHHHHHHHH.',
      '.HHhHHHhhHHHhHH.',
      ...SKULL_FULL.slice(1),
    ]),
    right: art(1, [
      '...HH.HHHH......',
      '..HHHHHHHHHH....',
      '.HHHHHHHHHHHH...',
      '.HHhHHHhhHHHh...',
      '.HHh............',
      '.Hh.............',
      '.Hh.............',
    ]),
  }),
} as const satisfies Record<string, HairArt>

export type HairId = keyof typeof HAIR

// ── packages/characters/src/parts/accessories.ts ────────────────────────────

/**
 * Six accessories, drawn last and over everything.
 *
 * An accessory carries its own two colours rather than a thirteenth seeded
 * attribute: spectacle frames and headphone cups are three pixels each, and
 * spending a hash stream on them would buy variety nobody can see at 16px while
 * costing every existing face if the list ever changed length.
 *
 * `none` is a member of the list, not an absence of one. One in six managers has
 * nothing on their head, which is the only way the other five read as a choice.
 */

export interface AccessoryArt {
  readonly art: DirectionalArt
  readonly colours: Ramp
}

const accessory = (name: string, colours: Ramp, art: DirectionalArt): AccessoryArt => ({
  art: checkDirectional(`accessory.${name}`, art),
  colours,
})

export const ACCESSORIES = {
  none: accessory(
    'none',
    { base: '#000000', shade: '#000000' },
    { down: NO_ART, up: NO_ART, right: NO_ART },
  ),

  /**
   * ⚠️ **The lens is empty, and that is the whole design of both spectacles.**
   *
   * The widest pair of eyes (`closed`) spans columns 4–6 and 9–11 on rows 8–9.
   * A frame with a rim above *and* below fills 24 of the 32 cells over that
   * band, and posts drawn just inside it clip the outer pixel of `closed` —
   * the first draft did both, so `eyes` went from six choices to one for a sixth
   * of all managers. One accessory erasing a whole face attribute is the thing
   * #938 asks this generator not to do.
   *
   * So the lenses sit **outside** every eye column (posts at 3 and 12, or 3, 7,
   * 8 and 12) and nothing at all is drawn on rows 8–9 between them.
   * `render.test.ts` measures it: under every accessory, the six pairs of eyes
   * still draw as many distinct faces as they do bare-faced.
   */
  glasses: accessory(
    'glasses',
    { base: '#2B2F36', shade: '#14161A' },
    {
      // Half-rim: one brow bar, two posts, hinges below. Rectangular at 16px.
      down: {
        top: 7,
        rows: ['...AAAAAAAAAA...', '...A........A...', '...A........A...', '...a........a...'],
      },
      up: NO_ART,
      right: {
        top: 7,
        rows: ['......AAAAA.....', '.....aA...A.....', '......A...A.....', '......a...a.....'],
      },
    },
  ),

  'round-glasses': accessory(
    'round-glasses',
    { base: '#B08A3C', shade: '#7E6026' },
    {
      // Full rim, but two pixels of arc top and bottom instead of a bar — the
      // outline reads as a circle beside the rectangle above.
      down: {
        top: 7,
        rows: ['....AAA..AAA....', '...A...aa...A...', '...A...AA...A...', '....AAA..AAA....'],
      },
      up: NO_ART,
      right: {
        top: 7,
        rows: ['.......AAA......', '.....aA...A.....', '......A...A.....', '.......AAA......'],
      },
    },
  ),

  headphones: accessory(
    'headphones',
    { base: '#3A3D44', shade: '#22242A' },
    {
      down: {
        top: 2,
        rows: [
          '....AAAAAAAA....',
          '...A........A...',
          '...AA......AA...',
          '...Aa......aA...',
          '...AA......AA...',
          '...AA......AA...',
        ],
      },
      up: {
        top: 2,
        rows: [
          '....AAAAAAAA....',
          '...A........A...',
          '...AA......AA...',
          '...Aa......aA...',
          '...AA......AA...',
          '...AA......AA...',
        ],
      },
      right: {
        top: 2,
        rows: [
          '...AAAAAAA......',
          '..A.......A.....',
          '..AA......A.....',
          '..Aa............',
          '..AA............',
          '..AA............',
        ],
      },
    },
  ),

  cap: accessory(
    'cap',
    { base: '#C1453F', shade: '#8C2B27' },
    {
      down: {
        top: 1,
        rows: ['....AAAAAAAA....', '..AAAAAAAAAAAA..', '..AAAAAAAAAAAA..', '.aaaaaaaaaaaaaa.'],
      },
      up: {
        top: 1,
        rows: ['....AAAAAAAA....', '..AAAAAAAAAAAA..', '..AAAAAAAAAAAA..', '..aaaaaaaaaaaa..'],
      },
      right: {
        top: 1,
        rows: ['...AAAAAA.......', '..AAAAAAAA......', '..AAAAAAAA......', '..aaaaaaaaaaa...'],
      },
    },
  ),

  /**
   * ⚠️ One earring, on one side. The engine mirrors the profile art to face left,
   * so it changes ears when the manager turns around — accepted, and recorded in
   * the README. A pair would be a different accessory, not a fix for this one.
   */
  earring: accessory(
    'earring',
    { base: '#E0B84C', shade: '#A8862E' },
    {
      down: { top: 11, rows: ['..A.............', '..a.............'] },
      up: NO_ART,
      right: { top: 11, rows: ['....A...........', '....a...........'] },
    },
  ),
} as const satisfies Record<string, AccessoryArt>

export type AccessoryId = keyof typeof ACCESSORIES

// ── packages/characters/src/parts/body.ts ───────────────────────────────────

/**
 * The twenty-one body frames, and the anchors every other part rides on.
 *
 * ── What a frame means, measured rather than guessed ───────────────────────
 *
 * The office engine picks a frame like this (#938's survey of the vendored
 * bundle; `apps/desktop/src/operations/protocol.ts` carries the types):
 *
 * | frame | what the engine does with it |
 * |---|---|
 * | 0, 1, 2 | the walk cycle, played `[0, 1, 2, 1]` |
 * | **1** | the standing pose — `IDLE` draws this one frame and nothing else |
 * | 3, 4 | seated at a desk, alternating. **Drawn six pixels lower**, so the last six rows fall under the desk |
 * | 5, 6 | reading. Aumos declares `readingTools: []`, so these are never drawn — and must exist anyway, because the engine indexes them unconditionally |
 *
 * The portrait is a crop of `down[1]` (`render.ts`), which is the same frame the
 * room draws when a manager is standing still. That is the whole reason it is
 * frame 1 and not frame 0.
 *
 * ── Why the body is bare skin ──────────────────────────────────────────────
 *
 * These frames draw skin, and shoes, and nothing else. Trousers and shirts are
 * **masks painted over the body's skin pixels** (`render.ts`), not drawings of
 * their own, so one authored shirt fits all twenty-one poses — including the
 * seated ones, where the lap is a solid block that no standing-pose garment
 * drawing would have covered. `render.test.ts` measures that no garment pixel
 * lands outside the body silhouette and that every seated frame is still dressed.
 *
 * ── Anchors ───────────────────────────────────────────────────────────────
 *
 * Head, torso and hip each carry an offset from the standing frame. The walk and
 * typing frames bob the upper body down a pixel while the feet stay planted:
 * `head` and `torso` move, `hip` does not. Hair, faces and accessories ride the
 * head anchor, so they bob with the skull instead of floating over it.
 */

export interface Point {
  readonly x: number
  readonly y: number
}
export interface FrameAnchors {
  readonly head: Point
  readonly torso: Point
  readonly hip: Point
}

const STILL: FrameAnchors = { head: { x: 0, y: 0 }, torso: { x: 0, y: 0 }, hip: { x: 0, y: 0 } }
const BOB: FrameAnchors = { head: { x: 0, y: 1 }, torso: { x: 0, y: 1 }, hip: { x: 0, y: 0 } }
/** In profile the head also leans a pixel into the stride. */
const LEAN: FrameAnchors = { head: { x: 1, y: 1 }, torso: { x: 0, y: 1 }, hip: { x: 0, y: 0 } }

const FLAT_ANCHORS: readonly FrameAnchors[] = [BOB, STILL, BOB, BOB, BOB, STILL, STILL]
const PROFILE_ANCHORS: readonly FrameAnchors[] = [LEAN, STILL, LEAN, BOB, BOB, STILL, STILL]

export const ANCHORS: Readonly<Record<'down' | 'up' | 'right', readonly FrameAnchors[]>> = {
  down: FLAT_ANCHORS,
  up: FLAT_ANCHORS,
  right: PROFILE_ANCHORS,
}

const body = (name: string, rows: readonly string[]): Art =>
  checkArt(`body.${name}`, { top: 15, rows })

// ── Front and back: the same silhouette ────────────────────────────────────
// A 16-wide figure's torso, arms and legs read identically from behind; what
// differs is the head (no face) and the collar, and both of those are other
// parts. So `up` reuses these frames rather than restating them — see `BODY`.

const FRONT_STAND = body('front.stand', [
  '......SSSs......',
  '....SSSSSSSs....',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '....SSSSSSSs....',
  '....SSSSSSSs....',
  '....SSs..SSs....',
  '....SSs..SSs....',
  '....SSs..SSs....',
  '....SSs..SSs....',
  '...KKKk..KKKk...',
  '...KKKk..KKKk...',
])

const FRONT_STEP_LEFT = body('front.step-left', [
  '................',
  '......SSSs......',
  '....SSSSSSSs....',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '....SSSSSSSSSs..',
  '....SSSSSSSs....',
  '....SSSSSSSs....',
  '....SSs..SSs....',
  '....SSs..SSs....',
  '....SSs..SSs....',
  '...KKKk..SSs....',
  '...KKKk..KKKk...',
  '.........KKKk...',
])

const FRONT_STEP_RIGHT = body('front.step-right', [
  '................',
  '......SSSs......',
  '....SSSSSSSs....',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSs....',
  '....SSSSSSSs....',
  '....SSSSSSSs....',
  '....SSs..SSs....',
  '....SSs..SSs....',
  '....SSs..SSs....',
  '....SSs..KKKk...',
  '...KKKk..KKKk...',
  '...KKKk.........',
])

const FRONT_TYPE_A = body('front.type-a', [
  '................',
  '......SSSs......',
  '....SSSSSSSs....',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '................',
  '................',
])

const FRONT_TYPE_B = body('front.type-b', [
  '................',
  '......SSSs......',
  '....SSSSSSSs....',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '...SSSSSSSSSs...',
  '..SSSSSSSSSSSs..',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '................',
  '................',
])

const FRONT_READ_A = body('front.read-a', [
  '......SSSs......',
  '....SSSSSSSs....',
  '..SSSSSSSSSSSs..',
  '..SSSSSSSSSSSs..',
  '...SSSSSSSSSs...',
  '....SSSSSSSs....',
  '....SSSSSSSs....',
  '....SSSSSSSs....',
  '....SSSSSSSs....',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '................',
  '................',
])

const FRONT_READ_B = body('front.read-b', [
  '......SSSs......',
  '....SSSSSSSs....',
  '..SSSSSSSSSSSs..',
  '...SSSSSSSSSs...',
  '....SSSSSSSs....',
  '....SSSSSSSs....',
  '....SSSSSSSs....',
  '....SSSSSSSs....',
  '....SSSSSSSs....',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '...SSSSSSSSSs...',
  '................',
  '................',
])

// ── Profile ───────────────────────────────────────────────────────────────
// The engine draws a left-facing character by reversing each row of these, so
// nothing here may depend on which way it points. Nothing does: the role
// alphabet has no text, and the asymmetries are limbs, which read either way.

const SIDE_STAND = body('side.stand', [
  '......SSSs......',
  '.....SSSSSs.....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSs.....',
  '.....SSSSSs.....',
  '.....SSSs.......',
  '.....SSSs.......',
  '.....SSSs.......',
  '.....SSSs.......',
  '....KKKKKk......',
  '....KKKKKk......',
])

const SIDE_STEP_A = body('side.step-a', [
  '................',
  '......SSSs......',
  '.....SSSSSs.....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSs.....',
  '.....SSSSSs.....',
  '....SSs.SSs.....',
  '....SSs.SSs.....',
  '....SSs..SSs....',
  '...SSs...SSs....',
  '..KKKk...KKKk...',
  '..KKKk...KKKk...',
])

const SIDE_STEP_B = body('side.step-b', [
  '................',
  '......SSSs......',
  '.....SSSSSs.....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSs.....',
  '.....SSSSSs.....',
  '.....SSs.SSs....',
  '.....SSs.SSs....',
  '....SSs...SSs...',
  '....SSs...SSs...',
  '...KKKk...KKKk..',
  '...KKKk...KKKk..',
])

const SIDE_TYPE_A = body('side.type-a', [
  '................',
  '......SSSs......',
  '.....SSSSSs.....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSs.....',
  '.....SSSSSs.....',
  '.....SSSSSs.....',
  '................',
  '................',
])

const SIDE_TYPE_B = body('side.type-b', [
  '................',
  '......SSSs......',
  '.....SSSSSs.....',
  '.....SSSSSSs....',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSs.....',
  '.....SSSSSs.....',
  '.....SSSSSs.....',
  '................',
  '................',
])

const SIDE_READ_A = body('side.read-a', [
  '......SSSs......',
  '.....SSSSSs.....',
  '.....SSSSSSs....',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSs.....',
  '.....SSSSSs.....',
  '.....SSSSSs.....',
  '................',
  '................',
])

const SIDE_READ_B = body('side.read-b', [
  '......SSSs......',
  '.....SSSSSs.....',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSs....',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSSSSs..',
  '.....SSSSSs.....',
  '.....SSSSSs.....',
  '.....SSSSSs.....',
  '................',
  '................',
])

const FRONT: readonly Art[] = [
  FRONT_STEP_LEFT,
  FRONT_STAND,
  FRONT_STEP_RIGHT,
  FRONT_TYPE_A,
  FRONT_TYPE_B,
  FRONT_READ_A,
  FRONT_READ_B,
]

const SIDE: readonly Art[] = [
  SIDE_STEP_A,
  SIDE_STAND,
  SIDE_STEP_B,
  SIDE_TYPE_A,
  SIDE_TYPE_B,
  SIDE_READ_A,
  SIDE_READ_B,
]

export const BODY: Readonly<Record<'down' | 'up' | 'right', readonly Art[]>> = {
  down: FRONT,
  up: FRONT,
  right: SIDE,
}

for (const [direction, frames] of Object.entries(BODY)) {
  if (frames.length !== FRAMES_PER_DIRECTION) {
    throw new Error(`body.${direction}: ${frames.length} frames, expected ${FRAMES_PER_DIRECTION}`)
  }
}

// ── packages/characters/src/appearance.ts ───────────────────────────────────

/**
 * Seed → twelve choices. The only place a string becomes a face.
 *
 * ── Why the lists are written out ──────────────────────────────────────────
 *
 * Each list below is a literal array rather than `Object.keys` of the part table
 * it indexes. Key order in an object literal is stable in practice, but it is not
 * a thing anyone reviews: moving two hairstyles apart in `parts/hair.ts` would
 * silently re-cut every published face, and nothing in a diff would say so.
 * Written out here, that reordering is a line in a file whose whole subject is
 * that it must not move — and `appearance.test.ts` pins each list against the
 * table's keys so a *new* part cannot be added to one and forgotten in the other.
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
 * can fall back, and a parse that refuses unknown generators would turn a
 * decoration into an install failure.
 */
export interface CharacterDescriptor {
  readonly generator: string
  readonly seed: string
}

export interface Appearance {
  readonly skin: SkinId
  readonly face: FaceId
  readonly eyes: EyesId
  readonly mouth: MouthId
  readonly hair: HairId
  readonly hairColour: HairColourId
  readonly accessory: AccessoryId
  readonly top: TopId
  readonly topColour: TopColourId
  readonly bottom: BottomId
  readonly bottomColour: BottomColourId
  readonly shoes: ShoesId
}

export const SKINS: readonly SkinId[] = ['porcelain', 'sand', 'honey', 'clay', 'umber', 'ebony']
export const FACE_IDS: readonly FaceId[] = ['round', 'square', 'narrow', 'wide']
export const EYE_IDS: readonly EyesId[] = ['dot', 'wide', 'slant', 'closed', 'bright', 'small']
export const MOUTH_IDS: readonly MouthId[] = ['neutral', 'smile', 'line']
export const HAIR_IDS: readonly HairId[] = [
  'bald',
  'buzz',
  'short',
  'parted',
  'fringe',
  'bob',
  'long',
  'ponytail',
  'bun',
  'curly',
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
export const ACCESSORY_IDS: readonly AccessoryId[] = [
  'none',
  'glasses',
  'round-glasses',
  'headphones',
  'cap',
  'earring',
]
export const TOP_IDS: readonly TopId[] = [
  'tee',
  'shirt',
  'hoodie',
  'jacket',
  'vest',
  'knit',
  'collar',
  'turtleneck',
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
export const BOTTOM_IDS: readonly BottomId[] = ['trousers', 'jeans', 'skirt', 'shorts']
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
  face: FACES,
  eyes: EYES,
  mouth: MOUTHS,
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
 * The twelve attribute names, in the order a signature writes them.
 *
 * Each name is also the string hashed for that attribute's stream, so this list
 * is part of the generator: renaming `hairColour` re-cuts every face.
 */
export const ATTRIBUTES = [
  'skin',
  'face',
  'eyes',
  'mouth',
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
    face: of(FACE_IDS, 'face'),
    eyes: of(EYE_IDS, 'eyes'),
    mouth: of(MOUTH_IDS, 'mouth'),
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
 * Composition: nine layers, back to front, into a 16×32 grid of colours.
 *
 * ── The order, and the one place it differs from the design note ───────────
 *
 * ```
 * 1 hairBack    behind everything — a ponytail passes behind a shoulder
 * 2 body        skin and shoes; the silhouette every garment is clipped to
 * 3 bottom      over the body's bare legs
 * 4 top         over the body's bare torso and arms; wins at the waist
 * 5 head        the skin of the skull, whose shape the `face` attribute picks
 * 6 face        eyes, then mouth
 * 7 hairFront   fringe and crown, over the head
 * 8 accessory   last, over all of it
 * ```
 *
 * ⚠️ #938's design note listed `bottom` and `shoes` *before* the body's skin.
 * That order assumed the body frames already carried clothing regions. They do
 * not — the body is bare skin (`parts/body.ts`), which is what lets one garment
 * drawing fit twenty-one poses — so drawing skin after trousers would paint the
 * legs back over them. Shoes are not a layer at all: `shoes` is a colour-only
 * attribute and the body's own `K` cells carry it. The rest of the order is the
 * note's, unchanged.
 *
 * ⛔ There is no alpha blending. A layer either writes a cell or leaves it, which
 * is the same rule the office engine's sprites already obey.
 */

/** The row the portrait crop starts on, and how tall it is. */
export const PORTRAIT_TOP = 2
export const PORTRAIT_SIZE = 16

const NO_OFFSET: Point = { x: 0, y: 0 }

type RoleGrid = Role[][]

const blankRoles = (): RoleGrid =>
  Array.from({ length: FRAME_HEIGHT }, () => Array.from({ length: FRAME_WIDTH }, (): Role => '.'))

/**
 * Write every non-transparent cell of `art`, offset by `at`.
 *
 * The loop walks the art rather than the frame: most parts are a few rows, and
 * `uniqueness.test.ts` renders a thousand of these. Cells that fall outside the
 * frame are dropped, which is what lets a part be authored past an edge and lets
 * the walk anchor push a hat up a row without a bounds check at the call site.
 */
const paint = (grid: RoleGrid, art: Art, at: Point): void => {
  for (const [index, source] of art.rows.entries()) {
    const row = art.top + index + at.y
    if (row < 0 || row >= FRAME_HEIGHT) continue
    const line = grid[row]
    if (line === undefined) continue
    for (let index_ = 0; index_ < source.length; index_ += 1) {
      const role = source[index_] as Role
      if (role === '.') continue
      const col = index_ + at.x
      if (col < 0 || col >= FRAME_WIDTH) continue
      line[col] = role
    }
  }
}

/**
 * Write `art` only where the grid already holds skin — the garment rule.
 *
 * Shoes (`K`/`k`) and anything already drawn are left alone, so a trouser mask
 * cannot swallow a foot and a sleeve cannot cover a hand the body drew as skin
 * at a row the mask happens to span.
 */
const paintOverSkin = (grid: RoleGrid, art: Art, at: Point): void => {
  for (const [index, source] of art.rows.entries()) {
    const row = art.top + index + at.y
    if (row < 0 || row >= FRAME_HEIGHT) continue
    const line = grid[row]
    if (line === undefined) continue
    for (let index_ = 0; index_ < source.length; index_ += 1) {
      const role = source[index_] as Role
      if (role === '.') continue
      const col = index_ + at.x
      if (col < 0 || col >= FRAME_WIDTH) continue
      const under = line[col]
      if (under !== 'S' && under !== 's') continue
      // The body's own shading survives the change of material.
      line[col] = under === 's' ? (role.toLowerCase() as Role) : role
    }
  }
}

const frameRoles = (appearance: Appearance, direction: Direction, frame: number): RoleGrid => {
  const anchors = ANCHORS[direction][frame]
  const body = BODY[direction][frame]
  if (anchors === undefined || body === undefined) {
    throw new Error(`no frame ${frame} for ${direction}`)
  }
  const hair = HAIR[appearance.hair]
  const grid = blankRoles()
  paint(grid, hair.back[direction], anchors.head)
  paint(grid, body, NO_OFFSET)
  paintOverSkin(grid, BOTTOMS[appearance.bottom][direction], anchors.hip)
  paintOverSkin(grid, TOPS[appearance.top][direction], anchors.torso)
  paint(grid, FACES[appearance.face][direction], anchors.head)
  paint(grid, EYES[appearance.eyes][direction], anchors.head)
  paint(grid, MOUTHS[appearance.mouth][direction], anchors.head)
  paint(grid, hair.front[direction], anchors.head)
  paint(grid, ACCESSORIES[appearance.accessory].art[direction], anchors.head)
  return grid
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
  const standing = renderFrame(appearance, 'down', 1, colours)
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
