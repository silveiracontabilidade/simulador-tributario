import React, { useState, useMemo, useEffect } from "react";
import { Info } from "lucide-react";
import { EmpresaAPI, SimulacaoAPI, BalanceteAPI, AnexoSimplesAPI, BasePresumidoAPI, AliquotaFederalAPI } from "../../api";
import Modal from "../../components/Modal";
import { consolidarBalancete } from "./balanceteMap";
import "./NovaSimulacao.css";

const sanitizeDigits = (value = "") => String(value).replace(/\D/g, "");
const gerarChave = () => Math.random().toString(36).slice(2, 11);

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
      const key =
        lowerCaseMap[candidate.toLowerCase()] ||
        Object.keys(lowerCaseMap).find((k) => k.includes(candidate.toLowerCase()));
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
  const normalizado = possuiVirgula ? texto.replace(/\./g, "").replace(",", ".") : texto;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return "0.00";
  return Math.abs(numero).toFixed(2);
};

const moeda = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(+v || 0);

const toDecimal = (valor, casas = 4) => {
  if (valor === null || valor === undefined || valor === "") return "0";
  const num = Number(String(valor).replace(",", "."));
  if (!Number.isFinite(num)) return "0";
  return num.toFixed(casas);
};

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

const valorParaNumero = (valor) => {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  const texto = String(valor).trim();
  if (!texto) return 0;
  const normalizado = texto.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
};

const somarRateios = (rateios) => rateios.reduce((acc, item) => acc + valorParaNumero(item.valor), 0);

const primeiroDiaDoMes = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const ultimoDiaDoMes = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const formatISO = (date) => date.toISOString().slice(0, 10);

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
  const [anexos, setAnexos] = useState([]);
  const [basesPresumidas, setBasesPresumidas] = useState([]);
  const [aliqPisDefault, setAliqPisDefault] = useState("");
  const [aliqCofinsDefault, setAliqCofinsDefault] = useState("");
  const [rateiosMercadoria, setRateiosMercadoria] = useState([]);
  const [rateiosServico, setRateiosServico] = useState([]);
  const [rbt12Interval, setRbt12Interval] = useState(null);

  // UX: Tabs + acordeões
  const [useTabs, setUseTabs] = useState(() => {
    const v = localStorage.getItem("ui.useTabs");
    return (v === null ? "true" : v) !== "false";
  });
  const [activeTab, setActiveTab] = useState("geral");
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("ui.collapsed") || "{}");
    } catch (e) {
      return {};
    }
  });

  const tabs = [
    { key: "geral", label: "Geral", sections: ["identificacao", "receitas"] },
    { key: "tributos", label: "Tributos", sections: ["presumido", "issicms", "federais"] },
    { key: "rateios", label: "Rateios", sections: ["rateio-merc", "rateio-serv"] },
    { key: "custos", label: "Custos/Créditos", sections: ["custos"] },
    { key: "folha", label: "Folha/INSS", sections: ["folha"] },
    { key: "despesas", label: "Despesas/Ajustes", sections: ["despesas"] },
  ];

  const showSection = (id) => {
    if (!useTabs) return true;
    const tab = tabs.find((t) => t.key === activeTab);
    const sections = tab && tab.sections ? tab.sections : [];
    return sections.includes(id);
  };

  const toggleCollapse = (id) =>
    setCollapsed((prev) => {
      const next = Object.assign({}, prev);
      next[id] = !prev[id];
      return next;
    });

  useEffect(() => {
    localStorage.setItem("ui.useTabs", useTabs ? "true" : "false");
  }, [useTabs]);

  useEffect(() => {
    localStorage.setItem("ui.activeTab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem("ui.collapsed", JSON.stringify(collapsed));
  }, [collapsed]);

  // Carrega valores padrão de PIS/COFINS (Cumulativo - Presumido)
  useEffect(() => {
    (async () => {
      try {
        const [pis, cofins] = await Promise.all([
          AliquotaFederalAPI.list({ imposto: "PIS", base_calculo: "Cumulativo" }),
          AliquotaFederalAPI.list({ imposto: "COFINS", base_calculo: "Cumulativo" }),
        ]);
        const pisAliq = (pis && pis.data && pis.data[0] && pis.data[0].aliquota) || "0.65";
        const cofinsAliq = (cofins && cofins.data && cofins.data[0] && cofins.data[0].aliquota) || "3.00";
        setAliqPisDefault(String(pisAliq));
        setAliqCofinsDefault(String(cofinsAliq));
        setForm((prev) => ({
          ...prev,
          aliquota_pis: prev.aliquota_pis || String(pisAliq),
          aliquota_cofins: prev.aliquota_cofins || String(cofinsAliq),
        }));
      } catch (_e) {
        setAliqPisDefault("0.65");
        setAliqCofinsDefault("3.00");
        setForm((prev) => ({
          ...prev,
          aliquota_pis: prev.aliquota_pis || "0.65",
          aliquota_cofins: prev.aliquota_cofins || "3.00",
        }));
      }
    })();
  }, []);

  const defaultForm = () => ({
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
    receita_deducoes: "",
    outras_receitas: "",
    folha_total: "",
    inss_patronal: "",
    desoneracao_folha: false,
    aliquota_inss_total: "",
    aliquota_iss: "",
    aliquota_icms: "",
    aliquota_pis: "",
    aliquota_cofins: "",
    custo_mercadorias: "",
    custo_servicos: "",
    despesas_operacionais: "",
    outras_despesas: "",
    pro_labore: "",
    despesas_nao_dedutiveis: "",
    investimentos: "",
    depreciacao: "",
    creditos_pis: "",
    creditos_cofins: "",
    adicoes_fiscais: "",
    exclusoes_fiscais: "",
    lucro_contabil: "",
    receita_12_meses: "",
    // Percentuais de presunção informados pelo usuário
    presumido_irpj_merc: "",
    presumido_csll_merc: "",
    presumido_irpj_serv: "",
    presumido_csll_serv: "",
    base_presumido_merc_id: "",
    base_presumido_serv_id: "",
  });
  const [form, setForm] = useState(defaultForm());

  const criarLinhaRateio = (dados = {}) => ({
    key: gerarChave(),
    id: dados.id || null,
    anexo: dados.anexo ? String(dados.anexo) : "",
    valor:
      dados.valor !== undefined && dados.valor !== null && dados.valor !== ""
        ? formatarValorBR(dados.valor)
        : "",
  });

  const atualizarRateio = (tipo, chave, campo, valor) => {
    const setter = tipo === "mercadoria" ? setRateiosMercadoria : setRateiosServico;
    setter((prev) =>
      prev.map((item) => {
        if (item.key !== chave) return item;
        if (campo === "anexo") {
          return Object.assign({}, item, { anexo: valor });
        }
        if (campo === "valor") {
          const digits = (valor || "").replace(/\D/g, "");
          const formatado = digits ? formatarValorBR((parseInt(digits, 10) / 100).toFixed(2)) : "";
          return Object.assign({}, item, { valor: formatado });
        }
        return item;
      })
    );
  };

  const adicionarRateio = (tipo) => {
    const setter = tipo === "mercadoria" ? setRateiosMercadoria : setRateiosServico;
    setter((prev) => prev.concat([criarLinhaRateio()]));
  };

  const removerRateio = (tipo, chave) => {
    const setter = tipo === "mercadoria" ? setRateiosMercadoria : setRateiosServico;
    setter((prev) => prev.filter((item) => item.key !== chave));
  };

  // INSS CPRB toggle removed: alíquota única informada pelo usuário

  const calcularReceita12Meses = async (empresaId, dataFimISO) => {
    if (!empresaId || !dataFimISO) return 0;
    // Usa o último mês do período selecionado como mês final do RBT12
    const ref = new Date(`${dataFimISO}T00:00:00`);
    const ultimoMesPeriodo = new Date(ref.getFullYear(), ref.getMonth(), 1);
    // Janela de 12 meses incluindo o último mês do período
    const inicioPeriodo = new Date(ultimoMesPeriodo.getFullYear(), ultimoMesPeriodo.getMonth() - 11, 1);
    const fimPeriodo = ultimoDiaDoMes(ultimoMesPeriodo);
    const inicioStr = formatISO(inicioPeriodo);
    const fimStr = formatISO(fimPeriodo);
    // Armazena intervalo para tooltip (ex.: jan/2024 a dez/2024)
    try {
      const fmt = (iso) => {
        const d = new Date(`${iso}T00:00:00`);
        return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
      };
      setRbt12Interval({ inicio: inicioStr, fim: fimStr, label: `${fmt(inicioStr)} a ${fmt(fimStr)}` });
    } catch (_e) {}
    // comp_ref é o próprio último mês do período selecionado
    const comp = calcularCompetencia(fimStr);
    try {
      const { data } = await BalanceteAPI.fetch({
        empresa: empresaId,
        data_inicio: inicioStr,
        data_fim: fimStr,
        comp_ref: comp,
      });
      const linhas = (data && data.dados) ? data.dados : [];
      if (!linhas.length) return 0;
      // Preferir campo de movimento do período quando existir
      const candidatosCampo = [
        "bdvalor_periodo",
        "bdvlr_periodo",
        "bdvalor_mes",
        "bdmovimento",
        "bdvalor",
        "bdsaldo_atual",
      ];
      const consol = consolidarBalancete(linhas, candidatosCampo);
      // Para RBT12 do Simples, usar receita bruta (conta 03)
      const base = valorParaNumero(consol.receita_bruta ?? 0);
      if (base > 0) return base;
      // Fallback: calcula manualmente se não vier (sem deduções)
      const rb =
        valorParaNumero(consol.receita_mercadorias) +
        valorParaNumero(consol.receita_servicos) +
        valorParaNumero(consol.receita_exportacao);
      return rb;
    } catch (erro) {
      console.error("Falha ao obter balancete para cálculo do RBT12:", erro);
      throw erro;
    }
  };

  const validarRateios = () => {
    const rbt12 = valorParaNumero(form.receita_12_meses);
    if (rbt12 <= 0) {
      setErro("Informe a Receita dos últimos 12 meses (RBT12).");
      return false;
    }

    const totalMerc = valorParaNumero(form.receita_mercadorias);
    const totalServ = valorParaNumero(form.receita_servicos);
    const somaMerc = somarRateios(rateiosMercadoria);
    const somaServ = somarRateios(rateiosServico);

    if (totalMerc > 0) {
      if (!rateiosMercadoria.length) {
        setErro("Adicione pelo menos um anexo para a Receita de Mercadorias.");
        return false;
      }
      if (Math.abs(totalMerc - somaMerc) > 0.01) {
        setErro("A soma dos anexos de mercadorias deve ser igual ao valor informado.");
        return false;
      }
      if (rateiosMercadoria.some((item) => !item.anexo)) {
        setErro("Selecione o anexo para cada linha de mercadorias.");
        return false;
      }
    }

    if (totalServ > 0) {
      if (!rateiosServico.length) {
        setErro("Adicione pelo menos um anexo para a Receita de Serviços.");
        return false;
      }
      if (Math.abs(totalServ - somaServ) > 0.01) {
        setErro("A soma dos anexos de serviços deve ser igual ao valor informado.");
        return false;
      }
      if (rateiosServico.some((item) => !item.anexo)) {
        setErro("Selecione o anexo para cada linha de serviços.");
        return false;
      }
    }

    // INSS: exigir alíquota única ou valor informado quando houver folha
    const folha = valorParaNumero(form.folha_total);
    const inssInformado = valorParaNumero(form.inss_patronal);
    const aliqInss = Number(String(form.aliquota_inss_total || "0").replace(",", "."));
    if (folha > 0 && inssInformado <= 0 && aliqInss <= 0) {
      setErro("Informe a alíquota única de INSS (ou o valor de INSS patronal).");
      return false;
    }

    // Percentuais de presunção (Presumido): pedir quando houver receita correspondente
    if (totalMerc > 0) {
      const irpj = Number(String(form.presumido_irpj_merc || "0").replace(",", "."));
      const csll = Number(String(form.presumido_csll_merc || "0").replace(",", "."));
      if (irpj <= 0 || csll <= 0) {
        setErro("Informe os percentuais de presunção (IRPJ/CSLL) para Mercadorias.");
        return false;
      }
    }
    if (totalServ > 0) {
      const irpj = Number(String(form.presumido_irpj_serv || "0").replace(",", "."));
      const csll = Number(String(form.presumido_csll_serv || "0").replace(",", "."));
      if (irpj <= 0 || csll <= 0) {
        setErro("Informe os percentuais de presunção (IRPJ/CSLL) para Serviços.");
        return false;
      }
    }

    // PIS/COFINS devem estar preenchidos e > 0
    const pisNum = Number(String(form.aliquota_pis || "").replace(",", "."));
    const cofinsNum = Number(String(form.aliquota_cofins || "").replace(",", "."));
    if (!Number.isFinite(pisNum) || pisNum <= 0 || !Number.isFinite(cofinsNum) || cofinsNum <= 0) {
      setErro("Informe as alíquotas de PIS e COFINS.");
      return false;
    }

    return true;
  };

  const formValido = useMemo(() => {
    return (
      String(form.empresa).length > 0 &&
      String(form.receita_total).length > 0 &&
      String(form.receita_12_meses).length > 0
    );
  }, [form]);

  useEffect(() => {
    AnexoSimplesAPI.list().then(({ data }) => {
      const lista = Array.isArray(data) ? data : data.results || [];
      setAnexos(lista);
    });
    BasePresumidoAPI.list().then(({ data }) => {
      const lista = Array.isArray(data) ? data : data.results || [];
      setBasesPresumidas(lista);
    });
  }, []);

  // Helper: tenta casar percentuais atuais com uma base presumida e selecionar o id
  useEffect(() => {
    if (!basesPresumidas.length) return;
    const match = (irpj, csll) => {
      const toNum = (v) => Number(String(v).replace(",", "."));
      const ir = toNum(irpj);
      const cs = toNum(csll);
      const found = basesPresumidas.find((b) => Number(b.fator_irpj) === ir && Number(b.fator_csll) === cs);
      return found ? String(found.id) : "";
    };
    setForm((prev) => ({
      ...prev, // 👈 mantém os demais campos do form
      base_presumido_merc_id:
        prev.presumido_irpj_merc && prev.presumido_csll_merc
          ? match(prev.presumido_irpj_merc, prev.presumido_csll_merc)
          : prev.base_presumido_merc_id,
      base_presumido_serv_id:
        prev.presumido_irpj_serv && prev.presumido_csll_serv
          ? match(prev.presumido_irpj_serv, prev.presumido_csll_serv)
          : prev.base_presumido_serv_id,
    }));
  }, [basesPresumidas]);

  useEffect(() => {
    if (!initialData) {
      // Nova simulação: limpar campos e garantir aba "Geral"
      setForm(defaultForm());
      setRateiosMercadoria([]);
      setRateiosServico([]);
      setActiveTab("geral");
      return;
    }

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
      receita_deducoes: formatarValorBR(initialData.receita_deducoes),
      outras_receitas: formatarValorBR(initialData.outras_receitas),
      folha_total: formatarValorBR(initialData.folha_total),
      inss_patronal: formatarValorBR(initialData.inss_patronal),
      aliquota_inss_total:
        initialData.aliquota_inss_total !== undefined && initialData.aliquota_inss_total !== null
          ? String(initialData.aliquota_inss_total)
          : prev.aliquota_inss_total,
      aliquota_iss: formatarValorBR(initialData.aliquota_iss),
      aliquota_icms: formatarValorBR(initialData.aliquota_icms),
      custo_mercadorias: formatarValorBR(initialData.custo_mercadorias),
      custo_servicos: formatarValorBR(initialData.custo_servicos),
      despesas_operacionais: formatarValorBR(initialData.despesas_operacionais),
      outras_despesas: formatarValorBR(initialData.outras_despesas),
      pro_labore: formatarValorBR(initialData.pro_labore),
      despesas_nao_dedutiveis: formatarValorBR(initialData.despesas_nao_dedutiveis),
      investimentos: formatarValorBR(initialData.investimentos),
      depreciacao: formatarValorBR(initialData.depreciacao),
      creditos_pis: formatarValorBR(initialData.creditos_pis),
      creditos_cofins: formatarValorBR(initialData.creditos_cofins),
      adicoes_fiscais: formatarValorBR(initialData.adicoes_fiscais),
      exclusoes_fiscais: formatarValorBR(initialData.exclusoes_fiscais),
      lucro_contabil: formatarValorBR(initialData.lucro_contabil),
      desoneracao_folha: !!initialData.desoneracao_folha,
      receita_12_meses: formatarValorBR(initialData.receita_12_meses),
      presumido_irpj_merc:
        initialData.presumido_irpj_merc !== undefined && initialData.presumido_irpj_merc !== null
          ? String(initialData.presumido_irpj_merc)
          : prev.presumido_irpj_merc,
      presumido_csll_merc:
        initialData.presumido_csll_merc !== undefined && initialData.presumido_csll_merc !== null
          ? String(initialData.presumido_csll_merc)
          : prev.presumido_csll_merc,
      presumido_irpj_serv:
        initialData.presumido_irpj_serv !== undefined && initialData.presumido_irpj_serv !== null
          ? String(initialData.presumido_irpj_serv)
          : prev.presumido_irpj_serv,
      presumido_csll_serv:
        initialData.presumido_csll_serv !== undefined && initialData.presumido_csll_serv !== null
          ? String(initialData.presumido_csll_serv)
          : prev.presumido_csll_serv,
    }));

    const rateiosMerc = (initialData.anexos_mercadoria || []).map(criarLinhaRateio);
    const rateiosServ = (initialData.anexos_servico || []).map(criarLinhaRateio);
    setRateiosMercadoria(rateiosMerc);
    setRateiosServico(rateiosServ);
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

  const onChange = (name, value) =>
    setForm((p) => {
      const novo = Object.assign({}, p);
      novo[name] = value;
      return novo;
    });

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
    if (!validarRateios()) {
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        empresa_id: Number(form.empresa),
        regime_atual: form.regime_atual,
        receita_12_meses: toDotNumber(form.receita_12_meses),
        receita_total: toDotNumber(form.receita_total),
        receita_mercadorias: toDotNumber(form.receita_mercadorias),
        receita_servicos: toDotNumber(form.receita_servicos),
        receita_exportacao: toDotNumber(form.receita_exportacao),
        receita_deducoes: toDotNumber(form.receita_deducoes),
        outras_receitas: toDotNumber(form.outras_receitas),
        folha_total: toDotNumber(form.folha_total),
        inss_patronal: toDotNumber(form.inss_patronal),
        desoneracao_folha: !!form.desoneracao_folha,
        aliquota_inss_total: Number(toDecimal(form.aliquota_inss_total, 4)),
        aliquota_iss: toDotNumber(form.aliquota_iss),
        aliquota_icms: toDotNumber(form.aliquota_icms),
        aliquota_pis: Number(toDecimal(form.aliquota_pis, 2)),
        aliquota_cofins: Number(toDecimal(form.aliquota_cofins, 2)),

        custo_mercadorias: toDotNumber(form.custo_mercadorias),
        custo_servicos: toDotNumber(form.custo_servicos),
        despesas_operacionais: toDotNumber(form.despesas_operacionais),
        outras_despesas: toDotNumber(form.outras_despesas),
        pro_labore: toDotNumber(form.pro_labore),
        despesas_nao_dedutiveis: toDotNumber(form.despesas_nao_dedutiveis),
        investimentos: toDotNumber(form.investimentos),
        depreciacao: toDotNumber(form.depreciacao),
        creditos_pis: toDotNumber(form.creditos_pis),
        creditos_cofins: toDotNumber(form.creditos_cofins),
        adicoes_fiscais: toDotNumber(form.adicoes_fiscais),
        exclusoes_fiscais: toDotNumber(form.exclusoes_fiscais),
        lucro_contabil: toDotNumber(form.lucro_contabil || "0"),
        presumido_irpj_merc: Number(toDecimal(form.presumido_irpj_merc, 2)),
        presumido_csll_merc: Number(toDecimal(form.presumido_csll_merc, 2)),
        presumido_irpj_serv: Number(toDecimal(form.presumido_irpj_serv, 2)),
        presumido_csll_serv: Number(toDecimal(form.presumido_csll_serv, 2)),
        anexos_mercadoria: rateiosMercadoria
          .filter((item) => valorParaNumero(item.valor) > 0)
          .map((item) => ({
            anexo: item.anexo ? Number(item.anexo) : null,
            valor: toDotNumber(item.valor || "0"),
          })),
        anexos_servico: rateiosServico
          .filter((item) => valorParaNumero(item.valor) > 0)
          .map((item) => ({
            anexo: item.anexo ? Number(item.anexo) : null,
            valor: toDotNumber(item.valor || "0"),
          })),
      };

      const { data: sim } = await SimulacaoAPI.create(payload);
      const { data: res } = await SimulacaoAPI.processar(sim.id);
      setResultado(res);
      onSaved && onSaved();
    } catch (e) {
      console.error(e);
      const msg =
        (e && e.response && e.response.data && (e.response.data.detail || e.response.data.error)) ||
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

      const linhas = (data && data.dados) ? data.dados : [];
      if (!linhas.length) {
        setImportErro("Balancete sem dados para os parâmetros informados. Verifique os filtros e tente novamente.");
        return;
      }

      const empresaExtraida = resolverEmpresa(data && data.empresa_detalhes, linhas);
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
        if (consultaErro && consultaErro.response && consultaErro.response.status !== 404) {
          setImportErro(
            (consultaErro && consultaErro.response && consultaErro.response.data && consultaErro.response.data.detail) ||
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
            (criacaoErro &&
              criacaoErro.response &&
              criacaoErro.response.data &&
              (criacaoErro.response.data.detail ||
                (criacaoErro.response.data.cnpj && criacaoErro.response.data.cnpj[0]))) ||
            "Não foi possível cadastrar a empresa automaticamente.";
          setImportErro(mensagem);
          return;
        }
      }

      // Consolidar usando campo de movimento do período, não saldo acumulado
      const candidatosCampo = [
        "bdvalor_periodo",
        "bdvlr_periodo",
        "bdvalor_mes",
        "bdmovimento",
        "bdvalor",
        "bdsaldo_atual",
      ];
      const consolidado = consolidarBalancete(linhas, candidatosCampo);
      if (!consolidado || !Object.keys(consolidado).length) {
        setImportErro("Não foi possível consolidar os parâmetros do balancete com a estrutura atual das contas.");
        return;
      }
      let receita12 = 0;
      try {
        receita12 = await calcularReceita12Meses(importParams.empresa, importParams.dataFim);
      } catch (erroRbt) {
        console.warn("Falha ao calcular RBT12 automaticamente.", erroRbt);
        setImportErro("Não foi possível obter a Receita dos últimos 12 meses automaticamente. Informe manualmente.");
      }

      const valorMercadorias = consolidado.receita_mercadorias || 0;
      const valorServicos = consolidado.receita_servicos || 0;

      setRateiosMercadoria(
        valorMercadorias && valorMercadorias > 0 ? [criarLinhaRateio({ valor: valorMercadorias })] : []
      );

      setRateiosServico(
        valorServicos && valorServicos > 0 ? [criarLinhaRateio({ valor: valorServicos })] : []
      );

      setForm((prev) => {
        const atualizado = { ...prev };
        Object.entries(consolidado).forEach(([parametro, valor]) => {
          if (parametro in prev) {
            atualizado[parametro] = formatarValorBR(valor);
          }
        });
        if (consolidado.despesas_outros !== undefined) {
          atualizado.outras_despesas = formatarValorBR(consolidado.despesas_outros);
        }
        atualizado.empresa = empresaRegistrada ? String(empresaRegistrada.id) : prev.empresa;
        atualizado.empresa_nome = (empresaRegistrada && empresaRegistrada.razao_social) || prev.empresa_nome;
        atualizado.empresa_cnpj = (empresaRegistrada && empresaRegistrada.cnpj) || prev.empresa_cnpj;
        atualizado.empresa_cnae = (empresaRegistrada && empresaRegistrada.cnae_principal) || prev.empresa_cnae;
        atualizado.empresa_municipio = (empresaRegistrada && empresaRegistrada.municipio) || prev.empresa_municipio;
        const regimePreferido =
          (empresaRegistrada &&
          empresaRegistrada.regime_tributario &&
          empresaRegistrada.regime_tributario !== "Outras"
            ? empresaRegistrada.regime_tributario
            : (empresaRegistrada && empresaRegistrada.planilha_regime));
        if (regimePreferido) {
          atualizado.regime_atual = regimePreferido;
        }
        if (receita12 > 0) {
          atualizado.receita_12_meses = formatarValorBR(receita12);
        }
        return atualizado;
      });

      if (receita12 <= 0) {
        setErro("Informe manualmente a Receita dos últimos 12 meses (não foi possível importar). ");
      }

      setResultado(null);
      setMensagem(
        empresaCriada
          ? "Parâmetros importados do SCI com sucesso. Empresa cadastrada automaticamente."
          : "Parâmetros importados do SCI com sucesso."
      );
      setShowImportModal(false);
    } catch (error) {
      const detalhe =
        (error && error.response && error.response.data && (error.response.data.detail || error.response.data.error)) ||
        (error && error.message) ||
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
          <button
            className="btn btn-outline"
            style={{ marginLeft: 8 }}
            onClick={() => setUseTabs((v) => !v)}
            type="button"
            title="Alternar modo de abas"
          >
            {useTabs ? "ABAS: ON" : "ABAS: OFF"}
          </button>
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

    {useTabs ? (
      <div className="tabs-nav">
        {tabs.map(function (t) {
          return (
            <button
              key={t.key}
              type="button"
              className={"tab " + (activeTab === t.key ? "active" : "")}
              onClick={function () {
                setActiveTab(t.key);
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    ) : null}

      {/* Identificação */}
      {showSection("identificacao") && (
        <div className={"card collapsible " + (collapsed["identificacao"] ? "collapsed" : "")} id="identificacao">
          <div className="card-header" onClick={() => toggleCollapse("identificacao")}>
            <h4>Identificação</h4>
            <span className="card-chevron">{collapsed["identificacao"] ? "⯈" : "⯆"}</span>
          </div>
          <div className="card-body">
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
              {/* ISS/ICMS removidos da tela inicial; disponíveis na aba Tributos */}
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
        </div>
      )}

      {/* Receitas */}
      {showSection("receitas") && (
        <div className={"card collapsible " + (collapsed["receitas"] ? "collapsed" : "")} id="receitas">
          <div className="card-header" onClick={() => toggleCollapse("receitas")}>
            <h4>Receitas</h4>
            <span className="card-chevron">{collapsed["receitas"] ? "⯈" : "⯆"}</span>
          </div>
          <div className="card-body">
            <div className="grid-receitas">
              <div>
                <label>Receita Total</label>
                <input
                  inputMode="decimal"
                  value={form.receita_total}
                  onChange={handleValorChange("receita_total")}
                />
              </div>
              <div>
                <label>
                  Receita 12 meses
                  {rbt12Interval && (
                    <span title={`RBT12: ${rbt12Interval.label}`} style={{ marginLeft: 6, verticalAlign: "middle", cursor: "help" }}>
                      <Info size={16} />
                    </span>
                  )}
                </label>
                <input
                  inputMode="decimal"
                  value={form.receita_12_meses}
                  onChange={handleValorChange("receita_12_meses")}
                />
              </div>
              <div>
                <label>Receita Mercadorias</label>
                <input
                  inputMode="decimal"
                  value={form.receita_mercadorias}
                  onChange={handleValorChange("receita_mercadorias")}
                />
              </div>
              <div>
                <label>Receita Serviços</label>
                <input
                  inputMode="decimal"
                  value={form.receita_servicos}
                  onChange={handleValorChange("receita_servicos")}
                />
              </div>
              <div>
                <label>Receita Exportação</label>
                <input
                  inputMode="decimal"
                  value={form.receita_exportacao}
                  onChange={handleValorChange("receita_exportacao")}
                />
              </div>
              <div>
                <label>Deduções de Receita</label>
                <input
                  inputMode="decimal"
                  value={form.receita_deducoes}
                  onChange={handleValorChange("receita_deducoes")}
                />
              </div>
              <div>
                <label>Outras Receitas</label>
                <input
                  inputMode="decimal"
                  value={form.outras_receitas}
                  onChange={handleValorChange("outras_receitas")}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Percentuais Presumidos (informados pelo usuário) */}
      {showSection("presumido") && (
        <div className={"card collapsible " + (collapsed["presumido"] ? "collapsed" : "")} id="presumido">
          <div className="card-header" onClick={() => toggleCollapse("presumido")}>
            <h4>Percentuais Para Base Presumidos (IRPJ/CSLL)</h4>
            <span className="card-chevron">{collapsed["presumido"] ? "⯈" : "⯆"}</span>
          </div>
          <div className="card-body">
            <div className="grid-impostos">
              <div>
                <label>Base Presumido - Mercadorias</label>
                <select
                  value={form.base_presumido_merc_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    onChange("base_presumido_merc_id", id);
                    const sel = basesPresumidas.find((b) => String(b.id) === String(id));
                    if (sel) {
                      onChange("presumido_irpj_merc", String(sel.fator_irpj));
                      onChange("presumido_csll_merc", String(sel.fator_csll));
                    }
                  }}
                >
                  <option value="">Selecione...</option>
                  {basesPresumidas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.atividade} (IRPJ {b.fator_irpj}% | CSLL {b.fator_csll}%)
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input readOnly value={form.presumido_irpj_merc} />
                  <input readOnly value={form.presumido_csll_merc} />
                </div>
              </div>
              <div>
                <label>Base Presumido - Serviços</label>
                <select
                  value={form.base_presumido_serv_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    onChange("base_presumido_serv_id", id);
                    const sel = basesPresumidas.find((b) => String(b.id) === String(id));
                    if (sel) {
                      onChange("presumido_irpj_serv", String(sel.fator_irpj));
                      onChange("presumido_csll_serv", String(sel.fator_csll));
                    }
                  }}
                >
                  <option value="">Selecione...</option>
                  {basesPresumidas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.atividade} (IRPJ {b.fator_irpj}% | CSLL {b.fator_csll}%)
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input readOnly value={form.presumido_irpj_serv} />
                  <input readOnly value={form.presumido_csll_serv} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ISS / ICMS */}
      {showSection("issicms") && (
        <div className={"card collapsible " + (collapsed["issicms"] ? "collapsed" : "")} id="issicms">
          <div className="card-header" onClick={() => toggleCollapse("issicms")}>
            <h4>Impostos Municipais/Estaduais</h4>
            <span className="card-chevron">{collapsed["issicms"] ? "⯈" : "⯆"}</span>
          </div>
          <div className="card-body">
            <div className="grid-impostos">
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
            </div>
          </div>
        </div>
      )}

      {/* PIS / COFINS (federais) */}
      {showSection("federais") && (
        <div className={"card collapsible " + (collapsed["federais"] ? "collapsed" : "")} id="federais">
          <div className="card-header" onClick={() => toggleCollapse("federais")}>
            <h4>PIS / COFINS</h4>
            <span className="card-chevron">{collapsed["federais"] ? "⯈" : "⯆"}</span>
          </div>
          <div className="card-body">
            <div className="grid-impostos">
              <div>
                <label>PIS (%)</label>
                <input
                  inputMode="decimal"
                  value={form.aliquota_pis}
                  onChange={(e) => onChange("aliquota_pis", e.target.value)}
                  placeholder={aliqPisDefault}
                />
              </div>
              <div>
                <label>COFINS (%)</label>
                <input
                  inputMode="decimal"
                  value={form.aliquota_cofins}
                  onChange={(e) => onChange("aliquota_cofins", e.target.value)}
                  placeholder={aliqCofinsDefault}
                />
              </div>
            </div>
            <small style={{ display: "block", marginTop: 8, color: "#666" }}>
              Valores padrão carregados da base Cumulativa (Presumido). Você pode ajustar conforme necessário.
            </small>
          </div>
        </div>
      )}

      {/* Rateio Mercadorias */}
      {showSection("rateio-merc") && (
        <div className={"card collapsible " + (collapsed["rateio-merc"] ? "collapsed" : "")} id="rateio-merc">
          <div className="card-header" onClick={() => toggleCollapse("rateio-merc")}>
            <h4>Rateio Mercadorias</h4>
            <span className="card-chevron">{collapsed["rateio-merc"] ? "⯈" : "⯆"}</span>
          </div>
          {!collapsed["rateio-merc"] && (
            <div className="card-header-inline" style={{ marginTop: -6 }}>
              <span className="card-subtitle">
                Distribua {formatarValorBR(valorParaNumero(form.receita_mercadorias || 0))} entre os anexos
              </span>
            </div>
          )}
          <div className="rateio-wrapper">
            <table className="rateio-table">
              <thead>
                <tr>
                  <th>Anexo</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rateiosMercadoria.length ? (
                  rateiosMercadoria.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <select
                          value={item.anexo}
                          onChange={(e) => atualizarRateio("mercadoria", item.key, "anexo", e.target.value)}
                        >
                          <option value="">Selecione...</option>
                          {anexos.map((anexo) => (
                            <option key={anexo.id} value={anexo.id}>
                              {"Anexo " + anexo.numero + (anexo.atividade ? " - " + anexo.atividade : "")}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={item.valor}
                          inputMode="decimal"
                          onChange={(e) => atualizarRateio("mercadoria", item.key, "valor", e.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-small btn-danger"
                          onClick={() => removerRateio("mercadoria", item.key)}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="rateio-empty" colSpan={3}>Nenhum rateio cadastrado</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="rateio-summary">
              Total distribuído: <strong>{formatarValorBR(somarRateios(rateiosMercadoria))}</strong> | Necessário:{" "}
              <strong>{form.receita_mercadorias || "0,00"}</strong>
            </div>
            <button type="button" className="btn btn-small" onClick={() => adicionarRateio("mercadoria")}>
              + Adicionar linha
            </button>
          </div>
        </div>
      )}

      {/* Rateio Serviços */}
      {showSection("rateio-serv") && (
        <div className={"card collapsible " + (collapsed["rateio-serv"] ? "collapsed" : "")} id="rateio-serv">
          <div className="card-header" onClick={() => toggleCollapse("rateio-serv")}>
            <h4>Rateio Serviços</h4>
            <span className="card-chevron">{collapsed["rateio-serv"] ? "⯈" : "⯆"}</span>
          </div>
          {!collapsed["rateio-serv"] && (
            <div className="card-header-inline" style={{ marginTop: -6 }}>
              <span className="card-subtitle">
                Distribua {formatarValorBR(valorParaNumero(form.receita_servicos || 0))} entre os anexos
              </span>
            </div>
          )}
          <div className="rateio-wrapper">
            <table className="rateio-table">
              <thead>
                <tr>
                  <th>Anexo</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rateiosServico.length ? (
                  rateiosServico.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <select
                          value={item.anexo}
                          onChange={(e) => atualizarRateio("servico", item.key, "anexo", e.target.value)}
                        >
                          <option value="">Selecione...</option>
                          {anexos.map((anexo) => (
                            <option key={anexo.id} value={anexo.id}>
                              {"Anexo " + anexo.numero + (anexo.atividade ? " - " + anexo.atividade : "")}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={item.valor}
                          inputMode="decimal"
                          onChange={(e) => atualizarRateio("servico", item.key, "valor", e.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-small btn-danger"
                          onClick={() => removerRateio("servico", item.key)}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="rateio-empty" colSpan={3}>Nenhum rateio cadastrado</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="rateio-summary">
              Total distribuído: <strong>{formatarValorBR(somarRateios(rateiosServico))}</strong> | Necessário:{" "}
              <strong>{form.receita_servicos || "0,00"}</strong>
            </div>
            <button type="button" className="btn btn-small" onClick={() => adicionarRateio("servico")}>
              + Adicionar linha
            </button>
          </div>
        </div>
      )}

      {/* Custos & Créditos */}
      {showSection("custos") && (
        <div className={"card collapsible " + (collapsed["custos"] ? "collapsed" : "")} id="custos">
          <div className="card-header" onClick={() => toggleCollapse("custos")}>
            <h4>Custos & Créditos</h4>
            <span className="card-chevron">{collapsed["custos"] ? "⯈" : "⯆"}</span>
          </div>
          <div className="card-body">
            <div className="grid-custos">
              <div>
                <label>Custo Mercadorias</label>
                <input
                  inputMode="decimal"
                  value={form.custo_mercadorias}
                  onChange={handleValorChange("custo_mercadorias")}
                />
              </div>
              <div>
                <label>Custo Serviços</label>
                <input
                  inputMode="decimal"
                  value={form.custo_servicos}
                  onChange={handleValorChange("custo_servicos")}
                />
              </div>
              <div>
                <label>Despesas Operacionais</label>
                <input
                  inputMode="decimal"
                  value={form.despesas_operacionais}
                  onChange={handleValorChange("despesas_operacionais")}
                />
              </div>
              <div>
                <label>Créditos PIS</label>
                <input
                  inputMode="decimal"
                  value={form.creditos_pis}
                  onChange={handleValorChange("creditos_pis")}
                />
              </div>
              <div>
                <label>Créditos COFINS</label>
                <input
                  inputMode="decimal"
                  value={form.creditos_cofins}
                  onChange={handleValorChange("creditos_cofins")}
                />
              </div>
              <div>
                <label>Adições Fiscais</label>
                <input
                  inputMode="decimal"
                  value={form.adicoes_fiscais}
                  onChange={handleValorChange("adicoes_fiscais")}
                />
              </div>
              <div>
                <label>Exclusões Fiscais</label>
                <input
                  inputMode="decimal"
                  value={form.exclusoes_fiscais}
                  onChange={handleValorChange("exclusoes_fiscais")}
                />
              </div>
              <div>
                <label>Lucro Contábil (opcional)</label>
                <input
                  inputMode="decimal"
                  value={form.lucro_contabil}
                  onChange={handleValorChange("lucro_contabil")}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Folha e Encargos */}
      {showSection("folha") && (
        <div className={"card collapsible " + (collapsed["folha"] ? "collapsed" : "")} id="folha">
          <div className="card-header" onClick={() => toggleCollapse("folha")}>
            <h4>Folha e Encargos</h4>
            <span className="card-chevron">{collapsed["folha"] ? "⯈" : "⯆"}</span>
          </div>
          <div className="card-body">
            <div className="grid-folha">
              <div>
                <label>Folha Total</label>
                <input
                  inputMode="decimal"
                  value={form.folha_total}
                  onChange={handleValorChange("folha_total")}
                />
              </div>
              <div>
                <label>INSS Patronal (valor informado)</label>
                <input
                  inputMode="decimal"
                  value={form.inss_patronal}
                  onChange={handleValorChange("inss_patronal")}
                />
              </div>
              <div>
                <label>INSS total (%)</label>
                <input
                  inputMode="decimal"
                  value={form.aliquota_inss_total}
                  onChange={(e) => onChange("aliquota_inss_total", e.target.value)}
                />
              </div>
              <div className="checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={form.desoneracao_folha}
                    onChange={(e) => onChange("desoneracao_folha", e.target.checked)}
                  />
                  Desoneração da folha (informativa)
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Despesas e Ajustes adicionais */}
      {showSection("despesas") && (
        <div className={"card collapsible " + (collapsed["despesas"] ? "collapsed" : "")} id="despesas">
          <div className="card-header" onClick={() => toggleCollapse("despesas")}>
            <h4>Despesas e Ajustes</h4>
            <span className="card-chevron">{collapsed["despesas"] ? "⯈" : "⯆"}</span>
          </div>
          <div className="card-body">
            <div className="grid-custos">
              <div>
                <label>Outras Despesas</label>
                <input
                  inputMode="decimal"
                  value={form.outras_despesas}
                  onChange={handleValorChange("outras_despesas")}
                />
              </div>
              <div>
                <label>Pró-labore</label>
                <input
                  inputMode="decimal"
                  value={form.pro_labore}
                  onChange={handleValorChange("pro_labore")}
                />
              </div>
              <div>
                <label>Despesas não dedutíveis (adições)</label>
                <input
                  inputMode="decimal"
                  value={form.despesas_nao_dedutiveis}
                  onChange={handleValorChange("despesas_nao_dedutiveis")}
                />
              </div>
              <div>
                <label>Investimentos</label>
                <input
                  inputMode="decimal"
                  value={form.investimentos}
                  onChange={handleValorChange("investimentos")}
                />
              </div>
              <div>
                <label>Depreciação</label>
                <input
                  inputMode="decimal"
                  value={form.depreciacao}
                  onChange={handleValorChange("depreciacao")}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Seção Resultado removida */}

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
                setImportParams((prev) => {
                  const novo = Object.assign({}, prev);
                  novo.empresa = e.target.value;
                  return novo;
                })
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
                setImportParams((prev) => {
                  const novo = Object.assign({}, prev);
                  novo.dataInicio = e.target.value;
                  return novo;
                })
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
                setImportParams((prev) => {
                  const novo = Object.assign({}, prev);
                  novo.dataFim = e.target.value;
                  return novo;
                })
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
          setForm((prev) => {
            const atualizado = Object.assign({}, prev);
            atualizado.empresa = String(empresa.id);
            atualizado.empresa_nome = empresa.razao_social || "";
            atualizado.empresa_cnpj = empresa.cnpj || "";
            atualizado.empresa_cnae = empresa.cnae_principal || "";
            atualizado.empresa_municipio = empresa.municipio || "";
            atualizado.regime_atual = regimePreferido || prev.regime_atual;
            return atualizado;
          });
          setRateiosMercadoria([]);
          setRateiosServico([]);
          setShowEmpresaModal(false);
        }}
      />
    </div>
  );
}

function TabelaRegime({ titulo, data }) {
  if (!data) return null;
  const linhas = Object.entries(data).filter(([k]) => k !== "TOTAL");
  const moedaFmt = (v) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(+v || 0);

  return (
    <div className="tabela-card">
      <h5>{titulo}</h5>
      <table>
        <tbody>
          {linhas.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td style={{ textAlign: "right" }}>{moedaFmt(v)}</td>
            </tr>
          ))}
          <tr>
            <td><strong>TOTAL</strong></td>
            <td style={{ textAlign: "right" }}>
              <strong>{moedaFmt(data.TOTAL)}</strong>
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
      setEmpresas((prev) => prev.concat([data]));
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
                  onChange={(e) => setNova(Object.assign({}, nova, { razao_social: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <label>CNPJ</label>
                <input
                  value={nova.cnpj}
                  onChange={(e) => setNova(Object.assign({}, nova, { cnpj: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid-3">
              <div className="form-row">
                <label>CNAE</label>
                <input
                  value={nova.cnae_principal}
                  onChange={(e) => setNova(Object.assign({}, nova, { cnae_principal: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <label>Município</label>
                <input
                  value={nova.municipio}
                  onChange={(e) => setNova(Object.assign({}, nova, { municipio: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <label>UF</label>
                <select value={nova.uf} onChange={(e) => setNova(Object.assign({}, nova, { uf: e.target.value }))}>
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
                  onChange={(e) => setNova(Object.assign({}, nova, { regime_tributario: e.target.value }))}
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
