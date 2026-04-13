FROM node:20-alpine

WORKDIR /workspace

EXPOSE 4173

CMD ["sh", "-lc", "npm install && npm run dev --workspace @jump/web -- --host 0.0.0.0 --port 4173"]
