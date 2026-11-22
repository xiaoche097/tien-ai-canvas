FROM nginx:1.27-alpine
COPY docker/canvas-web-entrypoint.sh /usr/local/bin/canvas-web-entrypoint
RUN chmod +x /usr/local/bin/canvas-web-entrypoint && sh -n /usr/local/bin/canvas-web-entrypoint
