/**
 * Server-side math module with typed functions
 * These functions will be called from the client through SendScript
 */

export const add = (a: number, b: number): number => a + b

export const square = (a: number): number => a * a

