# ==========================================
# Stage 1: Build Nuxt 3 SPA application
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency specifications
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy application source code
COPY . .

# Build application
RUN pnpm build

# ==========================================
# Stage 2: Minimal Production Runtime
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
ENV PORT=3000

# Copy standalone output from builder stage
COPY --from=builder /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
