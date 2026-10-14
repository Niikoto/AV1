# Greencode

CLI em Node.js e TypeScript para o núcleo operacional de uma plataforma de logística reversa de resíduos e equipamentos eletrônicos.

O projeto permite provisionar o sistema, autenticar usuários, cadastrar organizações e lotes, registrar equipamentos, executar triagem, registrar movimentações, consultar rastreabilidade e gerar relatórios.

## Requisitos

- Node.js 22 ou superior
- npm

Compatível com Windows 10+ e Ubuntu 24.04.03+ (e derivados).

## Instalação e execução

```powershell
npm install
npm run build
npm start
```

Na primeira execução, o sistema solicita a senha do primeiro administrador, gera a chave mestra de criptografia e cria o usuário inicial `admin`.

Nas execuções seguintes, informe a senha de desbloqueio para recuperar a chave mestra e acessar os dados persistidos.

## Uso inicial

```text
login admin --senha SUA_SENHA

org criar --id ORG-001 --razao "Empresa Exemplo Ltda" --cnpj 04.252.011/0001-10

lote criar --id LOTE-001 --org ORG-001 --nf NF-123 --transp TransRapida

equip criar --id EQ-001 --lote LOTE-001 --tipo NOTEBOOK --marca Dell --modelo Latitude --ano 2024 --estado BOM_ESTADO --peso 1.8

lote triagem --id LOTE-001

equip mover --id EQ-001 --destino "Área de desmontagem"

rastrear EQ-001
```

Use `ajuda` dentro da aplicação para ver todos os comandos disponíveis e `menu` para visualizar apenas as operações permitidas para o usuário autenticado.

## Papéis de usuário

| Papel | Responsabilidades |
| --- | --- |
| `ADMINISTRADOR` | gerencia credenciais e acessa todas as operações disponíveis |
| `OPERADOR_CADASTRO` | mantém organizações e contratos |
| `GESTOR_ALMOXARIFADO` | cria lotes, realiza triagem e registra equipamentos e movimentações |
| `AUDITOR` | consulta rastreabilidade e gera relatórios |

As permissões são verificadas tanto no menu quanto antes da execução do serviço.

## Comandos principais

| Comando | Finalidade |
| --- | --- |
| `login USUARIO --senha SENHA` | inicia uma sessão |
| `logout` | encerra a sessão atual |
| `usuario criar --usuario U --senha S --papel PAPEL` | cria uma credencial (administrador) |
| `usuario listar` / `usuario consultar --usuario U` | consulta contas sem mostrar hashes ou salts (administrador) |
| `usuario nome --usuario U --novo NOME` / `usuario papel --usuario U --papel PAPEL` | atualiza nome de exibição ou papel (administrador) |
| `usuario senha --usuario U --nova SENHA` / `usuario desativar --usuario U` | redefine senha ou desativa conta (administrador) |
| `senha alterar --atual S --nova N` | altera a senha do usuário autenticado |
| `parametros consultar` / `parametros historico` | consulta parâmetros atuais ou suas versões anteriores (administrador) |
| `parametros atualizar [--imposto ICMS --aliquota 0.18] [--coeficiente-depreciacao 0.08]` | cria nova versão dos parâmetros; taxas usam fração entre 0 e 1 |
| `org criar ...` | cadastra uma organização |
| `org listar [--todas true]` / `org consultar --id ORG` | consulta organizações ativas ou inclui desativadas na listagem |
| `org atualizar --id ORG --razao RAZAO --cnpj CNPJ [...]` / `org desativar --id ORG --motivo MOTIVO` | atualiza dados cadastrais ou desativa sem apagar vínculos históricos |
| `contrato criar --org ORG --id CONTRATO --assinatura DATA --vencimento DATA --valor VALOR [...]` | registra o primeiro contrato ou um novo contrato após encerramento |
| `contrato listar --org ORG` / `contrato atualizar --org ORG --id CONTRATO [...]` | consulta ou altera contrato ainda não encerrado |
| `contrato cancelar --org ORG --id CONTRATO` / `org encerrar-contrato --id ORG` | encerra contrato preservando o histórico |
| `org renovar-contrato --id ORG --vencimento AAAA-MM-DD` | renova o contrato existente |
| `lote criar ...` | registra um lote de entrada |
| `lote listar [--org ORG --inicio DATA --fim DATA --status STATUS --todos true]` / `lote consultar --id LOTE` | consulta lotes com filtros; cancelados entram somente com `--todos true` |
| `lote atualizar --id LOTE [...]` | corrige dados de um lote recebido ainda sem equipamentos, sem alterar a organização vinculada |
| `lote triagem --id LOTE` | conclui a triagem do lote |
| `lote cancelar --id LOTE --motivo MOTIVO` | cancela sem apagar o lote; equipamentos ativos precisam ser cancelados antes |
| `equip criar ...` | cadastra equipamento em um lote |
| `equip listar [--lote LOTE --status STATUS --todos true]` / `equip consultar --id ID` ou `--codigo BARRAS` | consulta equipamentos por lote, status, ID ou código de barras |
| `equip atualizar --id ID [...]` / `equip cancelar --id ID --motivo MOTIVO` | corrige cadastro antes da triagem ou cancela sem apagar o histórico |
| `equip status --id ID --status STATUS` | avança pela sequência triagem, desmontagem, destinação e baixa definitiva |
| `equip mover --id EQ --destino LOCAL` | registra movimentação |
| `equip corrigir-movimentacao --id EQ --mov ID_MOV --destino LOCAL --justificativa "MOTIVO"` | registra correção sem alterar a movimentação original |
| `equip estornar-movimentacao --id EQ --mov ID_MOV --justificativa "MOTIVO"` | registra retorno ao local de origem da movimentação física mais recente |
| `equip estado --id EQ --estado ESTADO --justificativa "TEXTO"` | atualiza estado físico |
| `rastrear EQ` | mostra equipamento, lote, organização e linha do tempo de contratos, movimentações, status, estado físico e destinação |
| `relatorio status --status STATUS` | gera relatório por status |
| `relatorio organizacao --org ORG --inicio AAAA-MM-DD --fim AAAA-MM-DD` | gera relatório por organização |
| `relatorio financeiro --inicio AAAA-MM-DD --fim AAAA-MM-DD` | gera relatório financeiro |
| `relatorio auditoria --inicio AAAA-MM-DD --fim AAAA-MM-DD` | lista operações do journal por data, resultado, entidade e responsável, sem exibir snapshots de dados |

## Persistência e segurança

- Dados operacionais são cifrados com AES-256-GCM.
- Senhas usam SHA-256 com salt individual.
- A chave mestra é gerada no provisionamento e protegida por chave derivada da senha do administrador com scrypt.
- Sessões expiram após 30 minutos de inatividade.
- A persistência usa arquivo temporário e renomeação para escrita atômica.
- Cada gravação e exclusão registra uma intenção cifrada no journal antes de alterar o arquivo de dados; o resultado é registrado em seguida.
- Na inicialização, o sistema remove temporários órfãos e reaplica intenções sem desfecho.
- O journal é rotacionado ao atingir 10 MB e não é removido automaticamente, atendendo à retenção mínima de 180 dias.
- O histórico da CLI é armazenado cifrado no repositório; no primeiro início após a atualização, o histórico legado em texto é migrado e removido após a migração bem-sucedida. Comandos com campos de senha não são persistidos.

Detalhes, limitações e cenários de falha estão em [SEGURANCA_E_TESTES.md](docs/SEGURANCA_E_TESTES.md).

## Testes

```powershell
npm test
```

A suíte cobre provisionamento, contas e permissões, ciclo de contrato, recebimento e triagem de lote, destinação e rastreabilidade, correção e estorno de movimentações, versões de parâmetros, histórico da CLI cifrado, gravação atômica por arquivo, recuperação de journal e rotação.

## Estrutura

```text
src/
  cli/          Interface de linha de comando
  config/       Provisionamento e configuração mestre
  domain/       Entidades de negócio
  infra/        Criptografia, repositório e journal
  services/     Serviços de autenticação e domínio
  session/      Credenciais e sessões
  types/        Enums do UML
  validators/   Validadores de CNPJ e data
tests/          Testes automatizados
docs/           Documentação de segurança e testes
```

## Limitações conhecidas

- O histórico de comandos não contém entradas antigas com campos de senha; a migração legada as descarta.
- Os testes exercitam serviços e persistência, mas não automatizam uma sessão interativa completa da CLI.
- A gravação atômica protege cada arquivo individualmente; operações que atualizam mais de uma entidade não têm garantia de commit atômico conjunto.
- A retenção mínima do journal é atendida por não haver expurgo automático; a execução dos testes não simula a passagem de 180 dias nem valida backups.
