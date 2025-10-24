import React from "react";
import "./ModalSimulacao.css";

const moeda = (v) =>
  typeof v === "number" || typeof v === "string"
    ? new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(v))
    : "-";

const percentual = (valor, receita) => {
  if (!receita || receita === 0) return "-";
  return ((Number(valor) / receita) * 100).toFixed(2) + "%";
};

export default function ModalSimulacao({ aberto, onClose, simulacao }) {
  if (!aberto || !simulacao) return null;

  const receitaTotal = Number(simulacao.receita_total) || 0;
  const LIMITE_SIMPLES = 4800000;
  const simplesDisponivel = receitaTotal <= LIMITE_SIMPLES;

  // lista única de impostos
  const impostos = [
    ...new Set(
      simulacao.resultados
        .map((r) => r.imposto)
        .filter((imp) => imp !== "TOTAL")
    ),
  ];

  // totais por regime
  const totalPorRegime = ["Simples", "Presumido", "Real"].reduce(
    (acc, regime) => {
      const resultadosRegime = simulacao.resultados.filter(
        (r) => r.regime === regime
      );
      const totalRow = resultadosRegime.find((r) => r.imposto === "TOTAL");
      const totalValor = totalRow
        ? Number(totalRow.valor)
        : resultadosRegime.reduce((sum, r) => sum + Number(r.valor), 0);

      return {
        ...acc,
        [regime]:
          regime === "Simples" && !simplesDisponivel ? null : totalValor,
      };
    },
    {}
  );

  // melhor regime (ignora Simples se indisponível)
  const regimesValidos = Object.entries(totalPorRegime).filter(
    ([_, v]) => v !== null
  );
  const melhorRegime = regimesValidos.reduce(
    (best, [reg, valor]) => {
      const pct = receitaTotal ? valor / receitaTotal : Infinity;
      if (pct < best.pct) return { regime: reg, pct };
      return best;
    },
    { regime: null, pct: Infinity }
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <header className="modal-header">
          <h2>Resultado da Simulação #{simulacao.id}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="modal-body">
          <div className="empresa-info">
            <p>
              <strong>Empresa:</strong>{" "}
              {simulacao?.empresa?.razao_social ?? "-"}
            </p>
            <p>
              <strong>CNPJ:</strong> {simulacao?.empresa?.cnpj ?? "-"}
            </p>
            <p>
              <strong>Data:</strong>{" "}
              {simulacao.data
                ? new Date(simulacao.data).toLocaleDateString("pt-BR")
                : "-"}
            </p>
            <p>
              <strong>Regime Atual:</strong> {simulacao.regime_atual}
            </p>
            <p>
              <strong>Receita Total:</strong> {moeda(simulacao.receita_total)}
            </p>
            <p>
              <strong>Folha Total:</strong> {moeda(simulacao.folha_total)}
            </p>
          </div>

          <h3 style={{ marginTop: "1rem" }}>Comparativo por Regime</h3>

          <table className="resultado-table">
            <thead>
              <tr>
                <th>Imposto</th>
                <th>Simples (R$)</th>
                <th>Simples (%)</th>
                <th>Presumido (R$)</th>
                <th>Presumido (%)</th>
                <th>Real (R$)</th>
                <th>Real (%)</th>
              </tr>
            </thead>
            <tbody>
              {impostos.map((imp) => {
                const simples = simulacao.resultados.find(
                  (r) => r.imposto === imp && r.regime === "Simples"
                );
                const presumido = simulacao.resultados.find(
                  (r) => r.imposto === imp && r.regime === "Presumido"
                );
                const real = simulacao.resultados.find(
                  (r) => r.imposto === imp && r.regime === "Real"
                );

                return (
                  <tr key={imp}>
                    <td>{imp}</td>

                    {/* Simples */}
                    {!simplesDisponivel ? (
                      <>
                        <td colSpan={2} style={{ color: "gray", fontStyle: "italic" }}>
                          Indisponível (&gt; R$ 4,8M)
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{simples ? moeda(simples.valor) : "-"}</td>
                        <td>
                          {simples ? percentual(simples.valor, receitaTotal) : "-"}
                        </td>
                      </>
                    )}

                    {/* Presumido */}
                    <td>{presumido ? moeda(presumido.valor) : "-"}</td>
                    <td>
                      {presumido
                        ? percentual(presumido.valor, receitaTotal)
                        : "-"}
                    </td>

                    {/* Real */}
                    <td>{real ? moeda(real.valor) : "-"}</td>
                    <td>{real ? percentual(real.valor, receitaTotal) : "-"}</td>
                  </tr>
                );
              })}

              {/* Totais */}
              <tr className="total-row">
                <td>
                  <strong>Total</strong>
                </td>
                {!simplesDisponivel ? (
                  <td colSpan={2} style={{ color: "gray", fontStyle: "italic" }}>
                    Indisponível
                  </td>
                ) : (
                  <>
                    <td>{moeda(totalPorRegime.Simples)}</td>
                    <td>{percentual(totalPorRegime.Simples, receitaTotal)}</td>
                  </>
                )}
                <td>{moeda(totalPorRegime.Presumido)}</td>
                <td>{percentual(totalPorRegime.Presumido, receitaTotal)}</td>
                <td>{moeda(totalPorRegime.Real)}</td>
                <td>{percentual(totalPorRegime.Real, receitaTotal)}</td>
              </tr>
            </tbody>
          </table>

          {(simulacao.anexos_mercadoria?.length || 0) > 0 && (
            <div className="rateio-detalhe">
              <h4>Rateio Mercadorias</h4>
              <table className="resultado-table" style={{ marginTop: 0 }}>
                <thead>
                  <tr>
                    <th>Anexo</th>
                    <th style={{ width: "160px" }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {simulacao.anexos_mercadoria.map((item) => (
                    <tr key={`m-${item.id || item.anexo}`}>
                      <td>{item.anexo_label || item.anexo}</td>
                      <td style={{ textAlign: "right" }}>{moeda(item.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(simulacao.anexos_servico?.length || 0) > 0 && (
            <div className="rateio-detalhe">
              <h4>Rateio Serviços</h4>
              <table className="resultado-table" style={{ marginTop: 0 }}>
                <thead>
                  <tr>
                    <th>Anexo</th>
                    <th style={{ width: "160px" }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {simulacao.anexos_servico.map((item) => (
                    <tr key={`s-${item.id || item.anexo}`}>
                      <td>{item.anexo_label || item.anexo}</td>
                      <td style={{ textAlign: "right" }}>{moeda(item.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="melhor-opcao">
            ✅ Melhor opção tributária:{" "}
            <strong>{melhorRegime.regime}</strong> (
            {(melhorRegime.pct * 100).toFixed(2)}% da receita)
          </div>
        </div>

        <footer className="modal-footer">
          <button className="btn" onClick={onClose}>
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
