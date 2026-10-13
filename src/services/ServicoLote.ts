import { Equipamento } from '../domain/Equipamento.js';
import { Lote } from '../domain/Lote.js';
import { Movimentacao } from '../domain/Movimentacao.js';
import { RepositorioArquivo } from '../infra/RepositorioArquivo.js';
import { EstadoFisico } from '../types/EstadoFisico.js';
import { StatusLote } from '../types/StatusLote.js';
import { StatusRastreamento } from '../types/StatusRastreamento.js';
import { TipoEquipamento } from '../types/TipoEquipamento.js';
import { ValidadorDataEntrada } from '../validators/ValidadorDataEntrada.js';

export class ServicoLote {
  constructor(
    private repositorio: RepositorioArquivo,
    private validadorDataEntrada: ValidadorDataEntrada,
  ) {}

  criarLote(dados: any): Lote {
    const dataEntrada = new Date(dados.dataEntrada);

    if (!this.validadorDataEntrada.validar(dataEntrada)) {
      throw new Error(this.validadorDataEntrada.obterMensagemErro());
    }

    const dadosOrganizacao = this.repositorio.carregarEntidade('organizacoes', dados.organizacaoId);
    if (!dadosOrganizacao) {
      throw new Error('Não é possível criar lote para uma organização inexistente.');
    }
    if (!dadosOrganizacao.ativo) throw new Error('Não é possível criar lote para uma organização desativada.');

    const lote = new Lote(
      dados.id,
      dataEntrada,
      dados.organizacaoId,
      dados.notaFiscal,
      dados.transportadora,
      (dados.equipamentos ?? []).map((equipamento: any) => this.reconstituirEquipamento(equipamento)),
      dados.statusProcessamento ?? StatusLote.RECEBIDO,
      dados.observacoes ?? '',
    );

    this.repositorio.salvarEntidade('lotes', lote);
    return lote;
  }

  adicionarEquipamentoLote(loteId: string, equipamento: Equipamento): void {
    const lote = this.buscarLote(loteId);
    lote.exigirAtivo();

    if (equipamento.loteId !== loteId) {
      throw new Error('O equipamento deve pertencer ao mesmo lote informado.');
    }

    if (lote.equipamentos.some((item) => item.id === equipamento.id)) {
      throw new Error('O equipamento já pertence a este lote.');
    }
    equipamento.exigirAtivo();

    equipamento.posicaoNoLote = lote.equipamentos.length + 1;
    lote.adicionarEquipamento(equipamento);
    this.repositorio.salvarEntidade('equipamentos', equipamento);
    this.repositorio.salvarEntidade('lotes', lote);
  }

  processarTriagem(loteId: string): void {
    const lote = this.buscarLote(loteId);
    lote.exigirAtivo();

    if (lote.equipamentos.length === 0) {
      throw new Error('Não é possível concluir a triagem de um lote sem equipamentos.');
    }
    if (lote.equipamentos.some((equipamento) => equipamento.cancelado)) {
      throw new Error('Não é possível concluir a triagem enquanto o lote contém equipamento cancelado.');
    }

    lote.statusProcessamento = StatusLote.EM_TRIAGEM;

    for (const equipamento of lote.equipamentos) {
      equipamento.atualizarStatus(StatusRastreamento.AGUARDANDO_DESMONTE, 'Triagem concluída.');
      this.repositorio.salvarEntidade('equipamentos', equipamento);
    }

    lote.statusProcessamento = StatusLote.TRIAGEM_CONCLUIDA;
    this.repositorio.salvarEntidade('lotes', lote);
  }

  consultarLotePorPeriodo(dataInicio: Date, dataFim: Date): Lote[] {
    return this.repositorio.listarEntidades('lotes')
      .map((dados) => this.reconstituirLote(dados))
      .filter((lote) => lote.dataEntrada >= dataInicio && lote.dataEntrada <= dataFim);
  }

  cancelarLote(loteId: string, motivo: string): void {
    const lote = this.buscarLote(loteId);
    if (lote.equipamentos.some((equipamento) => !equipamento.cancelado)) {
      throw new Error('Cancele os equipamentos ainda ativos antes de cancelar o lote.');
    }
    lote.cancelar(motivo);
    this.repositorio.salvarEntidade('lotes', lote);
  }

  private buscarLote(id: string): Lote {
    const dados = this.repositorio.carregarEntidade('lotes', id);

    if (!dados) {
      throw new Error('Lote não encontrado.');
    }

    return this.reconstituirLote(dados);
  }

  private reconstituirLote(dados: any): Lote {
    return new Lote(
      dados.id,
      new Date(dados.dataEntrada),
      dados.organizacaoId,
      dados.notaFiscal,
      dados.transportadora,
      (dados.equipamentos ?? []).map((equipamento: any) => this.reconstituirEquipamento(equipamento)),
      dados.statusProcessamento,
      dados.observacoes,
      dados.cancelado ?? false,
      dados.motivoCancelamento ?? null,
    );
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
}
