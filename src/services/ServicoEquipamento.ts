import { Equipamento } from '../domain/Equipamento.js';
import { Lote } from '../domain/Lote.js';
import { Movimentacao } from '../domain/Movimentacao.js';
import { Organizacao } from '../domain/Organizacao.js';
import { RepositorioArquivo } from '../infra/RepositorioArquivo.js';
import { EstadoFisico } from '../types/EstadoFisico.js';
import { StatusLote } from '../types/StatusLote.js';
import { StatusRastreamento } from '../types/StatusRastreamento.js';
import { TipoEquipamento } from '../types/TipoEquipamento.js';

export interface HistoricoCompleto {
  equipamento: Equipamento;
  lote: Lote;
  organizacao: Organizacao;
  movimentacoes: Movimentacao[];
}

export class ServicoEquipamento {
  constructor(private repositorio: RepositorioArquivo) {}

  rastrearEquipamento(id: string): HistoricoCompleto {
    const dadosEquipamento = this.repositorio.carregarEntidade('equipamentos', id);

    if (!dadosEquipamento) {
      throw new Error('Equipamento não encontrado.');
    }

    const equipamento = this.reconstituirEquipamento(dadosEquipamento);
    const dadosLote = this.repositorio.carregarEntidade('lotes', equipamento.loteId);

    if (!dadosLote) {
      throw new Error('Lote associado ao equipamento não encontrado.');
    }

    const lote = this.reconstituirLote(dadosLote);
    const dadosOrganizacao = this.repositorio.carregarEntidade('organizacoes', lote.organizacaoId);

    if (!dadosOrganizacao) {
      throw new Error('Organização associada ao lote não encontrada.');
    }

    return {
      equipamento,
      lote,
      organizacao: this.reconstituirOrganizacao(dadosOrganizacao),
      movimentacoes: [...equipamento.historicoMovimentacao]
        .sort((primeira, segunda) => primeira.dataHora.getTime() - segunda.dataHora.getTime()),
    };
  }

  atualizarEstadoFisico(id: string, novoEstado: EstadoFisico, justificativa = ''): void {
    const dados = this.repositorio.carregarEntidade('equipamentos', id);

    if (!dados) {
      throw new Error('Equipamento não encontrado.');
    }

    const equipamento = this.reconstituirEquipamento(dados);
    equipamento.exigirAtivo();
    this.exigirLoteAtivo(equipamento);
    const ordem: Record<EstadoFisico, number> = {
      [EstadoFisico.NOVO]: 0,
      [EstadoFisico.BOM_ESTADO]: 1,
      [EstadoFisico.USADO_LEVE]: 2,
      [EstadoFisico.USADO_MODERADO]: 3,
      [EstadoFisico.DANIFICADO_LEVE]: 4,
      [EstadoFisico.DANIFICADO_GRAVE]: 5,
      [EstadoFisico.INSERVIVEL]: 6,
    };

    if (
      ordem[novoEstado] - ordem[equipamento.estadoFisico] >= 2
      && !justificativa.trim()
    ) {
      throw new Error('Justificativa obrigatória para degradar o estado físico em duas ou mais categorias.');
    }

    equipamento.estadoFisico = novoEstado;
    this.repositorio.salvarEntidade('equipamentos', equipamento);
    this.atualizarEquipamentoNoLote(equipamento);
  }

  registrarMovimentacao(id: string, destino: string, responsavel: string): void {
    const dados = this.repositorio.carregarEntidade('equipamentos', id);

    if (!dados) {
      throw new Error('Equipamento não encontrado.');
    }

    const equipamento = this.reconstituirEquipamento(dados);
    equipamento.exigirAtivo();
    this.exigirLoteAtivo(equipamento);
    equipamento.registrarMovimentacao(destino, responsavel);
    this.repositorio.salvarEntidade('equipamentos', equipamento);
    this.atualizarEquipamentoNoLote(equipamento);
  }

  cancelarEquipamento(id: string, motivo: string): void {
    const dados = this.repositorio.carregarEntidade('equipamentos', id);
    if (!dados) throw new Error('Equipamento não encontrado.');
    const equipamento = this.reconstituirEquipamento(dados);
    this.exigirLoteAtivo(equipamento);
    equipamento.cancelar(motivo);
    this.repositorio.salvarEntidade('equipamentos', equipamento);
    this.atualizarEquipamentoNoLote(equipamento);
  }

  gerarCodigoBarras(tipo: TipoEquipamento, sequencia: number): string {
    if (!Number.isInteger(sequencia) || sequencia <= 0) {
      throw new Error('A sequência do código de barras deve ser um inteiro positivo.');
    }

    return `GC-${tipo}-${sequencia.toString().padStart(6, '0')}`;
  }

  private atualizarEquipamentoNoLote(equipamento: Equipamento): void {
    const dadosLote = this.repositorio.carregarEntidade('lotes', equipamento.loteId);

    if (!dadosLote) {
      return;
    }

    const lote = this.reconstituirLote(dadosLote);
    const indice = lote.equipamentos.findIndex((item) => item.id === equipamento.id);

    if (indice !== -1) {
      lote.equipamentos[indice] = equipamento;
      this.repositorio.salvarEntidade('lotes', lote);
    }
  }

  private exigirLoteAtivo(equipamento: Equipamento): void {
    const lote = this.repositorio.carregarEntidade('lotes', equipamento.loteId);
    if (!lote) throw new Error('Lote associado ao equipamento não encontrado.');
    if (lote.cancelado) throw new Error('O lote está cancelado e não aceita operações nos equipamentos.');
  }

  private reconstituirEquipamento(dados: any): Equipamento {
    return new Equipamento(
      dados.id,
      dados.codigoBarrasInterno,
      dados.tipo as TipoEquipamento,
      dados.marca,
      dados.modelo,
      dados.anoFabricacao,
      dados.estadoFisico as EstadoFisico,
      dados.pesoQuilogramas,
      dados.loteId,
      dados.posicaoNoLote,
      dados.statusRastreamento as StatusRastreamento,
      (dados.historicoMovimentacao ?? []).map((movimentacao: any) => new Movimentacao(
        movimentacao.id,
        movimentacao.equipamentoId,
        new Date(movimentacao.dataHora),
        movimentacao.origem,
        movimentacao.destino,
        movimentacao.responsavel,
        movimentacao.observacao,
      )),
      dados.cancelado ?? false,
      dados.motivoCancelamento ?? null,
    );
  }

  private reconstituirLote(dados: any): Lote {
    return new Lote(
      dados.id,
      new Date(dados.dataEntrada),
      dados.organizacaoId,
      dados.notaFiscal,
      dados.transportadora,
      (dados.equipamentos ?? []).map((equipamento: any) => this.reconstituirEquipamento(equipamento)),
      dados.statusProcessamento as StatusLote,
      dados.observacoes,
      dados.cancelado ?? false,
      dados.motivoCancelamento ?? null,
    );
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
      null,
      dados.motivoDesativacao ?? null,
    );
  }
}
