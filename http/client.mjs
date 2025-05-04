import fetch from 'node-fetch';
import stringify from '../stringify.mjs';

export default function httpClient(serverUrl = 'http://localhost:3000') {
  const send = async (program) => {
    const res = await fetch(serverUrl, {
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
