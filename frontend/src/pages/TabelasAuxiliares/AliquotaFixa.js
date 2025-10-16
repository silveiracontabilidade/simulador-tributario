import React, { useEffect, useState } from "react";
import { AliquotaFixaAPI } from "../../api";

export function AliquotaFixa() {
  const [dados, setDados] = useState([]);
  const [novo, setNovo] = useState({ imposto: "", aliquota: "" });
  const [filtro, setFiltro] = useState("");  // 🔹 estado do filtro

  const carregar = async () => {
    const { data } = await AliquotaFixaAPI.list();
    setDados(Array.isArray(data) ? data : data.results || []);
  };
  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!novo.imposto) return;
    await AliquotaFixaAPI.create(novo);
    setNovo({ imposto: "", aliquota: "" });
    carregar();
  };

  const excluir = async (id) => {
    if (!window.confirm("Excluir alíquota fixa?")) return;
    await AliquotaFixaAPI.delete(id);
    carregar();
  };

  // 🔹 aplica o filtro localmente
  const dadosFiltrados = dados.filter(d =>
    d.imposto.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div>
      <h4>Alíquotas Fixas</h4>

      {/* 🔹 campo de filtro */}
      <input
        type="text"
        placeholder="Filtrar por imposto..."
        className="filtro"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        style={{ marginBottom: "0.8rem", padding: "0.4rem", width: "100%" }}
      />

      <table>
        <thead>
          <tr>
            <th>Imposto</th>
            <th>Alíquota (%)</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {/* 🔹 usa os dados filtrados */}
          <tr>
            <td>
              <input
                value={novo.imposto}
                onChange={(e)=>setNovo({ ...novo, imposto: e.target.value })}
              />
            </td>
            <td>
              <input
                type="number"
                value={novo.aliquota}
                onChange={(e)=>setNovo({ ...novo, aliquota: e.target.value })}
              />
            </td>
            <td>
              <button className="btn btn-small btn-primary" onClick={salvar}>
                Adicionar
              </button>
            </td>
          </tr>

          {dadosFiltrados.map((d) => (
            <tr key={d.id}>
              <td>{d.imposto}</td>
              <td>{d.aliquota}</td>
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
