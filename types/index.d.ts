declare module '@kanthakarn-test/klaytn-use-wallet' {
  import { ReactNode } from 'react'

  type Connectors = Partial<{
    injected: {}
    klip: {
      showModal: () => void,
      closeModal: () => void
    }
  }>

  export interface Wallet<T> {
    account: string | null
    balance: string
    chainId: number | null
    connect(connectorId: keyof Connectors): Promise<void>
    connector: keyof Connectors
    connectors: Connectors
    error:
    | UnsupportedChainError
    | UnsupportedChainError
    | RejectedActivationError
    | ConnectorConfigError
    klaytn: T
    networkName: string
    getBlockNumber(): number
    reset(): void
    status: string
    type: string | null
  }
  export interface KlipModalContext {
    showModal: boolean
    setShowModal: (state: boolean) => void
  }
  interface UseWalletProviderProps {
    chainId: number
    children: ReactNode
    connectors?: Connectors
    pollBalanceInterval?: number
    pollBlockNumberInterval?: number
  }

  interface UseWalletProps {
    pollBalanceInterval?: number
    pollBlockNumberInterval?: number
  }

  export class ChainUnsupportedError extends Error {
    name: 'ChainUnsupportedError'
  }

  export class ConnectorUnsupportedError extends Error {
    name: 'ConnectorUnsupportedError'
  }

  export class ConnectionRejectedError extends Error {
    name: 'ConnectionRejectedError'
  }

  export class ConnectorConfigError extends Error {
    name: 'ConnectorConfigError'
  }

  export function useWallet<T>(props?: UseWalletProps): Wallet<T>

  export function UseWalletProvider(props: UseWalletProviderProps)

  export function KlipModalProvider(children: any): JSX.Element

  export function KlipModalContext(): React.Context<KlipModalContext>
  
  export class KlipConnector{}
}
