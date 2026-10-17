FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY viewer/package*.json ./viewer/
RUN npm ci
FROM deps AS build
COPY . .
RUN npm run build
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /app ./
RUN mkdir -p /app/storage && chown app:app /app/storage
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]
