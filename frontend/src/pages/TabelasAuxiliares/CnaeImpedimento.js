import React, { useEffect, useState } from "react";
import { CnaeImpedimentoAPI } from "../../api";
import { Pencil, Trash2, Save, X } from "lucide-react";

export function CnaeImpedimento() {
  const [dados, setDados] = useState([]);
  const [novo, setNovo] = useState({ cnae: "", descricao: "" });
  const [filtro, setFiltro] = useState(""); // 🔹 estado do filtro
  const [editId, setEditId] = useState(null);
  const [editRow, setEditRow] = useState({ cnae: "", descricao: "" });

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
              <td>
                {editId === d.id ? (
                  <input value={editRow.cnae} onChange={(e)=>setEditRow({ ...editRow, cnae: e.target.value })} />
                ) : (
                  d.cnae
                )}
              </td>
              <td>
                {editId === d.id ? (
                  <input value={editRow.descricao} onChange={(e)=>setEditRow({ ...editRow, descricao: e.target.value })} />
                ) : (
                  d.descricao
                )}
              </td>
              <td>
                {editId === d.id ? (
                  <span className="action-icons">
                    <button className="icon-btn" title="Salvar" onClick={async ()=>{ await CnaeImpedimentoAPI.update(d.id, editRow); setEditId(null); carregar(); }}>
                      <Save />
                    </button>
                    <button className="icon-btn" title="Cancelar" onClick={()=>setEditId(null)}>
                      <X />
                    </button>
                  </span>
                ) : (
                  <span className="action-icons">
                    <button className="icon-btn" title="Editar" onClick={()=>{ setEditId(d.id); setEditRow({ cnae: d.cnae, descricao: d.descricao }); }}>
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
