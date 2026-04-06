type ModuleFunction = {
    (...args: any[]): any;
    toJSON?: () => any;
    then?: (resolve: (value: any) => any) => any;
};
export default function SendScriptModule(schema: string[] | Record<string, any>): Record<string, ModuleFunction>;
export {};
//# sourceMappingURL=module.d.ts.map