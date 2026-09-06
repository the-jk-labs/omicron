# Backup sidecar: pg_dump + restic. Takes daily encrypted snapshots of the
# database, uploads, state and secrets — to a local volume by default, or to
# any S3-compatible backend (Cloudflare R2, AWS S3, MinIO, Backblaze B2, …)
# via BACKUP_REPOSITORY. No vendor SDKs involved, restic's format is open.
#
# Keep the postgresql client major in sync with the `postgres` service image.
FROM alpine:3
RUN apk add --no-cache restic postgresql16-client \
 && rm -rf /var/cache/apk/*
COPY db-env.sh backup entrypoint restore-from /usr/local/bin/
RUN chmod +x /usr/local/bin/db-env.sh /usr/local/bin/backup \
      /usr/local/bin/entrypoint /usr/local/bin/restore-from \
 && ln -sf backup /usr/local/bin/backup-now \
 && mkdir -p /backups /etc/backup
ENTRYPOINT ["entrypoint"]
