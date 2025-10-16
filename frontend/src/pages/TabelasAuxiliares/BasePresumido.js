import React, { useEffect, useState } from "react";
import { BasePresumidoAPI } from "../../api";

export function BasePresumido() {
  const [dados, setDados] = useState([]);
  const [novo, setNovo] = useState({ atividade: "", fator_irpj: "", fator_csll: "" });
  const [filtro, setFiltro] = useState(""); // 🔹 estado do filtro

  const carregar = async () => {
    const { data } = await BasePresumidoAPI.list();
    setDados(Array.isArray(data) ? data : data.results || []);
  };
  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!novo.atividade) return;
    await BasePresumidoAPI.create(novo);
    setNovo({ atividade: "", fator_irpj: "", fator_csll: "" });
    carregar();
  };

  const excluir = async (id) => {
    if (!window.confirm("Excluir base?")) return;
    await BasePresumidoAPI.delete(id);
    carregar();
  };

  // 🔹 aplica filtro em atividade
  const dadosFiltrados = dados.filter((d) =>
    d.atividade.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div>
      <h4>Base Presumido</h4>

      {/* 🔹 Campo de filtro */}
      <input
        type="text"
        placeholder="Filtrar por atividade..."
        className="filtro"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        style={{ marginBottom: "0.8rem", padding: "0.4rem", width: "100%" }}
      />

      <table>
        <thead>
          <tr>
            <th>Atividade</th>
            <th>IRPJ (%)</th>
            <th>CSLL (%)</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {/* 🔹 Linha de adição no topo */}
          <tr>
            <td>
              <input
                value={novo.atividade}
                onChange={(e) => setNovo({ ...novo, atividade: e.target.value })}
              />
            </td>
            <td>
              <input
                type="number"
                value={novo.fator_irpj}
                onChange={(e) => setNovo({ ...novo, fator_irpj: e.target.value })}
              />
            </td>
            <td>
              <input
                type="number"
                value={novo.fator_csll}
                onChange={(e) => setNovo({ ...novo, fator_csll: e.target.value })}
              />
            </td>
            <td>
              <button className="btn btn-small btn-primary" onClick={salvar}>
                Adicionar
              </button>
            </td>
          </tr>

          {/* 🔹 Lista filtrada */}
          {dadosFiltrados.map((d) => (
            <tr key={d.id}>
              <td>{d.atividade}</td>
              <td>{d.fator_irpj}</td>
              <td>{d.fator_csll}</td>
              <td>
                <button
                  className="btn btn-small btn-danger"
                  onClick={() => excluir(d.id)}
                >
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
