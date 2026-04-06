import stringify from './stringify.js';
import makeModule from './module.js';
import createParser from './parse.js';
export default function sendscript(env) {
    return {
        stringify,
        parse: createParser(env),
        module: makeModule(env)
    };
}
//# sourceMappingURL=index.js.map