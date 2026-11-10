import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { base58CheckEncode } from '@/lib/base58'
import { renderAt } from '../test-utils'

const scan = vi.hoisted(() => ({
  read: vi.fn<(input: Blob | ImageData) => Promise<string | undefined>>(),
}))
vi.mock('./scan', () => ({ readQr: scan.read }))

const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const WIF = base58CheckEncode(0xcc, Uint8Array.from([...new Uint8Array(32).fill(9), 1]))

const picture = () =>
  new File([new Uint8Array([137, 80, 78, 71])], 'code.png', { type: 'image/png' })

afterEach(() => {
  scan.read.mockReset()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('QR page', () => {
  it('has a camera button and a picture chooser @IN-11', async () => {
    renderAt('/tools/qr')
    expect(await screen.findByRole('heading', { level: 1, name: 'QR reader' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use the camera' })).toBeInTheDocument()
    expect(screen.getByLabelText('Choose a picture with a QR code')).toBeInTheDocument()
  })

  it('sends the address in a picture to search @IN-11', async () => {
    scan.read.mockResolvedValue(`dash:${ADDRESS}?amount=1`)
    const user = userEvent.setup()
    renderAt('/tools/qr')
    await user.upload(await screen.findByLabelText('Choose a picture with a QR code'), picture())
    expect(await screen.findByRole('heading', { level: 1, name: 'Search' })).toBeInTheDocument()
    await waitFor(() =>
      expect(document.querySelector('input[type="search"], input')).not.toBeNull(),
    )
    expect(scan.read).toHaveBeenCalledTimes(1)
  })

  it('refuses a private key in a picture and shows none of it @IN-11', async () => {
    scan.read.mockResolvedValue(WIF)
    const user = userEvent.setup()
    renderAt('/tools/qr')
    await user.upload(await screen.findByLabelText('Choose a picture with a QR code'), picture())
    expect(
      await screen.findByText('That QR code holds a private key or a recovery phrase.'),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(WIF)
    expect(screen.getByRole('heading', { level: 1, name: 'QR reader' })).toBeInTheDocument()
  })

  it('says when a picture has no QR code @IN-11', async () => {
    scan.read.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderAt('/tools/qr')
    await user.upload(await screen.findByLabelText('Choose a picture with a QR code'), picture())
    expect(await screen.findByText('No QR code found in that picture.')).toBeInTheDocument()
  })

  it('says when a QR code holds nothing Radar can look up @IN-11', async () => {
    scan.read.mockResolvedValue('a')
    const user = userEvent.setup()
    renderAt('/tools/qr')
    await user.upload(await screen.findByLabelText('Choose a picture with a QR code'), picture())
    expect(
      await screen.findByText('That QR code isn’t something Radar can look up.'),
    ).toBeInTheDocument()
  })

  it('points to the picture chooser when the camera is refused @IN-11', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')) },
    })
    const user = userEvent.setup()
    renderAt('/tools/qr')
    await user.click(await screen.findByRole('button', { name: 'Use the camera' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('choose a picture instead')
    expect(screen.getByLabelText('Choose a picture with a QR code')).toBeEnabled()
  })

  it('points to the picture chooser when there is no camera at all @IN-11', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    const user = userEvent.setup()
    renderAt('/tools/qr')
    await user.click(await screen.findByRole('button', { name: 'Use the camera' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No camera could be opened here')
  })

  it('stops the camera when the page is left @IN-11', async () => {
    const stopTrack = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: stopTrack }] }),
      },
    })
    HTMLMediaElement.prototype.play = () => Promise.resolve()
    const user = userEvent.setup()
    renderAt('/tools/qr')
    await user.click(await screen.findByRole('button', { name: 'Use the camera' }))
    await screen.findByRole('button', { name: 'Stop the camera' })
    await user.click(screen.getByRole('button', { name: 'Stop the camera' }))
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: 'Use the camera' })).toBeInTheDocument()
  })
})
