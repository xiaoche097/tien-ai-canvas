FROM open-ai-canvas-web:v1.8.1-custom
COPY web/dist /opt/canvas-release
COPY docker/canvas-web-entrypoint.sh /usr/local/bin/canvas-web-entrypoint
RUN chmod +x /usr/local/bin/canvas-web-entrypoint
