/**
 * Frais FedaPay sur les payouts (versements vers mobile money).
 *
 * Contrairement aux transactions entrantes (pourcentage variable selon
 * l'opérateur), les payouts sont facturés selon une grille forfaitaire
 * commune à toutes les méthodes de paiement (MTN BJ/CI, MOOV BJ/TG,
 * Togocel T-Money, etc.), basée sur la tranche du montant brut envoyé.
 */

export type PayoutFeeTier = { max: number; fee: number }

export const PAYOUT_FEE_TIERS: PayoutFeeTier[] = [
  { max: 10_000,  fee: 150 },
  { max: 50_000,  fee: 300 },
  { max: 150_000, fee: 800 },
  { max: 500_000, fee: 2_000 },
  { max: Infinity, fee: 2_500 },
]

/** Frais que FedaPay prélèvera pour un brut donné (en XOF entiers). */
export function payoutFeeForBrut(brut: number): number {
  for (const t of PAYOUT_FEE_TIERS) {
    if (brut <= t.max) return t.fee
  }
  return PAYOUT_FEE_TIERS[PAYOUT_FEE_TIERS.length - 1].fee
}

/**
 * Calcule le brut à envoyer à FedaPay pour qu'après prélèvement du
 * forfait de la tranche correspondante, le marchand reçoive exactement
 * `net` XOF.
 *
 * On essaie les tranches dans l'ordre croissant : pour chaque tranche
 * de fee `f` et borne supérieure `max`, on teste `brut = net + f`
 * et on retient la première tranche où `brut <= max`.
 */
export function reverseFedapayPayoutAmount(net: number) {
  for (const t of PAYOUT_FEE_TIERS) {
    const brut = net + t.fee
    if (brut <= t.max) {
      return { fedapay_amount: brut, fee: t.fee }
    }
  }
  const top = PAYOUT_FEE_TIERS[PAYOUT_FEE_TIERS.length - 1]
  return { fedapay_amount: net + top.fee, fee: top.fee }
}
