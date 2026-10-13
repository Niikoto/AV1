export class Movimentacao {
  constructor(
    public readonly id: string,
    public readonly equipamentoId: string,
    public readonly dataHora: Date,
    public readonly origem: string,
    public readonly destino: string,
    public readonly responsavel: string,
    public readonly observacao: string,
  ) {}
}
