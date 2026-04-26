#!/bin/bash
# ============================================================================
# backup-cron.sh - Backup quotidien Postgres GifStudio-X
#
# A executer en cron tous les jours a 3h du matin :
#   sudo crontab -e
#   0 3 * * * /var/www/gifstudio-x/scripts/backup-cron.sh
#
# Garde les 7 derniers jours de backups.
# ============================================================================

set -e

BACKUP_DIR="/var/backups/gifstudio-x"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/gifstudio_x-$TIMESTAMP.sql.gz"

# Creer le dossier si pas existant
mkdir -p "$BACKUP_DIR"

# pg_dump via le conteneur (utilise les credentials Docker)
docker exec gifstudio-x-postgres pg_dump -U gifstudio_x gifstudio_x | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Backup OK : $BACKUP_FILE ($SIZE)" >> "$BACKUP_DIR/backup.log"
else
    echo "[$(date)] Backup ECHEC : $BACKUP_FILE" >> "$BACKUP_DIR/backup.log"
    exit 1
fi

# Suppression des backups > RETENTION_DAYS jours
find "$BACKUP_DIR" -name 'gifstudio_x-*.sql.gz' -mtime +$RETENTION_DAYS -delete

# Storage backup hebdomadaire (lundi seulement)
if [ "$(date +%u)" = "1" ]; then
    STORAGE_BACKUP="$BACKUP_DIR/storage-$TIMESTAMP.tar.gz"
    tar czf "$STORAGE_BACKUP" -C /var/www/gifstudio-x storage 2>/dev/null
    if [ -s "$STORAGE_BACKUP" ]; then
        SIZE=$(du -h "$STORAGE_BACKUP" | cut -f1)
        echo "[$(date)] Storage backup OK : $STORAGE_BACKUP ($SIZE)" >> "$BACKUP_DIR/backup.log"
    fi
    # Garde 4 semaines de storage
    find "$BACKUP_DIR" -name 'storage-*.tar.gz' -mtime +28 -delete
fi
