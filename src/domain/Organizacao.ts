import { Contrato } from './Contrato.js';

export class Organizacao {
  constructor(
    public id: string,
    public razaoSocial: string,
    public cnpj: string,
    public inscricaoEstadual: string,
    public enderecoCompleto: string,
    public telefone: string,
    public email: string,
    public dataCadastro: Date,
    public ativo: boolean,
    public contratoVigente: Contrato | null,
    public motivoDesativacao: string | null = null,
  ) {}

  alterarEndereco(novoEndereco: string): void {
    this.enderecoCompleto = novoEndereco;
  }

  desativar(motivo = ''): void {
    if (!motivo.trim()) throw new Error('Informe o motivo da desativação da organização.');
    this.ativo = false;
    this.motivoDesativacao = motivo.trim();
  }
}
