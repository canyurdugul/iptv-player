# ── Stage 1: Build ───────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer cache)
COPY package*.json ./
RUN npm ci

# Copy source and build.
# Override base to '/' so asset paths are root-relative (/assets/…).
# The vite.config.js base '/iptv-player/' is only needed for GitHub Pages.
COPY . .
RUN npm run build -- --base /

# ── Stage 2: Serve ───────────────────────────────────────────
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config (SPA routing + port 6687)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 6687

CMD ["nginx", "-g", "daemon off;"]
