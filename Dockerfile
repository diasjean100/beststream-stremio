FROM node:24-bookworm-slim
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright NODE_OPTIONS=--max-old-space-size=192
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=optional --ignore-scripts && npx playwright install --with-deps chromium && chmod -R a+rX /ms-playwright
COPY --chown=node:node . .
RUN npm test && npm run check
USER node
EXPOSE 7000
CMD ["node", "src/server.js"]
