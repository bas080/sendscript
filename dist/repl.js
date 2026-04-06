import SendScriptModule from './module.js';
import repl from 'node:repl';
async function sendscriptRepl(send, module) {
    Object.assign(globalThis, SendScriptModule(module));
    async function cb(cmd, context, filename, callback) {
        try {
            const result = await send(eval(cmd)); // eslint-disable-line no-eval
            callback(null, result);
        }
        catch (err) {
            callback(err, undefined);
        }
    }
    return repl.start({
        prompt: '> ',
        eval: cb
    });
}
export default sendscriptRepl;
//# sourceMappingURL=repl.js.map