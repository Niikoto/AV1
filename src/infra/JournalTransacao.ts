import { randomUUID } from 'node:crypto';

import { RepositorioArquivo } from './RepositorioArquivo.js';

const ARQUIVO_JOURNAL = 'journal-transacoes';
const LIMITE_ROTACAO_BYTES = 10 * 1024 * 1024;

export class JournalTransacao {
  #repositorio: RepositorioArquivo;

  constructor(
    public id: string,
    public timestamp: Date,
    public operacao: string,
    public entidade: string,
    public dadosAntes: any,
    public dadosDepois: any,
    public usuarioResponsavel: string,
    repositorio: RepositorioArquivo,
  ) {
    this.#repositorio = repositorio;
  }

  registrar(): void {
    if (this.#repositorio.obterTamanhoArquivo(ARQUIVO_JOURNAL) >= LIMITE_ROTACAO_BYTES) {
      this.#repositorio.rotacionarArquivo(
        ARQUIVO_JOURNAL,
        `${ARQUIVO_JOURNAL}-${Date.now()}-${randomUUID()}`,
      );
    }

    this.#repositorio.salvarEntidade(ARQUIVO_JOURNAL, this);
  }

  reverter(): boolean {
    try {
      if (this.dadosAntes === null || this.dadosAntes === undefined) {
        const identificador = this.dadosDepois?.id ?? this.dadosDepois?.usuario;

        if (typeof identificador !== 'string') {
          return false;
        }

        this.#repositorio.excluirEntidade(this.entidade, identificador);
      } else {
        this.#repositorio.salvarEntidade(this.entidade, this.dadosAntes);
      }

      return true;
    } catch {
      return false;
    }
  }

  static criar(
    operacao: string,
    entidade: string,
    dadosAntes: any,
    dadosDepois: any,
    usuarioResponsavel: string,
    repositorio: RepositorioArquivo,
  ): JournalTransacao {
    return new JournalTransacao(
      `journal-${randomUUID()}`,
      new Date(),
      operacao,
      entidade,
      dadosAntes,
      dadosDepois,
      usuarioResponsavel,
      repositorio,
    );
  }

  static listar(repositorio: RepositorioArquivo): JournalTransacao[] {
    return repositorio.listarEntidadesPorPrefixo(ARQUIVO_JOURNAL)
      .map((dados) => new JournalTransacao(
        dados.id,
        new Date(dados.timestamp),
        dados.operacao,
        dados.entidade,
        dados.dadosAntes,
        dados.dadosDepois,
        dados.usuarioResponsavel,
        repositorio,
      ))
      .sort((primeira, segunda) => primeira.timestamp.getTime() - segunda.timestamp.getTime());
  }
}
