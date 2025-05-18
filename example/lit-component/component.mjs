export function time () {
  return html`<time>${new Date().toLocaleTimeString()}</time>`
}

// Will throw if a Promise is encountered
// Awaits promises
// console.log(await collectResult(ssrResult));
