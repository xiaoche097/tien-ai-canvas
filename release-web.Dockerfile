FROM open-ai-canvas-web:v1.7.3.7-commerce-save
COPY web/dist /opt/canvas-release
COPY docker/canvas-web-entrypoint.sh /usr/local/bin/canvas-web-entrypoint
RUN chmod +x /usr/local/bin/canvas-web-entrypoint
