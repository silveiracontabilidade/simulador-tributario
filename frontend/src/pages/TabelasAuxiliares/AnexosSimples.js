import React, { useEffect, useState } from "react";
import { AnexoSimplesAPI } from "../../api";

export function AnexosSimples() {
  const [dados, setDados] = useState([]);
  const [novo, setNovo] = useState({ numero: "", atividade: "" });
  const [filtro, setFiltro] = useState(""); // 🔹 estado do filtro

  const carregar = async () => {
    const { data } = await AnexoSimplesAPI.list();
    setDados(Array.isArray(data) ? data : data.results || []);
  };
  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!novo.numero || !novo.atividade) return;
    await AnexoSimplesAPI.create(novo);
    setNovo({ numero: "", atividade: "" });
    carregar();
  };

  const excluir = async (id) => {
    if (!window.confirm("Excluir anexo?")) return;
    await AnexoSimplesAPI.delete(id);
    carregar();
  };

  // 🔹 aplica filtro em número e atividade
  const dadosFiltrados = dados.filter(
    (d) =>
      String(d.numero).toLowerCase().includes(filtro.toLowerCase()) ||
      d.atividade.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div>
      <h4>Anexos Simples</h4>

      {/* 🔹 Campo de filtro */}
      <input
        type="text"
        placeholder="Filtrar por número ou atividade..."
        className="filtro"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        style={{ marginBottom: "0.8rem", padding: "0.4rem", width: "100%" }}
      />

      <table>
        <thead>
          <tr>
            <th>Número</th>
            <th>Atividade</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {/* 🔹 Linha de adição no topo */}
          <tr>
            <td>
              <input
                type="number"
                value={novo.numero}
                onChange={(e) => setNovo({ ...novo, numero: e.target.value })}
              />
            </td>
            <td>
              <input
                value={novo.atividade}
                onChange={(e) => setNovo({ ...novo, atividade: e.target.value })}
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
              <td>{d.numero}</td>
              <td>{d.atividade}</td>
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
