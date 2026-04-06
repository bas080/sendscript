export default function curry<T extends (...args: any[]) => any> (func: T): (...args: any[]) => any {
  return function curried (this: any, ...args: any[]): any {
    if (args.length >= func.length) {
      return func.apply(this, args)
    } else {
      return function (this: any, ...args2: any[]): any {
        return curried.apply(this, args.concat(args2))
      }
    }
  }
}
