// src/pages/TabelasAuxiliares/index.js
import React, { useState } from "react";
import "./TabelasAuxiliares.css";

import { CnaeImpedimento } from "./CnaeImpedimento";
import { AliquotaFederal } from "./AliquotaFederal";
import { FaixasSimples } from "./FaixasSimples";
import { BasePresumido } from "./BasePresumido";
import { AnexosSimples } from "./AnexosSimples";

export default function TabelasAuxiliares() {
  const tabs = [
    { key: "cnae_imped", label: "CNAE Impeditivo", comp: <CnaeImpedimento /> },
    { key: "anexos", label: "Anexos Simples", comp: <AnexosSimples /> },
    { key: "faixas", label: "Faixas Simples", comp: <FaixasSimples /> },
    { key: "presumido", label: "Base Presumido", comp: <BasePresumido /> },
    { key: "aliq_federal", label: "Alíquotas Federais", comp: <AliquotaFederal /> },
  ];

  const [activeTab, setActiveTab] = useState("cnae_imped");

  return (
    <div className="tabelas-auxiliares">
      <div className="tabs-header">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${activeTab === t.key ? "active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-content">
        {tabs.find((t) => t.key === activeTab)?.comp}
      </div>
    </div>
  );
}
