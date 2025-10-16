import React, { useEffect, useState } from "react";
import api from "../../../api";

const moeda = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(v || 0)
  );

export default function DetalheSimulacao({ id, onVoltar }) {
  const [sim, setSim] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setErro("");
        const { data } = await api.get(`/simulacoes/${id}/`);
        setSim(data);
      } catch (e) {
        console.error(e);
        setErro("Não foi possível carregar os detalhes.");
      }
    })();
  }, [id]);

  if (erro) return <div className="alert-erro">{erro}</div>;
  if (!sim) return <div>Carregando...</div>;

  return (
    <div>
      <button className="btn btn-outline" onClick={onVoltar}>← Voltar</button>
      <h2 style={{ marginTop: "1rem" }}>Simulação #{sim.id}</h2>
      <p><strong>Empresa:</strong> {sim?.empresa?.razao_social ?? sim?.razao_social} ({sim?.empresa?.cnpj ?? sim?.cnpj})</p>
      <p><strong>Regime atual:</strong> {sim.regime_atual}</p>
      <p><strong>Receita Total:</strong> {moeda(sim.receita_total)}</p>
      <p><strong>Folha Total:</strong> {moeda(sim.folha_total)}</p>
      {/* aqui você pode renderizar os "resultados" se a API retornar junto ou em /resultados/?simulacao=id */}
    </div>
  );
}
