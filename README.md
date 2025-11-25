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

## Docker

```bash
docker compose up -d
```

