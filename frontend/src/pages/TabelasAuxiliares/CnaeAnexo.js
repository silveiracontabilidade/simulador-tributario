import React, { useEffect, useState } from "react";
import { CnaeAnexoAPI } from "../../api";

export function CnaeAnexo() {
  const [dados, setDados] = useState([]);
  const [novo, setNovo] = useState({ cnae: "", anexo: "" });

  const carregar = async () => {
    const { data } = await CnaeAnexoAPI.list();
    setDados(Array.isArray(data) ? data : data.results || []);
  };
  useEffect(() => { carregar(); }, []);

  const salvar = async () => {
    if (!novo.cnae || !novo.anexo) return;
    await CnaeAnexoAPI.create(novo);
    setNovo({ cnae: "", anexo: "" });
    carregar();
  };

  const excluir = async (id) => {
    if (!window.confirm("Excluir este vínculo?")) return;
    await CnaeAnexoAPI.delete(id);
    carregar();
  };

  return (
    <div>
      <h4>CNAE → Anexo</h4>
      <table>
        <thead>
          <tr><th>CNAE</th><th>Anexo</th><th>Ações</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><input value={novo.cnae} onChange={(e)=>setNovo({ ...novo, cnae: e.target.value })}/></td>
            <td><input value={novo.anexo} onChange={(e)=>setNovo({ ...novo, anexo: e.target.value })}/></td>
            <td><button className="btn btn-small btn-primary" onClick={salvar}>Adicionar</button></td>
          </tr>
          {dados.map((d) => (
            <tr key={d.id}>
              <td>{d.cnae}</td>
              <td>{d.anexo}</td>
              <td><button className="btn btn-small btn-danger" onClick={() => excluir(d.id)}>Excluir</button></td>
            </tr>
          ))}

        </tbody>
      </table>
    </div>
  );
}
