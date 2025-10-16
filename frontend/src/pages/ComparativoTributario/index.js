import React, { useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import api, { SimulacaoAPI } from "../../api";
import ListaSimulacao from "../ListaSimulacao";
import NovaSimulacao from "../NovaSimulacao";
import TabelasAuxiliares from "../TabelasAuxiliares";

export default function ComparativoTributario({ onOpenDetalhe }) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [simulacoes, setSimulacoes] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [showNovaSimulacao, setShowNovaSimulacao] = useState(false);
  const [showTabelas, setShowTabelas] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [cloneSimulacao, setCloneSimulacao] = useState(null);
  const [cloneErro, setCloneErro] = useState("");
  const [cloneCarregando, setCloneCarregando] = useState(false);

  const carregar = async () => {
    try {
      setLoading(true);
      setErro("");
      // ajuste a rota conforme seu backend (DRF ViewSet padrão):
      // GET /api/simulacoes/
      const { data } = await api.get("/simulacoes/");
      setSimulacoes(Array.isArray(data) ? data : data.results || []);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível carregar as simulações.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const simulacoesFiltradas = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (!f) return simulacoes;
    return simulacoes.filter((s) => {
      // suporta tanto empresa como objeto quanto id
      const rz =
        (s.empresa && s.empresa.razao_social) ||
        s.razao_social ||
        "";
      const cnpj =
        (s.empresa && s.empresa.cnpj) ||
        s.cnpj ||
        "";
      return (
        rz.toLowerCase().includes(f) ||
        cnpj.toLowerCase().includes(f) ||
        String(s.id || "").includes(f)
      );
    });
  }, [filtro, simulacoes]);

  const handleExcluir = async (id) => {
    const ok = window.confirm("Confirmar exclusão desta simulação?");
    if (!ok) return;
    try {
      await api.delete(`/simulacoes/${id}/`);
      setSimulacoes((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      console.error(e);
      alert("Falha ao excluir. Verifique permissões/servidor.");
    }
  };

  const handleClonar = async (id) => {
    setCloneErro("");
    setCloneSimulacao(null);
    setShowClone(true);
    setCloneCarregando(true);
    try {
      const { data } = await SimulacaoAPI.retrieve(id);
      setCloneSimulacao(data);
    } catch (e) {
      console.error(e);
      setCloneErro("Não foi possível carregar os dados da simulação para clonagem.");
    } finally {
      setCloneCarregando(false);
    }
  };

  return (
    <div>
      {/* Barra de ações */}
      <div className="actions-bar">
        <input
          type="text"
          placeholder="Filtro por empresa, CNPJ ou ID..."
          className="input-filtro"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => setShowNovaSimulacao(true)}>
          Nova Simulação
        </button>
        <button className="btn btn-outline" onClick={() => setShowTabelas(true)}>
          Tabelas Auxiliares
        </button>
      </div>

      {erro && <div className="alert-erro">{erro}</div>}
      {loading ? (
        <div className="skeleton">Carregando...</div>
      ) : (
        <ListaSimulacao
          data={simulacoesFiltradas}
          onDetalhes={(id) => onOpenDetalhe && onOpenDetalhe(id)}
          onExcluir={handleExcluir}
          onClonar={handleClonar}
        />
      )}

      {/* Modal Nova Simulação */}
      <Modal
        show={showNovaSimulacao}
        onClose={() => setShowNovaSimulacao(false)}
        title="Nova Simulação"
        size="lg"   // 👈 aqui
      >
        <NovaSimulacao
          onSaved={() => {
            setShowNovaSimulacao(false);
            carregar(); // já recarrega a lista
          }}
        />
      </Modal>


      {/* Modal Tabelas Auxiliares */}
        <Modal
          show={showTabelas}
          onClose={() => setShowTabelas(false)}
          title="Tabelas Auxiliares"
          size="lg"
        >
          <TabelasAuxiliares />
        </Modal>

      <Modal
        show={showClone}
        onClose={() => {
          setShowClone(false);
          setCloneSimulacao(null);
          setCloneErro("");
        }}
        title="Clonar Simulação"
        size="lg"
      >
        {cloneErro && <div className="alert-erro">{cloneErro}</div>}
        {cloneCarregando ? (
          <div className="skeleton">Carregando parâmetros...</div>
        ) : cloneSimulacao ? (
          <NovaSimulacao
            initialData={cloneSimulacao}
            allowImport={false}
            onSaved={() => {
              setShowClone(false);
              setCloneSimulacao(null);
              carregar();
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
