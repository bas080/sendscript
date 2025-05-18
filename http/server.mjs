import http from 'http';
import Parse from '../parse.mjs';
import Debug from '../debug.mjs';

const debug = Debug.extend('cli').extend('http').extend('server')

export default async function startServer(env, port = process.env.PORT ?? 3000) {
  const parse = Parse(env);

  const server = http.createServer(async (req, res) => {
    const { method, url } = req;

    if (method === 'GET' && url === '/schema') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Object.keys(env)));
      return;
    }

    if (method === 'POST' && url === '/') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', async () => {
        try {
          const result = await parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, () => {
    debug(`sendscript server running at http://localhost:${port}`);
  });
}
