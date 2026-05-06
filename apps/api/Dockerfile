FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY packages/database/package*.json packages/database/
RUN npm install --workspace=@fitness/api --workspace=@fitness/database
COPY packages/database packages/database
RUN npm run db:generate --workspace=@fitness/database
COPY apps/api apps/api
RUN npm run build --workspace=@fitness/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json .
EXPOSE 4000
CMD ["node", "dist/main"]
