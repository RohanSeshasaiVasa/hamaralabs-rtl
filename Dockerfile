# # 1. Use official Node.js image as base
# FROM node:18-alpine AS deps

# # 2. Set working directory
# WORKDIR /app

# # 3. Install dependencies first (only package.json + lock files)
# COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./

# # 4. Install dependencies (choose npm/pnpm/yarn depending on your project)
# RUN npm install

# # 5. Copy all project files
# COPY . .

# # 6. Build the project
# RUN npm run build

# # 7. Production image
# FROM node:18-alpine AS runner

# # 8. Set working directory
# WORKDIR /app

# # 9. Copy built output from previous stage

# COPY --from=deps /app/.next ./.next
# COPY --from=deps /app/node_modules ./node_modules
# COPY --from=deps /app/public ./public
# COPY --from=deps /app/package.json ./package.json
# COPY --from=deps /app/tsconfig.json ./tsconfig.json

# # 10. Set environment variable to production
# ENV NODE_ENV production

# # 11. Expose port (default Next.js port is 3000)
# EXPOSE 3000

# # 12. Start Next.js app
# CMD ["sh", "-c", "npm start"]

# 1. Use official Node.js image as base
FROM node:22-alpine AS deps

# 2. Set working directory
WORKDIR /app

# 3. Install dependencies first (only package.json + lock files)
COPY package.json package-lock.json* ./

# 4. Install dependencies using npm ci
RUN npm ci

# 5. Copy all project files
COPY . .

# 6. Build the project
RUN npm run build

# 7. Production image
FROM node:22-alpine AS runner

# 8. Set working directory
WORKDIR /app

# 9. Create a non-root user
RUN addgroup -S appuser && adduser -S appuser -G appuser

# 10. Copy built output from previous stage
COPY --from=deps --chown=appuser:appuser /app/.next ./.next
COPY --from=deps --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=deps --chown=appuser:appuser /app/public ./public
COPY --from=deps --chown=appuser:appuser /app/package.json ./package.json
COPY --from=deps --chown=appuser:appuser /app/tsconfig.json ./tsconfig.json

# 11. Set environment variable to production
ENV NODE_ENV production

# 12. Switch to the non-root user
USER appuser

# 13. Expose port (default Next.js port is 3000)
EXPOSE 3000

# 14. Start Next.js app
CMD ["npm", "start"]