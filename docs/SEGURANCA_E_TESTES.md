# Greencode — Segurança e testes

## Arquitetura de segurança

### Criptografia dos dados

`RepositorioArquivo` persiste organizações, lotes, equipamentos, credenciais e journal. Antes da escrita, converte as entidades para JSON e usa `CriptografiaArquivo.cifrar`.

O algoritmo é AES-256-GCM: uma chave de 256 bits, IV aleatório de 12 bytes e tag de autenticação. O arquivo contém `iv.tag.conteudo`, em Base64. AES-256 é padronizado e disponível nativamente no Node.js; GCM também detecta alteração do conteúdo cifrado, não apenas leitura indevida.

A escrita é atômica: o repositório escreve primeiro um arquivo temporário no mesmo diretório e depois o renomeia para o arquivo definitivo. Se a gravação ou renomeação falhar, o temporário é removido e o arquivo anterior permanece. A configuração mestre também usa temporário exclusivo e limpa o arquivo incompleto em caso de erro.

### Senhas

`Credencial` armazena um identificador interno, login, nome de exibição, hash, salt, último acesso, papel e estado ativo; nunca a senha em texto puro. Login e nome de exibição são campos separados. `ServicoAutenticacao` gera um salt aleatório de 16 bytes por usuário e calcula SHA-256 sobre `salt:senha`.

O salt impede que usuários com a mesma senha tenham o mesmo hash e reduz a utilidade de tabelas pré-calculadas. SHA-256 impede recuperar diretamente a senha a partir do hash. Limitação: SHA-256 é rápido; para um sistema de produção, uma função lenta de senha, como scrypt, bcrypt ou Argon2, é mais resistente a tentativas massivas.

### Chave mestra e provisionamento

No primeiro uso, `ProvisionamentoInicial` detecta a ausência de `configuracao-mestre.json`, exige a senha do primeiro administrador e gera uma chave mestra aleatória de 32 bytes.

A chave mestra não é gravada diretamente. A senha do administrador e um salt aleatório de 16 bytes alimentam `scrypt`, que deriva a chave de proteção. A chave mestra é então cifrada com AES-256-GCM e persistida na configuração mestre.

Limitações:

- Se a senha do administrador for perdida, esta implementação não recupera a chave mestra nem os dados.
- O arquivo mestre precisa de proteção do sistema operacional e de backup contra exclusão ou substituição.
- O histórico da CLI não é cifrado. A CLI não grava no histórico comandos que contêm senha, mas o arquivo ainda diverge da exigência de cifrar todos os dados persistidos. Essa correção depende de integrá-lo ao repositório cifrado.

### Sessões e permissões

O login cria uma `Sessao` com token aleatório, usuário, papel, criação e expiração. A expiração inicial é de 30 minutos. Cada validação de token bem-sucedida chama `Sessao.renovar`, portanto o período é de inatividade, não de duração total da sessão.

Trinta minutos reduzem a exposição de um terminal abandonado sem exigir autenticação para cada comando. A CLI valida token e permissão antes de delegar cada operação. Os métodos de gestão de credenciais também validam token e papel administrador dentro de `ServicoAutenticacao`; esconder opções no menu não é a única proteção. O auditor não pode alterar senha, pois seu papel é somente leitura.

Ao desativar uma conta, o sistema revoga as sessões e limpa login, nome de exibição, hash e salt do registro corrente. A intenção de desativação no journal também omite esses dados. Entradas anteriores do journal permanecem cifradas e preservadas para auditoria; elas podem conter o login e nome de exibição existentes quando a conta foi criada ou alterada.

| Papel | Operações na CLI |
| --- | --- |
| `ADMINISTRADOR` | credenciais, organizações, contratos, lotes, equipamentos, rastreabilidade e relatórios |
| `OPERADOR_CADASTRO` | organizações e contratos |
| `GESTOR_ALMOXARIFADO` | lotes, triagem, equipamentos e movimentações |
| `AUDITOR` | rastreabilidade e relatórios |

## Journal e retenção

`JournalTransacao` também é persistido pelo repositório e, portanto, cifrado. Toda gravação ou exclusão de entidade segue esta sequência:

1. Gravar atomicamente uma intenção com os dados anteriores e posteriores.
2. Aplicar a alteração ou exclusão no arquivo da entidade.
3. Acrescentar um evento de confirmação; se a aplicação falhar, acrescentar um evento de aborto.

Os eventos são acrescentados, não sobrescritos. Se o processo cair depois da intenção e antes do desfecho, na próxima inicialização o sistema reaplica os dados posteriores de forma idempotente e registra a confirmação. Temporários órfãos são removidos antes dessa recuperação. Se a tentativa de registrar o aborto também falhar, a intenção permanece pendente e será concluída na próxima inicialização; nesse caso, o comando pode ter retornado erro embora a operação seja aplicada na recuperação.

Ao atingir 10 MB, o arquivo corrente é renomeado com um identificador único e um novo arquivo recebe os registros. A consulta percorre os arquivos cujo nome começa com `journal-transacoes`. O sistema não expurga journals automaticamente: a política é retenção indefinida, portanto superior ao mínimo de 180 dias. A organização deve manter o diretório e seus backups; rotação não é exclusão.

## Execução dos testes

Execute na raiz do projeto:

```powershell
npm test
```

O comando compila o TypeScript e executa `tests/av1.test.mjs` pelo executor nativo do Node.js. Os testes usam diretórios temporários dentro do workspace e não modificam os dados reais.

## Cenários de falha testados

| Cenário | Resposta do sistema | Resultado |
| --- | --- | --- |
| CNPJ inválido | cadastro rejeitado com erro de validação | Aprovado |
| CNPJ duplicado | cadastro rejeitado | Aprovado |
| Data futura | criação do lote rejeitada | Aprovado |
| Lote com mais de 90 dias | criação rejeitada | Aprovado |
| Queda de duas categorias sem justificativa | alteração de estado rejeitada | Aprovado |
| Queda com justificativa | alteração concluída | Aprovado |
| Senha incorreta | login rejeitado | Aprovado |
| Usuário sem permissão | permissão retorna falso | Aprovado |
| Sessão expirada | token inválido e sessão removida | Aprovado |
| Escrita atômica com sucesso | não sobra arquivo temporário | Aprovado |
| Falha antes da renomeação | arquivo definitivo intacto, temporário removido e transação abortada no journal | Aprovado |
| Intenção sem desfecho | reaplicação idempotente na recuperação de inicialização | Aprovado |
| Temporário órfão | removido na inicialização sem alterar o arquivo definitivo | Aprovado |
| Journal acima de 10 MB | arquivo é rotacionado | Aprovado |
| Jornada completa | provisionamento, login, lote, triagem, movimentações, rastreabilidade e journal automático | Aprovado |
| Gestão de contas | consulta sem segredos, alteração de nome/papel, redefinição de senha, autorização no serviço e desativação | Aprovado |

## Pendências identificadas pelos testes

Um teste permanece como `TODO`, pois expõe uma lacuna ainda não implementada:

1. **Desmonte sem triagem:** `ServicoEquipamento` ainda não possui uma operação de transição para `EM_DESMONTE` que aplique essa regra de negócio.

## Comandos principais

```text
login USUARIO --senha SENHA
org criar --id ID --razao "RAZÃO" --cnpj CNPJ
lote criar --id ID --org ORG --nf NF --transp TRANSPORTADORA
equip criar --id ID --lote LOTE --tipo TIPO --marca MARCA --modelo MODELO --ano ANO --estado ESTADO --peso KG
lote triagem --id LOTE
equip mover --id EQUIPAMENTO --destino DESTINO
rastrear EQUIPAMENTO
relatorio status --status STATUS
```

Use `ajuda` dentro da aplicação para ver todos os comandos e valores de enums aceitos.
