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
| `OPERADOR_CADASTRO` | cadastra organizações e renova contratos |
| `GESTOR_ALMOXARIFADO` | cria lotes, realiza triagem e registra equipamentos e movimentações |
| `AUDITOR` | consulta rastreabilidade e gera relatórios |

As permissões são verificadas tanto no menu quanto antes da execução do serviço.

## Comandos principais

| Comando | Finalidade |
| --- | --- |
| `login USUARIO --senha SENHA` | inicia uma sessão |
| `logout` | encerra a sessão atual |
| `usuario criar --usuario U --senha S --papel PAPEL` | cria uma credencial (administrador) |
| `senha alterar --atual S --nova N` | altera a senha do usuário autenticado |
| `org criar ...` | cadastra uma organização |
| `org renovar-contrato --id ORG --vencimento AAAA-MM-DD` | renova o contrato existente |
| `lote criar ...` | registra um lote de entrada |
| `lote triagem --id LOTE` | conclui a triagem do lote |
| `equip criar ...` | cadastra equipamento em um lote |
| `equip mover --id EQ --destino LOCAL` | registra movimentação |
| `equip estado --id EQ --estado ESTADO --justificativa "TEXTO"` | atualiza estado físico |
| `rastrear EQ` | mostra equipamento, lote, organização e movimentações |
| `relatorio status --status STATUS` | gera relatório por status |
| `relatorio organizacao --org ORG --inicio AAAA-MM-DD --fim AAAA-MM-DD` | gera relatório por organização |
| `relatorio financeiro --inicio AAAA-MM-DD --fim AAAA-MM-DD` | gera relatório financeiro |

## Persistência e segurança

- Dados operacionais são cifrados com AES-256-GCM.
- Senhas usam SHA-256 com salt individual.
- A chave mestra é gerada no provisionamento e protegida por chave derivada da senha do administrador com scrypt.
- Sessões expiram após 30 minutos de inatividade.
- A persistência usa arquivo temporário e renomeação para escrita atômica.
- O journal é rotacionado ao ultrapassar 10 MB.

Detalhes, limitações e cenários de falha estão em [SEGURANCA_E_TESTES.md](docs/SEGURANCA_E_TESTES.md).

## Testes

```powershell
npm test
```

A suíte cobre provisionamento, autenticação, permissões, validações de CNPJ e data, estado físico, escrita atômica, rotação de journal e a jornada de rastreabilidade.

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

- O histórico de comandos da CLI não é cifrado; comandos que contêm senha não são gravados nele.
- O registro automático no journal pelos serviços ainda está pendente.
- A regra de impedir `EM_DESMONTE` antes da triagem depende de uma operação de alteração de status que ainda não existe no serviço de equipamentos.
