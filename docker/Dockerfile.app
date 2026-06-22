# Local Canvas — production Docker image
# Usage: docker compose up
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm install --no-fund --no-audit --omit=dev

# Copy source
COPY src/ src/
COPY renderer/dist/ public/ 2>/dev/null || echo "No pre-built frontend — run 'cd renderer && npm run build' first"

# Runtime data directory
RUN mkdir -p /root/.localcanvas /app/models /app/output

EXPOSE 3001

ENV PORT=3001 \
    HOST=0.0.0.0 \
    LC_DISABLE_AUTH=1

CMD ["node", "src/index.js"]
