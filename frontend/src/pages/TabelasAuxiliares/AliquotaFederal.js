import React, { useEffect, useState } from "react";
import { AliquotaFederalAPI } from "../../api";
import { Pencil, Trash2, Save, X } from "lucide-react";

export function AliquotaFederal() {
  const [dados, setDados] = useState([]);
  const [novo, setNovo] = useState({ imposto: "", aliquota: "", base_calculo: "" });
  const [filtro, setFiltro] = useState(""); // 🔹 estado do filtro
  const [editId, setEditId] = useState(null);
  const [editRow, setEditRow] = useState({ imposto: "", aliquota: "", base_calculo: "" });

  const carregar = async () => {
    const { data } = await AliquotaFederalAPI.list();
    setDados(Array.isArray(data) ? data : data.results || []);
  };
  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!novo.imposto) return;
    await AliquotaFederalAPI.create(novo);
    setNovo({ imposto: "", aliquota: "", base_calculo: "" });
    carregar();
  };

  const excluir = async (id) => {
    await AliquotaFederalAPI.delete(id);
    carregar();
  };

  // 🔹 aplica filtro em imposto e base_calculo
  const dadosFiltrados = dados.filter(
    (d) =>
      d.imposto.toLowerCase().includes(filtro.toLowerCase()) ||
      d.base_calculo.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div>
      <h4>Alíquotas Federais</h4>

      {/* 🔹 Campo de filtro */}
      <input
        type="text"
        className="filtro"
        placeholder="Filtrar por imposto ou base de cálculo..."
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        style={{ marginBottom: "0.8rem", padding: "0.4rem", width: "100%" }}
      />

      <table>
        <thead>
          <tr>
            <th>Imposto</th>
            <th>Alíquota (%)</th>
            <th>Base de Cálculo</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {/* 🔹 Linha de adição no topo */}
          <tr>
            <td>
              <input
                value={novo.imposto}
                onChange={(e) => setNovo({ ...novo, imposto: e.target.value })}
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
                value={novo.base_calculo}
                onChange={(e) => setNovo({ ...novo, base_calculo: e.target.value })}
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
                  <input value={editRow.imposto} onChange={(e)=>setEditRow({ ...editRow, imposto: e.target.value })} />
                ) : d.imposto}
              </td>
              <td>
                {editId === d.id ? (
                  <input type="number" value={editRow.aliquota} onChange={(e)=>setEditRow({ ...editRow, aliquota: e.target.value })} />
                ) : d.aliquota}
              </td>
              <td>
                {editId === d.id ? (
                  <input value={editRow.base_calculo} onChange={(e)=>setEditRow({ ...editRow, base_calculo: e.target.value })} />
                ) : d.base_calculo}
              </td>
              <td>
                {editId === d.id ? (
                  <span className="action-icons">
                    <button className="icon-btn" title="Salvar" onClick={async ()=>{ await AliquotaFederalAPI.update(d.id, editRow); setEditId(null); carregar(); }}>
                      <Save />
                    </button>
                    <button className="icon-btn" title="Cancelar" onClick={()=>setEditId(null)}>
                      <X />
                    </button>
                  </span>
                ) : (
                  <span className="action-icons">
                    <button className="icon-btn" title="Editar" onClick={()=>{ setEditId(d.id); setEditRow({ imposto: d.imposto, aliquota: d.aliquota, base_calculo: d.base_calculo }); }}>
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
