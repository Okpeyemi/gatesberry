import { getOperatorRate } from './fees'

/**
 * Calcule le brut à envoyer à FedaPay pour qu'après prélèvement de la commission
 * opérateur, le marchand reçoive exactement `net` XOF.
 *
 *   brut * (1 - r) = net
 *   brut = ceil(net / (1 - r))
 *
 * Correction itérative car FedaPay applique Math.round() sur la commission entière.
 */
export function reverseFedapayPayoutAmount(net: number, country: string, provider: string) {
  const r = getOperatorRate(country, provider) / 100
  let brut = Math.ceil(net / (1 - r))
  for (let i = 0; i < 500; i++) {
    const fee = Math.round(brut * r)
    const received = brut - fee
    if (received === net) break
    else if (received < net) brut++
    else brut--
  }
  return { fedapay_amount: brut, fee: brut - net }
}
