/**
 * @typedef {string | [string, Schema]} SchemaNode
 *
 * A schema defines the structure of the runtime API tree.
 *
 * - string → leaf node
 * - [name, children] → namespace node
 *
 * Schema is recursive: nodes can contain nested schemas.
 *
 * @typedef {SchemaNode[]} Schema
 * @public
 */
