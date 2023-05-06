FROM node:18.4.0-alpine AS builder

RUN apk --no-cache add git python3 make g++ pkgconfig \
    build-base \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Run build process as a regular user in case of npm pre-hooks that aren't executed while running as root
USER node
WORKDIR /opt/mx-puppet-vk

COPY --chown=node:node package.json .
COPY --chown=node:node package-lock.json .

RUN npm install

COPY tsconfig.json .
COPY src/ ./src/
RUN npm run build


FROM node:18.4.0-alpine

ENV CONFIG_PATH=/data/config.yaml \
    REGISTRATION_PATH=/data/vk-registration.yaml \
    USER=node \
    GROUP=node

RUN apk add --no-cache su-exec \
    cairo \
    jpeg \
    pango \
    musl \
    giflib \
    pixman \
    pangomm \
    libjpeg-turbo \
    freetype


WORKDIR /opt/mx-puppet-vk
COPY docker-run.sh ./
# Used by docker-run.sh
COPY sample.config.yaml ./
COPY --from=builder /opt/mx-puppet-vk/node_modules/ ./node_modules/
COPY --from=builder /opt/mx-puppet-vk/build/ ./build/

# change workdir to /data so relative paths in the config.yaml
# point to the persisten volume
WORKDIR /data
VOLUME /data
ENTRYPOINT ["/opt/mx-puppet-vk/docker-run.sh"]
