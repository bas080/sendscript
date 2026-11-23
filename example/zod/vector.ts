import { z } from 'zod'

const multiplyInput = z.object({
  v: z.array(z.number()).min(1),
  k: z.number(),
})

export const vector = {
  multiply: (args) => {
    const { v, k } = multiplyInput.parse(args)

    return v.map((x) => x * k)
  },
  length: (v) => Math.hypot(...v),
}
