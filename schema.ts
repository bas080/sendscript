/**
 * A single schema node.
 *
 * - string → leaf node
 * - [name, children] → namespace node
 */
export type SchemaNode = string | [string, Schema]

/**
 * A schema defines the structure of the runtime API tree.
 *
 * Schema is recursive: nodes can contain nested schemas.
 */
export type Schema = SchemaNode[]
