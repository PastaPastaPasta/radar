import type { ComponentType, ReactNode, Ref } from 'react'

export interface DashhqBarProps {
  product: string
  network?: string
  networks?: string
  'phone-nav'?: 'menu' | 'tabs'
  'network-note'?: string
  sticky?: true
  ref?: Ref<HTMLElement>
  children?: ReactNode
}

export interface DashhqFooterProps {
  product: string
  source?: string
  children?: ReactNode
}

export const DashhqBar = 'dashhq-bar' as unknown as ComponentType<DashhqBarProps>
export const DashhqFooter = 'dashhq-footer' as unknown as ComponentType<DashhqFooterProps>

export interface DashhqNetworkDetail {
  network: string
  href: string
}
