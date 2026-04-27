const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8080;
const DIR = __dirname;

const server = http.createServer((req, res) => {
  const filePath = path.join(DIR, req.url === "/" ? "index.html" : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const mime = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" }[ext] || "text/plain";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Serving test-fixtures/ at http://localhost:${PORT}`);
});
