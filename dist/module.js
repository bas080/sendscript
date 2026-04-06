import { awaitSymbol, call, ref } from './symbol.js';
function instrument(name) {
    function reference(...args) {
        const called = instrument(name);
        called.toJSON = () => ({
            [call]: call,
            call: true,
            ref: reference,
            args
        });
        return called;
    }
    reference.then = (resolve) => {
        const awaited = instrument(name);
        delete awaited.then;
        awaited.toJSON = () => ({
            [awaitSymbol]: awaitSymbol,
            await: true,
            ref: reference
        });
        return resolve(awaited);
    };
    reference.toJSON = () => ({
        [ref]: ref,
        reference: true,
        name
    });
    return reference;
}
export default function SendScriptModule(schema) {
    if (!Array.isArray(schema))
        return SendScriptModule(Object.keys(schema));
    return schema.reduce((api, name) => {
        api[name] = instrument(name);
        return api;
    }, {});
}
//# sourceMappingURL=module.js.map