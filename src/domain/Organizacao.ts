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
  ) {}

  alterarEndereco(novoEndereco: string): void {
    this.enderecoCompleto = novoEndereco;
  }

  desativar(): void {
    this.ativo = false;
  }
}
