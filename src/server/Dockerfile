# Build from the repository root: docker build -f src/server/Dockerfile .
FROM node:24.13.0-bookworm-slim AS build

WORKDIR /build
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.28.2

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs ./
COPY src/server/package.json ./src/server/package.json
COPY src/core/package.json ./src/core/package.json
COPY src/contracts/package.json ./src/contracts/package.json
COPY src/server/src ./src/server/src
COPY src/server/sbin ./src/server/sbin
COPY src/core/src ./src/core/src
COPY src/contracts/src ./src/contracts/src

# Compile native SQLite against the same Node/OS used by the runtime.
ENV npm_config_build_from_source=true
RUN pnpm install --frozen-lockfile --prod --filter @signalpost/server... \
    && pnpm --filter @signalpost/server deploy --prod --legacy /opt/signalpost \
    && node src/server/sbin/finalize-runtime.mjs /opt/signalpost

FROM node:24.13.0-bookworm-slim AS runtime

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates msmtp \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -o 1000 -g 1000 -m 0700 /var/lib/signalpost \
    && touch /var/lib/signalpost/.volume-initialized \
    && chown 1000:1000 /var/lib/signalpost/.volume-initialized

WORKDIR /opt/signalpost
COPY --from=build /opt/signalpost ./
COPY --chmod=0755 src/server/sbin/container-entrypoint.sh src/server/sbin/msmtp-config.sh src/server/sbin/sendmail.sh /usr/local/libexec/signalpost/

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIRECTORY=/var/lib/signalpost \
    SENDMAIL_PATH=/usr/local/libexec/signalpost/sendmail.sh

USER 1000:1000
VOLUME ["/var/lib/signalpost"]
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/healthz', {signal: AbortSignal.timeout(2000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
ENTRYPOINT ["/usr/local/libexec/signalpost/container-entrypoint.sh"]
CMD ["node", "--import", "tsx", "src/main.ts"]
