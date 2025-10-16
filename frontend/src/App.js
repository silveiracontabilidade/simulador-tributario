import React, { useState } from "react";
import "./App.css";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ComparativoTributario from "./pages/ComparativoTributario";

export default function App() {
  const [activePage, setActivePage] = useState("comparativo");

  return (
    <div className="app-container">
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
