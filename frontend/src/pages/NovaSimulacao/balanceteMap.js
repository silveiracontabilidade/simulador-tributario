const sanitizeCode = (codigo) => {
  if (!codigo && codigo !== 0) return "";
  const raw = String(codigo).trim().replace(/,+/g, ".");
  const normalized = raw
    .split(".")
    .map((parte) => {
      const clean = parte.replace(/\D/g, "");
      if (!clean.length) return parte.replace(/^0+/, "") || "0";
      return String(Number(clean));
    })
    .join(".");
  return { raw, normalized };
};

const parseSaldo = (valor) => {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === "number") return valor;
  const texto = String(valor).trim().replace(/\./g, "").replace(",", ".");
  const num = Number(texto);
  return Number.isFinite(num) ? num : 0;
};

// Permite escolher qual campo usar como valor (ex.: bdsaldo_atual ou movimento do período)
// campoValor pode ser string ou array de candidatos; escolhe o primeiro existente em cada linha
const prepararLinhas = (dados, campoValor = "bdsaldo_atual") => {
  const candidatos = Array.isArray(campoValor)
    ? [...campoValor, "bdsaldo_atual"]
    : [campoValor, "bdsaldo_atual"];

  return Array.isArray(dados)
    ? dados.map((linha) => {
        const { raw, normalized } = sanitizeCode(linha?.bdctalon ?? linha?.bdcodcta ?? "");
        const key = candidatos.find((k) => Object.prototype.hasOwnProperty.call(linha || {}, k));
        const valor = key ? linha[key] : linha?.bdsaldo_atual;
        return {
          ...linha,
          codigoRaw: raw,
          codigo: normalized,
          saldo: parseSaldo(valor),
          nome: String(linha?.bdnomcta || "").toLowerCase(),
          analitica: Number(linha?.bdtipcta) > 0,
        };
      })
    : [];
};

const normalizePrefix = (prefix) => sanitizeCode(prefix).normalized;

const valorPorCodigo = (linhas, codigos) => {
  for (const codigo of codigos) {
    const { raw, normalized } = sanitizeCode(codigo);
    const linha = linhas.find(
      (item) => item.codigo === normalized || (raw && item.codigoRaw === raw)
    );
    if (linha) return linha.saldo;
  }
  return 0;
};

const somaPorPrefixos = (linhas, prefixos, { somenteAnaliticas = true } = {}) => {
  const lista = prefixos.map(normalizePrefix).filter(Boolean);
  if (!lista.length) return 0;
  return linhas.reduce((acumulado, linha) => {
    if (somenteAnaliticas && !linha.analitica) return acumulado;
    return lista.some((pref) => linha.codigo.startsWith(pref)) ? acumulado + linha.saldo : acumulado;
  }, 0);
};

const somaPorPredicado = (linhas, predicado) =>
  linhas.reduce((total, linha) => (predicado(linha) ? total + linha.saldo : total), 0);

const RECEITA_TOTAL_CODES = ["03", "3"];
// Contas agregadoras (sem somar filhas) para evitar duplicidade
const RECEITA_MERCADORIAS_CODES = ["03.1.1.01", "03.1.1.05", "03.1.1.06"];
const RECEITA_SERVICOS_CODES = ["03.1.1.03"];
const RECEITA_EXPORTACAO_CODES = ["03.1.1.02", "03.1.1.04"];
const RECEITA_DEDUCOES_PREFIXES = ["03.1.2"]; // Deduções da Receita
const DEDUCOES_SIMPLES_CODE = "03.1.2.02.008"; // Simples Nacional sobre vendas e serviços
const RECEITA_FINANCEIRA_PREFIXES = ["03.1.3"];
const RECEITA_OUTRAS_PREFIXES = ["03.2"];

const CUSTO_TOTAL_CODES = ["04.1", "4.1"];
const CUSTO_MERCADORIAS_PREFIXES = ["04.1.1", "04.1.2"];
const CUSTO_SERVICOS_PREFIXES = ["04.1.3"];

const DESPESAS_TOTAL_CODES = ["04.2", "4.2"];
const FOLHA_PREFIXES = ["04.2.1.01"];
const INSS_PREFIXES = ["04.2.1.02"];
const DESPESAS_OPERACIONAIS_PREFIXES = [
  "04.2.1.03",
  "04.2.1.04",
  "04.2.1.05",
  "04.2.1.06",
  "04.2.1.07",
  "04.2.10",
  "04.2.2",
  "04.2.3",
  "04.2.4",
  "04.2.5",
  "04.2.6",
  "04.2.7",
  "04.2.8",
  "04.2.9",
];

const ehCreditoPis = (linha) =>
  linha.nome.includes("pis") &&
  (linha.nome.includes("crédito") ||
    linha.nome.includes("credito") ||
    linha.nome.includes("recuper") ||
    linha.nome.includes("compens"));

const ehCreditoCofins = (linha) =>
  linha.nome.includes("cofins") &&
  (linha.nome.includes("crédito") ||
    linha.nome.includes("credito") ||
    linha.nome.includes("recuper") ||
    linha.nome.includes("compens"));

const arredonda = (valor) => Number.parseFloat(Number(valor || 0).toFixed(2));

export const consolidarBalancete = (dados, campoValor = "bdsaldo_atual") => {
  const linhas = prepararLinhas(dados, campoValor);
  if (!linhas.length) return {};

  const receitaMercadorias = RECEITA_MERCADORIAS_CODES.reduce(
    (acc, code) => acc + valorPorCodigo(linhas, [code]),
    0
  );
  const receitaServicos = RECEITA_SERVICOS_CODES.reduce(
    (acc, code) => acc + valorPorCodigo(linhas, [code]),
    0
  );
  const receitaExportacao = RECEITA_EXPORTACAO_CODES.reduce(
    (acc, code) => acc + valorPorCodigo(linhas, [code]),
    0
  );
  // Deduções: subtrai o Simples Nacional sobre vendas/serviços (03.1.2.02.008)
  // para não inflar o total de deduções
  const receitaDeducoesBruta = valorPorCodigo(linhas, RECEITA_DEDUCOES_PREFIXES);
  const simplesNasDeducoes = valorPorCodigo(linhas, [DEDUCOES_SIMPLES_CODE]);
  const receitaDeducoes = receitaDeducoesBruta - simplesNasDeducoes;
  const receitaFinanceira = somaPorPrefixos(linhas, RECEITA_FINANCEIRA_PREFIXES, {
    somenteAnaliticas: true,
  });
  const outrasReceitas = somaPorPrefixos(linhas, RECEITA_OUTRAS_PREFIXES, {
    somenteAnaliticas: true,
  });

  const receitaTotalLinha = valorPorCodigo(linhas, RECEITA_TOTAL_CODES);
  // Receita bruta do período para o Simples: usar conta 03 quando disponível
  const receitaBruta = receitaTotalLinha !== 0
    ? receitaTotalLinha
    : receitaMercadorias + receitaServicos + receitaExportacao; // fallback mínimo

  // Receita total contábil (exibível): receita bruta + financeiras + outras (quando 03 não traz esse total)
  const receitaTotalCalculada = receitaBruta + receitaFinanceira + outrasReceitas;
  const receitaTotal = receitaTotalLinha !== 0 ? receitaTotalLinha : receitaTotalCalculada;
  // Outras receitas (exibição): diferença para evitar dupla contagem
  const receitaOutros = receitaTotal - (receitaMercadorias + receitaServicos);

  const custoMercadorias = somaPorPrefixos(linhas, CUSTO_MERCADORIAS_PREFIXES, {
    somenteAnaliticas: true,
  });
  const custoServicos = somaPorPrefixos(linhas, CUSTO_SERVICOS_PREFIXES, {
    somenteAnaliticas: true,
  });
  const custoTotalLinha = valorPorCodigo(linhas, CUSTO_TOTAL_CODES);
  const custoOutros = custoTotalLinha - (custoMercadorias + custoServicos);

  const folhaTotal = somaPorPrefixos(linhas, FOLHA_PREFIXES, { somenteAnaliticas: true });
  const inssPatronal = somaPorPrefixos(linhas, INSS_PREFIXES, { somenteAnaliticas: true });
  const despesasOperacionais = somaPorPrefixos(linhas, DESPESAS_OPERACIONAIS_PREFIXES, {
    somenteAnaliticas: true,
  });
  const despesasTotalLinha = valorPorCodigo(linhas, DESPESAS_TOTAL_CODES);
  const despesasOutros =
    despesasTotalLinha - (despesasOperacionais + folhaTotal + inssPatronal);

  const creditosPis = somaPorPredicado(linhas, ehCreditoPis);
  const creditosCofins = somaPorPredicado(linhas, ehCreditoCofins);

  return {
    receita_total: arredonda(receitaTotal),
    receita_bruta: arredonda(receitaBruta),
    receita_mercadorias: arredonda(receitaMercadorias),
    receita_servicos: arredonda(receitaServicos),
    receita_exportacao: arredonda(receitaExportacao),
    receita_financeira: arredonda(receitaFinanceira),
    outras_receitas: arredonda(receitaOutros),
    receita_deducoes: arredonda(receitaDeducoes),
    receita_outros: arredonda(receitaOutros),
    custo_total: arredonda(custoTotalLinha),
    custo_mercadorias: arredonda(custoMercadorias),
    custo_servicos: arredonda(custoServicos),
    custo_outros: arredonda(custoOutros),
    folha_total: arredonda(folhaTotal),
    inss_patronal: arredonda(inssPatronal),
    despesas_operacionais: arredonda(despesasOperacionais),
    despesas_outros: arredonda(despesasOutros),
    creditos_pis: arredonda(creditosPis),
    creditos_cofins: arredonda(creditosCofins),
  };
};

export default consolidarBalancete;
