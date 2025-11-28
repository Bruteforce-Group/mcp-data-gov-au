# data.gov.au MCP Server

This is a Model Context Protocol (MCP) server for data.gov.au, allowing AI assistants to search and fetch datasets.

## Setup

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Create `.env` file:
    ```env
    DATAGOVAU_API_KEY=your_key_here
    PORT=3000
    ```

3.  Build and run:
    ```bash
    npm run build
    npm start
    ```

## HTTPS Support

To enable HTTPS, set the following environment variables in your `.env` file:

```env
SSL_KEY_PATH=./certs/server.key
SSL_CERT_PATH=./certs/server.cert
```

You can generate self-signed certificates for development using the provided script:

```bash
./generate-certs.sh
```

## Docker

```bash
docker compose up -d
```
