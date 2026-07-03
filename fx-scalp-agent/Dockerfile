FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
ENV FX_TICK_MS=1000
CMD ["node", "worker/index.js"]
