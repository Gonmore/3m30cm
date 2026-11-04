FROM node:20-alpine

WORKDIR /workspace

# Copy root tsconfig base (referenced by apps/web-athlete/tsconfig.json)
COPY tsconfig.base.json ./tsconfig.base.json

# Copy web-athlete files
COPY apps/web-athlete/package.json ./apps/web-athlete/package.json
COPY apps/web-athlete/vite.config.ts ./apps/web-athlete/vite.config.ts
COPY apps/web-athlete/index.html ./apps/web-athlete/index.html
COPY apps/web-athlete/tsconfig.json ./apps/web-athlete/tsconfig.json

RUN cd apps/web-athlete && npm install

COPY apps/web-athlete/src ./apps/web-athlete/src

WORKDIR /workspace/apps/web-athlete
EXPOSE 4174

CMD ["sh", "-lc", "npm run dev -- --host 0.0.0.0 --port 4174"]
