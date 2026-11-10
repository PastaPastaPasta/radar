import { useLingui } from '@lingui/react/macro'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/ui'
import { qrPng } from './qr-image'

/** The address as a QR code, on white so any scanner reads it in either theme. Drawn in the browser. */
export default function AddressQr({ address }: { address: string }) {
  const { t } = useLingui()
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let made: string | undefined
    let live = true
    setUrl(undefined)
    setFailed(false)
    qrPng(address)
      .then((blob) => {
        made = URL.createObjectURL(blob)
        if (live) setUrl(made)
        else URL.revokeObjectURL(made)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [address])

  if (failed) return <p>{t`The QR code could not be drawn here. The address above is the same.`}</p>
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
