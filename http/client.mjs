import stringify from '../stringify.mjs';
import Debug from '../debug.mjs';

const debug = Debug.extend('http-client')

const port = process.env.PORT ?? 3000

const serverUrl = `http://localhost:${port}`

export default function httpClient(url = serverUrl) {
  debug('created http client', url)
  const send = async (program) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stringify(program)
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const { result } = await res.json();
    return result;
  };

  return send;
}
