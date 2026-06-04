import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const apiPath = "/api/generate-listing";
const maxBodyBytes = 20 * 1024 * 1024;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBodyBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    req.on("error", reject);
  });
}

function openAiProxyPlugin(apiKey) {
  async function handleGenerateListing(req, res) {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end();
      return;
    }

    if (!apiKey) {
      sendJson(res, 500, {
        error: {
          message: "The server is missing OPENAI_API_KEY."
        }
      });
      return;
    }

    try {
      const requestBody = await readJsonBody(req);
      const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      const payload = await openAiResponse.json().catch(() => ({}));
      sendJson(res, openAiResponse.status, payload);
    } catch (error) {
      sendJson(res, 500, {
        error: {
          message: error.message || "Could not generate the listing."
        }
      });
    }
  }

  function attachMiddleware(server) {
    server.middlewares.use(apiPath, handleGenerateListing);
  }

  return {
    name: "openai-api-proxy",
    configureServer: attachMiddleware,
    configurePreviewServer: attachMiddleware
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    base: "/PDP_Genegerator/",
    plugins: [openAiProxyPlugin(env.OPENAI_API_KEY), react()]
  };
});

