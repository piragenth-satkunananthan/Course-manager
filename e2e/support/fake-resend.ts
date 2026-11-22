// A stand-in for Resend's send endpoint during end-to-end runs (design file 73): keeps the emails in memory so a
// test can read them (GET /emails). EMAIL_API_BASE_URL points the app here.
import { createServer } from "node:http";

const emails: unknown[] = [];
createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return void res.end("ok");
  if (req.method === "GET" && req.url === "/emails") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(emails));
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    emails.push(JSON.parse(body || "{}"));
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `e2e-${emails.length}` }));
  });
}).listen(Number(process.argv[2] ?? 3101), "127.0.0.1");
