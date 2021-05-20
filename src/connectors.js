import {
  InjectedConnector,
  // NoEthereumProviderError as InjectedNoEthereumProviderError,
  UserRejectedRequestError as InjectedUserRejectedRequestError,
} from 'caverjs-react-injected-connector'
import { ConnectionRejectedError, ConnectorConfigError } from './errors'

export function getConnectors(chainId, connectorsInitsOrConfigs = {}) {
  // Split the connector initializers from the confs.
  const [inits, configs] = Object.entries(connectorsInitsOrConfigs).reduce(
    ([inits, configs], [id, initOrConfig]) => {
      // Having a web3ReactConnector function is
      // the only prerequisite for an initializer.
      if (typeof initOrConfig.web3ReactConnector === 'function') {
        return [{ ...inits, [id]: initOrConfig }, configs]
      }
      return [inits, [...configs, [id, initOrConfig]]]
    },
    [{}, []]
  )

  const connectors = {
    injected: {
      web3ReactConnector({ chainId }) {
        return new InjectedConnector({ supportedChainIds: [chainId] })
      },
      handleActivationError(err) {
        if (err instanceof InjectedUserRejectedRequestError) {
          return new ConnectionRejectedError()
        }
      },
    },
    ...inits,
  }

  // Attach the configs to their connectors.
  for (const [id, config] of configs) {
    if (connectors[id]) {
      connectors[id].config = config
    }
  }

  return connectors
}
