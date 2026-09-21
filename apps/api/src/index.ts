import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const port = Number(process.env.PORT ?? 4000);

function respondJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function handleRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "GET" && request.url === "/health") {
    respondJson(response, 200, { ok: true, service: "api" });
    return;
  }

  respondJson(response, 404, { error: "not_found" });
}

export function startApiServer() {
  return createServer(handleRequest).listen(port, () => {
    console.log(`Tarot LIVE API listening on port ${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startApiServer();
}
