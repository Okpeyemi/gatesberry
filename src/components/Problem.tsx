"use client";

import { useEffect, useRef } from "react";

const cards = [
  {
    color: "red",
    icon: "hgi-credit-card-not-found",
    title: "Stripe ne vient pas ici",
    desc: "Pas de carte bancaire, pas de prélèvement automatique. Les outils occidentaux ignorent le mobile money.",
  },
  {
    color: "amber",
    icon: "hgi-running-shoes",
    title: "La chasse au client",
    desc: "Chaque mois, le fondateur relance manuellement. Le client oublie. L'abonnement meurt en silence.",
  },
  {
    color: "purple",
    icon: "hgi-chart-decrease",
    title: "Le churn invisible",
    desc: "Pas d'outil pour mesurer qui paye, qui décroche, qui est en retard. Zéro visibilité sur les revenus récurrents.",
  },
];

export default function Problem() {
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

    const items = ref.current?.querySelectorAll(".problem-card");
    items?.forEach((el) => {
      (el as HTMLElement).style.opacity = "0";
      (el as HTMLElement).style.transform = "translateY(24px)";
      (el as HTMLElement).style.transition = "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)";
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <section className="problem" id="problem">
      <p className="section-label">
        <i className="hgi-stroke hgi-alert-02" />
        Le problème
      </p>
      <h2>En Afrique, un abonnement sur deux meurt au renouvellement.</h2>

      <div className="problem-grid" ref={ref}>
        {cards.map((card) => (
          <div key={card.title} className="problem-card">
            <div className={`problem-icon ${card.color}`}>
              <i className={`hgi-stroke ${card.icon}`} />
            </div>
            <h3>{card.title}</h3>
            <p>{card.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
