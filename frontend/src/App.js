import React, { useMemo, useState } from "react";
import "./App.css";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ComparativoTributario from "./pages/ComparativoTributario";

const ambienteLabel = process.env.REACT_APP_ENV_LABEL || "";

export default function App() {
  const [activePage, setActivePage] = useState("comparativo");

  const banner = useMemo(() => {
    if (!ambienteLabel) return null;
    return <div className="env-banner">{ambienteLabel}</div>;
  }, []);

  return (
    <div className="app-container">
      {banner}
      <Header title="SMART CSI" />

      <div className="layout">
        <Sidebar activeKey={activePage} onSelect={setActivePage} />

        <main className="content">
          {activePage === "comparativo" ? (
            <ComparativoTributario />
          ) : (
            <h2>Bem-vindo</h2>
          )}
        </main>
      </div>
    </div>
  );
}
