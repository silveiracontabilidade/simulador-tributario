import React, { useEffect, useState } from "react";
import { FaixaSimplesAPI } from "../../api";

export function FaixasSimples() {
  const [dados, setDados] = useState([]);
  const [novo, setNovo] = useState({ anexo: "", receita_de: "", receita_ate: "", aliquota: "", deducao: "" });
  const [filtro, setFiltro] = useState(""); // 🔹 estado do filtro

  const carregar = async () => {
    const { data } = await FaixaSimplesAPI.list();
    setDados(Array.isArray(data) ? data : data.results || []);
  };
  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!novo.anexo) return;
    await FaixaSimplesAPI.create(novo);
    setNovo({ anexo: "", receita_de: "", receita_ate: "", aliquota: "", deducao: "" });
    carregar();
  };

  const excluir = async (id) => {
    if (!window.confirm("Excluir faixa?")) return;
    await FaixaSimplesAPI.delete(id);
    carregar();
  };

  // // 🔹 aplica filtro em anexo
  // const dadosFiltrados = dados.filter((d) =>
  //   d.anexo.toLowerCase().includes(filtro.toLowerCase())
  // );

  // 🔹 aplica filtro em anexo (converte para string para evitar erro)
  const dadosFiltrados = dados.filter((d) =>
    String(d.anexo).toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div>
      <h4>Faixas do Simples</h4>

      {/* 🔹 Campo de filtro */}
      <input
        type="text"
        placeholder="Filtrar por anexo..."
        className="filtro"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        style={{ marginBottom: "0.8rem", padding: "0.4rem", width: "100%" }}
      />

      <table>
        <thead>
          <tr>
            <th>Anexo</th>
            <th>Receita De</th>
            <th>Receita Até</th>
            <th>Alíquota (%)</th>
            <th>Dedução</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {/* 🔹 Linha de adição no topo */}
          <tr>
            <td>
              <input
                value={novo.anexo}
                onChange={(e) => setNovo({ ...novo, anexo: e.target.value })}
              />
            </td>
            <td>
              <input
                type="number"
                value={novo.receita_de}
                onChange={(e) => setNovo({ ...novo, receita_de: e.target.value })}
              />
            </td>
            <td>
              <input
                type="number"
                value={novo.receita_ate}
                onChange={(e) => setNovo({ ...novo, receita_ate: e.target.value })}
              />
            </td>
            <td>
              <input
                type="number"
                value={novo.aliquota}
                onChange={(e) => setNovo({ ...novo, aliquota: e.target.value })}
              />
            </td>
            <td>
              <input
                type="number"
                value={novo.deducao}
                onChange={(e) => setNovo({ ...novo, deducao: e.target.value })}
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
              <td>{d.anexo}</td>
              <td>{d.receita_de}</td>
              <td>{d.receita_ate}</td>
              <td>{d.aliquota}</td>
              <td>{d.deducao}</td>
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
