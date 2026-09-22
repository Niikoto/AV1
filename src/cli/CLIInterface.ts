import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface, Interface } from 'node:readline';

import { Equipamento } from '../domain/Equipamento.js';
import { AcaoProtegida, ServicoAutenticacao } from '../services/ServicoAutenticacao.js';
import { ServicoEquipamento } from '../services/ServicoEquipamento.js';
import { ServicoLote } from '../services/ServicoLote.js';
import { ServicoOrganizacao } from '../services/ServicoOrganizacao.js';
import { ServicoRelatorio } from '../services/ServicoRelatorio.js';
import { Sessao } from '../session/Sessao.js';
import { EstadoFisico } from '../types/EstadoFisico.js';
import { PapelUsuario } from '../types/PapelUsuario.js';
import { StatusRastreamento } from '../types/StatusRastreamento.js';
import { TipoEquipamento } from '../types/TipoEquipamento.js';

type NivelMensagem = 'SUCESSO' | 'ERRO' | 'INFO';

export class CLIInterface {
  public sessaoAtual: Sessao | null = null;
  private interface: Interface | null = null;
  private readonly caminhoHistorico = join('data', 'historico-comandos.txt');
  private readonly comandosPublicos = ['ajuda', 'login', 'logout', 'menu', 'sair'];

  constructor(private autenticacao: ServicoAutenticacao, private organizacao: ServicoOrganizacao, private lote: ServicoLote, private equipamento: ServicoEquipamento, private relatorio: ServicoRelatorio) {}

  iniciarLoop(): void { void this.executarLoop(); }

  processarComando(entrada: string): void {
    const [comando = '', acao = '', ...restante] = this.tokenizar(entrada);
    const opcoes = this.extrairOpcoes(restante);
    try {
      if (comando === 'login') {
        this.sessaoAtual = this.autenticacao.login(acao, this.obrigatoria(opcoes, 'senha'));
        this.exibir('SUCESSO', `Login efetuado para ${this.sessaoAtual.usuario}.`);
      } else if (comando === 'logout') {
        if (this.sessaoAtual) this.autenticacao.logout(this.sessaoAtual.token);
        this.sessaoAtual = null; this.exibir('SUCESSO', 'Sessão encerrada.');
      } else if (comando === 'menu') {
        this.exigirSessao(); this.exibirMenuPorPapel(this.sessaoAtual!.papel);
      } else if (comando === 'usuario' && acao === 'criar') {
        this.exigir('GERENCIAR_CREDENCIAIS');
        this.autenticacao.criarCredencial(this.obrigatoria(opcoes, 'usuario'), this.obrigatoria(opcoes, 'senha'), this.enumObrigatorio(PapelUsuario, opcoes.papel, 'papel'));
        this.exibir('SUCESSO', 'Credencial criada.');
      } else if (comando === 'senha' && acao === 'alterar') {
        this.exigirSessao();
        const alterada = this.autenticacao.alterarSenha(this.sessaoAtual!.usuario, this.obrigatoria(opcoes, 'atual'), this.obrigatoria(opcoes, 'nova'));
        if (!alterada) throw new Error('Senha atual inválida ou nova senha ausente.');
        this.exibir('SUCESSO', 'Senha alterada.');
      } else if (comando === 'org' && acao === 'criar') {
        this.exigir('GERENCIAR_ORGANIZACOES');
        this.organizacao.cadastrarOrganizacao({ id: this.obrigatoria(opcoes, 'id'), razaoSocial: this.obrigatoria(opcoes, 'razao'), cnpj: this.obrigatoria(opcoes, 'cnpj'), inscricaoEstadual: opcoes.ie ?? '', enderecoCompleto: opcoes.endereco ?? '', telefone: opcoes.telefone ?? '', email: opcoes.email ?? '', contratoVigente: null });
        this.exibir('SUCESSO', 'Organização cadastrada.');
      } else if (comando === 'org' && acao === 'renovar-contrato') {
        this.exigir('GERENCIAR_CONTRATOS'); this.organizacao.renovarContrato(this.obrigatoria(opcoes, 'id'), this.dataObrigatoria(opcoes, 'vencimento'));
        this.exibir('SUCESSO', 'Contrato renovado.');
      } else if (comando === 'lote' && acao === 'criar') {
        this.exigir('GERENCIAR_LOTES');
        this.lote.criarLote({ id: this.obrigatoria(opcoes, 'id'), dataEntrada: opcoes.data ? this.dataObrigatoria(opcoes, 'data') : new Date(), organizacaoId: this.obrigatoria(opcoes, 'org'), notaFiscal: this.obrigatoria(opcoes, 'nf'), transportadora: this.obrigatoria(opcoes, 'transp'), observacoes: opcoes.obs ?? '' });
        this.exibir('SUCESSO', 'Lote criado.');
      } else if (comando === 'lote' && acao === 'triagem') {
        this.exigir('TRIAR_EQUIPAMENTOS'); this.lote.processarTriagem(this.obrigatoria(opcoes, 'id')); this.exibir('SUCESSO', 'Triagem concluída.');
      } else if (comando === 'equip' && acao === 'criar') {
        this.exigir('GERENCIAR_EQUIPAMENTOS');
        const tipo = this.enumObrigatorio(TipoEquipamento, opcoes.tipo, 'tipo');
        const novo = new Equipamento(this.obrigatoria(opcoes, 'id'), this.equipamento.gerarCodigoBarras(tipo, Date.now()), tipo, this.obrigatoria(opcoes, 'marca'), this.obrigatoria(opcoes, 'modelo'), this.numeroObrigatorio(opcoes, 'ano'), this.enumObrigatorio(EstadoFisico, opcoes.estado, 'estado'), this.numeroObrigatorio(opcoes, 'peso'), this.obrigatoria(opcoes, 'lote'), 0, StatusRastreamento.AGUARDANDO_TRIAGEM, []);
        this.lote.adicionarEquipamentoLote(novo.loteId, novo); this.exibir('SUCESSO', `Equipamento cadastrado com código ${novo.codigoBarrasInterno}.`);
      } else if (comando === 'equip' && acao === 'mover') {
        this.exigir('GERENCIAR_EQUIPAMENTOS'); this.equipamento.registrarMovimentacao(this.obrigatoria(opcoes, 'id'), this.obrigatoria(opcoes, 'destino'), this.sessaoAtual!.usuario); this.exibir('SUCESSO', 'Movimentação registrada.');
      } else if (comando === 'equip' && acao === 'estado') {
        this.exigir('GERENCIAR_EQUIPAMENTOS'); this.equipamento.atualizarEstadoFisico(this.obrigatoria(opcoes, 'id'), this.enumObrigatorio(EstadoFisico, opcoes.estado, 'estado'), opcoes.justificativa ?? ''); this.exibir('SUCESSO', 'Estado físico atualizado.');
      } else if (comando === 'rastrear') {
        this.exigir('CONSULTAR_HISTORICOS'); this.exibir('INFO', JSON.stringify(this.equipamento.rastrearEquipamento(acao), null, 2));
      } else if (comando === 'relatorio' && acao === 'status') {
        this.exigir('GERAR_RELATORIOS'); this.exibir('INFO', this.relatorio.gerarRelatorioPorStatus(this.enumObrigatorio(StatusRastreamento, opcoes.status, 'status')));
      } else if (comando === 'relatorio' && acao === 'organizacao') {
        this.exigir('GERAR_RELATORIOS'); this.exibir('INFO', this.relatorio.gerarRelatorioPorOrganizacao(this.obrigatoria(opcoes, 'org'), { inicio: this.dataObrigatoria(opcoes, 'inicio'), fim: this.dataObrigatoria(opcoes, 'fim') }));
      } else if (comando === 'relatorio' && acao === 'financeiro') {
        this.exigir('GERAR_RELATORIOS'); this.exibir('INFO', this.relatorio.gerarRelatorioFinanceiro({ inicio: this.dataObrigatoria(opcoes, 'inicio'), fim: this.dataObrigatoria(opcoes, 'fim') }));
      } else if (comando === 'ajuda') {
        this.exibirAjuda();
      } else { throw new Error('Comando inválido. Use ajuda.'); }
    } catch (erro) { this.exibir('ERRO', erro instanceof Error ? erro.message : 'Falha na operação.'); }
  }

  exibirMenuPorPapel(papel: PapelUsuario): void {
    const menus: Record<PapelUsuario, string[]> = {
      ADMINISTRADOR: ['usuario criar', 'senha alterar', 'org criar', 'org renovar-contrato', 'lote criar', 'lote triagem', 'equip criar', 'equip mover', 'equip estado', 'rastrear', 'relatorio status/organizacao/financeiro'],
      OPERADOR_CADASTRO: ['senha alterar', 'org criar', 'org renovar-contrato'],
      GESTOR_ALMOXARIFADO: ['senha alterar', 'lote criar', 'lote triagem', 'equip criar', 'equip mover', 'equip estado'],
      AUDITOR: ['senha alterar', 'rastrear', 'relatorio status/organizacao/financeiro'],
    };
    this.exibir('INFO', `Opções: ${menus[papel].join(' | ')}`);
  }

  private async executarLoop(): Promise<void> {
    this.interface = createInterface({ input: process.stdin, output: process.stdout, completer: (linha: string) => this.completar(linha) });
    this.carregarHistorico(); this.exibir('INFO', 'Greencode iniciado. Use ajuda.'); this.interface.setPrompt('greencode> '); this.interface.prompt();
    this.interface.on('line', (linha: string) => { if (linha.trim() === 'sair') { this.interface?.close(); return; } if (linha.trim()) this.salvarHistorico(linha.trim()); this.processarComando(linha.trim()); this.interface?.prompt(); });
  }

  private completar(linha: string): [string[], string] {
    const candidatos = this.comandosDisponiveis(); const sugestoes = candidatos.filter((comando) => comando.startsWith(linha.trimStart()));
    return [sugestoes.length ? sugestoes : candidatos, linha];
  }

  private comandosDisponiveis(): string[] {
    if (!this.sessaoAtual) return this.comandosPublicos;
    const porPapel: Record<PapelUsuario, string[]> = {
      ADMINISTRADOR: ['usuario criar', 'senha alterar', 'org criar', 'org renovar-contrato', 'lote criar', 'lote triagem', 'equip criar', 'equip mover', 'equip estado', 'rastrear', 'relatorio status', 'relatorio organizacao', 'relatorio financeiro'],
      OPERADOR_CADASTRO: ['senha alterar', 'org criar', 'org renovar-contrato'],
      GESTOR_ALMOXARIFADO: ['senha alterar', 'lote criar', 'lote triagem', 'equip criar', 'equip mover', 'equip estado'],
      AUDITOR: ['senha alterar', 'rastrear', 'relatorio status', 'relatorio organizacao', 'relatorio financeiro'],
    };
    return [...this.comandosPublicos, ...porPapel[this.sessaoAtual.papel]];
  }

  private exibirAjuda(): void {
    this.exibir('INFO', [
      'login USUARIO --senha SENHA', 'usuario criar --usuario USUARIO --senha SENHA --papel PAPEL', 'senha alterar --atual SENHA --nova SENHA',
      'org criar --id ID --razao "RAZÃO" --cnpj CNPJ [--ie IE --endereco "ENDEREÇO" --telefone TEL --email EMAIL]', 'org renovar-contrato --id ORG --vencimento AAAA-MM-DD',
      'lote criar --id ID --org ORG --nf NF --transp TRANSPORTADORA [--data AAAA-MM-DD --obs "TEXTO"]', 'lote triagem --id LOTE',
      'equip criar --id ID --lote LOTE --tipo TIPO --marca MARCA --modelo MODELO --ano ANO --estado ESTADO --peso KG', 'equip mover --id EQUIPAMENTO --destino DESTINO', 'equip estado --id EQUIPAMENTO --estado ESTADO [--justificativa "TEXTO"]',
      'rastrear EQUIPAMENTO', 'relatorio status --status STATUS | relatorio organizacao --org ORG --inicio AAAA-MM-DD --fim AAAA-MM-DD | relatorio financeiro --inicio AAAA-MM-DD --fim AAAA-MM-DD',
      `Papéis: ${Object.values(PapelUsuario).join(', ')}`, `Estados: ${Object.values(EstadoFisico).join(', ')}`,
    ].join('\n'));
  }

  private exigir(acao: AcaoProtegida): void { this.exigirSessao(); if (!this.autenticacao.possuiPermissao(this.sessaoAtual!.token, acao)) throw new Error('Sessão inválida ou usuário sem permissão para esta operação.'); }
  private exigirSessao(): void { if (!this.sessaoAtual || !this.autenticacao.validarToken(this.sessaoAtual.token)) { this.sessaoAtual = null; throw new Error('Faça login novamente.'); } }
  private obrigatoria(opcoes: Record<string, string>, nome: string): string { const valor = opcoes[nome]?.trim(); if (!valor) throw new Error(`O argumento --${nome} é obrigatório.`); return valor; }
  private numeroObrigatorio(opcoes: Record<string, string>, nome: string): number { const valor = Number(this.obrigatoria(opcoes, nome)); if (!Number.isFinite(valor)) throw new Error(`O argumento --${nome} deve ser numérico.`); return valor; }
  private dataObrigatoria(opcoes: Record<string, string>, nome: string): Date { const valor = this.obrigatoria(opcoes, nome); const data = new Date(`${valor}T00:00:00`); if (Number.isNaN(data.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error(`O argumento --${nome} deve usar o formato AAAA-MM-DD.`); return data; }
  private enumObrigatorio<T extends Record<string, string>>(enumeracao: T, valor: string | undefined, nome: string): T[keyof T] { const valorObrigatorio = this.obrigatoria({ [nome]: valor ?? '' }, nome); if (!Object.values(enumeracao).includes(valorObrigatorio)) throw new Error(`Valor inválido para --${nome}. Use: ${Object.values(enumeracao).join(', ')}.`); return valorObrigatorio as T[keyof T]; }
  private exibir(nivel: NivelMensagem, mensagem: string): void { console.log(`[${nivel}] ${mensagem}`); }
  private tokenizar(texto: string): string[] { return texto.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((item) => item.replace(/^"|"$/g, '')) ?? []; }
  private extrairOpcoes(tokens: string[]): Record<string, string> { const opcoes: Record<string, string> = {}; for (let indice = 0; indice < tokens.length; indice += 2) if (tokens[indice]?.startsWith('--')) opcoes[tokens[indice].slice(2)] = tokens[indice + 1] ?? ''; return opcoes; }
  private carregarHistorico(): void { if (this.interface && existsSync(this.caminhoHistorico)) (this.interface as Interface & { history: string[] }).history = readFileSync(this.caminhoHistorico, 'utf-8').split(/\r?\n/).filter(Boolean).reverse(); }
  private salvarHistorico(comando: string): void {
    if (/^(login|usuario criar|senha alterar)\b/i.test(comando.trim())) return;
    mkdirSync('data', { recursive: true });
    appendFileSync(this.caminhoHistorico, `${comando}\n`, 'utf-8');
  }
}
