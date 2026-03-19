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

  const amount = parseInt(amountText) || 0;
  const selectedRate = rates.find((r) => r.id === selectedRateId) || rates[0];
  
  const opFee = Math.round((amount * selectedRate.fee) / 100);
  const gbFee = amount < 10000 ? Math.round(amount * 0.02 + 50) : Math.round(amount * 0.01 + 100);
  const totalFee = opFee + gbFee;
  const net = amount - totalFee;

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
          <div className="pricing-amount" style={{ fontSize: "3.5rem" }}>
            1%<span style={{ fontSize: "1.5rem", fontWeight: 500, margin: "0 8px" }}>à</span>2%
          </div>
          <p className="pricing-desc" style={{ color: "var(--color-text)", fontWeight: 600, fontSize: "1.1rem" }}>
            + Frais FedaPay (opérateur local)
          </p>

          <div className="pricing-tiers">
            <div className="tier">
              <strong>&lt; 10 000 FCFA</strong>
              <span>Frais FedaPay + 2% + 50F</span>
            </div>
            <div className="tier">
              <strong>&ge; 10 000 FCFA</strong>
              <span>Frais FedaPay + 1% + 100F</span>
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
        <div className="simulator-section anim-fade-up">
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
                <span>Paiement client</span>
                <span>{amount.toLocaleString("fr-FR")} F</span>
              </div>
              <div className="sim-row">
                <span>Frais FedaPay ({selectedRate.fee}%)</span>
                <span>- {opFee.toLocaleString("fr-FR")} F</span>
              </div>
              <div className="sim-row">
                <span>Commission Gatesberry</span>
                <span>- {gbFee.toLocaleString("fr-FR")} F</span>
              </div>
              <div className="sim-row total">
                <span>Total des frais</span>
                <span>{totalFee.toLocaleString("fr-FR")} F</span>
              </div>
              <div className="sim-row net">
                <span>Tu encaisses</span>
                <span>{net.toLocaleString("fr-FR")} F</span>
              </div>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="rates-table-section anim-fade-up">
          <h3 className="sim-title">Grille détaillée des frais FedaPay</h3>
          <p className="sim-subtitle">Notre partenaire FedaPay applique des frais de traitement qui varient selon le pays.</p>
          <div className="table-wrapper">
            <table className="rates-table">
              <thead>
                <tr>
                  <th>Pays</th>
                  <th>Réseaux Mobile Money</th>
                  <th>Frais FedaPay</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r, idx) => (
                  <tr key={idx}>
                    <td><strong>{r.country}</strong></td>
                    <td>{r.providers}</td>
                    <td>{r.fee}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </section>
  );
}
