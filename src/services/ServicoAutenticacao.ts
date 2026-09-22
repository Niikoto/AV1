import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { RepositorioArquivo } from '../infra/RepositorioArquivo.js';
import { Credencial } from '../session/Credencial.js';
import { Sessao } from '../session/Sessao.js';
import { PapelUsuario } from '../types/PapelUsuario.js';

export type AcaoProtegida =
  | 'GERENCIAR_CREDENCIAIS'
  | 'GERENCIAR_PARAMETROS_GLOBAIS'
  | 'GERENCIAR_ORGANIZACOES'
  | 'GERENCIAR_CONTRATOS'
  | 'GERENCIAR_LOTES'
  | 'TRIAR_EQUIPAMENTOS'
  | 'GERENCIAR_EQUIPAMENTOS'
  | 'CONSULTAR_HISTORICOS'
  | 'GERAR_RELATORIOS';

export class ServicoAutenticacao {
  public credenciais: Credencial[];
  public sessoesAtivas: Sessao[] = [];

  constructor(private repositorio: RepositorioArquivo) {
    this.credenciais = this.carregarCredenciais();
  }

  criarCredencial(usuario: string, senha: string, papel: PapelUsuario): Credencial {
    const usuarioNormalizado = usuario.trim();

    if (!usuarioNormalizado) {
      throw new Error('O usuário é obrigatório.');
    }

    if (!senha) {
      throw new Error('A senha é obrigatória.');
    }

    this.credenciais = this.carregarCredenciais();
    if (this.credenciais.some((credencial) => credencial.usuario === usuarioNormalizado)) {
      throw new Error('Já existe uma credencial para este usuário.');
    }

    const salt = randomBytes(16).toString('hex');
    const credencial = new Credencial(
      usuarioNormalizado,
      this.calcularHashSenha(senha, salt),
      salt,
      new Date(),
      papel,
    );

    this.repositorio.salvarEntidade('credenciais', credencial);
    this.credenciais.push(credencial);

    return credencial;
  }

  login(usuario: string, senha: string): Sessao {
    this.credenciais = this.carregarCredenciais();
    const credencial = this.credenciais.find((item) => item.usuario === usuario);

    if (!credencial || !credencial.verificarSenha(senha)) {
      throw new Error('Usuário ou senha inválidos.');
    }

    credencial.atualizarUltimoAcesso();
    this.repositorio.salvarEntidade('credenciais', credencial);

    const agora = new Date();
    const sessao = new Sessao(
      randomUUID(),
      credencial.usuario,
      credencial.papel,
      agora,
      new Date(agora.getTime() + 30 * 60 * 1000),
    );

    this.sessoesAtivas.push(sessao);
    return sessao;
  }

  logout(token: string): void {
    this.sessoesAtivas = this.sessoesAtivas.filter((sessao) => sessao.token !== token);
  }

  validarToken(token: string): boolean {
    const sessao = this.sessoesAtivas.find((item) => item.token === token);

    if (!sessao || !sessao.isValida()) {
      this.logout(token);
      return false;
    }

    sessao.renovar();
    return true;
  }

  possuiPermissao(token: string, acao: AcaoProtegida): boolean {
    if (!this.validarToken(token)) {
      return false;
    }

    const sessao = this.sessoesAtivas.find((item) => item.token === token);
    return Boolean(sessao && this.papelPossuiPermissao(sessao.papel, acao));
  }

  exigirPermissao(token: string, acao: AcaoProtegida): void {
    if (!this.possuiPermissao(token, acao)) {
      throw new Error('Sessão inválida ou usuário sem permissão para esta operação.');
    }
  }

  alterarSenha(usuario: string, senhaAntiga: string, senhaNova: string): boolean {
    if (!senhaNova) {
      return false;
    }

    this.credenciais = this.carregarCredenciais();
    const credencial = this.credenciais.find((item) => item.usuario === usuario);

    if (!credencial || !credencial.verificarSenha(senhaAntiga)) {
      return false;
    }

    credencial.salt = randomBytes(16).toString('hex');
    credencial.hashSenha = this.calcularHashSenha(senhaNova, credencial.salt);
    credencial.atualizarUltimoAcesso();
    this.repositorio.salvarEntidade('credenciais', credencial);

    return true;
  }

  private carregarCredenciais(): Credencial[] {
    return this.repositorio.listarEntidades('credenciais').map((dados) => new Credencial(
      dados.usuario,
      dados.hashSenha,
      dados.salt,
      new Date(dados.ultimoAcesso),
      dados.papel as PapelUsuario,
    ));
  }

  private calcularHashSenha(senha: string, salt: string): string {
    return createHash('sha256').update(`${salt}:${senha}`, 'utf-8').digest('hex');
  }

  private papelPossuiPermissao(papel: PapelUsuario, acao: AcaoProtegida): boolean {
    if (papel === PapelUsuario.ADMINISTRADOR) {
      return true;
    }

    const permissoesPorPapel: Record<Exclude<PapelUsuario, PapelUsuario.ADMINISTRADOR>, AcaoProtegida[]> = {
      [PapelUsuario.OPERADOR_CADASTRO]: [
        'GERENCIAR_ORGANIZACOES',
        'GERENCIAR_CONTRATOS',
      ],
      [PapelUsuario.GESTOR_ALMOXARIFADO]: [
        'GERENCIAR_LOTES',
        'TRIAR_EQUIPAMENTOS',
        'GERENCIAR_EQUIPAMENTOS',
      ],
      [PapelUsuario.AUDITOR]: [
        'CONSULTAR_HISTORICOS',
        'GERAR_RELATORIOS',
      ],
    };

    return permissoesPorPapel[papel].includes(acao);
  }
}
