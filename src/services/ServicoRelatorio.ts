import { JournalTransacao } from '../infra/JournalTransacao.js';
import { RepositorioArquivo } from '../infra/RepositorioArquivo.js';
import { StatusRastreamento } from '../types/StatusRastreamento.js';

export class ServicoRelatorio {
  constructor(private repositorio: RepositorioArquivo) {}

  gerarRelatorioPorOrganizacao(
    organizacaoId: string,
    periodo: { inicio: Date; fim: Date },
  ): string {
    const organizacao = this.repositorio.carregarEntidade('organizacoes', organizacaoId);

    if (!organizacao) {
      throw new Error('Organização não encontrada.');
    }

    const lotes = this.repositorio.listarEntidades('lotes').filter((lote) => (
      lote.organizacaoId === organizacaoId
      && this.estaNoPeriodo(new Date(lote.dataEntrada), periodo)
    ));
    const quantidadeEquipamentos = lotes.reduce(
      (total, lote) => total + (lote.equipamentos?.length ?? 0),
      0,
    );

    return [
      `Relatório por organização: ${organizacao.razaoSocial}`,
      `Período: ${periodo.inicio.toISOString()} até ${periodo.fim.toISOString()}`,
      `Lotes recebidos: ${lotes.length}`,
      `Equipamentos nos lotes: ${quantidadeEquipamentos}`,
    ].join('\n');
  }

  gerarRelatorioPorStatus(status: StatusRastreamento): string {
    const equipamentos = this.repositorio.listarEntidades('equipamentos')
      .filter((equipamento) => equipamento.statusRastreamento === status);

    return [
      `Relatório por status: ${status}`,
      `Quantidade de equipamentos: ${equipamentos.length}`,
      ...equipamentos.map((equipamento) => `${equipamento.id} - ${equipamento.codigoBarrasInterno}`),
    ].join('\n');
  }

  gerarRelatorioFinanceiro(periodo: { inicio: Date; fim: Date }): string {
    const organizacoes = this.repositorio.listarEntidades('organizacoes');
    const contratosNoPeriodo = organizacoes.filter((organizacao) => {
      const contrato = organizacao.contratoVigente;

      return contrato
        && new Date(contrato.dataAssinatura) <= periodo.fim
        && new Date(contrato.dataVencimento) >= periodo.inicio;
    }).map((organizacao) => organizacao.contratoVigente);
    const valorMensalContratado = contratosNoPeriodo.reduce(
      (total, contrato) => total + contrato.valorMensal,
      0,
    );
    const transacoesNoPeriodo = JournalTransacao.listar(this.repositorio)
      .filter((transacao) => this.estaNoPeriodo(transacao.timestamp, periodo));

    return [
      'Relatório financeiro',
      `Período: ${periodo.inicio.toISOString()} até ${periodo.fim.toISOString()}`,
      `Contratos vigentes no período: ${contratosNoPeriodo.length}`,
      `Valor mensal contratado: R$ ${valorMensalContratado.toFixed(2)}`,
      `Transações auditadas no período: ${transacoesNoPeriodo.length}`,
    ].join('\n');
  }

  private estaNoPeriodo(data: Date, periodo: { inicio: Date; fim: Date }): boolean {
    return data >= periodo.inicio && data <= periodo.fim;
  }
}
