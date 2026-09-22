export class Contrato {
  constructor(
    public id: string,
    public organizacaoId: string,
    public dataAssinatura: Date,
    public dataVencimento: Date,
    public clausulas: string[],
    public valorMensal: number,
    public renovacaoAutomatica: boolean,
  ) {}

  estaVigente(): boolean {
    return this.dataVencimento >= new Date();
  }

  renovar(novoVencimento: Date): void {
    this.dataVencimento = novoVencimento;
  }
}
