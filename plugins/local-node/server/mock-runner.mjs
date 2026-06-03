import http from "node:http";

const modules = [
  {
    id: "print-center",
    title: "Print Center",
    status: "not-configured",
    detail: "No printer has been paired.",
  },
  {
    id: "gmail",
    title: "Gmail",
    status: "not-configured",
    detail: "OAuth credentials are not configured.",
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    status: "not-configured",
    detail: "No browser session is paired.",
  },
];

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status: "mock-development-only",
        runnerVersion: "dev",
        paired: false,
        modules,
        checkedAt: new Date().toISOString(),
      }),
    );
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      ok: false,
      status: "unavailable",
      message: "Mock runner exposes only /health.",
    }),
  );
});

const port = Number(process.env.PORT ?? 8799);
server.listen(port, () => {
  console.log(`Local Node mock runner listening on http://localhost:${port}`);
});
