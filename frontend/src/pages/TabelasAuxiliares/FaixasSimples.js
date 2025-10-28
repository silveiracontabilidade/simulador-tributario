import React, { useEffect, useState } from "react";
import { FaixaSimplesAPI } from "../../api";
import { Pencil, Trash2, Save, X } from "lucide-react";

export function FaixasSimples() {
  const [dados, setDados] = useState([]);
  const [novo, setNovo] = useState({ anexo: "", receita_de: "", receita_ate: "", aliquota: "", deducao: "" });
  const [filtro, setFiltro] = useState(""); // 🔹 estado do filtro
  const [editId, setEditId] = useState(null);
  const [editRow, setEditRow] = useState({ anexo: "", receita_de: "", receita_ate: "", aliquota: "", deducao: "" });

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
              <td>{editId === d.id ? <input value={editRow.anexo} onChange={(e)=>setEditRow({ ...editRow, anexo: e.target.value })} /> : d.anexo}</td>
              <td>{editId === d.id ? <input type="number" value={editRow.receita_de} onChange={(e)=>setEditRow({ ...editRow, receita_de: e.target.value })} /> : d.receita_de}</td>
              <td>{editId === d.id ? <input type="number" value={editRow.receita_ate} onChange={(e)=>setEditRow({ ...editRow, receita_ate: e.target.value })} /> : d.receita_ate}</td>
              <td>{editId === d.id ? <input type="number" value={editRow.aliquota} onChange={(e)=>setEditRow({ ...editRow, aliquota: e.target.value })} /> : d.aliquota}</td>
              <td>{editId === d.id ? <input type="number" value={editRow.deducao} onChange={(e)=>setEditRow({ ...editRow, deducao: e.target.value })} /> : d.deducao}</td>
              <td>
                {editId === d.id ? (
                  <span className="action-icons">
                    <button className="icon-btn" title="Salvar" onClick={async ()=>{ await FaixaSimplesAPI.update(d.id, editRow); setEditId(null); carregar(); }}>
                      <Save />
                    </button>
                    <button className="icon-btn" title="Cancelar" onClick={()=>setEditId(null)}>
                      <X />
                    </button>
                  </span>
                ) : (
                  <span className="action-icons">
                    <button className="icon-btn" title="Editar" onClick={()=>{ setEditId(d.id); setEditRow({ anexo: d.anexo, receita_de: d.receita_de, receita_ate: d.receita_ate, aliquota: d.aliquota, deducao: d.deducao }); }}>
                      <Pencil />
                    </button>
                    <button className="icon-btn danger" title="Excluir" onClick={() => excluir(d.id)}>
                      <Trash2 />
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
