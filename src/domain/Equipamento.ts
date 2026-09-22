import { Movimentacao } from './Movimentacao.js';
import { EstadoFisico } from '../types/EstadoFisico.js';
import { StatusRastreamento } from '../types/StatusRastreamento.js';
import { TipoEquipamento } from '../types/TipoEquipamento.js';

export class Equipamento {
  constructor(
    public id: string,
    public codigoBarrasInterno: string,
    public tipo: TipoEquipamento,
    public marca: string,
    public modelo: string,
    public anoFabricacao: number,
    public estadoFisico: EstadoFisico,
    public pesoQuilogramas: number,
    public loteId: string,
    public posicaoNoLote: number,
    public statusRastreamento: StatusRastreamento,
    public historicoMovimentacao: Movimentacao[],
  ) {}

  atualizarStatus(novoStatus: StatusRastreamento, justificativa: string): void {
    void justificativa;
    this.statusRastreamento = novoStatus;
  }

  registrarMovimentacao(destino: string, responsavel: string): void {
    const mov = new Movimentacao(
      `mov-${Date.now()}-${this.historicoMovimentacao.length}`,
      this.id,
      new Date(),
      this.statusRastreamento,
      destino,
      responsavel,
      `Movimentação registrada para ${this.id}`,
    );

    this.historicoMovimentacao.push(mov);
  }

  calcularDepreciacao(): number {
    const coeficientePadrao = 0.08;
    const anos = Math.max(0, new Date().getFullYear() - this.anoFabricacao);
    const valor = this.pesoQuilogramas * anos * coeficientePadrao;

    return Number(valor.toFixed(2));
  }
}
