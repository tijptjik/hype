FROM docker.io/library/rust:1.99.1-slim-bookworm AS build
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM docker.io/library/debian:bookworm-slim
COPY --from=build /build/target/release/whatsapp-relay /usr/local/bin/whatsapp-relay
USER 65532:65532
ENV WHATSOVER_RELAY_LISTEN=0.0.0.0:8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/whatsapp-relay"]
