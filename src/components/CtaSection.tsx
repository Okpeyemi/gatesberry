"use client";

import { useState } from "react";

export default function CtaSection() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  function handleSignup() {
    if (!email || !email.includes("@")) {
      setMsg({ text: "Entre une adresse email valide.", error: true });
      return;
    }
    setMsg({
      text: "Merci ! Tu seras parmi les premiers à tester Gatesberry.",
      error: false,
    });
    setEmail("");
  }

  return (
    <section className="cta" id="waitlist">
      <h2>
        Prêt à ne plus <span className="accent">courir après</span> tes
        clients ?
      </h2>
      <p>
        Rejoins la liste d&apos;attente. On te prévient dès que Gatesberry est
        prêt.
      </p>
      <div className="cta-form">
        <input
          className="cta-input"
          type="email"
          placeholder="Ton adresse email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSignup()}
        />
        <button className="btn-primary" onClick={handleSignup}>
          <i className="hgi-stroke hgi-mail-send-02" />
          S&apos;inscrire
        </button>
      </div>
      <p className="fomo-text">
        <i className="hgi-stroke hgi-fire" style={{ color: "var(--color-amber)" }} />
        Les 100 premiers inscrits auront 0% de frais pendant 1 mois.
      </p>
      {msg && (
        <p
          style={{
            marginTop: 16,
            fontSize: 14,
            color: msg.error ? "#A32D2D" : "#0F6E56",
          }}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
