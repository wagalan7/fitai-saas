FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json apps/web/
RUN npm install --workspace=@fitness/web
COPY apps/web apps/web
RUN npm run build --workspace=@fitness/web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/package.json .
EXPOSE 3000
CMD ["npx", "next", "start"]
