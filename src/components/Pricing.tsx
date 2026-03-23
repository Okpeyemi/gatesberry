"use client";

import { useState } from "react";
import Link from "next/link";

const pricingFeatures = [
  "Pages de paiement illimitées",
  "Relances WhatsApp automatiques",
  "Dashboard complet",
  "Support WhatsApp dédié",
  "Aucun frais de mise en place",
  "Aucun minimum de transaction",
];

const rates = [
  { id: "bj-all", country: "Bénin", providers: "MTN, Moov, Celtiis", fee: 1.8 },
  { id: "ci-wave", country: "Côte d'Ivoire", providers: "Wave, MTN", fee: 4.0 },
  { id: "ci-orange", country: "Côte d'Ivoire", providers: "Orange Money", fee: 3.3 },
  { id: "sn-wave", country: "Sénégal", providers: "Wave", fee: 4.0 },
  { id: "sn-orange", country: "Sénégal", providers: "Orange Money", fee: 2.9 },
  { id: "sn-mixx", country: "Sénégal", providers: "Mixx by Yas", fee: 2.0 },
  { id: "tg-moov", country: "Togo", providers: "Moov Money", fee: 2.5 },
  { id: "tg-mixx", country: "Togo", providers: "Mixx by Yas", fee: 3.5 },
  { id: "ml-orange", country: "Mali", providers: "Orange Money", fee: 4.0 },
  { id: "bf-all", country: "Burkina-Faso", providers: "Moov, Orange", fee: 4.0 },
  { id: "ne-airtel", country: "Niger", providers: "Airtel Money", fee: 4.0 },
];

export default function Pricing() {
  const [amountText, setAmountText] = useState<string>("5000");
  const [selectedRateId, setSelectedRateId] = useState<string>(rates[0].id);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [passFeesToClient, setPassFeesToClient] = useState<boolean>(false);

  const amount = parseInt(amountText) || 0;
  const selectedRate = rates.find((r) => r.id === selectedRateId) || rates[0];
  
  let clientPays = amount;
  let calculatedFee = 0;
  let merchantNet = 0;

  if (amount > 0) {
    if (passFeesToClient) {
      const rate = selectedRate.fee + (amount < 10000 ? 2 : 1);
      const fixed = amount < 10000 ? 50 : 100;
      clientPays = Math.floor((amount + fixed) / (1 - rate / 100));
      
      for(let i = 0; i < 500; i++) {
         const tempOpFee = Math.round((clientPays * selectedRate.fee) / 100);
         const tempGbFee = clientPays < 10000 ? Math.round(clientPays * 0.02 + 50) : Math.round(clientPays * 0.01 + 100);
         const tempNet = clientPays - (tempOpFee + tempGbFee);
         if (tempNet === amount) break;
         else if (tempNet < amount) clientPays++;
         else clientPays--;
      }
      
      const finalOpFee = Math.round((clientPays * selectedRate.fee) / 100);
      const finalGbFee = clientPays < 10000 ? Math.round(clientPays * 0.02 + 50) : Math.round(clientPays * 0.01 + 100);
      calculatedFee = finalOpFee + finalGbFee;
      merchantNet = clientPays - calculatedFee;
    } else {
      const finalOpFee = Math.round((amount * selectedRate.fee) / 100);
      const finalGbFee = amount < 10000 ? Math.round(amount * 0.02 + 50) : Math.round(amount * 0.01 + 100);
      calculatedFee = finalOpFee + finalGbFee;
      merchantNet = amount - calculatedFee;
    }
  }

  return (
    <section className="pricing" id="pricing">
      <div className="container">
        <p className="section-label">
          <i className="hgi-stroke hgi-money-send-02" />
          Tarification
        </p>
        <h2>Tu gagnes, on gagne.</h2>
        <p className="pricing-sub">
          Pas de frais fixe. Pas d&apos;abonnement. Juste une commission sur les
          transactions réussies.
        </p>

        <div className="pricing-card">
          <div className="pricing-amount" style={{ fontSize: "3rem", display: "flex", alignItems: "baseline", justifyContent: "center" }}>
            2,8%<span style={{ fontSize: "1.3rem", fontWeight: 500, margin: "0 8px" }}>à</span>6%
            <span style={{ fontSize: "1rem", color: "var(--color-text-muted)", fontWeight: 500, marginLeft: "12px" }}>selon le pays</span>
          </div>
          <p className="pricing-desc" style={{ color: "var(--color-text)", fontWeight: 600, fontSize: "1.1rem" }}>
            Frais de plateforme et opérateurs inclus
          </p>

          <div className="pricing-tiers">
            <div className="tier">
              <strong>Tarification Transparente</strong>
              <span>
                Un taux global unique.{" "}
                <Link href="#simulator" style={{ color: "var(--color-accent)", textDecoration: "underline", fontWeight: 500 }}>
                  Calculez votre marge nette ci-dessous.
                </Link>
              </span>
            </div>
          </div>
          <ul className="pricing-features">
            {pricingFeatures.map((feat) => (
              <li key={feat}>
                <i className="hgi-stroke hgi-checkmark-circle-02" />
                {feat}
              </li>
            ))}
          </ul>
          <Link href="#waitlist" className="btn-primary">
            <i className="hgi-stroke hgi-arrow-right-01" />
            Rejoindre la liste d&apos;attente
          </Link>
        </div>

        {/* Simulator Section */}
        <div id="simulator" className="simulator-section anim-fade-up">
          <h3 className="sim-title">Simulateur de revenus</h3>
          <p className="sim-subtitle">Découvre exactement ce qui te revient par transaction, sans frais cachés.</p>
          <div className="simulator-card">
            <div className="sim-inputs">
              <div>
                <label className="sim-label">Montant vendu (FCFA)</label>
                <input
                  type="number"
                  className="sim-input"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  min={100}
                />
                <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="passFees"
                    checked={passFeesToClient}
                    onChange={(e) => setPassFeesToClient(e.target.checked)}
                    style={{ cursor: "pointer", width: "16px", height: "16px", accentColor: "var(--color-accent)" }}
                  />
                  <label htmlFor="passFees" style={{ fontSize: "14px", cursor: "pointer", color: "var(--color-text-muted)" }}>
                    Faire supporter les frais au client
                  </label>
                </div>
              </div>
              <div>
                <label className="sim-label">Pays et Moyen de paiement</label>
                <div style={{ position: "relative" }}>
                  <div
                    className={`custom-select ${isDropdownOpen ? "open" : ""}`}
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  >
                    <span>{selectedRate.country} - {selectedRate.providers} ({selectedRate.fee}%)</span>
                    <i className={`hgi-stroke hgi-arrow-down-01 select-arrow ${isDropdownOpen ? "open" : ""}`} />
                  </div>
                  {isDropdownOpen && (
                    <>
                      <div className="custom-select-backdrop" onClick={() => setIsDropdownOpen(false)} />
                      <div className="custom-select-menu">
                        {rates.map((r) => (
                          <div
                            key={r.id}
                            className={`custom-select-option ${r.id === selectedRateId ? "selected" : ""}`}
                            onClick={() => {
                              setSelectedRateId(r.id);
                              setIsDropdownOpen(false);
                            }}
                          >
                            <span className="opt-country">{r.country}</span>
                            <span className="opt-details">{r.providers} ({r.fee}%)</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="sim-outputs">
              <div className="sim-row">
                <span>{passFeesToClient ? "Le client paiera" : "Paiement client"}</span>
                <span>{clientPays.toLocaleString("fr-FR")} F</span>
              </div>
              <div className="sim-row total">
                <span>Frais de transaction tout inclus</span>
                <span>- {calculatedFee.toLocaleString("fr-FR")} F</span>
              </div>
              <div className="sim-row net">
                <span>{passFeesToClient ? "Tu encaisses net" : "Tu encaisses"}</span>
                <span>{merchantNet.toLocaleString("fr-FR")} F</span>
              </div>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="rates-table-section anim-fade-up">
          <h3 className="sim-title">Grille détaillée des frais par pays</h3>
          <p className="sim-subtitle">Tous les frais de traitement (FedaPay + Gatesberry) sont combinés ici en un seul taux transparent.</p>
          <div className="table-wrapper">
            <table className="rates-table">
              <thead>
                <tr>
                  <th>Pays</th>
                  <th>Réseaux Mobile Money</th>
                  <th>Taux global (&lt; 10 000 F)</th>
                  <th>Taux global (&ge; 10 000 F)</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r, idx) => {
                  const rateUnder = (r.fee + 2).toFixed(1).replace(".0", "").replace(".", ",");
                  const rateOver = (r.fee + 1).toFixed(1).replace(".0", "").replace(".", ",");
                  return (
                    <tr key={idx}>
                      <td><strong>{r.country}</strong></td>
                      <td>{r.providers}</td>
                      <td>{rateUnder}% + 50F</td>
                      <td>{rateOver}% + 100F</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </section>
  );
}
