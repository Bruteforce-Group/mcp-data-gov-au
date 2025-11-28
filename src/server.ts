import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import "dotenv/config";
import https from "https";
import fs from "fs";

const DATAGOV_API_BASE = "https://data.gov.au/api/3/action";
const DATAGOV_DATASTORE_BASE =
  "https://data.gov.au/data/api/action/datastore_search";

/**
 * Get the data.gov.au API key or throw a clear error if missing.
 */
function requireApiKey(): string {
  const key = process.env.DATAGOVAU_API_KEY;
  if (!key) {
    throw new Error(
      "DATAGOVAU_API_KEY is not set. Set it in your environment or .env file before starting the server."
    );
  }
  return key;
}

const server = new McpServer({
  name: "data-gov-au",
  version: "1.0.0",
});

// ---------- Tool: search (package_search) ----------

const searchInputSchema = z.object({
  q: z.string().min(1, "Search query cannot be empty."),
  rows: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Number of results to return (default 20, max 100)."),
  start: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Result offset for pagination (default 0)."),
});

const searchOutputSchema = z.object({
  total: z.number(),
  datasets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      title: z.string().optional(),
      notes: z.string().optional(),
      organization: z
        .object({
          id: z.string().optional(),
          title: z.string().optional(),
          name: z.string().optional(),
        })
        .optional(),
    })
  ),
});

server.registerTool(
  "search",
  {
    title: "Search data.gov.au datasets",
    description:
      "Search the data.gov.au open data catalog by keyword. Returns dataset IDs, names and metadata.",
    inputSchema: searchInputSchema.shape,
    outputSchema: searchOutputSchema.shape,
  },
  async (input: z.infer<typeof searchInputSchema>) => {
    const { q, rows = 20, start = 0 } = input;
    const apiKey = requireApiKey();

    const url = new URL(`${DATAGOV_API_BASE}/package_search`);
    url.searchParams.set("q", q);
    url.searchParams.set("rows", rows.toString());
    url.searchParams.set("start", start.toString());

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: apiKey,
      },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      const errorMsg = `data.gov.au search failed: ${resp.status} ${resp.statusText} – ${body.slice(
        0,
        400
      )}`;
      const output = { error: errorMsg };
      return {
        content: [{ type: "text", text: errorMsg }],
        structuredContent: output,
      };
    }

    const json = (await resp.json()) as any;

    if (!json.success) {
      const errorMsg = `data.gov.au search returned success=false: ${JSON.stringify(
        json.error ?? json,
        null,
        2
      )}`;
      const output = { error: errorMsg };
      return {
        content: [{ type: "text", text: errorMsg }],
        structuredContent: output,
      };
    }

    const result = json.result ?? {};
    const datasets =
      (result.results ?? []).map((pkg: any) => ({
        id: String(pkg.id),
        name: String(pkg.name),
        title: typeof pkg.title === "string" ? pkg.title : undefined,
        notes: typeof pkg.notes === "string" ? pkg.notes : undefined,
        organization: pkg.organization
          ? {
              id: pkg.organization.id,
              title: pkg.organization.title,
              name: pkg.organization.name,
            }
          : undefined,
      })) ?? [];

    const output = {
      total: Number(result.count ?? datasets.length),
      datasets,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output, null, 2),
        },
      ],
      structuredContent: output,
    };
  }
);

// ---------- Tool: fetch (package_show) ----------

const fetchInputSchema = z.object({
  datasetId: z
    .string()
    .min(1, "datasetId is required.")
    .describe("CKAN dataset id or name as used by data.gov.au."),
});

const fetchOutputSchema = z.object({
  dataset: z.any(),
});

server.registerTool(
  "fetch",
  {
    title: "Fetch dataset details from data.gov.au",
    description:
      "Fetch full CKAN metadata for a dataset, including resources, given a dataset id or name.",
    inputSchema: fetchInputSchema.shape,
    outputSchema: fetchOutputSchema.shape,
  },
  async (input: z.infer<typeof fetchInputSchema>) => {
    const { datasetId } = input;
    const apiKey = requireApiKey();

    const url = new URL(`${DATAGOV_API_BASE}/package_show`);
    url.searchParams.set("id", datasetId);

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: apiKey,
      },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      const errorMsg = `data.gov.au fetch failed: ${resp.status} ${resp.statusText} – ${body.slice(
        0,
        400
      )}`;
      const output = { error: errorMsg };
      return {
        content: [{ type: "text", text: errorMsg }],
        structuredContent: output,
      };
    }

    const json = (await resp.json()) as any;

    if (!json.success) {
      const errorMsg = `data.gov.au fetch returned success=false: ${JSON.stringify(
        json.error ?? json,
        null,
        2
      )}`;
      const output = { error: errorMsg };
      return {
        content: [{ type: "text", text: errorMsg }],
        structuredContent: output,
      };
    }

    const dataset = json.result;
    const output = { dataset };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output, null, 2),
        },
      ],
      structuredContent: output,
    };
  }
);

// ---------- Tool: datastore_search ----------

const datastoreSearchInputSchema = z.object({
  resource_id: z
    .string()
    .min(1, "resource_id is required.")
    .describe("The CKAN resource_id of the table to query."),
  q: z
    .string()
    .optional()
    .describe("Optional free-text search across all fields."),
  limit: z
    .number()

    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Maximum rows to return (default 100)."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Offset into result set (default 0)."),
});

const datastoreSearchOutputSchema = z.object({
  total: z.number(),
  records: z.array(z.record(z.any())),
});

server.registerTool(
  "datastore_search",
  {
    title: "Query a data.gov.au DataStore resource",
    description:
      "Run datastore_search on a CKAN resource_id (table) hosted on data.gov.au.",
    inputSchema: datastoreSearchInputSchema.shape,
    outputSchema: datastoreSearchOutputSchema.shape,
  },
  async (input: z.infer<typeof datastoreSearchInputSchema>) => {
    const { resource_id, q, limit = 100, offset = 0 } = input;
    const apiKey = requireApiKey();

    const body: any = {
      resource_id,
      limit,
      offset,
    };

    if (q && q.trim().length > 0) {
      body.q = q;
    }

    const resp = await fetch(DATAGOV_DATASTORE_BASE, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const errorMsg = `datastore_search failed: ${resp.status} ${resp.statusText} – ${text.slice(
        0,
        400
      )}`;
      const output = { error: errorMsg };
      return {
        content: [{ type: "text", text: errorMsg }],
        structuredContent: output,
      };
    }

    const json = (await resp.json()) as any;

    if (!json.success) {
      const errorMsg = `datastore_search returned success=false: ${JSON.stringify(
        json.error ?? json,
        null,
        2
      )}`;
      const output = { error: errorMsg };
      return {
        content: [{ type: "text", text: errorMsg }],
        structuredContent: output,
      };
    }

    const result = json.result ?? {};
    const records = (result.records ?? []) as any[];
    const output = {
      total: Number(result.total ?? records.length),
      records,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output, null, 2),
        },
      ],
      structuredContent: output,
    };
  }
);

// ---------- Express + Streamable HTTP transport wiring ----------

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP server error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal MCP server error" });
    }
  }
});

const port = parseInt(process.env.PORT ?? "3000", 10);

if (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
  const options = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
  };

  https
    .createServer(options, app)
    .listen(port, () => {
      console.log(`data.gov.au MCP server running on https://localhost:${port}/mcp`);
    })
    .on("error", (error) => {
      console.error("HTTPS server error:", error);
      process.exit(1);
    });
} else {
  app
    .listen(port, () => {
      console.log(`data.gov.au MCP server running on http://localhost:${port}/mcp`);
    })
    .on("error", (error) => {
      console.error("Express server error:", error);
      process.exit(1);
    });
}

