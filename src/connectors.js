import {
  InjectedConnector,
  // NoEthereumProviderError as InjectedNoEthereumProviderError,
  UserRejectedRequestError as InjectedUserRejectedRequestError,
} from 'caverjs-react-injected-connector'
import {
  KlipConnector
} from '@kanthakran/klip-connr'
import { ConnectionRejectedError, ConnectorConfigError } from './errors'
const index = require("./index")

export function getConnectors(chainId, connectorsInitsOrConfigs = {}) {
  // Split the connector initializers from the confs.
  const [inits, configs] = Object.entries(connectorsInitsOrConfigs).reduce(
    ([inits, configs], [id, initOrConfig]) => {
      // Having a caverJsReactConnector function is
      // the only prerequisite for an initializer.
      if (typeof initOrConfig.caverJsReactConnector === 'function') {
        return [{ ...inits, [id]: initOrConfig }, configs]
      }
      return [inits, [...configs, [id, initOrConfig]]]
    },
    [{}, []]
  )

  const connectors = {
    injected: {
      caverJsReactConnector({ chainId }) {
        return new InjectedConnector({ supportedChainIds: [chainId] })
      },
      handleActivationError(err) {
        if (err instanceof InjectedUserRejectedRequestError) {
          return new ConnectionRejectedError()
        }
      },
    },
    klip: {
      caverJsReactConnector({ chainId, showModal, closeModal }) {
        return new KlipConnector({ supportedChainIds: [chainId], showModal, closeModal })
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
