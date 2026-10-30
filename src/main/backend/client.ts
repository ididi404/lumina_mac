/** Backend HTTP client — GET/POST to Python backend. */
import http from "http";

export const BACKEND_PORT = parseInt(
  process.env.LUMINA_BACKEND_PORT || "8765",
  10,
);

function parseJson(body: string, endpoint: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Bad JSON from ${endpoint}: ${body.slice(0, 120)}`);
  }
}

function collect(res: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => resolve(body));
  });
}

function checkStatus(
  res: import("http").IncomingMessage,
  body: string,
  endpoint: string,
): void {
  const code = res.statusCode || 0;
  if (code >= 200 && code < 300) return;
  throw new Error(`HTTP ${code} from ${endpoint}: ${body.slice(0, 200)}`);
}

export function apiGet(endpoint: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `http://127.0.0.1:${BACKEND_PORT}${endpoint}`,
      async (res) => {
        try {
          const body = await collect(res);
          checkStatus(res, body, endpoint);
          resolve(parseJson(body, endpoint));
        } catch (e) {
          reject(e);
        }
      },
    );
    req.on("error", reject);
  });
}

export function apiPost(endpoint: string, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `http://127.0.0.1:${BACKEND_PORT}${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      async (res) => {
        try {
          const text = await collect(res);
          checkStatus(res, text, endpoint);
          resolve(parseJson(text, endpoint));
        } catch (e) {
          reject(e);
        }
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}
