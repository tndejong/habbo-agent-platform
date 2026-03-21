'use strict';

const express = require('express');
const { createCanvas, loadImage } = require('canvas');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const FIGURE_DIR  = process.env.FIGURE_DIR  || '/assets/bundled/figure';
const GAMEDATA_DIR = process.env.GAMEDATA_DIR || '/assets/gamedata';
const PORT = parseInt(process.env.PORT || '3005');

// Canvas dimensions and avatar origin (feet position)
const PADDING_X = 16;   // extra pixels on each side to prevent side-angle clipping
const CANVAS_W  = 64 + PADDING_X * 2;
const CANVAS_H  = 110;
const ORIGIN_Y  = 95;   // y of feet (from top of canvas); geometry canvas height=130, canvasOffset=114 → shift 19px

// Directions that have no h_std sprites — mirror from their counterpart
const MIRROR_MAP = { 4: 2, 5: 1, 6: 0 };

// Draw order: back-to-front for direction 2 (facing right-forward)
const DRAW_ORDER = [
  'lh', 'ls', 'lc', 'bd', 'lg', 'sh',
  'ch', 'ca', 'cc', 'cp', 'rs', 'rc', 'rh', 'wa',
  'hrb', 'hd', 'fc', 'ey', 'ea', 'hr', 'ha', 'he',
];

// Parts that belong to the head — rendered using head_direction instead of body direction
const HEAD_PARTS = new Set(['hrb', 'hd', 'fc', 'ey', 'ea', 'hr', 'ha', 'he']);

// Generic full-size libs to try as fallback when FigureMap candidates all miss
const FALLBACK_LIBS = {
  'hr':  'hh_human_hair',
  'hrb': 'hh_human_hair',
  'ha':  'hh_human_hats',
  'he':  'hh_human_hats',
  'ea':  'hh_human_acc_eye',
  'wa':  'hh_human_acc_waist',
  'ca':  'hh_human_acc_chest',
  'cc':  'hh_human_acc_chest',
};

// ─── Game-data ──────────────────────────────────────────────────────────────

let figureData = null;  // { palettes, setTypes }
let figureMap  = null;  // { partToLib }

function loadGameData() {
  const fd = JSON.parse(
    fs.readFileSync(path.join(GAMEDATA_DIR, 'FigureData.json'), 'utf8')
  );

  // palettes: { paletteId -> { colorId -> hexCode } }
  const palettes = {};
  for (const [key, pal] of Object.entries(fd.palettes || {})) {
    const palId = pal.id != null ? String(pal.id) : key;
    palettes[palId] = {};
    for (const color of pal.colors || []) {
      palettes[palId][String(color.id)] = color.hexCode;
    }
  }

  // setTypes: { type -> { paletteId, sets: { setId -> { colorable, parts } } } }
  const setTypes = {};
  for (const st of fd.setTypes || []) {
    const setsMap = {};
    for (const set of st.sets || []) {
      setsMap[String(set.id)] = { colorable: set.colorable, parts: set.parts || [] };
    }
    setTypes[st.type] = { paletteId: String(st.paletteId), sets: setsMap };
  }

  figureData = { palettes, setTypes };

  const fm = JSON.parse(
    fs.readFileSync(path.join(GAMEDATA_DIR, 'FigureMap.json'), 'utf8')
  );

  // partToLibs: `${type}:${partId}` -> [libName, ...] (all candidates in order)
  const partToLibs = {};
  for (const lib of fm.libraries || []) {
    for (const part of lib.parts || []) {
      const key = `${part.type}:${part.id}`;
      if (!partToLibs[key]) partToLibs[key] = [];
      partToLibs[key].push(lib.id);
    }
  }

  figureMap = { partToLibs };
  console.log('Game data loaded.');
}

// ─── .nitro file parser ─────────────────────────────────────────────────────

const nitroCache   = new Map();
const pngImgCache  = new Map();
let   nitroFileMap = null;  // lowercase name -> actual filename

function getNitroFileMap() {
  if (!nitroFileMap) {
    nitroFileMap = {};
    for (const f of fs.readdirSync(FIGURE_DIR)) {
      nitroFileMap[f.toLowerCase()] = f;
    }
  }
  return nitroFileMap;
}

function loadNitro(libName) {
  const key = libName.toLowerCase();
  if (nitroCache.has(key)) return nitroCache.get(key);

  const fileMap  = getNitroFileMap();
  const filename = fileMap[key + '.nitro'];
  if (!filename) { nitroCache.set(key, null); return null; }

  const buf = fs.readFileSync(path.join(FIGURE_DIR, filename));
  let offset = 2;                       // skip magic/version
  const entries = {};
  while (offset + 6 <= buf.length) {
    const nameLen = buf.readUInt16BE(offset); offset += 2;
    if (offset + nameLen > buf.length) break;
    const name = buf.slice(offset, offset + nameLen).toString(); offset += nameLen;
    const dataLen = buf.readUInt32BE(offset); offset += 4;
    if (offset + dataLen > buf.length) break;
    entries[name] = buf.slice(offset, offset + dataLen); offset += dataLen;
  }

  const jsonKey = Object.keys(entries).find(k => k.endsWith('.json'));
  const pngKey  = Object.keys(entries).find(k => k.endsWith('.png'));
  if (!jsonKey || !pngKey) { nitroCache.set(key, null); return null; }

  const json      = JSON.parse(zlib.inflateSync(entries[jsonKey]).toString());
  const pngBuffer = zlib.inflateSync(entries[pngKey]);
  const libId     = path.basename(jsonKey, '.json');   // e.g. "Hair_F_Bib"

  const result = { json, pngBuffer, libId };
  nitroCache.set(key, result);
  return result;
}

async function getPngImage(libKey, pngBuffer) {
  if (pngImgCache.has(libKey)) return pngImgCache.get(libKey);
  const img = await loadImage(pngBuffer);
  pngImgCache.set(libKey, img);
  return img;
}

// ─── Colour helpers ─────────────────────────────────────────────────────────

function getColorHex(setType, colorId) {
  if (!figureData) return 'FFFFFF';
  const st = figureData.setTypes[setType];
  if (!st) return 'FFFFFF';
  return figureData.palettes[st.paletteId]?.[colorId] || 'FFFFFF';
}

function tintCanvas(ctx, w, h, hex) {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  if (r === 1 && g === 1 && b === 1) return;
  const imgd = ctx.getImageData(0, 0, w, h);
  const d = imgd.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]   = Math.min(255, Math.round(d[i]   * r));
    d[i+1] = Math.min(255, Math.round(d[i+1] * g));
    d[i+2] = Math.min(255, Math.round(d[i+2] * b));
  }
  ctx.putImageData(imgd, 0, 0);
}

// ─── Figure renderer ─────────────────────────────────────────────────────────

function parseFigureString(str) {
  return (str || '').split('.').filter(Boolean).map(p => {
    const [type, id, colorId] = p.split('-');
    return { type, id: String(id || '0'), colorId: String(colorId || '0') };
  });
}

async function renderFigure(figureStr, direction = 2, headDirection = null) {
  const hDir = headDirection ?? direction;
  // 1. Expand figure string into all drawable parts
  const partMap = {};  // partType -> [{ figEntry, partDef, setType }]

  for (const figEntry of parseFigureString(figureStr)) {
    const st = figureData?.setTypes[figEntry.type];
    if (!st) continue;
    const setDef = st.sets[figEntry.id];
    if (!setDef) continue;
    for (const partDef of setDef.parts) {
      if (!partMap[partDef.type]) partMap[partDef.type] = [];
      partMap[partDef.type].push({ figEntry, partDef, setType: figEntry.type });
    }
  }

  const canvas = createCanvas(CANVAS_W, CANVAS_H);
  const ctx    = canvas.getContext('2d');

  // 2. Draw each part in Z-order
  for (const drawType of DRAW_ORDER) {
    const parts = partMap[drawType];
    if (!parts?.length) continue;

    for (const { figEntry, partDef, setType } of parts) {
      const baseCandidates = figureMap?.partToLibs[`${drawType}:${partDef.id}`] || [];
      const fallback = FALLBACK_LIBS[drawType];
      const libCandidates = fallback && !baseCandidates.includes(fallback)
        ? [...baseCandidates, fallback]
        : baseCandidates;

      // Frame sprite-type: hrb uses the same sprites as hr
      const spriteType = drawType === 'hrb' ? 'hr' : drawType;

      // Pick the first candidate lib that has an h_std_* frame (large-scale, h = human)
      const partDir = HEAD_PARTS.has(drawType) ? hDir : direction;
      let nitro = null, frameKey = null, assetKey = null;
      for (const candidate of libCandidates) {
        const n = loadNitro(candidate);
        if (!n) continue;
        const fk = `${n.libId}_h_std_${spriteType}_${partDef.id}_${partDir}_0`;
        if (n.json.spritesheet?.frames[fk]) {
          nitro = n; frameKey = fk;
          assetKey = `h_std_${drawType}_${partDef.id}_${partDir}_0`;
          break;
        }
      }
      if (!nitro || !frameKey) continue;

      const { json, pngBuffer } = nitro;
      const frames = json.spritesheet?.frames || {};
      const assets = json.assets || {};

      if (!frames[frameKey]) continue;

      const frame = frames[frameKey];
      const asset = assets[assetKey] || { x: 0, y: 0 };

      const { x: fx, y: fy, w: fw, h: fh } = frame.frame;

      // asset.x/y are sprite offsets; Nitro renderer places each sprite at (-(asset.x), canvasOffset - asset.y)
      // where canvasOffset = geometryCanvas.height - 16 = 130 - 16 = 114.
      // Adjusted for our 64×110 canvas (feet at ORIGIN_Y=95 instead of 114):
      //   drawX = -(asset.x)          (regPoint offset cancels out)
      //   drawY = ORIGIN_Y - asset.y  (shift feet from 114 to 95)
      const drawX = Math.round(-(asset.x)) + PADDING_X;
      const drawY = Math.round(ORIGIN_Y - asset.y);

      // Draw sprite onto a temp canvas so we can tint it
      const sc   = createCanvas(fw, fh);
      const sctx = sc.getContext('2d');
      const pngImg = await getPngImage(nitro.libId.toLowerCase(), pngBuffer);
      sctx.drawImage(pngImg, fx, fy, fw, fh, 0, 0, fw, fh);

      if (partDef.colorable) {
        const hex = getColorHex(setType, figEntry.colorId);
        tintCanvas(sctx, fw, fh, hex);
      }

      ctx.drawImage(sc, drawX, drawY);
    }
  }

  return canvas.toBuffer('image/png');
}

// ─── HTTP server ─────────────────────────────────────────────────────────────

loadGameData();

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/figure', async (req, res) => {
  const figure        = String(req.query.figure    || 'hd-180-1');
  const direction     = parseInt(req.query.direction || '2');
  const headDirection = req.query.head_direction != null ? parseInt(req.query.head_direction) : null;

  const mirrorSource  = MIRROR_MAP[direction];
  const renderDir     = mirrorSource !== undefined ? mirrorSource : direction;
  // For mirrored directions the head must also use the mirrored source direction —
  // head sprites only exist for dirs 0-3; dirs 4-6 have no head spritesheets.
  const renderHeadDir = mirrorSource !== undefined ? renderDir : (headDirection ?? renderDir);

  try {
    const png = await renderFigure(figure, renderDir, renderHeadDir);

    let finalPng = png;
    if (mirrorSource !== undefined) {
      const src = await getPngImage(`__mirror_${figure}_${renderDir}`, png);
      const mc  = createCanvas(CANVAS_W, CANVAS_H);
      const mctx = mc.getContext('2d');
      mctx.translate(CANVAS_W, 0);
      mctx.scale(-1, 1);
      mctx.drawImage(src, 0, 0);
      finalPng = mc.toBuffer('image/png');
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.send(finalPng);
  } catch (err) {
    console.error('Render error:', err.message);
    res.status(500).end();
  }
});

app.listen(PORT, () => console.log(`nitro-imager listening on :${PORT}`));
