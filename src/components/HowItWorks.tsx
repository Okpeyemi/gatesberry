"use client";

import { useEffect, useRef } from "react";

const steps = [
  {
    icon: "hgi-package",
    title: "Crée ton produit",
    desc: "Nom, prix, cycle de facturation. En 30 secondes tu as ta page de paiement.",
  },
  {
    icon: "hgi-share-08",
    title: "Partage le lien",
    desc: "Intègre-le sur ton site, envoie-le par WhatsApp, ou affiche le QR code.",
  },
  {
    icon: "hgi-smart-phone-01",
    title: "Le client paye",
    desc: "Il entre son numéro mobile money. L'argent va directement sur ton compte.",
  },
  {
    icon: "hgi-notification-03",
    title: "Gatesberry relance",
    desc: "5 jours avant l'échéance, un message WhatsApp automatique avec le lien de paiement.",
  },
];

export default function HowItWorks() {
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

    const items = ref.current?.querySelectorAll(".step");
    items?.forEach((el) => {
      (el as HTMLElement).style.opacity = "0";
      (el as HTMLElement).style.transform = "translateY(24px)";
      (el as HTMLElement).style.transition = "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)";
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <section className="how" id="how">
      <div className="container">
        <p className="section-label">
          <i className="hgi-stroke hgi-workflow-square-10" />
          Comment ça marche
        </p>
        <h2>4 étapes. Zéro friction.</h2>

        <div className="steps" ref={ref}>
          {steps.map((step) => (
            <div key={step.title} className="step">
              <div className="step-num">
                <i className={`hgi-stroke ${step.icon}`} />
              </div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
