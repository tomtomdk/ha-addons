ARG BUILD_VERSION
ARG BUILD_ARCH
FROM ghcr.io/home-assistant/base:latest

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    fontconfig \
    ttf-dejavu

WORKDIR /app

COPY app/package*.json ./
RUN npm install --omit=dev \
    && npm cache clean --force

COPY app/src ./src
COPY app/views ./views
COPY app/public ./public
COPY rootfs /

RUN chmod a+x /etc/services.d/invoice-portal/run

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000
