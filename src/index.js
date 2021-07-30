import PropTypes from 'prop-types'
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  UnsupportedChainIdError,
  CaverJsReactProvider,
  useCaverJsReact,
} from '@sixnetwork/caverjs-react-core'
import {
  KlipConnector
} from '@sixnetwork/klip-connector'
import JSBI from 'jsbi'
import { getConnectors } from './connectors'
import {
  ConnectionRejectedError,
  ChainUnsupportedError,
  ConnectorUnsupportedError,
} from './errors'
import {
  getAccountBalance,
  getAccountIsContract,
  getBlockNumber,
  getNetworkName,
  pollEvery,
} from './utils'
import klipTalk from './Connect-to-KLIP-02.png'
import klipSearch from './Connect-to-KLIP-03.png'
import klipQr from './Connect-to-KLIP-04.png'
import klipIcon from './Connect-to-KLIP-01.png'


const NO_BALANCE = '-1'

const UseWalletContext = React.createContext(null)

function useWallet() {
  const walletContext = useContext(UseWalletContext)

  if (walletContext === null) {
    throw new Error(
      'useWallet() can only be used inside of <UseWalletProvider />, ' +
      'please declare it at a higher level.'
    )
  }

  const getBlockNumber = useGetBlockNumber()

  const { wallet } = walletContext

  return useMemo(() => ({ ...wallet, getBlockNumber }), [
    getBlockNumber,
    wallet,
  ])
}

function useGetBlockNumber() {
  const walletContext = useContext(UseWalletContext)
  const [blockNumber, setBlockNumber] = useState(null)
  const requestedBlockNumber = useRef(false)

  const getBlockNumber = useCallback(() => {
    requestedBlockNumber.current = true
    walletContext.addBlockNumberListener(setBlockNumber)

    return blockNumber
  }, [walletContext, blockNumber])

  useEffect(() => {
    if (!requestedBlockNumber.current) {
      return
    }

    walletContext.addBlockNumberListener(setBlockNumber)
    return () => {
      walletContext.removeBlockNumberListener(setBlockNumber)
    }
  }, [requestedBlockNumber, walletContext])

  return getBlockNumber
}

function useWalletBalance({ account, klaytn, pollBalanceInterval }) {
  const [balance, setBalance] = useState(NO_BALANCE)

  useEffect(() => {
    if (!account || !klaytn) {
      return
    }

    let cancel = false

    // Poll wallet balance
    const pollBalance = pollEvery((account, klaytn, onUpdate) => {
      let lastBalance = '-1'
      return {
        async request() {
          return getAccountBalance(klaytn, account)
            .then(value => (value ? JSBI.BigInt(value).toString() : NO_BALANCE))
            .catch(() => NO_BALANCE)
        },
        onResult(balance) {
          if (!cancel && balance !== lastBalance) {
            lastBalance = balance
            onUpdate(balance)
          }
        },
      }
    }, pollBalanceInterval)

    // start polling balance every x time
    const stopPollingBalance = pollBalance(account, klaytn, setBalance)

    return () => {
      cancel = true
      stopPollingBalance()
      setBalance(NO_BALANCE)
    }
  }, [account, klaytn, pollBalanceInterval])

  return balance
}

// Only watch block numbers, and return functions allowing to subscribe to it.
function useWatchBlockNumber({ klaytn, pollBlockNumberInterval }) {
  const lastBlockNumber = useRef(null)

  // Using listeners lets useWallet() decide if it wants to expose the block
  // number, which implies to re-render whenever the block number updates.
  const blockNumberListeners = useRef(new Set())

  const addBlockNumberListener = useCallback(cb => {
    if (blockNumberListeners.current.has(cb)) {
      return
    }

    // Immediately send the block number to the new listener
    cb(lastBlockNumber.current)

    // Add the listener
    blockNumberListeners.current.add(cb)
  }, [])

  const removeBlockNumberListener = useCallback(cb => {
    blockNumberListeners.current.delete(cb)
  }, [])

  // Update the block number and broadcast it to the listeners
  const updateBlockNumber = useCallback(blockNumber => {
    if (lastBlockNumber.current === blockNumber) {
      return
    }

    lastBlockNumber.current = blockNumber
    blockNumberListeners.current.forEach(cb => cb(blockNumber))
  }, [])

  useEffect(() => {
    if (!klaytn) {
      updateBlockNumber(null)
      return
    }

    let cancel = false

    const pollBlockNumber = pollEvery(() => {
      return {
        request: () => getBlockNumber(klaytn),
        onResult: latestBlockNumber => {
          if (!cancel) {
            updateBlockNumber(
              latestBlockNumber === null
                ? null
                : JSBI.BigInt(latestBlockNumber).toString()
            )
          }
        },
      }
    }, pollBlockNumberInterval)

    const stopPollingBlockNumber = pollBlockNumber()

    return () => {
      cancel = true
      stopPollingBlockNumber()
    }
  }, [klaytn, pollBlockNumberInterval, updateBlockNumber])

  return { addBlockNumberListener, removeBlockNumberListener }
}

function UseWalletProvider({
  chainId,
  children,
  // connectors contains init functions and/or connector configs.
  connectors: connectorsInitsOrConfigs,
  pollBalanceInterval,
  pollBlockNumberInterval,
}) {
  const walletContext = useContext(UseWalletContext)
  if (walletContext !== null) {
    throw new Error('<UseWalletProvider /> has already been declared.')
  }

  const [connector, setConnector] = useState(null)
  const [error, setError] = useState(null)
  const [type, setType] = useState(null)
  const [status, setStatus] = useState('disconnected')
  const caverJsReactContext = useCaverJsReact()
  const { account, library: klaytn } = caverJsReactContext
  const activationId = useRef(0)
  
  const balance = useWalletBalance({ account, klaytn, pollBalanceInterval })
  const {
    addBlockNumberListener,
    removeBlockNumberListener,
  } = useWatchBlockNumber({ klaytn, pollBlockNumberInterval })

  // Combine the user-provided connectors with the default ones (see connectors.js).
  const connectors = useMemo(
    () => getConnectors(chainId, connectorsInitsOrConfigs),
    [chainId, connectorsInitsOrConfigs]
  )

  const reset = useCallback(() => {
    if (caverJsReactContext.active) {
      caverJsReactContext.deactivate()
    }
    setConnector(null)
    setError(null)
    setStatus('disconnected')
  }, [caverJsReactContext])

  const connect = useCallback(
    async (connectorId = 'injected') => {
      // Prevent race conditions between connections by using an external ID.
      const id = ++activationId.current

      reset()

      // Check if another connection has happened right after deactivate().
      if (id !== activationId.current) {
        return
      }

      if (!connectors[connectorId]) {
        setStatus('error')
        setError(new ConnectorUnsupportedError(connectorId))
        return
      }

      // If no connection happens, we're in the right context and can safely update
      // the connection stage status
      setStatus('connecting')

      const connector = connectors[connectorId]

      const caverJsReactConnector =
        connector &&
        connector.caverJsReactConnector &&
        connector.caverJsReactConnector({
          chainId,
          ...(connector.config || {}),
        })

      if (!caverJsReactConnector) {
        setStatus('error')
        setError(new ConnectorUnsupportedError(connectorId))
        return
      }

      try {
        // TODO: there is no way to prevent an activation to complete, but we
        // could reconnect to the last provider the user tried to connect to.

        setConnector(connectorId)

        await caverJsReactContext.activate(caverJsReactConnector, null, true)

        setStatus('connected')

      } catch (err) {
        // Don’t throw if another connection has happened in the meantime.
        if (id !== activationId.current) {
          return
        }

        // If not, the error has been thrown during the current connection attempt,
        // so it's correct to indicate that there has been an error
        setConnector(null)
        setStatus('error')

        if (err instanceof UnsupportedChainIdError) {
          setError(new ChainUnsupportedError(-1, chainId))
          return
        }
        // It might have thrown with an error known by the connector
        if (connector.handleActivationError) {
          const handledError = connector.handleActivationError(err)
          if (handledError) {
            setError(handledError)
            return
          }
        }
        // Otherwise, set to state the received error
        setError(err)

      }
    },
    [chainId, connectors, reset, caverJsReactContext]
  )

  useEffect(() => {
    if (!account || !klaytn) {
      return
    }

    let cancel = false

    setType(null)

    getAccountIsContract(klaytn, account).then(isContract => {
      if (!cancel) {
        setStatus('connected')
        setType(isContract ? 'contract' : 'normal')
      }
    })

    return () => {
      cancel = true
      setStatus('disconnected')
      setType(null)
    }
  }, [account, klaytn])

  const wallet = useMemo(
    () => ({
      _caverJsReactContext: caverJsReactContext,
      account: account || null,
      balance,
      chainId,
      connect,
      connector,
      connectors,
      error,
      klaytn,
      networkName: getNetworkName(chainId),
      reset,
      status,
      type,
    }),
    [
      account,
      balance,
      chainId,
      connect,
      connector,
      connectors,
      error,
      klaytn,
      type,
      reset,
      status,
      caverJsReactContext,
    ]
  )

  return (
    <UseWalletContext.Provider
      value={{
        addBlockNumberListener,
        pollBalanceInterval,
        pollBlockNumberInterval,
        removeBlockNumberListener,
        wallet,
      }}
    >
      {children}
    </UseWalletContext.Provider>
  )
}

UseWalletProvider.propTypes = {
  chainId: PropTypes.number,
  children: PropTypes.node,
  connectors: PropTypes.objectOf(PropTypes.object),
  pollBalanceInterval: PropTypes.number,
  pollBlockNumberInterval: PropTypes.number,
}

UseWalletProvider.defaultProps = {
  chainId: 8217,
  connectors: {},
  pollBalanceInterval: 2000,
  pollBlockNumberInterval: 5000,
}

function UseWalletProviderWrapper(props) {
  return (
    <CaverJsReactProvider getLibrary={klaytn => klaytn}>
      <UseWalletProvider {...props} />
    </CaverJsReactProvider>
  )
}

UseWalletProviderWrapper.propTypes = UseWalletProvider.propTypes
UseWalletProviderWrapper.defaultProps = UseWalletProvider.defaultProps

const KlipModal = () => {
  const [countdown, setCountdown] = useState({
    minutes: 0,
    seconds: 0,
  })
  useEffect(() => {
    const endTimer = Date.now() + 5 * 60000
    const CountDownInterval = () => {
      const timer = endTimer - Date.now()
      if (timer >= 0)
        setCountdown({
          minutes: Math.floor((timer % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((timer % (1000 * 60)) / 1000),
        })
    }

    const inter = setInterval(CountDownInterval, 1000)
    return () => {
      clearInterval(inter)
    }
  }, [])

  return (
    <div
      id="customKlipModal"
      style={{
        // display: "none", /* Hidden by default */
        position: 'fixed' /* Stay in place */,
        zIndex: 999 /* Sit on top */,
        left: 0,
        top: 0,
        width: '100%' /* Full width */,
        height: '100%' /* Full height */,
        overflow: 'auto' /* Enable scroll if needed */,
        // backgroundColor: "rgb(0,0,0)", /* Fallback color */
      }}
    >
      <div
        style={{
          backgroundColor: '#fefefe',
          margin: '15% auto' /* 15% from the top and centered */,
          border: '1px solid #888',
          width: '30%',
          minWidth:"370px",
          borderRadius: '10px',
        }}
      >
        {/* <span class="close">&times;</span> */}
        <div style={{ padding: '20px' }} className="flex">
          <img src={klipIcon} alt="" width="50" style={{ marginRight: '10px' }} />
          <p style={{ verticalAlign: 'sub' }}>Connect to Kakao Klip via QR Code</p>
        </div>
        <div
          style={{
            width: '100%',
            background: 'linear-gradient(45deg,#349BE7,#0D418E)',
            paddingTop: '20px',
            paddingBottom: '20px',
          }}
        >
          <div style={{ color: 'white', lineHeight: '20px' }}>
            <p className="flex justify-center">Scan the QR code through a QR code</p>

            <p className="flex justify-center">reader or the KakaoTalk app.</p>
            <br />
          </div>
          <div className="flex justify-center">
            <canvas id="qrcode" />
          </div>
          <div className="flex justify-center" style={{ marginTop: '20px', marginBottom: '20px' }}>
            <span style={{ color: 'white', marginRight: '10px' }}>Time Remaining:</span>
            <span style={{ color: 'yellow' }}>
              {countdown.minutes} min {countdown.seconds} sec
            </span>
          </div>
        </div>

        {/* footer */}
        <div style={{ paddingBottom: '20px' }}>
          {/* icon */}
          <div className="flex justify-center" style={{ padding: '20px' }}>
            <img width="40" src={klipTalk} alt="" style={{ marginRight: '20px' }} />
            <img width="40" src={klipSearch} alt="" style={{ marginRight: '20px' }} />
            <img width="40" src={klipQr} alt="" />
          </div>
          <div className="flex justify-center" style={{ fontSize: '10px' }}>
            Open Kakaotalk -&gt; Click the search bar -&gt; Log in by scanning the code
          </div>
          <br />
          <div className="flex justify-center" style={{ fontSize: '10px' }}>
            * Klip &gt; Code Scan (from side menu) can be used
          </div>
          <br />
        </div>
      </div>
    </div>
  )
}

const KlipModalContext = React.createContext(null)

const KlipModalProvider = ({ children }) => {
  const [showModal, setShowModal] = useState(false)
  const value = { showModal, setShowModal }
  return (
    <KlipModalContext.Provider value={value}>
      {showModal ? <KlipModal /> : null}
      {children}
    </KlipModalContext.Provider>
  )
}

const getKlipModalContext = () => KlipModalContext
export {
  ConnectionRejectedError,
  ChainUnsupportedError,
  ConnectorUnsupportedError,
  UseWalletProviderWrapper as UseWalletProvider,
  useWallet,
  KlipModalProvider,
  getKlipModalContext as KlipModalContext,
  KlipConnector
}

export default useWallet
