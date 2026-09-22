export class Movimentacao {
  constructor(
    public id: string,
    public equipamentoId: string,
    public dataHora: Date,
    public origem: string,
    public destino: string,
    public responsavel: string,
    public observacao: string,
  ) {}
}
