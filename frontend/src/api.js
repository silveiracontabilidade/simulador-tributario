import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://127.0.0.1:8000/api",
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
