#!/usr/bin/env bash
# Add a custom furni to the hotel from a SWF.
#
# Usage:
#   scripts/add-furni.sh <swf-path> <display-name> [page_id] [cost_credits]
#
# Example:
#   scripts/add-furni.sh ~/Downloads/World_Cup_trophy.swf "World Cup Trophy" 217 5
#
# Page ids of interest:
#   217  Sports
#   225  Trophies (engravable, special layout)
#   737  Non-Writable Trophies (default grid)
#
# What this does, in order:
#   1. Copy SWF to converter input and to dcr/hof_furni (for re-runs)
#   2. Convert SWF -> .nitro inside the nitro Docker image
#   3. Copy bundle to nitro/nitro-assets/bundled/furniture/
#   4. Extract bundle, crop the icon sprite, save with padding to dcr/hof_furni/icons/
#   5. Allocate the next furnidata id (max+1) and add a <furnitype> entry
#   6. Append a row to productdata.txt
#   7. Regenerate FurnitureData.json + ProductData.json, deploy them
#   8. Write mysql/dumps/zz_custom_furni_<classname>.sql (for redeploys)
#   9. If MariaDB is running, apply the SQL against the live DB

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <swf-path> <display-name> [page_id] [cost_credits]" >&2
  exit 1
fi

SWF_SRC="$1"
DISPLAY_NAME="$2"
PAGE_ID="${3:-217}"
COST="${4:-5}"

if [[ ! -f "$SWF_SRC" ]]; then
  echo "error: SWF not found: $SWF_SRC" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

CLASSNAME="$(basename "$SWF_SRC" .swf)"
echo ">> classname: $CLASSNAME"
echo ">> display:   $DISPLAY_NAME"
echo ">> page id:   $PAGE_ID"
echo ">> cost:      $COST credits"

NITRO_IMAGE="habbo-agent-platform-nitro:latest"
if ! docker image inspect "$NITRO_IMAGE" >/dev/null 2>&1; then
  echo "error: docker image $NITRO_IMAGE not found. Run 'docker compose build nitro' first." >&2
  exit 1
fi

# 1. Place SWF in converter input and in dcr/hof_furni (for full-pipeline re-runs).
mkdir -p nitro/nitro-converter/assets/swf/furniture nitro/nitro-swf/dcr/hof_furni nitro/nitro-swf/dcr/hof_furni/icons
cp "$SWF_SRC" "nitro/nitro-converter/assets/swf/furniture/${CLASSNAME}.swf"
cp "$SWF_SRC" "nitro/nitro-swf/dcr/hof_furni/${CLASSNAME}.swf"

# 2. Convert SWF -> .nitro
echo ">> converting SWF -> .nitro"
docker run --rm -v "$PWD/nitro:/app" -w /app/nitro-converter --entrypoint sh "$NITRO_IMAGE" -c "
  yarn install --silent 2>&1 | tail -2
  yarn build 2>&1 | tail -2
  node dist/Main.js --convert-swf 2>&1 | tail -3
" || { echo "convert-swf failed"; exit 1; }

BUNDLE="nitro/nitro-converter/assets/bundled/furniture/${CLASSNAME}.nitro"
if [[ ! -f "$BUNDLE" ]]; then
  echo "error: bundle not produced at $BUNDLE" >&2
  exit 1
fi

# 3. Deploy bundle
cp "$BUNDLE" "nitro/nitro-assets/bundled/furniture/${CLASSNAME}.nitro"
echo ">> deployed bundle ($(wc -c < "$BUNDLE" | tr -d ' ') bytes)"

# 4. Extract bundle, crop icon, save with padding
echo ">> extracting icon"
mkdir -p nitro/nitro-converter/assets/extract/furniture
cp "$BUNDLE" "nitro/nitro-converter/assets/extract/furniture/${CLASSNAME}.nitro"

docker run --rm -v "$PWD/nitro:/app" -w /app/nitro-converter --entrypoint sh "$NITRO_IMAGE" -c "
  node dist/Main.js --extract 2>&1 | tail -2
" || { echo "extract failed"; exit 1; }

EXTRACT_JSON="nitro/nitro-converter/assets/extracted/furniture/${CLASSNAME}/${CLASSNAME}.json"
EXTRACT_PNG="nitro/nitro-converter/assets/extracted/furniture/${CLASSNAME}/${CLASSNAME}.png"
ICON_OUT="nitro/nitro-swf/dcr/hof_furni/icons/${CLASSNAME}_icon.png"

if [[ -f "$EXTRACT_JSON" && -f "$EXTRACT_PNG" ]]; then
  python3 - "$EXTRACT_JSON" "$EXTRACT_PNG" "$ICON_OUT" "$CLASSNAME" <<'PY'
import json, sys
from PIL import Image
json_path, png_path, out_path, classname = sys.argv[1:]
data = json.load(open(json_path))
frames = data.get('spritesheet', {}).get('frames', {})
# Furnibuilder bundles use "<classname>_<classname>_icon_a" as the spritesheet key.
candidates = [k for k in frames if k.endswith(f"{classname}_icon_a") or k.endswith("_icon_a")]
if not candidates:
    print("  no icon sprite found in bundle, skipping icon")
    sys.exit(0)
frame = frames[candidates[0]]["frame"]
sheet = Image.open(png_path)
sprite = sheet.crop((frame["x"], frame["y"], frame["x"]+frame["w"], frame["y"]+frame["h"]))
bbox = sprite.getbbox()
trimmed = sprite.crop(bbox) if bbox else sprite
pad = 6
w, h = trimmed.width + pad*2, trimmed.height + pad*2
canvas = Image.new('RGBA', (w, h), (0,0,0,0))
canvas.paste(trimmed, (pad, pad))
canvas.save(out_path)
print(f"  icon saved: {w}x{h}")
PY
else
  echo "  no extracted png/json, skipping icon"
fi

# 5. Allocate furnidata id
FURNIDATA="nitro/nitro-swf/gamedata/furnidata.xml"
if grep -q "classname=\"${CLASSNAME}\"" "$FURNIDATA"; then
  echo ">> furnidata.xml already has $CLASSNAME, skipping insert"
else
  NEXT_ID=$(grep -oE 'id="[0-9]+"' "$FURNIDATA" | grep -oE '[0-9]+' | sort -n | tail -1)
  NEXT_ID=$((NEXT_ID + 1))
  echo ">> allocating furnidata id $NEXT_ID"

  # Escape display name for XML
  XML_NAME="$(printf '%s' "$DISPLAY_NAME" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')"
  ENTRY="<furnitype id=\"${NEXT_ID}\" classname=\"${CLASSNAME}\">
<revision>1</revision>
<category>trophy</category>
<defaultdir>0</defaultdir>
<xdim>1</xdim>
<ydim>1</ydim>
<partcolors><color>#ffffff</color></partcolors>
<name>${XML_NAME}</name>
<description>Custom furni, ingebracht via add-furni.sh.</description>
<adurl/>
<offerid>${NEXT_ID}</offerid>
<buyout>1</buyout>
<rentofferid>-1</rentofferid>
<rentbuyout>0</rentbuyout>
<bc>0</bc>
<excludeddynamic>0</excludeddynamic>
<customparams/>
<specialtype>1</specialtype>
<canstandon>0</canstandon>
<cansiton>0</cansiton>
<canlayon>0</canlayon>
<furniline>custom</furniline>
<environment/>
<rare>0</rare>
</furnitype>"
  # Insert before </roomitemtypes>
  python3 - "$FURNIDATA" "$ENTRY" <<'PY'
import sys
path, entry = sys.argv[1], sys.argv[2]
src = open(path).read()
marker = "</roomitemtypes>"
src = src.replace(marker, entry + "\n" + marker, 1)
open(path, "w").write(src)
PY
fi

# Re-fetch the id (whether we just inserted or it already existed)
ITEM_ID=$(grep -oE "<furnitype id=\"[0-9]+\" classname=\"${CLASSNAME}\"" "$FURNIDATA" | grep -oE '[0-9]+' | head -1)
echo ">> item id: $ITEM_ID"

# 6. productdata.txt
PRODUCTDATA="nitro/nitro-swf/gamedata/productdata.txt"
if grep -q "\"${CLASSNAME}\"" "$PRODUCTDATA"; then
  echo ">> productdata.txt already has $CLASSNAME, skipping"
else
  python3 - "$PRODUCTDATA" "$CLASSNAME" "$DISPLAY_NAME" <<'PY'
import sys
path, classname, name = sys.argv[1:]
s = open(path).read().rstrip()
assert s.endswith("]]"), "unexpected productdata format"
name_esc = name.replace('"', '\\"')
entry = f',["{classname}","{name_esc}","Custom furni."]'
s = s[:-1] + entry + "]"
open(path, "w").write(s)
PY
fi

# 7. Regenerate JSON gamedata
echo ">> regenerating gamedata JSON"
docker run --rm -v "$PWD/nitro:/app" -w /app/nitro-converter --entrypoint sh "$NITRO_IMAGE" -c "
  cp configuration.local.json configuration.json
  node dist/Main.js 2>&1 | tail -8
" || true

cp nitro/nitro-converter/assets/gamedata/FurnitureData.json nitro/nitro-assets/gamedata/FurnitureData.json
cp nitro/nitro-converter/assets/gamedata/ProductData.json   nitro/nitro-assets/gamedata/ProductData.json

# 8. Write SQL dump for redeploys
SQL_FILE="mysql/dumps/zz_custom_furni_${CLASSNAME}.sql"
cat > "$SQL_FILE" <<SQL
-- Custom furni: ${DISPLAY_NAME} (${CLASSNAME})
-- Auto-generated by scripts/add-furni.sh
USE \`arcturus\`;

INSERT IGNORE INTO \`items_base\`
  (\`id\`, \`sprite_id\`, \`public_name\`, \`item_name\`, \`type\`, \`width\`, \`length\`, \`stack_height\`,
   \`allow_stack\`, \`allow_sit\`, \`allow_lay\`, \`allow_walk\`, \`allow_gift\`, \`allow_trade\`,
   \`allow_recycle\`, \`allow_marketplace_sell\`, \`allow_inventory_stack\`,
   \`interaction_type\`, \`interaction_modes_count\`, \`vending_ids\`, \`multiheight\`, \`customparams\`,
   \`effect_id_male\`, \`effect_id_female\`, \`clothing_on_walk\`)
VALUES
  (${ITEM_ID}, ${ITEM_ID}, '${DISPLAY_NAME//\'/\'\'}', '${CLASSNAME}', 's', 1, 1, 1.00,
   1, 0, 0, 0, 1, 1, 0, 1, 1,
   'default', 1, '0', '0', '',
   0, 0, '');

INSERT IGNORE INTO \`catalog_items\`
  (\`item_ids\`, \`page_id\`, \`catalog_name\`, \`cost_credits\`, \`cost_points\`, \`points_type\`,
   \`amount\`, \`limited_stack\`, \`limited_sells\`, \`order_number\`, \`offer_id\`, \`song_id\`,
   \`extradata\`, \`have_offer\`, \`club_only\`)
VALUES
  ('${ITEM_ID}', ${PAGE_ID}, '${DISPLAY_NAME//\'/\'\'}', ${COST}, 0, 0,
   1, 0, 0, 99, ${ITEM_ID}, 0,
   '', '1', '0');
SQL
echo ">> wrote $SQL_FILE"

# 9. Apply SQL to live DB if container is running
if docker ps --format '{{.Names}}' | grep -q '^mysql$'; then
  echo ">> applying SQL to live mysql container"
  docker exec -i mysql mariadb -uroot -parcturus_root_pw arcturus < "$SQL_FILE"
  if docker ps --format '{{.Names}}' | grep -q '^arcturus$'; then
    echo ">> reloading arcturus catalog via RCON"
    # RCON command for Arcturus catalog reload
    {
      printf '{"key":"reloadcatalog","data":{}}\n'
    } | nc -w 2 127.0.0.1 3001 >/dev/null 2>&1 || echo "  RCON nc not available, restart arcturus to pick up changes"
  fi
else
  echo ">> mysql not running; SQL will run automatically on next fresh init"
fi

echo ""
echo "Done. Open the catalog at the configured page ($PAGE_ID) to see '$DISPLAY_NAME'."
