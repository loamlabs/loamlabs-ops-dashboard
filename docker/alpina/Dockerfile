# OPTIONAL. Not needed for the normal NAS setup (the compose file uses the plain node:22-slim image and downloads the job code when it starts).
# Use this only if you prefer to build an image: docker build -t alpina-stock docker/alpina   then run it with the same environment and /data volume.
FROM node:22-slim
ENV TZ=America/New_York
ENV REPO_REF=main
RUN apt-get update -qq && apt-get install -y -qq git ca-certificates tzdata && rm -rf /var/lib/apt/lists/*
COPY entrypoint.sh /job/entrypoint.sh
RUN sed -i 's/\r$//' /job/entrypoint.sh
WORKDIR /app
ENTRYPOINT ["bash", "/job/entrypoint.sh"]
