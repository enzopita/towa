# syntax=docker/dockerfile:1

# ---- build: compile the bot into a single binary (Bun runtime + code + native libs) ----
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
# ffmpeg-static is an optional prism-media dependency; the bot never plays audio.
RUN bun build src/index.ts --compile --minify --sourcemap -e ffmpeg-static --outfile /app/bot

# ---- runtime: just alpine + the binary ----
FROM alpine:3
RUN apk add --no-cache libstdc++ libgcc \
 && adduser -D -H -u 1000 bot \
 && mkdir -p /app/data && chown bot:bot /app/data
WORKDIR /app
ENV NODE_ENV=production \
    DATABASE_PATH=/app/data/bot.sqlite
COPY --from=build /app/bot ./bot
USER bot
VOLUME ["/app/data"]
CMD ["./bot"]
