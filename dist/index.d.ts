interface SendScriptInstance {
    stringify: (program: any, leafSerializer?: (value: any) => string) => string;
    parse: (program: string, leafDeserializer?: ((text: string) => any) | null) => any;
    module: Record<string, any>;
}
export default function sendscript(env: Record<string, any>): SendScriptInstance;
export {};
//# sourceMappingURL=index.d.ts.map