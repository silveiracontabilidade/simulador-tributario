import React, { useState, useMemo, useEffect } from "react";
import { EmpresaAPI, SimulacaoAPI, BalanceteAPI } from "../../api";
import Modal from "../../components/Modal";
import { consolidarBalancete } from "./balanceteMap";
import "./NovaSimulacao.css";

const sanitizeDigits = (value = "") => String(value).replace(/\D/g, "");

const extrairEmpresaDasLinhas = (linhas) => {
  if (!Array.isArray(linhas) || !linhas.length) {
    return { ok: false, erro: "Balancete sem linhas para analisar a empresa." };
  }

  const base = linhas.find(
    (linha) =>
      linha &&
      (linha.bdcnpjemp ||
        linha.cnpj ||
        Object.keys(linha).some((key) => key.toLowerCase().includes("cnpj")))
  );

  if (!base) {
    return { ok: false, erro: "Não localizei o CNPJ da empresa no retorno do balancete." };
  }

  const lowerCaseMap = Object.keys(base).reduce((acc, key) => {
    acc[key.toLowerCase()] = key;
    return acc;
  }, {});

  const pickValue = (candidates, transform) => {
    for (const candidate of candidates) {
      const key = lowerCaseMap[candidate.toLowerCase()] || Object.keys(lowerCaseMap).find((k) => k.includes(candidate.toLowerCase()));
      if (key) {
        const value = base[lowerCaseMap[key] || key];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          return transform ? transform(String(value)) : String(value).trim();
        }
      }
    }
    return "";
  };

  const razao_social =
    pickValue(["bdnomemp", "razao_social", "nome_empresa"]) || pickValue(["bdapeemp", "apelido_emp"]);

  const cnpj = sanitizeDigits(
    pickValue(["bdcnpjemp", "cnpj", "bdcpfcnpjverificado", "bdcpfcnpj", "cnpj_empresa"])
  );

  const municipio = pickValue([
    "bdmunicipio",
    "municipio",
    "bdnomemunicipio",
    "bdnomemun",
    "cidade",
    "bdnomemunicip",
  ]);

  const ufCandidate = pickValue(["bdufemp", "uf", "bduf"]);
  const uf = ufCandidate ? ufCandidate.trim().toUpperCase().slice(0, 2) : "";

  const cnae_principal = pickValue(["bdcnae", "bdcnaeemp", "cnae", "cnae_principal"]);

  const faltantes = [];
  const dados = {
    razao_social: razao_social.trim(),
    cnpj,
    cnae_principal: cnae_principal.trim(),
    municipio: municipio ? municipio.trim() : "",
    uf,
  };

  if (!dados.razao_social) faltantes.push("razão social");
  if (!dados.cnpj || dados.cnpj.length !== 14) faltantes.push("CNPJ");
  if (!dados.cnae_principal) faltantes.push("CNAE");

  if (faltantes.length) {
    return {
      ok: false,
      erro: `Dados insuficientes para cadastrar a empresa automaticamente (${faltantes.join(
        ", "
      )}). Cadastre a empresa manualmente e tente novamente.`,
    };
  }

  return {
    ok: true,
    dados,
  };
};

const resolverEmpresa = (metadados, linhas) => {
  if (metadados) {
    const razao_social = (metadados.razao_social || "").trim();
    const cnpj = sanitizeDigits(metadados.cnpj || "");
    const cnae_principal = (metadados.cnae || "").toString().trim();
    const municipio = (metadados.municipio || "").toString().trim();

    const faltantes = [];
    if (!razao_social) faltantes.push("razão social");
    if (!cnpj || cnpj.length !== 14) faltantes.push("CNPJ");
    if (!cnae_principal) faltantes.push("CNAE");

    if (!faltantes.length) {
      return {
        ok: true,
        dados: {
          razao_social,
          cnpj,
          cnae_principal,
          municipio,
          uf: "",
        },
      };
    }
  }

  return extrairEmpresaDasLinhas(linhas);
};

// normaliza "1.234,56" -> "1234.56"
const toDotNumber = (v) => {
  if (v === "" || v === null || v === undefined) return "0.00";
  if (typeof v === "number") return Math.abs(v).toFixed(2);
  const texto = String(v).trim();
  if (!texto) return "0.00";
  const possuiVirgula = texto.includes(",");
  const normalizado = possuiVirgula
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return "0.00";
  return Math.abs(numero).toFixed(2);
};

const moeda = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(+v || 0);

const todayISO = () => new Date().toISOString().slice(0, 10);
const startOfYearISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
};

const formatarValorBR = (valor) => {
  if (valor === null || valor === undefined || valor === "") return "";
  const texto = String(valor).trim();
  if (!texto) return "";
  let numero = NaN;
  if (texto.includes(",")) {
    const normalizado = texto.replace(/\./g, "").replace(",", ".");
    numero = Number(normalizado);
  } else {
    const normalizado = texto.replace(/\s/g, "");
    numero = Number(normalizado);
  }
  if (!Number.isFinite(numero)) return texto;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numero);
};

const calcularCompetencia = (dataISO) => {
  if (!dataISO) return "";
  const limpo = dataISO.replace(/-/g, "");
  return limpo.slice(0, 6);
};

export default function NovaSimulacao({ onSaved, initialData = null, allowImport = true }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [resultado, setResultado] = useState(null);
  const [showEmpresaModal, setShowEmpresaModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importErro, setImportErro] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importParams, setImportParams] = useState({
    empresa: "",
    dataInicio: startOfYearISO(),
    dataFim: todayISO(),
  });

  const [form, setForm] = useState({
    empresa: "",
    empresa_nome: "",
    empresa_cnpj: "",
    empresa_cnae: "",
    empresa_municipio: "",
    regime_atual: "Presumido",
    receita_total: "",
    receita_mercadorias: "",
    receita_servicos: "",
    receita_exportacao: "",
    folha_total: "",
    inss_patronal: "",
    desoneracao_folha: false,
    aliquota_iss: "",
    aliquota_icms: "",
    custo_mercadorias: "",
    custo_servicos: "",
    despesas_operacionais: "",
    creditos_pis: "",
    creditos_cofins: "",
    adicoes_fiscais: "",
    exclusoes_fiscais: "",
    lucro_contabil: "",  
  });

  const formValido = useMemo(() => {
    return String(form.empresa).length > 0 && String(form.receita_total).length > 0;
  }, [form]);

  useEffect(() => {
    if (!initialData) return;

    const empresaId =
      initialData.empresa_id ||
      (initialData.empresa && initialData.empresa.id) ||
      (typeof initialData.empresa === "number" ? initialData.empresa : "");

    const empresaNome =
      (initialData.empresa && initialData.empresa.razao_social) ||
      initialData.empresa_nome ||
      "";
    const empresaObjeto =
      initialData.empresa && typeof initialData.empresa === "object" ? initialData.empresa : {};

    setForm((prev) => ({
      ...prev,
      empresa: empresaId ? String(empresaId) : "",
      empresa_nome: empresaNome,
      empresa_cnpj:
        empresaObjeto.cnpj ||
        initialData.empresa_cnpj ||
        initialData.cnpj ||
        prev.empresa_cnpj,
      empresa_cnae:
        empresaObjeto.cnae_principal ||
        initialData.cnae_principal ||
        prev.empresa_cnae,
      empresa_municipio:
        empresaObjeto.municipio ||
        initialData.municipio ||
        prev.empresa_municipio,
      regime_atual: initialData.regime_atual || prev.regime_atual,
      receita_total: formatarValorBR(initialData.receita_total),
      receita_mercadorias: formatarValorBR(initialData.receita_mercadorias),
      receita_servicos: formatarValorBR(initialData.receita_servicos),
      receita_exportacao: formatarValorBR(initialData.receita_exportacao),
      folha_total: formatarValorBR(initialData.folha_total),
      inss_patronal: formatarValorBR(initialData.inss_patronal),
      aliquota_iss: formatarValorBR(initialData.aliquota_iss),
      aliquota_icms: formatarValorBR(initialData.aliquota_icms),
      custo_mercadorias: formatarValorBR(initialData.custo_mercadorias),
      custo_servicos: formatarValorBR(initialData.custo_servicos),
      despesas_operacionais: formatarValorBR(initialData.despesas_operacionais),
      creditos_pis: formatarValorBR(initialData.creditos_pis),
      creditos_cofins: formatarValorBR(initialData.creditos_cofins),
      adicoes_fiscais: formatarValorBR(initialData.adicoes_fiscais),
      exclusoes_fiscais: formatarValorBR(initialData.exclusoes_fiscais),
      lucro_contabil: formatarValorBR(initialData.lucro_contabil),
      desoneracao_folha: !!initialData.desoneracao_folha,
    }));
  }, [initialData]);


  const abrirImportacao = () => {
    setImportErro("");
    setMensagem("");
    setImportParams((prev) => ({
      empresa: form.empresa || prev.empresa || "",
      dataInicio: prev.dataInicio || startOfYearISO(),
      dataFim: prev.dataFim || todayISO(),
    }));
    setShowImportModal(true);
  };

  const onChange = (name, value) => setForm((p) => ({ ...p, [name]: value }));

  const handleValorChange = (name) => (event) => {
    const raw = event.target.value || "";
    const apenasDigitos = raw.replace(/\D/g, "");
    if (!apenasDigitos) {
      onChange(name, "");
      return;
    }
    const numero = (parseInt(apenasDigitos, 10) / 100).toFixed(2);
    onChange(name, formatarValorBR(numero));
  };

  const handleImportarSCI = () => {
    abrirImportacao();
  };

  const handleProcessar = async () => {
    setErro("");
    setMensagem("");
    setResultado(null);
    if (!formValido) {
      setErro("Selecione a empresa e informe pelo menos a Receita Total.");
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        empresa_id: Number(form.empresa),   // 👈 alterar aqui
        regime_atual: form.regime_atual,
        receita_total: toDotNumber(form.receita_total),
        receita_mercadorias: toDotNumber(form.receita_mercadorias),
        receita_servicos: toDotNumber(form.receita_servicos),
        receita_exportacao: toDotNumber(form.receita_exportacao),
        folha_total: toDotNumber(form.folha_total),
        inss_patronal: toDotNumber(form.inss_patronal),
        desoneracao_folha: !!form.desoneracao_folha,
        aliquota_iss: toDotNumber(form.aliquota_iss),
        aliquota_icms: toDotNumber(form.aliquota_icms),

        custo_mercadorias: toDotNumber(form.custo_mercadorias),
        custo_servicos: toDotNumber(form.custo_servicos),
        despesas_operacionais: toDotNumber(form.despesas_operacionais),
        creditos_pis: toDotNumber(form.creditos_pis),
        creditos_cofins: toDotNumber(form.creditos_cofins),
        adicoes_fiscais: toDotNumber(form.adicoes_fiscais),
        exclusoes_fiscais: toDotNumber(form.exclusoes_fiscais),
        lucro_contabil: toDotNumber(form.lucro_contabil || "0"),
      };

      const { data: sim } = await SimulacaoAPI.create(payload);
      const { data: res } = await SimulacaoAPI.processar(sim.id);
      setResultado(res);
      onSaved && onSaved();
    } catch (e) {
      console.error(e);
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.error ||
        "Falha ao processar a simulação.";
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  };

  const handleSubmitImportSci = async (event) => {
    event.preventDefault();
    setImportErro("");
    setErro("");
    setMensagem("");

    if (!importParams.empresa || !importParams.dataInicio || !importParams.dataFim) {
      setImportErro("Informe empresa, data início e data fim para importar.");
      return;
    }

    const competencia = calcularCompetencia(importParams.dataFim);
    if (!competencia) {
      setImportErro("Não foi possível determinar a competência (comp_ref).");
      return;
    }

    setImportLoading(true);
    try {
      const { data } = await BalanceteAPI.fetch({
        empresa: importParams.empresa,
        data_inicio: importParams.dataInicio,
        data_fim: importParams.dataFim,
        comp_ref: competencia,
      });

      const linhas = data?.dados || [];
      if (!linhas.length) {
        setImportErro("Balancete sem dados para os parâmetros informados. Verifique os filtros e tente novamente.");
        return;
      }

      const empresaExtraida = resolverEmpresa(data?.empresa_detalhes, linhas);
      if (!empresaExtraida.ok) {
        setImportErro(empresaExtraida.erro);
        return;
      }

      let empresaRegistrada = null;
      let empresaCriada = false;
      try {
        const { data: encontrada } = await EmpresaAPI.findByCnpj(empresaExtraida.dados.cnpj);
        empresaRegistrada = encontrada;
      } catch (consultaErro) {
        if (consultaErro?.response?.status !== 404) {
          setImportErro(
            consultaErro?.response?.data?.detail ||
              "Falha ao consultar a empresa cadastrada. Tente novamente."
          );
          return;
        }
      }

      if (!empresaRegistrada) {
        try {
          const { data: criada } = await EmpresaAPI.create(empresaExtraida.dados);
          empresaRegistrada = criada;
          empresaCriada = true;
        } catch (criacaoErro) {
          const mensagem =
            criacaoErro?.response?.data?.detail ||
            criacaoErro?.response?.data?.cnpj?.[0] ||
            "Não foi possível cadastrar a empresa automaticamente.";
          setImportErro(mensagem);
          return;
        }
      }

      const consolidado = consolidarBalancete(linhas);
      if (!consolidado || !Object.keys(consolidado).length) {
        setImportErro("Não foi possível consolidar os parâmetros do balancete com a estrutura atual das contas.");
        return;
      }
      setForm((prev) => {
        const atualizado = { ...prev };
        Object.entries(consolidado).forEach(([parametro, valor]) => {
          if (parametro in prev) {
            atualizado[parametro] = formatarValorBR(valor);
          }
        });
        atualizado.empresa = empresaRegistrada ? String(empresaRegistrada.id) : prev.empresa;
        atualizado.empresa_nome = empresaRegistrada?.razao_social || prev.empresa_nome;
        atualizado.empresa_cnpj = empresaRegistrada?.cnpj || prev.empresa_cnpj;
        atualizado.empresa_cnae = empresaRegistrada?.cnae_principal || prev.empresa_cnae;
        atualizado.empresa_municipio = empresaRegistrada?.municipio || prev.empresa_municipio;
        const regimePreferido =
          (empresaRegistrada?.regime_tributario && empresaRegistrada.regime_tributario !== "Outras"
            ? empresaRegistrada.regime_tributario
            : empresaRegistrada?.planilha_regime);
        if (regimePreferido) {
          atualizado.regime_atual = regimePreferido;
        }
        return atualizado;
      });

      setResultado(null);
      setMensagem(
        empresaCriada
          ? "Parâmetros importados do SCI com sucesso. Empresa cadastrada automaticamente."
          : "Parâmetros importados do SCI com sucesso."
      );
      setShowImportModal(false);
    } catch (error) {
      const detalhe =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        error?.message ||
        "Falha ao importar dados do SCI.";
      setImportErro(detalhe);
    } finally {
      setImportLoading(false);
    }
  };

return (
  <div className="nova-container">
    {mensagem && <div className="alert-sucesso" style={{ marginBottom: 12 }}>{mensagem}</div>}
    {erro && <div className="alert-erro" style={{ marginBottom: 12 }}>{erro}</div>}

     <div className="nova-topbar">
      <div className="left">
        {allowImport && (
          <button className="btn btn-outline" onClick={handleImportarSCI} type="button">
            IMPORTAR SCI
          </button>
        )}
      </div>
      <div className="right">
        <button
          className="btn btn-primary"
          onClick={handleProcessar}
          disabled={salvando}
          type="button"
        >
          {salvando ? "Processando..." : "Processar simulação"}
        </button>
      </div>
    </div>

    {/* Identificação */}
    <div className="card">
      <h4>Identificação</h4>

      <div className="grid-empresa">
        <div>
          <label>Empresa</label>
          <div className="empresa-selecao">
            <input
              type="text"
              readOnly
              value={form.empresa_nome}
              placeholder="Nenhuma empresa selecionada"
            />
            <button type="button" onClick={() => setShowEmpresaModal(true)}>🔍</button>
          </div>
        </div>
        <div>
          <label>CNPJ</label>
          <input
            type="text"
            readOnly
            value={form.empresa_cnpj}
            placeholder="CNPJ não selecionado"
          />
        </div>
      </div>

      <div className="grid-identificacao">
        <div>
          <label>Regime atual</label>
          <select
            value={form.regime_atual}
            onChange={(e) => onChange("regime_atual", e.target.value)}
          >
            <option value="Simples">Simples Nacional</option>
            <option value="Presumido">Lucro Presumido</option>
            <option value="Real">Lucro Real</option>
            <option value="Outras">Outras</option>
          </select>
        </div>
        <div>
          <label>ISS (%)</label>
          <input
            inputMode="decimal"
            value={form.aliquota_iss}
            onChange={(e) => onChange("aliquota_iss", e.target.value)}
          />
        </div>
        <div>
          <label>ICMS (%)</label>
          <input
            inputMode="decimal"
            value={form.aliquota_icms}
            onChange={(e) => onChange("aliquota_icms", e.target.value)}
          />
        </div>
        <div>
          <label>CNAE</label>
          <input
            type="text"
            readOnly
            value={form.empresa_cnae}
            placeholder="CNAE não selecionado"
          />
        </div>
        <div>
          <label>Município</label>
          <input
            type="text"
            readOnly
            value={form.empresa_municipio}
            placeholder="Município não informado"
          />
        </div>
      </div>
    </div>

    {/* Parâmetros */}
    <div className="card">
      <h4>Parâmetros</h4>

      <div className="grid-parametros">
        <div className="param-col">
          <label>Receita Total</label>
          <input
            inputMode="decimal"
            value={form.receita_total}
            onChange={handleValorChange("receita_total")}
          />

          <label>Receita Mercadorias</label>
          <input
            inputMode="decimal"
            value={form.receita_mercadorias}
            onChange={handleValorChange("receita_mercadorias")}
          />

          <label>Receita Serviços</label>
          <input
            inputMode="decimal"
            value={form.receita_servicos}
            onChange={handleValorChange("receita_servicos")}
          />

          <label>Receita Exportação</label>
          <input
            inputMode="decimal"
            value={form.receita_exportacao}
            onChange={handleValorChange("receita_exportacao")}
          />
        </div>

        <div className="param-col">
          <label>Folha Total</label>
          <input
            inputMode="decimal"
            value={form.folha_total}
            onChange={handleValorChange("folha_total")}
          />

          <label>INSS Patronal</label>
          <input
            inputMode="decimal"
            value={form.inss_patronal}
            onChange={handleValorChange("inss_patronal")}
          />

          <label>Custo Mercadorias</label>
          <input
            inputMode="decimal"
            value={form.custo_mercadorias}
            onChange={handleValorChange("custo_mercadorias")}
          />

          <label>Custo Serviços</label>
          <input
            inputMode="decimal"
            value={form.custo_servicos}
            onChange={handleValorChange("custo_servicos")}
          />
        </div>

        <div className="param-col">
          <label>Despesas Operacionais</label>
          <input
            inputMode="decimal"
            value={form.despesas_operacionais}
            onChange={handleValorChange("despesas_operacionais")}
          />

          <label>Créditos PIS</label>
          <input
            inputMode="decimal"
            value={form.creditos_pis}
            onChange={handleValorChange("creditos_pis")}
          />

          <label>Créditos COFINS</label>
          <input
            inputMode="decimal"
            value={form.creditos_cofins}
            onChange={handleValorChange("creditos_cofins")}
          />
        </div>

        <div className="param-col">
          <label>Adições Fiscais</label>
          <input
            inputMode="decimal"
            value={form.adicoes_fiscais}
            onChange={handleValorChange("adicoes_fiscais")}
          />

          <label>Exclusões Fiscais</label>
          <input
            inputMode="decimal"
            value={form.exclusoes_fiscais}
            onChange={handleValorChange("exclusoes_fiscais")}
          />

          <label>Lucro Contábil (opcional)</label>
          <input
            inputMode="decimal"
            value={form.lucro_contabil}
            onChange={handleValorChange("lucro_contabil")}
          />
        </div>
      </div>
    </div>

    {/* Resultado */}
    {resultado && (
      <div className="card" style={{ marginTop: 16 }}>
        <h4>Resultado</h4>
        <div className="resumo-totais">
          <div className="pill"><span>Simples</span><strong>{moeda(resultado?.simples?.TOTAL)}</strong></div>
          <div className="pill"><span>Presumido</span><strong>{moeda(resultado?.presumido?.TOTAL)}</strong></div>
          <div className="pill"><span>Real</span><strong>{moeda(resultado?.real?.TOTAL)}</strong></div>
        </div>
        <div className="grid-3">
          <TabelaRegime titulo="Simples" data={resultado.simples} />
          <TabelaRegime titulo="Presumido" data={resultado.presumido} />
          <TabelaRegime titulo="Real" data={resultado.real} />
        </div>
      </div>
    )}

    <Modal
      show={showImportModal}
      onClose={() => {
        if (!importLoading) setShowImportModal(false);
      }}
      title="Importar dados do SCI"
      size="sm"
    >
      <form className="import-sci-form" onSubmit={handleSubmitImportSci}>
        {importErro && <div className="alert-erro">{importErro}</div>}

        <div className="form-row">
          <label htmlFor="import-empresa">Empresa</label>
          <input
            id="import-empresa"
            type="number"
            value={importParams.empresa}
            onChange={(e) =>
              setImportParams((prev) => ({ ...prev, empresa: e.target.value }))
            }
            required
          />
        </div>

        <div className="form-row">
          <label htmlFor="import-inicio">Data início</label>
          <input
            id="import-inicio"
            type="date"
            value={importParams.dataInicio}
            onChange={(e) =>
              setImportParams((prev) => ({ ...prev, dataInicio: e.target.value }))
            }
            required
          />
        </div>

        <div className="form-row">
          <label htmlFor="import-fim">Data fim</label>
          <input
            id="import-fim"
            type="date"
            value={importParams.dataFim}
            onChange={(e) =>
              setImportParams((prev) => ({ ...prev, dataFim: e.target.value }))
            }
            required
          />
        </div>

        <div className="import-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              if (!importLoading) setShowImportModal(false);
            }}
          >
            Cancelar
          </button>
          <button className="btn btn-primary" type="submit" disabled={importLoading}>
            {importLoading ? "Importando..." : "Importar"}
          </button>
        </div>

        <small className="import-hint">
          Ajuste o mapeamento em <code>balanceteMap.js</code> para controlar o de-para entre contas e parâmetros.
        </small>
      </form>
    </Modal>

    {/* Modal de Pesquisa de Empresas */}
    <ModalPesquisarEmpresa
      open={showEmpresaModal}
      onClose={() => setShowEmpresaModal(false)}
      onSelect={(empresa) => {
        const regimePreferido =
          (empresa.regime_tributario && empresa.regime_tributario !== "Outras"
            ? empresa.regime_tributario
            : empresa.planilha_regime);
        setForm((prev) => ({
          ...prev,
          empresa: String(empresa.id),
          empresa_nome: empresa.razao_social || "",
          empresa_cnpj: empresa.cnpj || "",
          empresa_cnae: empresa.cnae_principal || "",
          empresa_municipio: empresa.municipio || "",
          regime_atual: regimePreferido || prev.regime_atual,
        }));
        setShowEmpresaModal(false);
      }}
    />
  </div>
);



}

function TabelaRegime({ titulo, data }) {
  if (!data) return null;
  const linhas = Object.entries(data).filter(([k]) => k !== "TOTAL");
  const moeda = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(+v || 0);

  return (
    <div className="tabela-card">
      <h5>{titulo}</h5>
      <table>
        <tbody>
          {linhas.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td style={{ textAlign: "right" }}>{moeda(v)}</td>
            </tr>
          ))}
          <tr>
            <td><strong>TOTAL</strong></td>
            <td style={{ textAlign: "right" }}>
              <strong>{moeda(data.TOTAL)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---- Modal de pesquisa de empresas ----
function ModalPesquisarEmpresa({ open, onClose, onSelect }) {
  const [empresas, setEmpresas] = useState([]);
  const [busca, setBusca] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editarEmpresa, setEditarEmpresa] = useState(null);
  const [nova, setNova] = useState({
    razao_social: "",
    cnpj: "",
    cnae_principal: "",
    municipio: "",
    uf: "",
    regime_tributario: "Outras",
  });

  useEffect(() => {
    if (open) {
      EmpresaAPI.list().then(({ data }) => {
        const lista = Array.isArray(data) ? data : data.results || [];
        setEmpresas(lista);
      });
    }
  }, [open]);

  if (!open) return null;

  const buscaLower = busca.toLowerCase();
  const filtradas = empresas.filter((e) => {
    const regimeTexto = (e.regime_tributario || e.planilha_regime || "").toLowerCase();
    return (
      e.razao_social.toLowerCase().includes(buscaLower) ||
      e.cnpj.includes(busca) ||
      e.municipio.toLowerCase().includes(buscaLower) ||
      e.uf.toLowerCase().includes(buscaLower) ||
      regimeTexto.includes(buscaLower)
    );
  });

  const handleSalvar = async () => {
    if (editarEmpresa) {
      const { data } = await EmpresaAPI.update(editarEmpresa, nova);
      setEmpresas((prev) => prev.map((e) => (e.id === editarEmpresa ? data : e)));
    } else {
      const { data } = await EmpresaAPI.create(nova);
      setEmpresas((prev) => [...prev, data]);
    }
    setMostrarForm(false);
    setNova({
      razao_social: "",
      cnpj: "",
      cnae_principal: "",
      municipio: "",
      uf: "",
      regime_tributario: "Outras",
    });
    setEditarEmpresa(null);
  };

  const handleEditar = (empresa) => {
    setNova({
      razao_social: empresa.razao_social || "",
      cnpj: empresa.cnpj || "",
      cnae_principal: empresa.cnae_principal || "",
      municipio: empresa.municipio || "",
      uf: empresa.uf || "",
      regime_tributario: empresa.regime_tributario || empresa.planilha_regime || "Outras",
    });
    setEditarEmpresa(empresa.id);
    setMostrarForm(true);
  };

  const handleExcluir = async (id) => {
    if (window.confirm("Tem certeza que deseja excluir esta empresa?")) {
      await EmpresaAPI.delete(id);
      setEmpresas((prev) => prev.filter((e) => e.id !== id));
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h4>Pesquisar Empresa</h4>

        {!mostrarForm && (
          <div style={{ marginBottom: 12 }}>
            <button
              className="btn-primary"
              onClick={() => {
                setNova({
                  razao_social: "",
                  cnpj: "",
                  cnae_principal: "",
                  municipio: "",
                  uf: "",
                  regime_tributario: "Outras",
                });
                setEditarEmpresa(null);
                setMostrarForm(true);
              }}
            >
              + Nova Empresa
            </button>
          </div>
        )}
        {mostrarForm && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h5>{editarEmpresa ? "Editar Empresa" : "Cadastrar Nova Empresa"}</h5>
            <div className="grid-2">
              <div className="form-row">
                <label>Razão Social</label>
                <input
                  value={nova.razao_social}
                  onChange={(e) => setNova({ ...nova, razao_social: e.target.value })}
                />
              </div>
              <div className="form-row">
                <label>CNPJ</label>
                <input
                  value={nova.cnpj}
                  onChange={(e) => setNova({ ...nova, cnpj: e.target.value })}
                />
              </div>
            </div>
            <div className="grid-3">
              <div className="form-row">
                <label>CNAE</label>
                <input
                  value={nova.cnae_principal}
                  onChange={(e) => setNova({ ...nova, cnae_principal: e.target.value })}
                />
              </div>
              <div className="form-row">
                <label>Município</label>
                <input
                  value={nova.municipio}
                  onChange={(e) => setNova({ ...nova, municipio: e.target.value })}
                />
              </div>
              <div className="form-row">
                <label>UF</label>
                <select value={nova.uf} onChange={(e) => setNova({ ...nova, uf: e.target.value })}>
                  <option value="">Selecione...</option>
                  {[
                    "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
                    "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
                  ].map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Regime Tributário</label>
                <select
                  value={nova.regime_tributario}
                  onChange={(e) => setNova({ ...nova, regime_tributario: e.target.value })}
                >
                  <option value="Simples">Simples Nacional</option>
                  <option value="Presumido">Lucro Presumido</option>
                  <option value="Real">Lucro Real</option>
                  <option value="Outras">Outras</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button onClick={handleSalvar}>{editarEmpresa ? "Salvar Alterações" : "Salvar"}</button>
              <button
                className="btn-outline"
                onClick={() => {
                  setMostrarForm(false);
                  setEditarEmpresa(null);
                  setNova({
                    razao_social: "",
                    cnpj: "",
                    cnae_principal: "",
                    municipio: "",
                    uf: "",
                    regime_tributario: "Outras",
                  });
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Busca */}
        <input
          type="text"
          placeholder="Buscar por razão social, CNPJ, município ou UF..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ marginBottom: 12, width: "100%", padding: "6px" }}
        />

        {/* Tabela */}
        <div style={{ flex: 1, overflowY: "auto", maxHeight: "50vh" }}>
          <table className="tabela-empresas">
            <thead>
              <tr>
                <th>Razão Social</th>
                <th>CNPJ</th>
                <th>CNAE</th>
                <th>Município</th>
                <th>UF</th>
                <th>Regime</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((e) => (
                <tr key={e.id}>
                  <td>{e.razao_social}</td>
                  <td>{e.cnpj}</td>
                  <td>{e.cnae_principal}</td>
                  <td>{e.municipio}</td>
                  <td>{e.uf}</td>
                  <td>{e.regime_tributario || e.planilha_regime || "Outras"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => onSelect(e)}>Selecionar</button>
                    <button className="btn-outline" onClick={() => handleEditar(e)}>✏️</button>
                    <button
                      className="btn-outline"
                      onClick={() => handleExcluir(e.id)}
                      style={{ color: "#b00020", borderColor: "#b00020" }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center" }}>Nenhuma empresa encontrada</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button className="btn-outline" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
