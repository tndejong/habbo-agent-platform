#!/bin/bash

set -e

supervisord -c /app/supervisor/supervisord.conf

cp /app/configuration/nitro-converter/configuration.json /app/nitro-converter/configuration.json
cd /app/nitro-converter
yarn install

# Use a converted file that is guaranteed to exist after successful extraction.
ASSET_MARKER="/app/nitro-assets/gamedata/ExternalTexts.json"

if [ "${NITRO_AUTO_EXTRACT_ASSETS:-true}" = "true" ] && [ ! -f "$ASSET_MARKER" ]; then
  echo "Nitro assets not found, converting assets from SWF (first run can take a while)..."

  # Converter reads SWF/gamedata from the local SWF server on :8081.
  supervisorctl start swf-http-server
  until wget -qO- http://127.0.0.1:8081/ >/dev/null 2>&1; do
    sleep 1
  done

  yarn build
  node ./dist/Main.js

  if [ ! -d /app/nitro-converter/assets ]; then
    echo "Nitro converter did not produce /app/nitro-converter/assets"
    exit 1
  fi

  echo "Syncing converted assets into /app/nitro-assets..."
  rsync -r /app/nitro-converter/assets/ /app/nitro-assets/
fi

cp /app/configuration/nitro-react/public/* /app/nitro-react/public/
cd /app/nitro-react
yarn install

# Always regenerate renderer-config.json from environment variables.
node <<'NODE'
const fs = require('fs');
const p = '/app/nitro-react/public/renderer-config.json';
const c = JSON.parse(fs.readFileSync(p, 'utf8'));

const assetsHost = process.env.HABBO_ASSETS_PUBLIC_HOST || process.env.HABBO_PUBLIC_HOST || '127.0.0.1';
const assetsPort = process.env.HABBO_ASSETS_PUBLIC_PORT || '8080';
const assetUrl = assetsPort === '443'
  ? `https://${assetsHost}`
  : `http://${assetsHost}:${assetsPort}`;

// SWF server (port 8081) serves c_images and hof_furni.
// Set HABBO_SWF_PUBLIC_HOST to your Cloudflare tunnel hostname and
// HABBO_SWF_PUBLIC_PORT to 443 to get https://{host} with no port suffix.
const swfHost = process.env.HABBO_SWF_PUBLIC_HOST || assetsHost;
const swfPort = process.env.HABBO_SWF_PUBLIC_PORT || '8081';
const swfBase = swfPort === '443'
  ? `https://${swfHost}`
  : `http://${swfHost}:${swfPort}`;

const wsHost = process.env.HABBO_WS_PUBLIC_HOST || '127.0.0.1';
const wsPort = process.env.HABBO_WS_PUBLIC_PORT || '2096';
const wsProto = process.env.HABBO_WS_PUBLIC_PROTOCOL || (wsPort === '443' ? 'wss' : 'ws');
const defaultWsPort = wsProto === 'wss' ? '443' : '80';
const wsPortSuffix = wsPort === defaultWsPort ? '' : `:${wsPort}`;

c['asset.url'] = assetUrl;
c['socket.url'] = `${wsProto}://${wsHost}${wsPortSuffix}`;
c['image.library.url'] = `${swfBase}/c_images/`;
c['hof.furni.url'] = `${swfBase}/dcr/hof_furni`;

fs.writeFileSync(p, JSON.stringify(c, null, 4));
NODE

# Some Nitro builds reference this file unconditionally during bootstrap.
if [ ! -f /app/nitro-assets/gamedata/ExternalTextsOverride.json ]; then
  echo "{}" > /app/nitro-assets/gamedata/ExternalTextsOverride.json
fi

# Backward/legacy compatibility for variants seen in some Nitro bundles.
if [ ! -f /app/nitro-assets/gamedata/Exter_exts_override.json ]; then
  echo "{}" > /app/nitro-assets/gamedata/Exter_exts_override.json
fi

# Always expose SWF/c_images endpoints on :8081, even when asset conversion is skipped.
supervisorctl start swf-http-server || true
supervisorctl start assets-http-server
supervisorctl start nitro-dev-server

tail -f /dev/null