import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ConfiguracaoSistema } from '../dist/config/ConfiguracaoSistema.js';
import { ProvisionamentoInicial } from '../dist/config/ProvisionamentoInicial.js';
import { Equipamento } from '../dist/domain/Equipamento.js';
import { CriptografiaArquivo } from '../dist/infra/CriptografiaArquivo.js';
import { JournalTransacao } from '../dist/infra/JournalTransacao.js';
import { RepositorioArquivo } from '../dist/infra/RepositorioArquivo.js';
import { ServicoAutenticacao } from '../dist/services/ServicoAutenticacao.js';
import { ServicoEquipamento } from '../dist/services/ServicoEquipamento.js';
import { ServicoLote } from '../dist/services/ServicoLote.js';
import { ServicoOrganizacao } from '../dist/services/ServicoOrganizacao.js';
import { EstadoFisico } from '../dist/types/EstadoFisico.js';
import { PapelUsuario } from '../dist/types/PapelUsuario.js';
import { StatusRastreamento } from '../dist/types/StatusRastreamento.js';
import { TipoEquipamento } from '../dist/types/TipoEquipamento.js';
import { ValidadorCNPJ } from '../dist/validators/ValidadorCNPJ.js';
import { ValidadorDataEntrada } from '../dist/validators/ValidadorDataEntrada.js';

function criarContexto() {
  const raiz = mkdtempSync(join(tmpdir(), 'greencode-av1-'));
  const criptografia = new CriptografiaArquivo();
  const configuracao = new ConfiguracaoSistema(join(raiz, 'configuracao-mestre.json'));
  const provisionamento = new ProvisionamentoInicial(configuracao, criptografia);
  const chave = provisionamento.provisionar('senha-admin-segura');
  const repositorio = new RepositorioArquivo(join(raiz, 'dados'), criptografia, chave);
  const autenticacao = new ServicoAutenticacao(repositorio);
  const organizacao = new ServicoOrganizacao(repositorio, new ValidadorCNPJ());
  const lote = new ServicoLote(repositorio, new ValidadorDataEntrada());
  const equipamento = new ServicoEquipamento(repositorio);
  return { raiz, configuracao, provisionamento, repositorio, autenticacao, organizacao, lote, equipamento };
}

function removerContexto(contexto) {
  rmSync(contexto.raiz, { recursive: true, force: true });
}

function cadastrarOrganizacao(servico, id = 'ORG-001') {
  return servico.cadastrarOrganizacao({
    id,
    razaoSocial: 'Organização Teste Ltda',
    cnpj: '04.252.011/0001-10',
    inscricaoEstadual: 'ISENTO',
    enderecoCompleto: 'Rua dos Testes, 1',
    telefone: '11999999999',
    email: 'teste@exemplo.com',
    contratoVigente: null,
  });
}

test('jornada completa: provisionamento, rastreabilidade e journal', () => {
  const contexto = criarContexto();
  try {
    assert.equal(existsSync(join(contexto.raiz, 'configuracao-mestre.json')), true);
    assert.equal(contexto.provisionamento.precisaProvisionar(), false);
    assert.equal(contexto.provisionamento.obterChaveMestra('senha-admin-segura').length, 64);

    contexto.autenticacao.criarCredencial('admin', 'senha-admin-segura', PapelUsuario.ADMINISTRADOR);
    const sessao = contexto.autenticacao.login('admin', 'senha-admin-segura');
    assert.equal(contexto.autenticacao.validarToken(sessao.token), true);

    cadastrarOrganizacao(contexto.organizacao);
    contexto.lote.criarLote({ id: 'LOTE-001', dataEntrada: new Date(), organizacaoId: 'ORG-001', notaFiscal: 'NF-123', transportadora: 'TransRapida' });
    const equipamento = new Equipamento('EQ-001', contexto.equipamento.gerarCodigoBarras(TipoEquipamento.NOTEBOOK, 1), TipoEquipamento.NOTEBOOK, 'Marca', 'Modelo', 2024, EstadoFisico.BOM_ESTADO, 2.5, 'LOTE-001', 0, StatusRastreamento.AGUARDANDO_TRIAGEM, []);
    contexto.lote.adicionarEquipamentoLote('LOTE-001', equipamento);
    contexto.lote.processarTriagem('LOTE-001');
    contexto.equipamento.registrarMovimentacao('EQ-001', 'Área de desmontagem', 'admin');
    contexto.equipamento.registrarMovimentacao('EQ-001', 'Armazenamento', 'admin');

    const historico = contexto.equipamento.rastrearEquipamento('EQ-001');
    assert.equal(historico.equipamento.statusRastreamento, StatusRastreamento.AGUARDANDO_DESMONTE);
    assert.equal(historico.lote.id, 'LOTE-001');
    assert.equal(historico.organizacao.id, 'ORG-001');
    assert.equal(historico.movimentacoes.length, 2);
    assert.equal(historico.movimentacoes[0].destino, 'Área de desmontagem');

    JournalTransacao.criar('TESTE_JORNADA', 'equipamentos', null, { id: 'EQ-001' }, 'admin', contexto.repositorio).registrar();
    assert.equal(JournalTransacao.listar(contexto.repositorio).length, 1);
  } finally { removerContexto(contexto); }
});

test('rejeita CNPJ inválido e CNPJ duplicado', () => {
  const contexto = criarContexto();
  try {
    assert.throws(() => contexto.organizacao.cadastrarOrganizacao({ id: 'INV', cnpj: '11111111111111' }), /CNPJ/);
    cadastrarOrganizacao(contexto.organizacao);
    assert.throws(() => cadastrarOrganizacao(contexto.organizacao, 'ORG-002'), /Já existe uma organização/);
  } finally { removerContexto(contexto); }
});

test('rejeita lote com data futura ou anterior a 90 dias', () => {
  const contexto = criarContexto();
  try {
    cadastrarOrganizacao(contexto.organizacao);
    const dados = { id: 'LOTE-DATA', organizacaoId: 'ORG-001', notaFiscal: 'NF', transportadora: 'Trans' };
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
    const antigo = new Date(); antigo.setDate(antigo.getDate() - 91);
    assert.throws(() => contexto.lote.criarLote({ ...dados, dataEntrada: amanha }), /futura/);
    assert.throws(() => contexto.lote.criarLote({ ...dados, id: 'LOTE-ANTIGO', dataEntrada: antigo }), /90 dias/);
  } finally { removerContexto(contexto); }
});

test('exige justificativa ao degradar estado físico em duas categorias', () => {
  const contexto = criarContexto();
  try {
    cadastrarOrganizacao(contexto.organizacao);
    contexto.lote.criarLote({ id: 'LOTE-001', dataEntrada: new Date(), organizacaoId: 'ORG-001', notaFiscal: 'NF', transportadora: 'Trans' });
    contexto.lote.adicionarEquipamentoLote('LOTE-001', new Equipamento('EQ-001', 'GC-NOTEBOOK-000001', TipoEquipamento.NOTEBOOK, 'Marca', 'Modelo', 2024, EstadoFisico.BOM_ESTADO, 1, 'LOTE-001', 0, StatusRastreamento.AGUARDANDO_TRIAGEM, []));
    assert.throws(() => contexto.equipamento.atualizarEstadoFisico('EQ-001', EstadoFisico.USADO_MODERADO), /Justificativa obrigatória/);
    contexto.equipamento.atualizarEstadoFisico('EQ-001', EstadoFisico.USADO_MODERADO, 'Dano identificado na inspeção.');
    assert.equal(contexto.equipamento.rastrearEquipamento('EQ-001').equipamento.estadoFisico, EstadoFisico.USADO_MODERADO);
  } finally { removerContexto(contexto); }
});

test('rejeita senha incorreta, usuário sem permissão e sessão expirada', () => {
  const contexto = criarContexto();
  try {
    contexto.autenticacao.criarCredencial('auditor', 'senha-auditor', PapelUsuario.AUDITOR);
    assert.throws(() => contexto.autenticacao.login('auditor', 'incorreta'), /inválidos/);
    const sessao = contexto.autenticacao.login('auditor', 'senha-auditor');
    assert.equal(contexto.autenticacao.possuiPermissao(sessao.token, 'GERAR_RELATORIOS'), true);
    assert.equal(contexto.autenticacao.possuiPermissao(sessao.token, 'GERENCIAR_LOTES'), false);
    sessao.expiracao = new Date(Date.now() - 1);
    assert.equal(contexto.autenticacao.validarToken(sessao.token), false);
  } finally { removerContexto(contexto); }
});

test('persiste com escrita atômica sem arquivo temporário após sucesso', () => {
  const contexto = criarContexto();
  try {
    cadastrarOrganizacao(contexto.organizacao);
    const diretorio = join(contexto.raiz, 'dados');
    assert.equal(readdirSync(diretorio).some((arquivo) => arquivo.includes('.tmp-')), false);
    assert.equal(contexto.repositorio.listarEntidades('organizacoes').length, 1);
  } finally { removerContexto(contexto); }
});

test('rotaciona o journal ao ultrapassar 10 MB', () => {
  const contexto = criarContexto();
  try {
    const diretorio = join(contexto.raiz, 'dados');
    const arquivoAtual = join(diretorio, 'journal-transacoes.txt');
    // O conteúdo será rotacionado antes de ser lido, simulando um arquivo que já ultrapassou o limite.
    mkdirSync(diretorio, { recursive: true });
    writeFileSync(arquivoAtual, 'x'.repeat(10 * 1024 * 1024));
    JournalTransacao.criar('ROTACAO', 'equipamentos', null, { id: 'EQ-001' }, 'admin', contexto.repositorio).registrar();
    assert.equal(statSync(arquivoAtual).size > 0, true);
    assert.equal(readdirSync(diretorio).some((arquivo) => arquivo.startsWith('journal-transacoes-')), true);
  } finally { removerContexto(contexto); }
});

test.todo('bloqueia a mudança para EM_DESMONTE antes de a triagem ser concluída: falta método de alteração de status no ServicoEquipamento');
test.todo('registra automaticamente no journal as operações dos serviços: os serviços ainda não chamam JournalTransacao.registrar');
test.todo('simula falha de escrita e verifica tratamento de arquivo temporário órfão: o RepositorioArquivo não possui ponto de injeção de falha');
