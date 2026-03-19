import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <p>
          <Link href="#" className="logo" style={{ fontSize: 18 }}>
            <span className="logo-dot" />
            Gatesberry
          </Link>
        </p>
        <p>Fait avec passion depuis Cotonou</p>
        <div className="footer-socials">
          <Link href="#" title="Twitter">
            <i className="hgi-stroke hgi-new-twitter" />
          </Link>
          <Link href="#" title="LinkedIn">
            <i className="hgi-stroke hgi-linkedin-02" />
          </Link>
          <Link href="#" title="Email">
            <i className="hgi-stroke hgi-mail-01" />
          </Link>
        </div>
      </div>
    </footer>
  );
}
