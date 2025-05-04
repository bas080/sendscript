import http from 'http';
import Parse from '../parse.mjs';
import Debug from '../debug.mjs';

const debug = Debug.extend('cli').extend('http').extend('server')

export async function startServer(env, port = 3000) {
  const parse = Parse(env);

  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', async () => {
        try {
          const result = await parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result }));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    debug(`sendscript server running at http://localhost:${port}`);
  });
}
