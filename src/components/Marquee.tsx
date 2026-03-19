export default function Marquee() {
  const items = [
    { icon: "hgi-computer", label: "SaaS" },
    { icon: "hgi-dumbbell-03", label: "Salle de sport" },
    { icon: "hgi-mortarboard-02", label: "Formation" },
    { icon: "hgi-news-01", label: "Abonnement presse" },
    { icon: "hgi-truck-delivery", label: "Service de livraison" },
    { icon: "hgi-package", label: "Box mensuelle" },
    { icon: "hgi-headset", label: "Coaching en ligne" },
    { icon: "hgi-settings-02", label: "Logiciel" },
  ];

  const track = [...items, ...items];

  return (
    <div className="marquee-wrap">
      <div className="marquee-track">
        {track.map((item, i) => (
          <span key={i} className="marquee-item">
            <i className={`hgi-stroke ${item.icon}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
