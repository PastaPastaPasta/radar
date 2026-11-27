const MAX_RESENDS = 3

interface FailureCause {
  code?: string
  socket?: { bytesWritten?: number }
}

const refusedBeforeWrite = (error: unknown): boolean => {
  const cause = (error as { cause?: FailureCause }).cause
  if (cause?.code === 'UND_ERR_SOCKET') return cause.socket?.bytesWritten === 0
  return cause?.code === 'ECONNREFUSED'
}

/**
 * The mock's socket layer now and then fails a request to a mocked host before a byte reaches a handler: it closes the
 * connection before the request is written (`SocketError: closed`), or hands the connection to the real network while
 * the handler is still loading its recording, where nothing listens (`ECONNREFUSED`). Nothing was sent, so the request
 * is sent again.
 */
export function resendRefusedBeforeWrite(send: typeof fetch): typeof fetch {
  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await send(input instanceof Request ? input.clone() : input, init)
      } catch (error) {
        if (attempt >= MAX_RESENDS || !refusedBeforeWrite(error)) throw error
      }
    }
  }
}
