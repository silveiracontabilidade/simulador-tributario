import React, { useEffect, useState } from "react";
import { CnaeImpedimentoAPI } from "../../api";

export function CnaeImpedimento() {
  const [dados, setDados] = useState([]);
  const [novo, setNovo] = useState({ cnae: "", descricao: "" });
  const [filtro, setFiltro] = useState(""); // 🔹 estado do filtro

  const carregar = async () => {
    const { data } = await CnaeImpedimentoAPI.list();
    setDados(Array.isArray(data) ? data : data.results || []);
  };

  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!novo.cnae || !novo.descricao) return;
    await CnaeImpedimentoAPI.create(novo);
    setNovo({ cnae: "", descricao: "" });
    carregar();
  };

  const excluir = async (id) => {
    if (!window.confirm("Excluir este registro?")) return;
    await CnaeImpedimentoAPI.delete(id);
    carregar();
  };

  // 🔹 aplica filtro em CNAE e descrição
  const dadosFiltrados = dados.filter(
    (d) =>
      d.cnae.toLowerCase().includes(filtro.toLowerCase()) ||
      d.descricao.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div>
      <h4>CNAE Impeditivo</h4>

      {/* 🔹 Campo de filtro */}
      <input
        type="text"
        placeholder="Filtrar por CNAE ou descrição..."
        className="filtro"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        style={{ marginBottom: "0.8rem", padding: "0.4rem", width: "100%" }}
      />

      <table>
        <thead>
          <tr>
            <th>CNAE</th>
            <th>Descrição</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {/* 🔹 Linha de adição no topo */}
          <tr>
            <td>
              <input
                value={novo.cnae}
                onChange={(e) => setNovo({ ...novo, cnae: e.target.value })}
                placeholder="CNAE"
              />
            </td>
            <td>
              <input
                value={novo.descricao}
                onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                placeholder="Descrição"
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
              <td>{d.cnae}</td>
              <td>{d.descricao}</td>
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

