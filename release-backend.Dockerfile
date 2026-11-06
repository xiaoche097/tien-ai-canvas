FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS payment-package-build
RUN apk add --no-cache nodejs unzip zip
WORKDIR /src
COPY backend ./backend
COPY plugin-packages ./plugin-packages
ARG TARGETOS
ARG TARGETARCH
RUN --mount=type=cache,target=/root/.cache/go-build PAYMENT_PLUGIN_CGO_ENABLED=0 ./plugin-packages/build-packages.sh
RUN sh ./plugin-packages/verify-payment-packages.sh "$TARGETOS" "$TARGETARCH"

FROM golang:1.25-alpine AS check
RUN apk add --no-cache build-base ffmpeg nodejs
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
COPY backend/third_party ./third_party
RUN go mod download
COPY backend ./
COPY VERSION /src/VERSION
COPY docker-compose*.yml /src/
COPY --from=payment-package-build /src/plugin-packages /src/plugin-packages
COPY yingce-agent /src/yingce-agent
COPY scripts /src/scripts
COPY --from=open-ai-canvas-backend:v1.7.3.7-commerce-save /app/backend/agent-runtime/pi/node_modules /src/backend/agent-runtime/pi/node_modules
ENV GOMAXPROCS=2 GOFLAGS=-p=2
RUN --mount=type=cache,target=/root/.cache/go-build go test ./internal/database ./internal/astravia ./internal/hostupdate
RUN --mount=type=cache,target=/root/.cache/go-build go test ./internal/app ./internal/auth ./internal/protocol ./internal/agent/yingceagent -run 'CloudAgentRuntimeCompletes|CloudAgentRuntimeApprovalWrite|CloudAgentLive(Recall|Retries|DoesNot)|ImageOnlyDetail|MetasoCatalog|LinuxDORegistrationAgreement|OfficialTextProtocolsMapImages|OfficialNativeTextProtocolsPreserveHistory|RemoteRunCallsBridge' -count=1
RUN --mount=type=cache,target=/root/.cache/go-build go test ./internal/app -run '^TestCloudAgentMediaFailedTaskUpdatesNode$' -count=25
ARG VERIFY_FULL_SUITE=true
RUN --mount=type=cache,target=/root/.cache/go-build if [ "$VERIFY_FULL_SUITE" = "true" ]; then go test ./... -count=1; else printf '%s\n' 'Full suite runs in the separate release verification build'; fi
RUN --mount=type=cache,target=/root/.cache/go-build CGO_ENABLED=1 go build -trimpath -ldflags='-s -w -X yingce/backend/internal/buildinfo.Version=v1.8.0 -X yingce/backend/internal/buildinfo.Commit=2fe3ca13c27e46a786af6597938a0e5328df6723' -o /out/yingce-backend ./cmd/server
RUN --mount=type=cache,target=/root/.cache/go-build CGO_ENABLED=1 go build -trimpath -ldflags='-s -w -X yingce/backend/internal/buildinfo.Version=v1.8.0 -X yingce/backend/internal/buildinfo.Commit=2fe3ca13c27e46a786af6597938a0e5328df6723' -o /out/migrate-schema ./cmd/migrate-schema
FROM open-ai-canvas-backend:v1.7.3.7-commerce-save
COPY --from=check /out/yingce-backend /usr/local/bin/yingce-backend
COPY --from=check /out/migrate-schema /usr/local/bin/migrate-schema
COPY backend/agent-runtime/pi /app/backend/agent-runtime/pi
COPY --from=payment-package-build /src/plugin-packages /app/plugin-packages

