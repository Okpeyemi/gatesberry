"use client";

import { useEffect, useRef } from "react";

const stats = [
  {
    color: "green",
    icon: "hgi-smart-phone-01",
    value: "90%+",
    desc: "des transactions financières en Afrique passent par le mobile money",
  },
  {
    color: "amber",
    icon: "hgi-user-group",
    value: "2 Mds",
    desc: "d'utilisateurs WhatsApp dans le monde — le canal de communication #1",
  },
  {
    color: "blue",
    icon: "hgi-time-02",
    value: "10 sec",
    desc: "pour qu'un client renouvelle son abonnement via Gatesberry",
  },
];

export default function Trust() {
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

    const items = ref.current?.querySelectorAll(".trust-card");
    items?.forEach((el) => {
      (el as HTMLElement).style.opacity = "0";
      (el as HTMLElement).style.transform = "translateY(24px)";
      (el as HTMLElement).style.transition = "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)";
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <section className="trust">
      <p className="section-label" style={{ justifyContent: "center" }}>
        <i className="hgi-stroke hgi-chart-increase" />
        Conçu pour l&apos;Afrique
      </p>

      <div className="trust-grid" ref={ref}>
        {stats.map((s) => (
          <div key={s.value} className="trust-card">
            <div className={`trust-icon ${s.color}`}>
              <i className={`hgi-stroke ${s.icon}`} />
            </div>
            <h4>{s.value}</h4>
            <p>{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
