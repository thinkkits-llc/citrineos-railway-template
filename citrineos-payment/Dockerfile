FROM node:20 AS frontend-builder

WORKDIR /app

ARG CITRINEOS_PAYMENT_VERSION=main
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${CITRINEOS_PAYMENT_VERSION} https://github.com/citrineos/citrineos-payment.git .

WORKDIR /app/frontend
RUN npm install && npm run build

FROM python:3.10-slim

WORKDIR /app

ARG CITRINEOS_PAYMENT_VERSION=main
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${CITRINEOS_PAYMENT_VERSION} https://github.com/citrineos/citrineos-payment.git /app/source

WORKDIR /app/source
COPY env.template .env
RUN pip install --no-cache-dir --upgrade -r requirements.txt

RUN rm -rf ./frontend/build
COPY --from=frontend-builder /app/frontend/build ./frontend/build

EXPOSE 9010

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9010"]
