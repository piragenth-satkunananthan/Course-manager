// A stand-in for Resend's send endpoint during end-to-end runs (design file 73): keeps the emails in memory so a
// test can read them (GET /emails). EMAIL_API_BASE_URL points the app here. It also answers NVIDIA NIM's chat
// endpoint for "Test AI now" (#80): NIM_BASE_URL points here too.
import { createServer } from "node:http";

const emails: unknown[] = [];
createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return void res.end("ok");
  if (req.method === "GET" && req.url === "/emails") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(emails));
  if (req.method === "POST" && req.url === "/chat/completions")
    return void req.resume().on("end", () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })));
  if (req.method !== "POST" || req.url !== "/emails") return void res.writeHead(404).end();
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      emails.push(JSON.parse(body));
    } catch {
      return void res.writeHead(422, { "content-type": "application/json" }).end('{"message":"invalid JSON"}');
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `e2e-${emails.length}` }));
  });
}).listen(Number(process.argv[2] ?? 3101), "127.0.0.1");
