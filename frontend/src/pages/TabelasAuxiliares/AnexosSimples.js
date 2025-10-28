import React, { useEffect, useState } from "react";
import { AnexoSimplesAPI } from "../../api";
import { Pencil, Trash2, Save, X } from "lucide-react";

export function AnexosSimples() {
  const [dados, setDados] = useState([]);
  const [novo, setNovo] = useState({ numero: "", atividade: "" });
  const [filtro, setFiltro] = useState(""); // 🔹 estado do filtro
  const [editId, setEditId] = useState(null);
  const [editRow, setEditRow] = useState({ numero: "", atividade: "" });

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
              <td>
                {editId === d.id ? (
                  <input type="number" value={editRow.numero} onChange={(e)=>setEditRow({ ...editRow, numero: e.target.value })} />
                ) : (
                  d.numero
                )}
              </td>
              <td>
                {editId === d.id ? (
                  <input value={editRow.atividade} onChange={(e)=>setEditRow({ ...editRow, atividade: e.target.value })} />
                ) : (
                  d.atividade
                )}
              </td>
              <td>
                {editId === d.id ? (
                  <span className="action-icons">
                    <button className="icon-btn" title="Salvar" onClick={async ()=>{ await AnexoSimplesAPI.update(d.id, editRow); setEditId(null); carregar(); }}>
                      <Save />
                    </button>
                    <button className="icon-btn" title="Cancelar" onClick={()=>setEditId(null)}>
                      <X />
                    </button>
                  </span>
                ) : (
                  <span className="action-icons">
                    <button className="icon-btn" title="Editar" onClick={()=>{ setEditId(d.id); setEditRow({ numero: d.numero, atividade: d.atividade }); }}>
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
