ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache \
    bash \
    git \
    jq \
    yq \
    curl \
    ca-certificates \
    openssh-client

COPY rootfs /
RUN chmod +x /app/run.sh /app/mirror.sh

CMD ["/app/run.sh"]
