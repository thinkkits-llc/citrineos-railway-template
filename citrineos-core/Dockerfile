FROM node:24.4.1 AS build

WORKDIR /usr/local/apps/citrineos

ARG CITRINEOS_VERSION=main
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${CITRINEOS_VERSION} https://github.com/citrineos/citrineos-core.git .

RUN npm run install-all && npm run build

FROM node:24.4.1-slim

COPY --from=build /usr/local/apps/citrineos /usr/local/apps/citrineos
WORKDIR /usr/local/apps/citrineos

RUN chmod +x /usr/local/apps/citrineos/entrypoint.sh

EXPOSE 8080 8081 8082 8083 8443 8444

ENTRYPOINT ["/usr/local/apps/citrineos/entrypoint.sh"]
