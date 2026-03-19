"use client";

import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="site-nav">
      <div className="nav-inner">
        <Link href="#" className="logo">
          <span className="logo-dot" />
          Gatesberry
        </Link>

        <div className="nav-links">
          <Link href="#problem">Problème</Link>
          <Link href="#how">Fonctionnement</Link>
          <Link href="#features">Fonctionnalités</Link>
          <Link href="#pricing">Tarifs</Link>
        </div>

        <Link href="#waitlist" className="nav-cta">
          <i className="hgi-stroke hgi-arrow-right-01" />
          Rejoindre
        </Link>
      </div>
    </nav>
  );
}
