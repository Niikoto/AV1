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
    const dadosEquipamento = this.localizarDadosEquipamento(id);

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

  consultarEquipamento(identificador: string): Equipamento {
    return this.reconstituirEquipamento(this.localizarDadosEquipamento(identificador));
  }

  listarEquipamentos(filtros: { loteId?: string; status?: StatusRastreamento; incluirCancelados?: boolean } = {}): Equipamento[] {
    return this.repositorio.listarEntidades('equipamentos')
      .map((dados) => this.reconstituirEquipamento(dados))
      .filter((equipamento) => filtros.incluirCancelados || !equipamento.cancelado)
      .filter((equipamento) => !filtros.loteId || equipamento.loteId === filtros.loteId)
      .filter((equipamento) => !filtros.status || equipamento.statusRastreamento === filtros.status);
  }

  atualizarEquipamento(id: string, dados: { marca?: string; modelo?: string; anoFabricacao?: number; pesoQuilogramas?: number }): Equipamento {
    const equipamento = this.consultarEquipamento(id);
    equipamento.exigirAtivo();
    const lote = this.obterLote(equipamento.loteId);
    if (lote.cancelado || lote.statusProcessamento !== StatusLote.RECEBIDO || equipamento.statusRastreamento !== StatusRastreamento.AGUARDANDO_TRIAGEM || equipamento.historicoMovimentacao.length > 0) {
      throw new Error('Só é possível editar dados cadastrais antes da triagem e de qualquer movimentação.');
    }
    if (dados.marca !== undefined) { if (!dados.marca.trim()) throw new Error('A marca é obrigatória.'); equipamento.marca = dados.marca.trim(); }
    if (dados.modelo !== undefined) { if (!dados.modelo.trim()) throw new Error('O modelo é obrigatório.'); equipamento.modelo = dados.modelo.trim(); }
    if (dados.anoFabricacao !== undefined) {
      if (!Number.isInteger(dados.anoFabricacao) || dados.anoFabricacao < 1900 || dados.anoFabricacao > new Date().getFullYear()) throw new Error('O ano de fabricação é inválido.');
      equipamento.anoFabricacao = dados.anoFabricacao;
    }
    if (dados.pesoQuilogramas !== undefined) {
      if (!Number.isFinite(dados.pesoQuilogramas) || dados.pesoQuilogramas <= 0) throw new Error('O peso deve ser maior que zero.');
      equipamento.pesoQuilogramas = dados.pesoQuilogramas;
    }
    this.repositorio.salvarEntidade('equipamentos', equipamento);
    this.atualizarEquipamentoNoLote(equipamento);
    return equipamento;
  }

  atualizarStatusRastreamento(id: string, novoStatus: StatusRastreamento, responsavel: string): void {
    const equipamento = this.consultarEquipamento(id);
    equipamento.exigirAtivo();
    const lote = this.obterLote(equipamento.loteId);
    if (lote.cancelado) throw new Error('O lote está cancelado e não aceita operações nos equipamentos.');
    if (novoStatus === equipamento.statusRastreamento) throw new Error('O equipamento já está neste status.');
    if (equipamento.statusRastreamento === StatusRastreamento.BAIXA_DEFINITIVA) throw new Error('Um equipamento com baixa definitiva não pode mudar de status.');
    const destinosFinais: StatusRastreamento[] = [StatusRastreamento.PECAS_REAPROVEITADAS, StatusRastreamento.MATERIAL_RECICLAVEL, StatusRastreamento.DESCARTE_SEGURO];
    const permitido = equipamento.statusRastreamento === StatusRastreamento.AGUARDANDO_DESMONTE
      ? novoStatus === StatusRastreamento.EM_DESMONTE && lote.statusProcessamento === StatusLote.TRIAGEM_CONCLUIDA
      : equipamento.statusRastreamento === StatusRastreamento.EM_DESMONTE
        ? destinosFinais.includes(novoStatus)
        : destinosFinais.includes(equipamento.statusRastreamento) && novoStatus === StatusRastreamento.BAIXA_DEFINITIVA;
    if (!permitido) throw new Error('Transição de status inválida. Siga a sequência triagem, desmontagem, destinação e baixa definitiva.');
    equipamento.registrarMovimentacao(novoStatus, responsavel);
    equipamento.atualizarStatus(novoStatus, 'Alteração de status registrada no histórico.');
    this.repositorio.salvarEntidade('equipamentos', equipamento);
    this.atualizarEquipamentoNoLote(equipamento);
  }

  atualizarEstadoFisico(id: string, novoEstado: EstadoFisico, justificativa = ''): void {
    const dados = this.localizarDadosEquipamento(id);

    if (!dados) {
      throw new Error('Equipamento não encontrado.');
    }

    const equipamento = this.reconstituirEquipamento(dados);
    equipamento.exigirAtivo();
    const lote = this.obterLote(equipamento.loteId);
    if (lote.cancelado) throw new Error('O lote está cancelado e não aceita operações nos equipamentos.');
    if (lote.statusProcessamento !== StatusLote.RECEBIDO || equipamento.statusRastreamento !== StatusRastreamento.AGUARDANDO_TRIAGEM) {
      throw new Error('O estado físico só pode ser corrigido antes da conclusão da triagem.');
    }
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
    const dados = this.localizarDadosEquipamento(id);

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
    const dados = this.localizarDadosEquipamento(id);
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

    let candidato = sequencia;
    let codigo = `GC-${tipo}-${candidato.toString().padStart(6, '0')}`;
    const codigosExistentes = new Set(this.repositorio.listarEntidades('equipamentos').map((item) => item.codigoBarrasInterno));
    while (codigosExistentes.has(codigo)) {
      candidato += 1;
      codigo = `GC-${tipo}-${candidato.toString().padStart(6, '0')}`;
    }
    return codigo;
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

  private localizarDadosEquipamento(identificador: string): any {
    const dados = this.repositorio.carregarEntidade('equipamentos', identificador)
      ?? this.repositorio.listarEntidades('equipamentos').find((item) => item.codigoBarrasInterno === identificador);
    if (!dados) throw new Error('Equipamento não encontrado por ID ou código de barras.');
    return dados;
  }

  private obterLote(id: string): Lote {
    const dados = this.repositorio.carregarEntidade('lotes', id);
    if (!dados) throw new Error('Lote associado ao equipamento não encontrado.');
    return this.reconstituirLote(dados);
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
