import React from "react";

export default function Sidebar({ activeKey, onSelect }) {
  const items = [
    { key: "comparativo", label: "Comparativo Tributário", group: "Ferramentas" },
  ];

  return (
    <aside className="sidebar">
      <nav>
        <ul>
          <li className="menu-title">Ferramentas</li>
          {items.map((it) => (
            <li
              key={it.key}
              className={`menu-item ${activeKey === it.key ? "active" : ""}`}
              onClick={() => onSelect?.(it.key)}
            >
              {it.label}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
