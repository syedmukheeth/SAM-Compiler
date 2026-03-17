FROM node:20-alpine

RUN addgroup -g 1000 sandbox && adduser -D -u 1000 -G sandbox sandbox

WORKDIR /workspace
USER 1000:1000

