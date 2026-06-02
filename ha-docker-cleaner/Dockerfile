FROM ghcr.io/home-assistant/base:latest

RUN apk add --no-cache \
    bash \
    curl \
    docker-cli \
    jq \
    tzdata

COPY run.sh /run.sh

RUN chmod +x /run.sh

CMD ["/run.sh"]