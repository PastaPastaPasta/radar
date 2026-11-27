import { describe, expect, it, vi } from 'vitest'
import { resendRefusedBeforeWrite } from './resend-refused'

const closedBeforeWrite = () =>
  new TypeError('fetch failed', {
    cause: Object.assign(new Error('closed'), {
      code: 'UND_ERR_SOCKET',
      socket: { bytesWritten: 0 },
    }),
  })

describe('resending a request the mock closed before it was written', () => {
  it('sends it again and returns the answer', async () => {
    const answer = new Response('ok')
    const send = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(closedBeforeWrite())
      .mockResolvedValue(answer)
    expect(await resendRefusedBeforeWrite(send)('https://x.test/a')).toBe(answer)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('sends again a request the mock passed to the real network, where the connection was refused', async () => {
    const refused = new TypeError('fetch failed', {
      cause: Object.assign(new AggregateError([]), { code: 'ECONNREFUSED' }),
    })
    const answer = new Response('ok')
    const send = vi.fn<typeof fetch>().mockRejectedValueOnce(refused).mockResolvedValue(answer)
    expect(await resendRefusedBeforeWrite(send)('http://localhost:3000/x/hy/testnet/block/1')).toBe(
      answer,
    )
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('gives up after a few tries', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(closedBeforeWrite())
    await expect(resendRefusedBeforeWrite(send)('https://x.test/a')).rejects.toThrow('fetch failed')
    expect(send).toHaveBeenCalledTimes(4)
  })

  it('leaves every other failure alone', async () => {
    const written = new TypeError('fetch failed', {
      cause: Object.assign(new Error('closed'), {
        code: 'UND_ERR_SOCKET',
        socket: { bytesWritten: 40 },
      }),
    })
    const send = vi.fn<typeof fetch>().mockRejectedValue(written)
    await expect(resendRefusedBeforeWrite(send)('https://x.test/a')).rejects.toBe(written)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
