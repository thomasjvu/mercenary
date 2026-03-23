FROM node:20-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json ./
COPY bin/ ./bin/
COPY src/ ./src/

ENV NODE_ENV=production

CMD ["node_modules/.bin/tsx", "src/seller/runtime/seller.ts"]
