import { useQueryClient } from '@tanstack/react-query'
import { resetNetworkCache } from '@/data/query'
import { SettingsPage } from '@/features/you'
import { useDevnets, saveDevnet, removeDevnet } from './devnets'

/** The settings page wired to the saved-devnet store and the query cache. */
export function SettingsRoute() {
  const saved = useDevnets()
  const queryClient = useQueryClient()
  const forget = (name: string) => void resetNetworkCache(queryClient, `devnet-${name}`)
  return (
    <SettingsPage
      devnets={{
        saved,
        save: (config) => {
          const replaces = saved.some((d) => d.name === config.name)
          saveDevnet(config)
          if (replaces) forget(config.name)
        },
        remove: (name) => {
          removeDevnet(name)
          forget(name)
        },
      }}
    />
  )
}
