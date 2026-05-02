FROM node:22 AS build

WORKDIR /usr/local/apps/citrineos-ocpi

ARG CITRINEOS_OCPI_VERSION=main
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${CITRINEOS_OCPI_VERSION} https://github.com/citrineos/citrineos-ocpi.git .

RUN cp ./Server/tsconfig.docker.json ./Server/tsconfig.json
RUN npm run install-all && npm run build

FROM node:22-alpine
COPY --from=build /usr/local/apps/citrineos-ocpi /usr/local/apps/citrineos-ocpi
WORKDIR /usr/local/apps/citrineos-ocpi

EXPOSE 8085

CMD ["npm", "run", "start-docker-cloud"]
