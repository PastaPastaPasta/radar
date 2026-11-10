import { useLingui } from '@lingui/react/macro'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/ui'
import { qrPng } from './qr-image'

/** The address as a QR code, on white so any scanner reads it in either theme. Drawn in the browser. */
export default function AddressQr({ address }: { address: string }) {
  const { t } = useLingui()
  const [drawn, setDrawn] = useState<{ address: string; url?: string; failed?: boolean }>()

  useEffect(() => {
    let made: string | undefined
    let live = true
    qrPng(address)
      .then((blob) => {
        made = URL.createObjectURL(blob)
        if (live) setDrawn({ address, url: made })
        else URL.revokeObjectURL(made)
      })
      .catch(() => {
        if (live) setDrawn({ address, failed: true })
      })
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [address])

  const current = drawn?.address === address ? drawn : undefined
  const url = current?.url
  if (current?.failed)
    return <p>{t`The QR code could not be drawn here. The address above is the same.`}</p>
  if (!url) return <Skeleton shape="block" height={200} />
  return (
    <img
      src={url}
      alt={t`QR code of the address ${address}`}
      width={200}
      height={200}
      className="rounded bg-white"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
