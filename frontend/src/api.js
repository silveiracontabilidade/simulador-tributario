import axios from "axios";

// Detecta automaticamente a URL da API:
// - Se REACT_APP_API_URL estiver definida, usa ela.
// - Se estiver rodando no browser, usa o mesmo host do frontend:
//     - Em dev (porta 3000/3001), assume backend na porta 8001 do mesmo host.
//     - Em produção, usa `${origin}/api`.
// - Fallback: http://127.0.0.1:8001/api
const resolvedBaseURL = (() => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  if (typeof window !== "undefined" && window.location) {
    try {
      const { origin } = window.location;
      const url = new URL(origin);
      const host = url.hostname;
      const port = url.port;
      if (port === "3000" || port === "3001") {
        return `http://${host}:8001/api`;
      }
      return `${origin}/api`;
    } catch (_) {}
  }
  return "http://127.0.0.1:8001/api";
})();

const api = axios.create({
  baseURL: resolvedBaseURL,
  timeout: 20000,
});

// Factory CRUD genérico
const crud = (endpoint) => ({
  list: (params) => api.get(`/${endpoint}/`, { params }),
  create: (data) => api.post(`/${endpoint}/`, data),
  update: (id, data) => api.put(`/${endpoint}/${id}/`, data),
  delete: (id) => api.delete(`/${endpoint}/${id}/`),
});

// Exporta helpers
export const EmpresaAPI = crud("empresas");
EmpresaAPI.findByCnpj = (cnpj) =>
  api.get(`/empresas/buscar-por-cnpj/`, { params: { cnpj } });
export const SimulacaoAPI = {
  ...crud("simulacoes"),
  retrieve: (id) => api.get(`/simulacoes/${id}/`),
  processar: (id, meses = 1) => api.post(`/simulacoes/${id}/processar/?meses=${meses}`),
  comparativo: (id) => api.get(`/simulacoes/${id}/comparativo/`),
};
export const ResultadoAPI = crud("resultados");

export const CnaeImpedimentoAPI = crud("cnae-impedimentos");
export const CnaeAnexoAPI = crud("cnae-anexos");
export const AnexoSimplesAPI = crud("anexos-simples");
export const FaixaSimplesAPI = crud("faixas-simples");
export const BasePresumidoAPI = crud("base-presumido");
export const AliquotaFixaAPI = crud("aliquotas-fixas");
export const AliquotaFederalAPI = crud("aliquotas-federais");
export const BalanceteAPI = {
  fetch: (params) => api.get("/balancete/", { params }),
};

export default api;
