# STATIC live edge — the always-on debate channel (SSE + audio).
# Build context MUST be the repo root (it needs the whole pnpm workspace).
#   docker build -f apps/edge/Dockerfile -t static-edge .
# On Railway/Render: set Dockerfile path = apps/edge/Dockerfile, root = repo root.
FROM node:24-slim

# ffmpeg gives us ffprobe for real audio durations (optional but improves timing).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# Copy the whole monorepo (workspace deps are source, not published packages).
COPY . .
RUN pnpm install --no-frozen-lockfile

# The host injects PORT; the server reads it. Set STATIC_EDGE_PUBLIC_URL to the
# public origin so audio clip URLs are absolute, and STATIC_MODE/MINIMAX_API_KEY
# for a real (non-mock) broadcast.
ENV NODE_ENV=production
EXPOSE 8787
# `-s` (silent) stops pnpm from echoing `$ tsx src/server.ts` to STDERR, which
# Railway otherwise flags red as a false "error" on every deploy. The server's
# own startup logs go to stdout and show normally.
CMD ["pnpm", "-s", "--filter", "@static/edge", "start"]
