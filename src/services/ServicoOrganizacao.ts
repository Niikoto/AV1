import { Contrato } from '../domain/Contrato.js';
import { Organizacao } from '../domain/Organizacao.js';
import { RepositorioArquivo } from '../infra/RepositorioArquivo.js';
import { ValidadorCNPJ } from '../validators/ValidadorCNPJ.js';

export class ServicoOrganizacao {
  constructor(
    private repositorio: RepositorioArquivo,
    private validadorCNPJ: ValidadorCNPJ,
  ) {}

  cadastrarOrganizacao(dados: any): Organizacao {
    if (!this.validadorCNPJ.validar(dados.cnpj)) {
      throw new Error(this.validadorCNPJ.obterMensagemErro());
    }

    const cnpjNormalizado = dados.cnpj.replace(/\D/g, '');
    const existeCnpj = this.repositorio.listarEntidades('organizacoes').some(
      (organizacao) => organizacao.cnpj.replace(/\D/g, '') === cnpjNormalizado,
    );

    if (existeCnpj) {
      throw new Error('Já existe uma organização cadastrada com este CNPJ.');
    }

    const organizacao = new Organizacao(
      dados.id,
      dados.razaoSocial,
      dados.cnpj,
      dados.inscricaoEstadual,
      dados.enderecoCompleto,
      dados.telefone,
      dados.email,
      dados.dataCadastro ? new Date(dados.dataCadastro) : new Date(),
      dados.ativo ?? true,
      this.reconstituirContrato(dados.contratoVigente),
    );

    this.repositorio.salvarEntidade('organizacoes', organizacao);
    return organizacao;
  }

  buscarOrganizacao(id: string): Organizacao {
    const dados = this.repositorio.carregarEntidade('organizacoes', id);

    if (!dados) {
      throw new Error('Organização não encontrada.');
    }

    return this.reconstituirOrganizacao(dados);
  }

  listarOrganizacoesAtivas(): Organizacao[] {
    return this.repositorio.listarEntidades('organizacoes')
      .map((dados) => this.reconstituirOrganizacao(dados))
      .filter((organizacao) => organizacao.ativo);
  }

  desativarOrganizacao(id: string, motivo: string): void {
    const organizacao = this.buscarOrganizacao(id);
    if (!organizacao.ativo) throw new Error('A organização já está desativada.');
    organizacao.desativar(motivo);
    this.repositorio.salvarEntidade('organizacoes', organizacao);
  }

  renovarContrato(organizacaoId: string, novoVencimento: Date): void {
    const organizacao = this.buscarOrganizacao(organizacaoId);

    if (!organizacao.contratoVigente) {
      throw new Error('A organização não possui contrato vigente para renovar.');
    }

    organizacao.contratoVigente.renovar(novoVencimento);
    this.repositorio.salvarEntidade('organizacoes', organizacao);
  }

  encerrarContrato(organizacaoId: string): void {
    const organizacao = this.buscarOrganizacao(organizacaoId);
    if (!organizacao.contratoVigente) {
      throw new Error('A organização não possui contrato para encerrar.');
    }
    organizacao.contratoVigente.encerrar();
    this.repositorio.salvarEntidade('organizacoes', organizacao);
  }

  private reconstituirOrganizacao(dados: any): Organizacao {
    return new Organizacao(
      dados.id,
      dados.razaoSocial,
      dados.cnpj,
      dados.inscricaoEstadual,
      dados.enderecoCompleto,
      dados.telefone,
      dados.email,
      new Date(dados.dataCadastro),
      dados.ativo,
      this.reconstituirContrato(dados.contratoVigente),
      dados.motivoDesativacao ?? null,
    );
  }

  private reconstituirContrato(dados: any): Contrato | null {
    if (!dados) {
      return null;
    }

    return new Contrato(
      dados.id,
      dados.organizacaoId,
      new Date(dados.dataAssinatura),
      new Date(dados.dataVencimento),
      dados.clausulas,
      dados.valorMensal,
      dados.renovacaoAutomatica,
      dados.encerradoEm ? new Date(dados.encerradoEm) : null,
      (dados.historicoRenovacoes ?? []).map((renovacao: any) => ({
        dataVencimentoAnterior: new Date(renovacao.dataVencimentoAnterior),
        dataVencimentoNovo: new Date(renovacao.dataVencimentoNovo),
        registradoEm: new Date(renovacao.registradoEm),
      })),
    );
  }
}
