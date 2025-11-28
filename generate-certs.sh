#!/bin/bash
mkdir -p certs
openssl req -nodes -new -x509 -keyout certs/server.key -out certs/server.cert -days 365 -subj "/CN=localhost"
echo "Certificates generated in certs/ directory."

