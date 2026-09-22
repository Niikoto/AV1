import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { CriptografiaArquivo } from './CriptografiaArquivo.js';

export class RepositorioArquivo {
  constructor(
    public diretorioBase: string,
    public criptografia: CriptografiaArquivo,
    private chave: string,
  ) {}

  salvarEntidade(nomeArquivo: string, entidade: any): void {
    const identificador = this.obterIdentificador(entidade);

    const entidades = this.listarEntidades(nomeArquivo);
    const indice = entidades.findIndex((item) => this.obterIdentificador(item) === identificador);

    if (indice === -1) {
      entidades.push(entidade);
    } else {
      entidades[indice] = entidade;
    }

    this.salvarLista(nomeArquivo, entidades);
  }

  carregarEntidade(nomeArquivo: string, id: string): any {
    return this.listarEntidades(nomeArquivo)
      .find((entidade) => this.obterIdentificador(entidade) === id) ?? null;
  }

  listarEntidades(nomeArquivo: string): any[] {
    const caminho = this.obterCaminho(nomeArquivo);

    if (!existsSync(caminho)) {
      return [];
    }

    const dadosCifrados = readFileSync(caminho, 'utf-8');
    const dadosDecifrados = this.criptografia.decifrar(dadosCifrados, this.chave);
    const entidades = JSON.parse(dadosDecifrados);

    if (!Array.isArray(entidades)) {
      throw new Error(`O arquivo ${nomeArquivo} não contém uma lista de entidades.`);
    }

    return entidades;
  }

  excluirEntidade(nomeArquivo: string, id: string): void {
    const entidades = this.listarEntidades(nomeArquivo);
    const entidadesRestantes = entidades.filter(
      (entidade) => this.obterIdentificador(entidade) !== id,
    );

    if (entidadesRestantes.length !== entidades.length) {
      this.salvarLista(nomeArquivo, entidadesRestantes);
    }
  }

  obterTamanhoArquivo(nomeArquivo: string): number {
    const caminho = this.obterCaminho(nomeArquivo);
    return existsSync(caminho) ? statSync(caminho).size : 0;
  }

  rotacionarArquivo(nomeArquivo: string, nomeArquivoRotacionado: string): void {
    const caminhoOrigem = this.obterCaminho(nomeArquivo);

    if (!existsSync(caminhoOrigem)) {
      return;
    }

    renameSync(caminhoOrigem, this.obterCaminho(nomeArquivoRotacionado));
  }

  listarEntidadesPorPrefixo(prefixo: string): any[] {
    if (!existsSync(this.diretorioBase)) {
      return [];
    }

    return readdirSync(this.diretorioBase)
      .filter((arquivo) => arquivo.startsWith(prefixo) && arquivo.endsWith('.txt'))
      .flatMap((arquivo) => this.lerEntidadesDoCaminho(join(this.diretorioBase, arquivo), arquivo));
  }

  private salvarLista(nomeArquivo: string, entidades: any[]): void {
    const diretorio = this.diretorioBase;
    const caminhoFinal = this.obterCaminho(nomeArquivo);
    const caminhoTemporario = `${caminhoFinal}.tmp-${process.pid}-${Date.now()}`;
    const dadosCifrados = this.criptografia.cifrar(JSON.stringify(entidades), this.chave);

    mkdirSync(diretorio, { recursive: true });
    writeFileSync(caminhoTemporario, dadosCifrados, 'utf-8');
    renameSync(caminhoTemporario, caminhoFinal);
  }

  private obterCaminho(nomeArquivo: string): string {
    if (!nomeArquivo.trim() || nomeArquivo.includes('/') || nomeArquivo.includes('\\')) {
      throw new Error('Nome de arquivo inválido.');
    }

    return join(this.diretorioBase, `${nomeArquivo}.txt`);
  }

  private lerEntidadesDoCaminho(caminho: string, nomeArquivo: string): any[] {
    const dadosCifrados = readFileSync(caminho, 'utf-8');
    const dadosDecifrados = this.criptografia.decifrar(dadosCifrados, this.chave);
    const entidades = JSON.parse(dadosDecifrados);

    if (!Array.isArray(entidades)) {
      throw new Error(`O arquivo ${nomeArquivo} não contém uma lista de entidades.`);
    }

    return entidades;
  }

  private obterIdentificador(entidade: any): string {
    const identificador = entidade?.id ?? entidade?.usuario;

    if (typeof identificador !== 'string' || !identificador.trim()) {
      throw new Error('A entidade precisa possuir id ou usuario não vazio para ser persistida.');
    }

    return identificador;
  }
}
