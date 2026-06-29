---
description: Add a custom furni from a SWF (e.g. Furnibuilder) to the hotel catalog. Args: <swf-path> "<display-name>" [page_id] [cost_credits]
argument-hint: <swf-path> \"<display-name>\" [page_id] [cost_credits]
---

You are adding a custom furni to the hotel from a SWF file.

Arguments passed by the user: $ARGUMENTS

## Steps

1. Parse the arguments. Expected order:
   - `swf_path` (required, absolute or relative path to a .swf)
   - `display_name` (required, in quotes if it has spaces)
   - `page_id` (optional, default 217 = Sports; common: 217 Sports, 225 Trophies engravable, 737 Non-Writable Trophies)
   - `cost_credits` (optional, default 5)

2. If anything required is missing, ask the user via AskUserQuestion. Do not guess display names.

3. Run the helper script:
   ```
   scripts/add-furni.sh <swf_path> "<display_name>" <page_id> <cost_credits>
   ```
   It handles SWF placement, conversion, icon extraction with padding, furnidata.xml, productdata.txt, JSON regeneration, the SQL dump in mysql/dumps/, and a live DB insert + catalog reload if the stack is running.

4. After it finishes, report:
   - The allocated item id
   - The catalog page the item was placed on
   - Whether it was applied to the live DB (mysql running) or only persisted to mysql/dumps/ (will run on next fresh init)
   - The browser URL to test: `http://127.0.0.1:1080`

5. If the script errors:
   - SWF without `<classname>_icon_a` sprite: warn user, no icon will show, but the furni still works.
   - Bundle conversion fails: the SWF probably doesn't follow Habbo's classname convention. Suggest re-exporting from Furnibuilder, or renaming the SWF to match the internal classname.
   - DB connection error: confirm `docker compose up -d mysql arcturus` is running.

## Notes

- The script is idempotent. Re-running with the same SWF skips already-applied changes.
- Files committed to git keep the furni alive across redeploys: the .nitro bundle, gamedata XMLs/JSONs, the icon PNG, the SWF in dcr/hof_furni, and the SQL in mysql/dumps/.
- Do NOT manually edit furnidata.xml or productdata.txt for items added via this skill — re-run the script if you need to change the entry.
