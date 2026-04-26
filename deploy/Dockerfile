FROM caddy:2.7-alpine

WORKDIR /srv

# Static front-end + WASM build artifacts.
COPY crawl-ref/source/index.html        ./
COPY crawl-ref/source/ascii.html        ./
COPY crawl-ref/source/tiles.html        ./
COPY crawl-ref/source/index_tiles.html  ./
COPY crawl-ref/source/vkb.js            ./
COPY crawl-ref/source/vkb.css           ./
COPY crawl-ref/source/crawl.js          ./
COPY crawl-ref/source/crawl.wasm        ./
COPY crawl-ref/source/crawl.data        ./
COPY crawl-ref/source/crawl_tiles.js    ./
COPY crawl-ref/source/crawl_tiles.wasm  ./
COPY crawl-ref/source/crawl_tiles.data  ./

# Pre-compress the heavy bundles. -k keeps the originals so Caddy can
# fall back to them when a client doesn't send Accept-Encoding: gzip.
RUN gzip -9 -k crawl.js crawl.wasm crawl.data \
                crawl_tiles.js crawl_tiles.wasm crawl_tiles.data

COPY deploy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
