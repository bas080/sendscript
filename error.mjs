class BlendError extends Error { }
class BlendExpressionError extends BlendError {}
class BlendInvalidSchemaError extends BlendError {}

export {
  BlendError,
  BlendExpressionError,
  BlendInvalidSchemaError
}
