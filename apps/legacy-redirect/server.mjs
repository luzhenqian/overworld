import { createServer } from 'node:http';

const canonicalOrigin = 'https://overworldengine.com';
const port = Number(process.env.PORT);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be a valid TCP port');
}

createServer((request, response) => {
  const target = new URL(request.url ?? '/', canonicalOrigin);

  response.writeHead(308, {
    location: target.toString(),
    'cache-control': 'public, max-age=86400',
  });
  response.end();
}).listen(port, '127.0.0.1');
