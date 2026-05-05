/**
 * Source de vérité unique pour les frais FedaPay et la marge Gatesberry.
 * Modifie les taux ici → tous les calculs (encaissement, retrait, simulateur, page Pricing) sont à jour.
 */

type Provider = { code: string; label: string }

export type OperatorFee = {
  id: string             // 'bj-all', 'ci-wave', ...
  countryCode: string    // 'bj' (utilisé par l'API)
  countryLabel: string   // 'Bénin' (UI)
  providers: Provider[]
  rate: number           // pourcent, ex. 1.8
}

export const FEDAPAY_OPERATOR_FEES: OperatorFee[] = [
  { id: 'bj-all',    countryCode: 'bj', countryLabel: 'Bénin',
    providers: [{code:'mtn',label:'MTN'},{code:'moov',label:'Moov'},{code:'celtiis',label:'Celtiis'}], rate: 1.8 },
  { id: 'ci-wave',   countryCode: 'ci', countryLabel: "Côte d'Ivoire",
    providers: [{code:'wave',label:'Wave'},{code:'mtn',label:'MTN'}], rate: 4.0 },
  { id: 'ci-orange', countryCode: 'ci', countryLabel: "Côte d'Ivoire",
    providers: [{code:'orange',label:'Orange Money'}], rate: 3.3 },
  { id: 'sn-wave',   countryCode: 'sn', countryLabel: 'Sénégal',
    providers: [{code:'wave',label:'Wave'}], rate: 4.0 },
  { id: 'sn-orange', countryCode: 'sn', countryLabel: 'Sénégal',
    providers: [{code:'orange',label:'Orange Money'}], rate: 2.9 },
  { id: 'sn-mixx',   countryCode: 'sn', countryLabel: 'Sénégal',
    providers: [{code:'mixx',label:'Mixx by Yas'}], rate: 2.0 },
  { id: 'tg-moov',   countryCode: 'tg', countryLabel: 'Togo',
    providers: [{code:'moov',label:'Moov Money'}], rate: 2.5 },
  { id: 'tg-mixx',   countryCode: 'tg', countryLabel: 'Togo',
    providers: [{code:'mixx',label:'Mixx by Yas'}], rate: 3.5 },
  { id: 'ml-orange', countryCode: 'ml', countryLabel: 'Mali',
    providers: [{code:'orange',label:'Orange Money'}], rate: 4.0 },
  { id: 'bf-all',    countryCode: 'bf', countryLabel: 'Burkina-Faso',
    providers: [{code:'moov',label:'Moov'},{code:'orange',label:'Orange'}], rate: 4.0 },
  { id: 'ne-airtel', countryCode: 'ne', countryLabel: 'Niger',
    providers: [{code:'airtel',label:'Airtel Money'}], rate: 4.0 },
]

export const DEFAULT_OPERATOR_RATE = 3.0

/** Lookup pour les routes API : utilise les codes pays + provider. */
export function getOperatorRate(countryCode: string, providerCode: string): number {
  for (const e of FEDAPAY_OPERATOR_FEES) {
    if (e.countryCode === countryCode && e.providers.some(p => p.code === providerCode)) return e.rate
  }
  return DEFAULT_OPERATOR_RATE
}

/** Format pour les composants UI — drop-in pour SIM_RATES / rates. */
export const FEDAPAY_RATES_DISPLAY = FEDAPAY_OPERATOR_FEES.map(e => ({
  id: e.id,
  country: e.countryLabel,
  providers: e.providers.map(p => p.label).join(', '),
  fee: e.rate,
}))

/** Marge Gatesberry sur transaction entrante (pas sur payout). */
export function gatesberryFee(amount: number) {
  return amount < 10000
    ? Math.round(amount * 0.02 + 50)
    : Math.round(amount * 0.01 + 100)
}
