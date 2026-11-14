const MAX_RESENDS = 3

const refusedBeforeWrite = (error: unknown): boolean => {
  const cause = (error as { cause?: { code?: string; socket?: { bytesWritten?: number } } }).cause
  return cause?.code === 'UND_ERR_SOCKET' && cause.socket?.bytesWritten === 0
}

/**
 * The mock's socket layer now and then closes a connection to a mocked host before a byte is written, and the request
 * fails with `SocketError: closed` without reaching a handler. Nothing was sent, so the request is sent again.
 */
export function resendRefusedBeforeWrite(send: typeof fetch): typeof fetch {
  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await send(input, init)
      } catch (error) {
        if (attempt >= MAX_RESENDS || !refusedBeforeWrite(error)) throw error
      }
    }
  }
}
