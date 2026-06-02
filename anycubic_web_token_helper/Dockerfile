FROM ghcr.io/home-assistant/base:latest

RUN apk add --no-cache python3 py3-pip

WORKDIR /app

RUN pip3 install --break-system-packages flask

COPY app.py /app/app.py
COPY run.sh /run.sh

RUN chmod +x /run.sh

CMD ["/run.sh"]
