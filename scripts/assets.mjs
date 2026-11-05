// Copies the CC0 3D files the style frames use from the raw downloads in .cache/assets (git-ignored)
// into public/assets/3d, and records each pack: name, page, licence, the downloaded archive's SHA-256
// and the files taken from it. Only files listed here leave the cache.
//   node scripts/assets.mjs
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache', 'assets');
const out = join(root, 'public', 'assets', '3d');

const KENNEY_FURNITURE = 'kenney_furniture-kit/Models/GLTF format';
const KENNEY_MINI = 'kenney_mini-characters/Models/GLB format';
const KENNEY_BLOCKY = 'kenney_blocky-characters/Models/GLB format';
const KAYKIT = 'kaykit_furniture-bits/KayKit-Furniture-Bits-1.0-main/addons/kaykit_furniture_bits/Assets/gltf';
const kaykit = (name) => [`${name}.gltf`, `${name}.bin`];

const PACKS = [
  {
    id: 'kenney-furniture-kit',
    name: 'Furniture Kit 1.0',
    by: 'Kenney',
    url: 'https://kenney.nl/assets/furniture-kit',
    licence: 'CC0 1.0',
    archive: 'kenney_furniture-kit.zip',
    from: KENNEY_FURNITURE,
    files: [
      'desk.glb',
      'chairDesk.glb',
      'computerKeyboard.glb',
      'plantSmall1.glb',
      'plantSmall2.glb',
      'plantSmall3.glb',
      'pottedPlant.glb',
      'lampRoundTable.glb',
      'books.glb',
      'rugRectangle.glb',
      'radio.glb',
      'trashcan.glb',
      'coatRackStanding.glb',
      'lampSquareTable.glb',
      'rugRound.glb',
      'bookcaseOpen.glb',
      'sideTable.glb',
      'speakerSmall.glb',
    ],
  },
  {
    id: 'kenney-mini-characters',
    name: 'Mini Characters 1.0',
    by: 'Kenney',
    url: 'https://kenney.nl/assets/mini-characters',
    licence: 'CC0 1.0',
    archive: 'kenney_mini-characters.zip',
    from: KENNEY_MINI,
    files: [
      ...['a', 'b', 'c', 'd', 'e', 'f'].flatMap((x) => [`character-female-${x}.glb`, `character-male-${x}.glb`]),
      'wheelchair.glb',
      'aid-glasses.glb',
      'Textures/colormap.png',
    ],
  },
  {
    id: 'kenney-blocky-characters',
    name: 'Blocky Characters 2.0',
    by: 'Kenney',
    url: 'https://kenney.nl/assets/blocky-characters',
    licence: 'CC0 1.0',
    archive: 'kenney_blocky-characters.zip',
    from: KENNEY_BLOCKY,
    files: ['a', 'b', 'c', 'e', 'f', 'g', 'h', 'i', 'k', 'm', 'q'].flatMap((x) => [`character-${x}.glb`, `Textures/texture-${x}.png`]),
  },
  {
    id: 'kaykit-furniture-bits',
    name: 'KayKit Furniture Bits 1.0',
    by: 'Kay Lousberg',
    url: 'https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0',
    licence: 'CC0 1.0',
    archive: 'kaykit_furniture-bits.zip',
    from: KAYKIT,
    files: [
      ...[
        'cactus_small_A',
        'cactus_small_B',
        'cactus_medium_A',
        'lamp_table',
        'book_set',
        'pictureframe_large_A',
        'pictureframe_large_B',
        'rug_rectangle_stripes_A',
      ].flatMap(kaykit),
      'furniturebits_texture.png',
    ],
  },
];

rmSync(out, { recursive: true, force: true });
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const record = [];
for (const pack of PACKS) {
  const archive = join(cache, pack.archive);
  if (!existsSync(archive)) throw new Error(`missing ${pack.archive}: download it into .cache/assets first`);
  const files = {};
  for (const f of pack.files) {
    const from = join(cache, pack.from, f);
    const to = join(out, pack.id, f);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    files[f] = sha(to);
  }
  record.push({
    id: pack.id,
    name: pack.name,
    by: pack.by,
    url: pack.url,
    licence: pack.licence,
    archive: pack.archive,
    archiveSha256: sha(archive),
    files,
  });
}
writeFileSync(
  join(out, 'SOURCES.json'),
  `${JSON.stringify({ about: 'CC0 3D assets used by the style frames; raw downloads stay in .cache/assets.', packs: record }, null, 2)}\n`,
);
console.log(record.map((p) => `${p.name}: ${Object.keys(p.files).length} files, archive ${p.archiveSha256.slice(0, 12)}…`).join('\n'));
