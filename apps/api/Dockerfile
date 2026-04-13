FROM node:20-alpine

WORKDIR /workspace

EXPOSE 4100

CMD ["sh", "-lc", "npm install && npm run prisma:generate --workspace @jump/api && npm run dev --workspace @jump/api"]
