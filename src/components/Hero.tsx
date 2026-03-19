"use client";

import Link from "next/link";

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-text">
        <div className="hero-badge anim-fade-up">
          <i className="hgi-stroke hgi-location-01" />
          Bientôt disponible au Bénin
        </div>
        <h1 className="anim-fade-up anim-delay-1">
          L&apos;abonnement<br />
          <span className="accent">mobile money</span><br />
          qui se renouvelle tout seul.
        </h1>
        <p className="hero-sub anim-fade-up anim-delay-2">
          Crée ta page de paiement. Ton client paye via mobile money. Gatesberry
          relance automatiquement via WhatsApp avant chaque échéance.
        </p>
        <div className="hero-actions anim-fade-up anim-delay-3">
          <Link href="#waitlist" className="btn-primary">
            <i className="hgi-stroke hgi-rocket-01" />
            Commencer gratuitement
          </Link>
          <Link href="#how" className="btn-secondary">
            <i className="hgi-stroke hgi-play" />
            Comment ça marche
          </Link>
        </div>
      </div>

      <div className="hero-visual anim-fade-up anim-delay-4">
        <div className="float-wa">
          <i className="hgi-stroke hgi-notification-03" />
          Ton abonnement renouvelle dans 5 jours. Clique ici pour payer
        </div>
        <div className="float-momo">
          <i className="hgi-stroke hgi-checkmark-circle-02" />
          MTN MoMo
        </div>
        <div className="phone-frame">
          <div className="phone-notch" />
          <div className="phone-screen">
            <div className="phone-header">
              <p>Fitness Pro Academy</p>
              <p>Abonnement mensuel</p>
            </div>
            <div className="phone-amount">
              5 000 <span>FCFA/mois</span>
            </div>
            <input
              className="phone-input"
              type="tel"
              defaultValue="+229 97 XX XX XX"
              readOnly
            />
            <select className="phone-select">
              <option>MTN Mobile Money</option>
            </select>
            <button className="phone-btn">Payer maintenant</button>
            <p className="phone-secured">
              <i className="hgi-stroke hgi-shield-check" />
              Paiement sécurisé via FedaPay
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
