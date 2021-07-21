const axios = require("axios")
const KNOWN_CHAINS = new Map([
  ['8217', 'Mainnet'],
  ['1001', 'Baobab'],
  // This chainId is arbitrary and can be changed,
  // but by convention this is the number used
  // for local chains (ganache, buidler, etc) by default.
  ['1337', 'Local'],
  ['5777', 'Ganache'],
])

export function getNetworkName(chainId) {
  chainId = String(chainId)

  return KNOWN_CHAINS.get(chainId) || 'Unknown'
}

export function rpcResult(response) {
  // Some providers don’t wrap the response
  if (typeof response === 'object' && 'jsonrpc' in response) {
    if (response.error) {
      throw new Error(response.error)
    }
    return response.result || null
  }
  return response || null
}

async function sendCompat(klaytn, method, params) {
  // As of today (2020-02-17), MetaMask defines a send() method that correspond
  // to the one defined in EIP 1193. This is a breaking change since MetaMask
  // used to define a send() method that was an alias of the sendAsync()
  // method, and has a different signature than the send() defined by EIP 1193.
  // The latest version of Web3.js (1.2.6) is overwriting the klaytn.send()
  // provided by MetaMask, to replace it with klaytn.sendAsync(), making it
  // incompatible with EIP 1193 again.
  // This  means there is no way to detect that the klaytn.send() provided
  // corresponds to EIP 1193 or not. This is why we use sendAsync() when
  // available and send() otherwise, rather than the other way around.
  if (klaytn.sendAsync && klaytn.selectedAddress) {
    return new Promise((resolve, reject) => {
      klaytn.send(
        {
          method,
          params,
          from: klaytn.selectedAddress,
          jsonrpc: '2.0',
          id: 0,
        },
        (err, result) => {
          if (err) {
            reject(err)
          } else {
            resolve(result)
          }
        }
      )
    }).then(rpcResult)
  }

  return klaytn.send(method, params).then(rpcResult)
}

export async function getAccountIsContract(klaytn, account) {
  try {
    // const code = await sendCompat(klaytn, 'klay_getCode', [account])
    return true
  } catch (err) {
    return false
  }
}

export async function getAccountBalance(klaytn, account) {
  return  new Promise((resolve) => {
    resolve(0)
    }) //sendCompat(klaytn, 'klay_getBalance', [account, 'latest'])
}

export async function getBlockNumber(klaytn) {
  return (await axios.post(await getRPCurl(),{"jsonrpc":"2.0","method":"klay_blockNumber","params":[],"id":83})).data.result
}

export function pollEvery(fn, delay) {
  let timer = -1
  let stop = false
  const poll = async (request, onResult) => {
    const result = await request()
    if (!stop) {
      onResult(result)
      timer = setTimeout(poll.bind(null, request, onResult), delay)
    }
  }
  return (...params) => {
    const { request, onResult } = fn(...params)
    stop = false
    poll(request, onResult)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }
}

// RPC HELPER
const RPCS = ["https://klaytn-en.sixnetwork.io:8651/","https://kaikas.cypress.klaytn.net:8651/", "https://kaikas.cypress.klaytn.net:8651/"]

const checkHeartBeat = async (rpc) => {
    return new Promise(reslove => {
        axios.get(rpc)
            .then((res) => {
                reslove(res.status)
            })
            .catch(function (error) {
                if (error.response) {
                    reslove(error.response.status);
                }
            });
    })
}

const checkHeartBeatStatus = (status) => status === 200

const getRPCurlIsWorking = async () => {
    for (const rpc of RPCS) {
        const status = await checkHeartBeat(rpc)
        if (checkHeartBeatStatus(status)) {
            return rpc
        }
    }
   return "all node rpc not work"
}
const getRPCurl = async() => {
    try {
        return await getRPCurlIsWorking()
    } catch (error) {
        return "" // all rpc is die
    }
}