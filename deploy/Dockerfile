FROM caddy:2.7-alpine

WORKDIR /srv

# Static front-end + WASM build artifacts.
COPY crawl-ref/source/index.html             ./
COPY crawl-ref/source/ascii.html             ./
COPY crawl-ref/source/tiles.html             ./
COPY crawl-ref/source/index_tiles.html       ./
COPY crawl-ref/source/vkb.js                 ./
COPY crawl-ref/source/vkb.css                ./
COPY crawl-ref/source/version-check.js       ./
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

# Stamp a unique deploy version into the HTML pages and emit a sibling
# /version.txt that version-check.js polls. When a new deploy ships,
# already-loaded tabs detect the mismatch (their <meta dcss-version>
# vs. the freshly-served /version.txt) and surface a "Reload" banner.
#
# DEPLOY_VERSION is supplied by the build environment when present,
# otherwise we fall back to the current UTC timestamp. IMPORTANT for
# reliable cache busting on Depot's BuildKit cache: pass an explicit
# value at deploy time —
#   flyctl deploy --build-arg DEPLOY_VERSION=v$(date -u +%Y%m%dT%H%M%S)
# Without it, BuildKit hashes this RUN step on its inputs (HTML bytes
# unchanged across a content-only deploy) and reuses the cached layer
# with a stale timestamp, defeating the version check.
ARG DEPLOY_VERSION
RUN VERSION="${DEPLOY_VERSION:-$(date -u +v%Y%m%dT%H%M%S)}" && \
    echo "$VERSION" > version.txt && \
    sed -i "s/__DEPLOY_VERSION__/$VERSION/g" \
        index.html ascii.html tiles.html index_tiles.html

COPY deploy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
