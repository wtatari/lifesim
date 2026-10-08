#!/usr/bin/env bash
# Build LifeSim and publish it to the Pi at https://lifesim.wtatari.com
#
#   deploy/deploy.sh           build + upload (the usual case)
#   deploy/deploy.sh --setup   first time only: docroot, certificate, vhost
#
# Needs the `pi` host in ~/.ssh/config and passwordless sudo on the Pi.
set -euo pipefail

HOST=pi
DOMAIN=lifesim.wtatari.com
ROOT=/var/www/lifesim
CONF=$DOMAIN.conf

cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--setup" ]]; then
  ssh "$HOST" "sudo install -d -o \$USER -g www-data -m 2775 $ROOT"

  # The real vhost references the certificate, so Apache can't load it until
  # one exists. Bring up a plain-HTTP vhost first, just for the ACME challenge.
  if ! ssh "$HOST" "sudo test -e /etc/letsencrypt/live/$DOMAIN/fullchain.pem"; then
    ssh "$HOST" "sudo tee /etc/apache2/sites-available/$CONF >/dev/null" <<EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    DocumentRoot $ROOT
    <Directory $ROOT>
        Require all granted
        Options -Indexes
    </Directory>
</VirtualHost>
EOF
    ssh "$HOST" "sudo a2ensite -q $DOMAIN && sudo apache2ctl configtest && sudo systemctl reload apache2 \
      && sudo certbot certonly --webroot -w $ROOT -d $DOMAIN --non-interactive"
  fi

  scp -q "deploy/$CONF" "$HOST:/tmp/$CONF"
  ssh "$HOST" "sudo install -m 644 /tmp/$CONF /etc/apache2/sites-available/$CONF && rm /tmp/$CONF \
    && sudo a2ensite -q $DOMAIN && sudo apache2ctl configtest && sudo systemctl reload apache2"
fi

npm run build
rsync -rlt --delete --exclude .well-known dist/ "$HOST:$ROOT/"
echo "Deployed -> https://$DOMAIN"
