import React from "react";

const faqs = [
  {
    q: "Est-ce sécurisé ?",
    a: "Absolument. Gatesberry ne stocke pas directement vos fonds. Nous utilisons des agrégateurs partenaires licenciés BCEAO (comme FedaPay) pour sécuriser le traitement des paiements de bout en bout.",
  },
  {
    q: "Quand la plateforme sera-t-elle disponible ?",
    a: "Nous lançons la bêta privée très prochainement pour nos premiers testeurs. Inscrivez-vous sur la liste d'attente pour être averti et bénéficier de 1.5% de frais le premier mois.",
  },
  {
    q: "Quels pays sont couverts ?",
    a: "Pour le lancement, nous prévoyons de couvrir les paiements Mobile Money au Bénin (MTN, Moov, Celtiis).",
  },
  {
    q: "Faut-il des compétences techniques pour l'intégrer ?",
    a: "Non, aucune ! Vous pouvez générer un lien de paiement unique en 2 clics et l'envoyer par WhatsApp, ou utiliser notre widget simple à copier-coller si vous avez un site.",
  },
];

export default function Faq() {
  return (
    <section className="faq section-padding">
      <div className="faq-container">
        <h2 className="faq-title">Questions fréquentes</h2>
        <div className="faq-list">
          {faqs.map((faq, i) => (
            <div key={i} className="faq-item">
              <div className="faq-question">
                <i className="hgi-stroke hgi-help-circle"></i>
                <h3>{faq.q}</h3>
              </div>
              <p className="faq-answer">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
