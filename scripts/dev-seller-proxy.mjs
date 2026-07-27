/**
 * Dev-only proxy so the seller zone can be opened in a plain browser.
 *
 * The app routes zones by hostname (seller.homzlist.com → the (seller) group).
 * Locally that means `seller.localhost:3000`, which some browsers/tools refuse
 * to resolve. This listens on 3001 and forwards every request to the dev server
 * with `Host: seller.localhost:3000`, so http://localhost:3001/settings renders
 * the seller screen. Cookies pass through untouched, so the real OTP login works.
 *
 * Touches NO application code and is never part of the build.
 *
 *   node scripts/dev-seller-proxy.mjs      # then open http://localhost:3001
 */
import http from "node:http";

const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = Number(process.env.TARGET_PORT || 3000);
const LISTEN_PORT = Number(process.env.PROXY_PORT || 3001);
const ZONE_HOST = process.env.ZONE_HOST || `seller.localhost:${TARGET_PORT}`;

const server = http.createServer((req, res) => {
  const headers = { ...req.headers, host: ZONE_HOST };
  // The app builds absolute redirects from Host; rewrite them back to the proxy
  // so the browser doesn't get bounced to a hostname it can't resolve.
  const proxied = http.request(
    { host: TARGET_HOST, port: TARGET_PORT, path: req.url, method: req.method, headers },
    (up) => {
      const out = { ...up.headers };
      if (out.location) {
        out.location = String(out.location)
          .replace(`http://${ZONE_HOST}`, `http://localhost:${LISTEN_PORT}`)
          .replace(`http://localhost:${TARGET_PORT}`, `http://localhost:${LISTEN_PORT}`);
      }
      res.writeHead(up.statusCode || 502, out);
      up.pipe(res);
    },
  );
  proxied.on("error", (e) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`proxy error: ${e.message}`);
  });
  req.pipe(proxied);
});

// Next.js HMR rides a websocket; forward the upgrade so the dev overlay works.
server.on("upgrade", (req, socket, head) => {
  const up = http.request({
    host: TARGET_HOST, port: TARGET_PORT, path: req.url, method: req.method,
    headers: { ...req.headers, host: ZONE_HOST },
  });
  up.end();
  up.on("upgrade", (upRes, upSocket, upHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(upRes.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
        `\r\n\r\n`,
    );
    if (upHead?.length) upSocket.unshift(upHead);
    if (head?.length) socket.unshift(head);
    upSocket.pipe(socket).pipe(upSocket);
  });
  up.on("error", () => socket.destroy());
});

server.listen(LISTEN_PORT, () => {
  console.log(`seller-zone proxy: http://localhost:${LISTEN_PORT}  ->  ${TARGET_HOST}:${TARGET_PORT} (Host: ${ZONE_HOST})`);
});
