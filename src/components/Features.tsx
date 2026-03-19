"use client";

import { useEffect, useRef } from "react";

const features = [
  {
    color: "green",
    icon: "hgi-chart-line-data-03",
    title: "Dashboard vendeur",
    tag: null,
    desc: "Revenus, abonnés actifs, taux de renouvellement, historique des paiements. Tout en temps réel.",
  },
  {
    color: "blue",
    icon: "hgi-message-notification-01",
    title: "Relances WhatsApp",
    tag: "auto",
    desc: "Messages personnalisés envoyés automatiquement avant chaque échéance. Le client clique et paye en 10 secondes.",
  },
  {
    color: "amber",
    icon: "hgi-smart-phone-01",
    title: "Page de paiement",
    tag: null,
    desc: "Belle, rapide, mobile-first. Supporte MTN MoMo et Moov Money. Intégrable partout avec un simple lien.",
  },
  {
    color: "purple",
    icon: "hgi-shield-02",
    title: "Zéro risque légal",
    tag: null,
    desc: "On ne touches jamais l'argent. FedaPay (licencié BCEAO) gère les transferts. Nous, nous l'orchestrons.",
  },
];

export default function Features() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).style.opacity = "1";
            (entry.target as HTMLElement).style.transform = "translateY(0)";
          }
        });
      },
      { threshold: 0.1 }
    );

    const items = ref.current?.querySelectorAll(".feature-card");
    items?.forEach((el) => {
      (el as HTMLElement).style.opacity = "0";
      (el as HTMLElement).style.transform = "translateY(24px)";
      (el as HTMLElement).style.transition = "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)";
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <section className="features" id="features">
      <p className="section-label">
        <i className="hgi-stroke hgi-star" />
        Fonctionnalités
      </p>
      <h2>Tout ce qu&apos;il faut pour gérer tes abonnements.</h2>

      <div className="features-grid" ref={ref}>
        {features.map((f) => (
          <div key={f.title} className="feature-card">
            <div className={`feature-icon ${f.color}`}>
              <i className={`hgi-stroke ${f.icon}`} />
            </div>
            <h3>
              {f.title}
              {f.tag && <span className="tag">{f.tag}</span>}
            </h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
