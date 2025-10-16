// src/components/ListaSimulacao.js
import React, { useState } from "react";
import { Eye, Trash2, Copy } from "lucide-react";
import ModalSimulacao from "../ModalSimulacao";

const moeda = (v) =>
  typeof v === "number" || typeof v === "string"
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))
    : "-";

const dataBR = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "-");

export default function ListaSimulacao({ data = [], onExcluir, onClonar }) {
  const [simulacaoSelecionada, setSimulacaoSelecionada] = useState(null);

  const abrirDetalhes = (id) => {
    const sim = data.find((s) => s.id === id);
    setSimulacaoSelecionada(sim);
  };

  return (
    <>
      <table className="simulacoes-table">
        <thead>
          <tr>
            <th style={{ width: 70 }}>ID</th>
            <th>Empresa</th>
            <th style={{ width: 140 }}>CNPJ</th>
            <th style={{ width: 120 }}>Data</th>
            <th style={{ width: 140 }}>Regime Atual</th>
            <th style={{ width: 150, textAlign: "right" }}>Receita Total</th>
            <th style={{ width: 150, textAlign: "right" }}>Folha Total</th>
            <th style={{ width: 120 }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", padding: "1rem" }}>
                Nenhuma simulação encontrada.
              </td>
            </tr>
          )}
          {data.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s?.empresa?.razao_social ?? "-"}</td>
              <td>{s?.empresa?.cnpj ?? "-"}</td>
              <td>{dataBR(s.data)}</td>
              <td>{s.regime_atual}</td>
              <td style={{ textAlign: "right" }}>{moeda(s.receita_total)}</td>
              <td style={{ textAlign: "right" }}>{moeda(s.folha_total)}</td>
              <td>
                <div className="acoes">
                  <button
                    className="btn-icon"
                    title="Detalhes"
                    onClick={() => abrirDetalhes(s.id)}
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    className="btn-icon"
                    title="Clonar"
                    onClick={() => onClonar && onClonar(s.id)}
                  >
                    <Copy size={18} />
                  </button>
                  <button
                    className="btn-icon btn-danger"
                    title="Excluir"
                    onClick={() => onExcluir && onExcluir(s.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal de Detalhes */}
      <ModalSimulacao
        aberto={!!simulacaoSelecionada}
        simulacao={simulacaoSelecionada}
        onClose={() => setSimulacaoSelecionada(null)}
      />
    </>
  );
}
