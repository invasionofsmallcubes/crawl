FROM caddy:2.7-alpine

WORKDIR /srv

# Static front-end + WASM build artifacts.
COPY crawl-ref/source/index.html             ./
COPY crawl-ref/source/ascii.html             ./
COPY crawl-ref/source/tiles.html             ./
COPY crawl-ref/source/index_tiles.html       ./
COPY crawl-ref/source/vkb.js                 ./
COPY crawl-ref/source/vkb.css                ./
COPY crawl-ref/source/manifest.webmanifest   ./
COPY crawl-ref/source/sw.js                  ./
COPY crawl-ref/source/icon.svg               ./
COPY crawl-ref/source/icon-maskable.svg      ./
COPY crawl-ref/source/apple-touch-icon.png   ./
COPY crawl-ref/source/icon-192.png           ./
COPY crawl-ref/source/icon-512.png           ./
COPY crawl-ref/source/icon-maskable-512.png  ./
COPY crawl-ref/source/vendor/                ./vendor/
COPY crawl-ref/source/crawl.js               ./
COPY crawl-ref/source/crawl.wasm             ./
COPY crawl-ref/source/crawl.data             ./
COPY crawl-ref/source/crawl_tiles.js         ./
COPY crawl-ref/source/crawl_tiles.wasm       ./
COPY crawl-ref/source/crawl_tiles.data       ./

# Pre-compress the heavy bundles. -k keeps the originals so Caddy can
# fall back to them when a client doesn't send Accept-Encoding: gzip.
RUN gzip -9 -k crawl.js crawl.wasm crawl.data \
                crawl_tiles.js crawl_tiles.wasm crawl_tiles.data

# Stamp a unique deploy version into sw.js. The placeholder
# __DEPLOY_VERSION__ in sw.js is replaced at build time so every deploy
# invalidates the previous cache; without this, multiple deploys on the
# same day shared a cache key and iOS kept serving the older bundle.
# Done after the gzip layer so changing the timestamp alone doesn't
# invalidate the (much heavier) wasm-gzip cache.
#
# IMPORTANT: ALWAYS deploy with `--build-arg DEPLOY_VERSION=v$(date -u +%Y%m%dT%H%M%S)`.
# BuildKit's content-aware cache hashes this RUN step on its inputs (sw.js
# bytes + the literal command string). When sw.js content is unchanged
# between deploys the cached layer is reused — including the date that was
# computed during the previous build — and the SW version sticks. Passing
# an explicit build arg makes the ARG value part of the cache key, so each
# deploy gets a fresh version regardless of which source files changed.
# The $(date) fallback exists for ad-hoc local builds; on remote builders
# it is unreliable for the reason above.
ARG DEPLOY_VERSION
RUN sed -i "s/__DEPLOY_VERSION__/${DEPLOY_VERSION:-$(date -u +v%Y%m%dT%H%M%S)}/" sw.js

COPY deploy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
