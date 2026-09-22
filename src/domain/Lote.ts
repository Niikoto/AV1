import { Equipamento } from './Equipamento.js';
import { StatusLote } from '../types/StatusLote.js';
import { StatusRastreamento } from '../types/StatusRastreamento.js';

export class Lote {
  constructor(
    public id: string,
    public dataEntrada: Date,
    public organizacaoId: string,
    public notaFiscal: string,
    public transportadora: string,
    public equipamentos: Equipamento[],
    public statusProcessamento: StatusLote,
    public observacoes: string,
  ) {}

  adicionarEquipamento(equip: Equipamento): void {
    this.equipamentos.push(equip);
  }

  removerEquipamento(equipId: string): boolean {
    const indice = this.equipamentos.findIndex((equipamento) => equipamento.id === equipId);

    if (indice === -1) {
      return false;
    }

    this.equipamentos.splice(indice, 1);
    return true;
  }

  calcularPesoTotal(): number {
    return this.equipamentos.reduce(
      (pesoTotal, equipamento) => pesoTotal + equipamento.pesoQuilogramas,
      0,
    );
  }

  gerarRelatorioTriagem(): string {
    const quantidadeTriada = this.equipamentos.filter(
      (equipamento) => equipamento.statusRastreamento !== StatusRastreamento.AGUARDANDO_TRIAGEM,
    ).length;

    return [
      `Lote: ${this.id}`,
      `Status: ${this.statusProcessamento}`,
      `Equipamentos: ${this.equipamentos.length}`,
      `Equipamentos triados: ${quantidadeTriada}`,
      `Peso total: ${this.calcularPesoTotal().toFixed(2)} kg`,
    ].join('\n');
  }
}
