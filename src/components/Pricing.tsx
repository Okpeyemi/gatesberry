import Link from "next/link";

const pricingFeatures = [
  "Pages de paiement illimitées",
  "Relances WhatsApp automatiques",
  "Dashboard complet",
  "Support WhatsApp dédié",
  "Aucun frais de mise en place",
  "Aucun minimum de transaction",
];

export default function Pricing() {
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
          <div className="pricing-amount">
            4%<span> par transaction</span>
          </div>
          <p className="pricing-desc">
            Prélevé automatiquement. Tu ne payes rien si tu ne vends pas.
          </p>
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
      </div>
    </section>
  );
}
