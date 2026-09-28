# nginx serving a page built at container start from /atlas/templates and
# /atlas/assets. Mount your own over them and restart to rebuild; the baked-in
# copies are the example page.
FROM nginx:alpine
RUN apk add --no-cache python3
COPY bin /atlas/bin
COPY templates /atlas/templates
COPY assets /atlas/assets
# nginx's entrypoint runs executable /docker-entrypoint.d/*.sh before starting
# and stops the container when one fails, so a broken template shows in logs.
COPY --chmod=755 docker-entry.sh /docker-entrypoint.d/40-atlas-build.sh
