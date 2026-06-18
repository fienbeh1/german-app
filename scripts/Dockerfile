FROM node:20-bookworm

RUN apt-get update && apt-get install -y \
    postgresql-client \
    tesseract-ocr \
    poppler-utils \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY backend backend/
COPY frontend-react frontend-react/

COPY Deutsch\ als\ Fremdsprache Deutsch\ als\ Fremdsprache/

ENV PORT=3456
EXPOSE 3456

CMD ["node", "backend/server2.js"]