FROM rust:1.95 AS build
WORKDIR /app
COPY . .
RUN cargo build --release

FROM rust:1.95-slim
COPY --from=build /app/target/release/functionapp /usr/local/bin/functionapp
USER 65534

# ponytail: keep-alive placeholder — replace when functionapp becomes a long-running service
CMD ["sh", "-c", "functionapp && tail -f /dev/null"]
