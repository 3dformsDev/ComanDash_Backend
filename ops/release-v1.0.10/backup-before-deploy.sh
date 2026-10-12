#!/usr/bin/env bash
# Eduard ejecuta manualmente MAÑANA, tras confirmar DB, contenedores y ventana.
# No deploy, migraciones, reinicios, SQL de escritura ni eliminaciones.
set -euo pipefail
umask 077

if [[ $# -ne 2 ]]; then
  echo 'Uso: bash backup-before-deploy.sh DIRECTORIO_ABSOLUTO_NUEVO BASE_PRODUCTIVA'
  exit 1
fi
task_backup_dir=$1
task_database=$2
[[ "$task_backup_dir" = /* && "$task_backup_dir" != / && ! -e "$task_backup_dir" ]] || {
  echo 'El directorio debe ser absoluto, nuevo y distinto de /.'; exit 1;
}
[[ "$task_database" =~ ^[a-zA-Z0-9_]+$ ]] || { echo 'Revisar el nombre de la base.'; exit 1; }
command -v docker >/dev/null
command -v sha256sum >/dev/null
command -v gzip >/dev/null

# Parent directory must already exist; no recursive deletion or overwriting.
mkdir -m 700 -- "$task_backup_dir"
trap 'echo "Respaldo incompleto: detener despliegue y conservar archivos para revisar." >&2' ERR
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' > "$task_backup_dir/containers.txt"
docker inspect --format '{{.Name}} {{.Config.Image}} {{.Image}}' \
  comandash_backend comandash_frontend comandash_mariadb comandash_redis > "$task_backup_dir/images.txt"
docker inspect --format '{{.Name}} {{json .Mounts}}' \
  comandash_backend comandash_frontend comandash_mariadb > "$task_backup_dir/mounts.txt"

# Credentials stay inside the database container; no values enter terminal history.
docker exec --env COMANDASH_BACKUP_DB="$task_database" comandash_mariadb sh -ec '
  if [ -n "${MARIADB_ROOT_PASSWORD:-}" ]; then
    export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"
  elif [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
    export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  elif [ -n "${MARIADB_ROOT_PASSWORD_FILE:-}" ]; then
    MYSQL_PWD=$(cat "$MARIADB_ROOT_PASSWORD_FILE"); export MYSQL_PWD
  elif [ -n "${MYSQL_ROOT_PASSWORD_FILE:-}" ]; then
    MYSQL_PWD=$(cat "$MYSQL_ROOT_PASSWORD_FILE"); export MYSQL_PWD
  else
    echo "No se identifica el mecanismo de autenticación; detener y revisar sin mostrar secretos." >&2
    exit 1
  fi
  exec mariadb-dump --user=root --single-transaction --quick --skip-lock-tables \
    --routines --events --triggers --hex-blob --default-character-set=utf8mb4 \
    --databases "$COMANDASH_BACKUP_DB"
' > "$task_backup_dir/database.sql"
[[ $(stat -c %s "$task_backup_dir/database.sql") -gt 1024 ]]
tail -c 8192 "$task_backup_dir/database.sql" | grep -q 'Dump completed on'

task_backend_image=$(docker inspect --format '{{.Image}}' comandash_backend)
task_frontend_image=$(docker inspect --format '{{.Image}}' comandash_frontend)
docker image save "$task_backend_image" "$task_frontend_image" | gzip > "$task_backup_dir/application-images.tar.gz"
gzip -t "$task_backup_dir/application-images.tar.gz"
(
  cd -- "$task_backup_dir"
  sha256sum database.sql application-images.tar.gz containers.txt images.txt mounts.txt > SHA256SUMS
  sha256sum -c SHA256SUMS
)
echo 'Dump e imágenes anteriores respaldados y verificados.'
echo 'Falta confirmar copia privada de Compose/Dockerfiles/env/uploads y SHA de repos antes de desplegar.'
echo 'No se ejecutaron migraciones, cambios de datos, despliegues ni reinicios.'
